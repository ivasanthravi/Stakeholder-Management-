import { z } from 'zod'

// Loose: provider-specific variables (BILLING_PRICE_*, STRIPE_*, PADDLE_*) pass through to the adapters.
const schema = z.looseObject({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Which deployed environment a production build is: `staging` (synthetic data, sandbox providers) or `production`. */
  DEPLOY_ENV: z.enum(['staging', 'production']).default('production'),
  PORT: z.coerce.number().int().default(8787),
  /** Public origin the browser uses (Vite dev server in development, the app itself in production). */
  APP_URL: z.url().default('http://localhost:5173'),
  /** Postgres connection string. When absent, an embedded PGlite database is used (development/test only). */
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.data/pglite'),
  /** ≥32 random characters. Required in production. */
  AUTH_SECRET: z.string().min(32).optional(),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  /** `log` stores mail in the dev outbox and logs it (nothing is sent). `postmark` delivers through Postmark. */
  MAIL_TRANSPORT: z.enum(['log', 'postmark']).default('log'),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  POSTMARK_MESSAGE_STREAM: z.string().default('outbound'),
  MAIL_FROM: z.string().default('Meridian <no-reply@localhost>'),
  /** stripe | paddle | simulator (development only) | none. Default: simulator in development/test, none in production. */
  BILLING_PROVIDER: z.enum(['stripe', 'paddle', 'simulator', 'none']).optional(),
  /** Must be "true" before live (non-test) provider keys are accepted. */
  BILLING_LIVE_APPROVED: z.string().optional(),
  SIMULATOR_WEBHOOK_SECRET: z.string().default('dev-only-simulator-secret'),
  /**
   * Who may create an account: `open`, or `invite_only` (a pending invitation or SIGNUP_ALLOWLIST match is required).
   * Default: invite_only in production (controlled rollout), open elsewhere. Opening signup is an explicit decision.
   */
  SIGNUP_MODE: z.enum(['open', 'invite_only']).optional(),
  /** Comma-separated addresses or @domains allowed to sign up while invite-only (internal team, design partners). */
  SIGNUP_ALLOWLIST: z.string().default(''),
  /** Sign-in and sign-up attempts allowed per client IP per 10 seconds (production only). */
  AUTH_RATE_LIMIT_PER_10S: z.coerce.number().int().min(1).max(100).default(3),
  /** Runs the background job worker and schedules in this process (default on, except tests). */
  JOBS_ENABLED: z.enum(['true', 'false']).optional(),
})

export type Env = z.infer<typeof schema> & { AUTH_SECRET: string; SIGNUP_MODE: 'open' | 'invite_only' }

export function loadEnv(source?: Record<string, string | undefined>): Env {
  if (!source) {
    // Load ./.env when present (Node's built-in loader; never overrides variables already set).
    try { process.loadEnvFile('.env') } catch { /* no .env file */ }
    source = process.env
  }
  // The API has its own port variable so tools that set PORT for the web dev server don't collide with it.
  // In production one process serves app and API, so PORT is honoured there.
  const port = source.API_PORT ?? (source.NODE_ENV === 'production' ? source.PORT : undefined)
  const env = schema.parse({ ...source, PORT: port })
  if (env.NODE_ENV === 'production') {
    if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is required in production')
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required in production (PGlite is for development only)')
    if (env.MAIL_TRANSPORT === 'postmark' && !env.POSTMARK_SERVER_TOKEN) throw new Error('POSTMARK_SERVER_TOKEN is required when MAIL_TRANSPORT=postmark')
    if (env.BILLING_PROVIDER === 'simulator') throw new Error('The billing simulator is for development only')
    if (env.DEPLOY_ENV === 'production') {
      // Defaults that are right for development would fail silently here: no email would ever be sent, and
      // auth links would point at localhost.
      if (new URL(env.APP_URL).protocol !== 'https:') throw new Error('APP_URL must be the public https origin in production')
      if (source.MAIL_TRANSPORT !== 'postmark') throw new Error('MAIL_TRANSPORT=postmark is required in production (the log transport sends nothing)')
      // The model path processes customer records with a third party. It stays off until its data terms are reviewed and
      // a live evaluation is recorded (docs/launch/ai-production-verification.md); a key alone must not switch it on.
      const model = source.AI_ENGINE !== 'local' && !!(source.ANTHROPIC_API_KEY || source.ANTHROPIC_AUTH_TOKEN || source.AI_ENGINE === 'claude')
      if (model && source.AI_MODEL_APPROVED !== 'true') throw new Error('The Claude model engine needs AI_MODEL_APPROVED=true in production (or AI_ENGINE=local)')
    } else if (env.BILLING_LIVE_APPROVED === 'true') {
      throw new Error('Staging never takes live payments: unset BILLING_LIVE_APPROVED')
    }
  }
  const signupMode = env.SIGNUP_MODE ?? (env.NODE_ENV === 'production' && env.DEPLOY_ENV === 'production' ? 'invite_only' : 'open')
  return { ...env, SIGNUP_MODE: signupMode, AUTH_SECRET: env.AUTH_SECRET ?? 'dev-only-secret-not-for-production-use-0000' }
}
