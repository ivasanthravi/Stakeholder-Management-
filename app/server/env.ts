import { z } from 'zod'

// Loose: provider-specific variables (BILLING_PRICE_*, STRIPE_*, PADDLE_*) pass through to the adapters.
const schema = z.looseObject({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
  /** Runs the background job worker and schedules in this process (default on, except tests). */
  JOBS_ENABLED: z.enum(['true', 'false']).optional(),
})

export type Env = z.infer<typeof schema> & { AUTH_SECRET: string }

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
  }
  return { ...env, AUTH_SECRET: env.AUTH_SECRET ?? 'dev-only-secret-not-for-production-use-0000' }
}
