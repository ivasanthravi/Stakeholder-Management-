import { and, eq, sql, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { Tx } from '../db/client'
import { notFound, staleVersion } from '../http'

/** Rows from a raw `tx.execute(sql…)` regardless of driver (node-postgres or PGlite). */
export const rowsOf = <T>(res: unknown): T[] => ((res as { rows?: T[] }).rows ?? (res as T[]))

type Versioned = PgTable & { id: PgColumn; version: PgColumn; workspaceId: PgColumn; updatedAt: PgColumn; updatedBy: PgColumn }

/**
 * Optimistic-concurrency update: succeeds only if the row still has the version the client edited.
 * On conflict, returns 409 with the current row so the UI can show what changed.
 */
export async function versionedUpdate<T extends Versioned>(tx: Tx, table: T, id: string, version: number, patch: Record<string, unknown>, actorId: string) {
  const res = (await tx.update(table)
    .set({ ...patch, version: sql`${table.version} + 1`, updatedAt: new Date(), updatedBy: actorId } as never)
    .where(and(eq(table.id, id), eq(table.version, version)))
    .returning()) as Record<string, unknown>[]
  if (res[0]) return res[0]
  const current = await tx.select().from(table as PgTable).where(eq(table.id, id)).limit(1)
  if (!current[0]) throw notFound()
  throw staleVersion(current[0])
}

export async function getOr404<T extends PgTable & { id: PgColumn }>(tx: Tx, table: T, id: string, what: string, extra?: SQL) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound(what)
  const r = await tx.select().from(table as PgTable).where(extra ? and(eq(table.id, id), extra) : eq(table.id, id)).limit(1)
  if (!r[0]) throw notFound(what)
  return r[0] as Record<string, unknown> & { version: number }
}

export const pick = <T extends object, K extends keyof T>(o: T, keys: K[]) =>
  Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]])) as Pick<T, K>

export const csv = (v?: string) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : [])

export const STANCE_LABEL: Record<string, string> = {
  champion: 'Champion', supporter: 'Supporter', neutral: 'Neutral', concerned: 'Concerned', opposed: 'Opposed', unknown: 'Unknown',
}
