import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { loadEnv } from './env'
import { createDatabase, migrate } from './db/client'
import { createLogMailer } from './mail'
import { createAuth } from './auth'
import { createApp } from './app'

const env = loadEnv()
if (!env.DATABASE_URL) mkdirSync(env.PGLITE_DIR, { recursive: true })
const database = await createDatabase({ url: env.DATABASE_URL, dataDir: env.DATABASE_URL ? undefined : env.PGLITE_DIR })
await migrate(database)
const mailer = createLogMailer(database.db)
const auth = createAuth(database.db, env, mailer)
const app = createApp({ db: database.db, auth, env, mailer })

// In production the same process serves the built client (single origin: no CORS, first-party cookies).
if (env.NODE_ENV === 'production') {
  const dist = path.resolve('dist')
  const index = readFileSync(path.join(dist, 'index.html'), 'utf8')
  app.use('/assets/*', serveStatic({ root: './dist' }))
  app.get('*', c => c.html(index))
}

serve({ fetch: app.fetch, port: env.PORT }, info => {
  console.info(`Meridian API on http://localhost:${info.port} (${database.kind}${database.kind === 'pglite' ? `: ${env.PGLITE_DIR}` : ''})`)
})

const shutdown = async () => { await database.close(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
