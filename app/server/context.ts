import type { Context, MiddlewareHandler } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import type { Auth } from './auth'
import { withTenant, type DB, type TenantContext, type Tx } from './db/client'
import { idempotencyKey, membership, workspace } from './db/schema'
import type { Env } from './env'
import type { Mailer } from './mail'
import { ApiError, forbidden, notFound, unauthorized } from './http'
import { can, type Action, type Role } from '../shared/permissions'
import type { RequestMeta } from './history'

export interface Deps {
  db: DB; auth: Auth; env: Env; mailer: Mailer
  limiter?: import('./ratelimit').Limiter
  ai?: import('./ai/engine').AIEngine
  jobs?: import('./jobs').Jobs
  /** Active billing provider; null when billing isn't configured (trials still work). */
  billing?: import('./billing/provider').BillingProvider | null
  /** Development/test only. */
  simulator?: import('./billing/simulator').Simulator | null
  /** Turns subscription transitions into owner emails and inbox entries. */
  billingNotify?: (n: import('./billing/sync').BillingNotice) => Promise<void>
}
export interface SessionUser { id: string; email: string; name: string; emailVerified: boolean }
export interface Tenant extends TenantContext { role: Role; workspaceName: string; membershipId: string }

export type AppEnv = { Variables: { deps: Deps; user: SessionUser | null; tenant: Tenant; entitlements: import('./billing/entitlements').Entitlements } }
export type Ctx = Context<AppEnv>

export const meta = (c: Ctx): RequestMeta => ({
  ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  userAgent: c.req.header('user-agent') ?? null,
})

/** Resolves the Better Auth session (if any) onto the context. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await c.var.deps.auth.api.getSession({ headers: c.req.raw.headers })
  c.set('user', s ? { id: s.user.id, email: s.user.email, name: s.user.name, emailVerified: s.user.emailVerified } : null)
  await next()
}

export function requireUser(c: Ctx): SessionUser {
  const u = c.var.user
  if (!u) throw unauthorized()
  return u
}

/**
 * Tenant gate for every /api/w/:workspaceId route. The workspace id from the URL is never trusted:
 * the caller must hold an active membership, re-checked on every request (removal takes effect immediately).
 * Non-members get 404, not 403, so workspace ids cannot be probed.
 */
export const tenantMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = requireUser(c)
  const wid = c.req.param('workspaceId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(wid)) throw notFound('Workspace')
  const rows = await c.var.deps.db
    .select({ id: membership.id, role: membership.role, name: workspace.name })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(and(eq(membership.workspaceId, wid), eq(membership.userId, u.id), isNull(membership.removedAt), isNull(workspace.archivedAt)))
    .limit(1)
  if (!rows[0]) throw notFound('Workspace')
  c.set('tenant', { workspaceId: wid, userId: u.id, role: rows[0].role, workspaceName: rows[0].name, membershipId: rows[0].id })
  await next()
}

export function need(c: Ctx, action: Action) {
  if (!can(c.var.tenant.role, action)) throw forbidden()
}

/** Runs `fn` under row-level security for the current tenant. */
export const tx = <T>(c: Ctx, fn: (tx: Tx) => Promise<T>) => withTenant(c.var.deps.db, c.var.tenant, fn)

/**
 * Idempotency for creates: a repeated POST with the same Idempotency-Key returns the original response
 * instead of creating a duplicate. A concurrent duplicate gets 409 while the first is in flight.
 */
export const idempotency: MiddlewareHandler<AppEnv> = async (c, next) => {
  const key = c.req.header('idempotency-key')
  if (c.req.method !== 'POST' || !key) return next()
  if (key.length > 100) throw new ApiError(400, 'bad_key', 'Idempotency-Key too long')
  const t = c.var.tenant
  const where = and(eq(idempotencyKey.workspaceId, t.workspaceId), eq(idempotencyKey.userId, t.userId), eq(idempotencyKey.key, key))
  const claimed = await withTenant(c.var.deps.db, t, async db => {
    const existing = await db.select().from(idempotencyKey).where(where).limit(1)
    if (existing[0]) return existing[0]
    await db.insert(idempotencyKey).values({ workspaceId: t.workspaceId, userId: t.userId, key, status: 0, body: {} })
    return null
  })
  if (claimed) {
    if (claimed.status === 0) throw new ApiError(409, 'in_progress', 'This request is already being processed')
    return c.json(claimed.body as object, claimed.status as 200)
  }
  try {
    await next()
  } finally {
    const ok = c.res.status < 300
    await withTenant(c.var.deps.db, t, async db => {
      if (ok) await db.update(idempotencyKey).set({ status: c.res.status, body: await c.res.clone().json() }).where(where)
      else await db.delete(idempotencyKey).where(where)
    })
  }
}

export function jsonBody<T>(c: Ctx, schema: { parse: (v: unknown) => T }): Promise<T> {
  return c.req.json().catch(() => { throw new ApiError(400, 'bad_json', 'Request body must be JSON') }).then(v => schema.parse(v))
}

/**
 * PATCH bodies: validate with the schema, then keep only the keys the client actually sent.
 * (Schemas derived with .partial() still apply create-time defaults; a partial update must never reset
 * fields it didn't mention.)
 */
export async function patchBody<T extends object>(c: Ctx, schema: { parse: (v: unknown) => T }): Promise<T> {
  const raw = await c.req.json().catch(() => { throw new ApiError(400, 'bad_json', 'Request body must be JSON') })
  const parsed = schema.parse(raw)
  const sent = new Set(raw && typeof raw === 'object' ? Object.keys(raw) : [])
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => sent.has(k))) as T
}

export function query<T>(c: Ctx, schema: { parse: (v: unknown) => T }): T {
  return schema.parse(c.req.query())
}
