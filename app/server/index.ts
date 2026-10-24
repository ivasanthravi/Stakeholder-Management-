import { log } from './log'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from './env'
import { createDatabase, migrate } from './db/client'
import { createLogTransport, createMailer, createPostmarkTransport } from './mail'
import { createJobs } from './jobs'
import { createBilling } from './billing'
import { startSchedule } from './runtime'
import { createAuth } from './auth'
import { createApp } from './app'

const env = loadEnv()
if (!env.DATABASE_URL) mkdirSync(env.PGLITE_DIR, { recursive: true })
const database = await createDatabase({ url: env.DATABASE_URL, dataDir: env.DATABASE_URL ? undefined : env.PGLITE_DIR })
await migrate(database)
const jobs = createJobs(database.db)
const transport = env.MAIL_TRANSPORT === 'postmark' ? createPostmarkTransport(env.POSTMARK_SERVER_TOKEN!, env.POSTMARK_MESSAGE_STREAM) : createLogTransport(database.db)
const mailer = createMailer(database.db, transport, { from: env.MAIL_FROM, appUrl: env.APP_URL, jobs })
const auth = createAuth(database.db, env, mailer)
// In development the simulator keeps its provider-side state in .data so subscriptions survive restarts.
const billing = createBilling(env, { simulatorStatePath: env.DATABASE_URL ? undefined : path.join(env.PGLITE_DIR, '..', 'billing-simulator.json') })
const deps = { db: database.db, auth, env, mailer, jobs, billing: billing.provider, simulator: billing.simulator }
const app = createApp(deps)
const stopSchedule = env.JOBS_ENABLED === 'false' ? () => {} : startSchedule(deps)

// In production the same process serves the built client (single origin: no CORS, first-party cookies).
if (env.NODE_ENV === 'production') {
  const dist = path.resolve('dist')
  const index = readFileSync(path.join(dist, 'index.html'), 'utf8')
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.get('*', c => c.html(index))
}

serve({ fetch: app.fetch, port: env.PORT }, info => {
  log('info', `Meridian API on http://localhost:${info.port}`, { database: database.kind, mail: transport.name, billing: billing.provider?.label ?? 'not configured', jobs: env.JOBS_ENABLED !== 'false' })
})

const shutdown = async () => { stopSchedule(); await database.close(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
