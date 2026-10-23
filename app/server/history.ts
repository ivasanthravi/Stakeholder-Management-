// Activity (user-facing timeline) and audit (security trail) recording.
import { sql } from 'drizzle-orm'
import type { DB, TenantContext, Tx } from './db/client'
import { activityEvent, auditEvent, workspaceCounter } from './db/schema'

export interface RequestMeta { ip?: string | null; userAgent?: string | null }

/** Fields never copied into history (secrets, large free text). */
const OMIT = new Set(['notes', 'password', 'token', 'tokenHash', 'customFields'])

export function diff(before: Record<string, unknown>, after: Record<string, unknown>, keys?: string[]) {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of keys ?? Object.keys(after)) {
    if (OMIT.has(k) || k === 'version' || k === 'updatedAt' || k === 'updatedBy') continue
    const a = before[k], b = after[k]
    const same = Array.isArray(a) && Array.isArray(b) ? a.join('\u0000') === b.join('\u0000') : String(a ?? '') === String(b ?? '')
    if (!same) out[k] = { from: a ?? null, to: b ?? null }
  }
  return out
}

export async function recordActivity(tx: Tx, t: TenantContext, e: { entityType: string; entityId: string; verb: string; summary: string; changes?: Record<string, { from: unknown; to: unknown }> }) {
  await tx.insert(activityEvent).values({ workspaceId: t.workspaceId, actorId: t.userId, ...e, changes: e.changes && Object.keys(e.changes).length ? e.changes : null })
}

export async function recordAudit(db: DB | Tx, e: { workspaceId?: string | null; actorId?: string | null; action: string; entityType?: string; entityId?: string; metadata?: Record<string, unknown> }, meta: RequestMeta = {}) {
  await db.insert(auditEvent).values({ ...e, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null })
}

/** Next human-readable key for a scope (e.g. "C" → 101). Atomic within the tenant transaction. */
export async function nextKey(tx: Tx, workspaceId: string, scope: 'C' | 'D' | 'E', start = 100) {
  const res = await tx.insert(workspaceCounter).values({ workspaceId, scope, value: start + 1 })
    .onConflictDoUpdate({ target: [workspaceCounter.workspaceId, workspaceCounter.scope], set: { value: sql`${workspaceCounter.value} + 1` } })
    .returning({ value: workspaceCounter.value })
  return `${scope}-${res[0].value}`
}
