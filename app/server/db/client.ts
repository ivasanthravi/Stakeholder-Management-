import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as schema from './schema'

export type Schema = typeof schema
export type DB = PgDatabase<PgQueryResultHKT, Schema>
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export interface Database {
  db: DB
  kind: 'pglite' | 'postgres'
  close: () => Promise<void>
}

/**
 * Production: `DATABASE_URL` → node-postgres pool.
 * Development/test: PGlite (Postgres compiled to WASM) — persisted to `dataDir`, or in-memory when omitted.
 */
export async function createDatabase(opts: { url?: string; dataDir?: string }): Promise<Database> {
  if (opts.url) {
    const { Pool } = await import('pg')
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const pool = new Pool({ connectionString: opts.url, max: 10 })
    return { db: drizzle(pool, { schema }) as unknown as DB, kind: 'postgres', close: () => pool.end() }
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const client = new PGlite(opts.dataDir)
  return { db: drizzle(client, { schema }) as unknown as DB, kind: 'pglite', close: () => client.close() }
}

export async function migrate(database: Database) {
  if (database.kind === 'postgres') {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(database.db as never, { migrationsFolder })
  } else {
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(database.db as never, { migrationsFolder })
  }
}

export interface TenantContext {
  workspaceId: string
  userId: string
  role: string
}

/**
 * Runs `fn` in a transaction scoped to one tenant: sets the RLS context and drops to `app_user`,
 * so every statement inside is constrained by row-level security policies.
 */
export async function withTenant<T>(db: DB, ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`select
      set_config('app.workspace_id', ${ctx.workspaceId}, true),
      set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.role', ${ctx.role}, true)`)
    await tx.execute(sql`set local role app_user`)
    return fn(tx as Tx)
  })
}
