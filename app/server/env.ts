import { z } from 'zod'

const schema = z.object({
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
  /** `log` stores mail in the dev outbox and logs it. Production requires a real transport (not yet implemented). */
  MAIL_TRANSPORT: z.enum(['log']).default('log'),
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
  }
  return { ...env, AUTH_SECRET: env.AUTH_SECRET ?? 'dev-only-secret-not-for-production-use-0000' }
}
