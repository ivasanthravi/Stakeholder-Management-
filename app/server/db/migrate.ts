// Applies pending migrations (idempotent). Usage: npm run db:migrate
import { mkdirSync } from 'node:fs'
import { loadEnv } from '../env'
import { createDatabase, migrate } from './client'

const env = loadEnv()
if (!env.DATABASE_URL) mkdirSync(env.PGLITE_DIR, { recursive: true })
const database = await createDatabase({ url: env.DATABASE_URL, dataDir: env.DATABASE_URL ? undefined : env.PGLITE_DIR })
await migrate(database)
console.info(`Migrations applied (${database.kind}).`)
await database.close()
