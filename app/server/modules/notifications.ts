// Inbox, notification preferences, profile, unsubscribe, onboarding state, and the daily commitments digest.
import { Hono } from 'hono'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { and, asc, count, desc, eq, inArray, isNull, lte } from 'drizzle-orm'
import { commitment, engagement, initiative, invitation, membership, notification, stakeholder, subscription, user, userPreference, workspace } from '../db/schema'
import { withTenant } from '../db/client'
import { jsonBody, meta, need, requireUser, tx, type AppEnv, type Deps } from '../context'
import { ApiError } from '../http'
import { recordAudit } from '../history'
import { NOTIFICATION_TYPES, type NotificationType } from '../mail'
import { notify } from '../notify'
import { aiSettings } from '../ai/usage'
import { track } from '../analytics'
import { accessFor } from '../../shared/plans'
import { stateOf } from '../billing/entitlements'

const hash = (t: string) => createHash('sha256').update(t).digest('hex')
const TYPES = Object.keys(NOTIFICATION_TYPES) as NotificationType[]

async function preferences(deps: Pick<Deps, 'db'>, userId: string) {
  const [p] = await deps.db.select().from(userPreference).where(eq(userPreference.userId, userId))
  const n = p?.notifications ?? {}
  return {
    notifications: Object.fromEntries(TYPES.map(t => [t, { email: n[t]?.email ?? true, inApp: n[t]?.inApp ?? true, label: NOTIFICATION_TYPES[t] }])),
    analyticsOptOut: p?.analyticsOptOut ?? false,
  }
}

/** /api/me/... (signed in, not workspace-scoped) */
export const meRoutes = new Hono<AppEnv>()
  .get('/preferences', async c => c.json(await preferences(c.var.deps, requireUser(c).id)))
  .put('/preferences', async c => {
    const u = requireUser(c)
    const input = await jsonBody(c, z.object({
      notifications: z.record(z.enum(TYPES as [NotificationType, ...NotificationType[]]), z.object({ email: z.boolean(), inApp: z.boolean() })).optional(),
      analyticsOptOut: z.boolean().optional(),
    }))
    const cur = await preferences(c.var.deps, u.id)
    const notifications = Object.fromEntries(TYPES.map(t => [t, { email: input.notifications?.[t]?.email ?? cur.notifications[t].email, inApp: input.notifications?.[t]?.inApp ?? cur.notifications[t].inApp }]))
    const analyticsOptOut = input.analyticsOptOut ?? cur.analyticsOptOut
    await c.var.deps.db.insert(userPreference).values({ userId: u.id, notifications, analyticsOptOut })
      .onConflictDoUpdate({ target: userPreference.userId, set: { notifications, analyticsOptOut, updatedAt: new Date() } })
    return c.json(await preferences(c.var.deps, u.id))
  })
  .patch('/profile', async c => {
    const u = requireUser(c)
    const { name } = await jsonBody(c, z.object({ name: z.string().trim().min(1, 'Required').max(80) }))
    await c.var.deps.db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, u.id))
    await recordAudit(c.var.deps.db, { actorId: u.id, action: 'user.profile_updated', entityType: 'user', entityId: u.id, metadata: { fields: ['name'] } }, meta(c))
    return c.json({ name })
  })

/** Public: unsubscribe from all notification email. GET shows a confirmation (link scanners must not unsubscribe people); POST does it (also RFC 8058 one-click). */
export const unsubscribeRoutes = new Hono<AppEnv>()
  .get('/unsubscribe', c => {
    const token = c.req.query('token') ?? ''
    return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe — Meridian</title>
<style>body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#F8F9FA;color:#151A20;display:grid;place-items:center;min-height:100vh}main{background:#fff;border:1px solid #E4E7EB;border-radius:14px;padding:32px;max-width:420px;width:calc(100% - 32px);box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}p{color:#4D5562}button{font:inherit;font-weight:600;border-radius:8px;padding:11px 16px;border:0;background:#0E6B65;color:#fff;cursor:pointer}button:focus-visible{outline:2px solid #17857D;outline-offset:2px}</style></head>
<body><main><h1>Stop notification emails?</h1><p>You’ll stop getting digests and activity emails from Meridian. Account and billing emails still arrive, and you can turn notifications back on in Settings.</p>
<form method="post"><input type="hidden" name="token" value="${token.replace(/[^A-Za-z0-9_-]/g, '')}"><button>Unsubscribe</button></form></main></body></html>`)
  })
  .post('/unsubscribe', async c => {
    const form = await c.req.parseBody().catch(() => ({} as Record<string, string>))
    const token = String(c.req.query('token') ?? form.token ?? '')
    const { db } = c.var.deps
    const [p] = token ? await db.select().from(userPreference).where(eq(userPreference.unsubscribeTokenHash, hash(token))) : []
    if (!p) throw new ApiError(404, 'not_found', 'This unsubscribe link is invalid or has been replaced by a newer one.')
    const notifications = Object.fromEntries(TYPES.map(t => [t, { email: false, inApp: p.notifications[t]?.inApp ?? true }]))
    await db.update(userPreference).set({ notifications, updatedAt: new Date() }).where(eq(userPreference.userId, p.userId))
    await recordAudit(db, { actorId: p.userId, action: 'user.unsubscribed', entityType: 'user', entityId: p.userId })
    return c.html('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title></head><body style="font:15px/1.5 sans-serif;padding:40px"><h1 style="font-size:20px">You’re unsubscribed</h1><p>You won’t get notification emails any more. You can turn them back on in Settings › Notifications.</p></body></html>')
  })

/** /api/w/:workspaceId/notifications and /onboarding */
export const inboxRoutes = new Hono<AppEnv>()
  .get('/notifications', async c => {
    const rows = await tx(c, t => t.select().from(notification).where(eq(notification.userId, c.var.tenant.userId)).orderBy(desc(notification.createdAt)).limit(50))
    return c.json({ notifications: rows.map(n => ({ id: n.id, kind: n.kind, title: n.title, href: n.href, readAt: n.readAt, createdAt: n.createdAt })), unread: rows.filter(n => !n.readAt).length })
  })
  .post('/notifications/read', async c => {
    const { ids } = await jsonBody(c, z.object({ ids: z.array(z.uuid()).max(200).optional() }))
    await tx(c, t => t.update(notification).set({ readAt: new Date() }).where(and(eq(notification.userId, c.var.tenant.userId), isNull(notification.readAt), ids ? inArray(notification.id, ids) : undefined)))
    return c.json({ ok: true })
  })
  .get('/onboarding', async c => {
    const t = c.var.tenant
    const { db } = c.var.deps
    const [w] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, t.workspaceId))
    const counts = await tx(c, async q => ({
      initiatives: (await q.select({ n: count() }).from(initiative))[0].n,
      stakeholders: (await q.select({ n: count() }).from(stakeholder))[0].n,
      engagements: (await q.select({ n: count() }).from(engagement))[0].n,
    }))
    const [m] = await db.select({ n: count() }).from(membership).where(and(eq(membership.workspaceId, t.workspaceId), isNull(membership.removedAt)))
    const [i] = await db.select({ n: count() }).from(invitation).where(eq(invitation.workspaceId, t.workspaceId))
    const settings = (w?.settings ?? {}) as { template?: string; onboarding?: { completed?: string[]; dismissed?: boolean } }
    // Progress is derived from real data, so it resumes correctly however the user got there.
    const done = new Set(settings.onboarding?.completed ?? [])
    if (settings.template) done.add('template')
    if (counts.initiatives) done.add('initiative')
    if (counts.stakeholders) done.add('stakeholders')
    if (m.n > 1 || i.n > 0) done.add('team')
    if (counts.engagements) done.add('engagement')
    return c.json({ template: settings.template ?? null, completed: [...done], dismissed: settings.onboarding?.dismissed ?? false, counts })
  })
  .patch('/onboarding', async c => {
    need(c, 'workspace.update')
    const input = await jsonBody(c, z.object({ complete: z.enum(['template', 'workspace', 'initiative', 'stakeholders', 'team', 'engagement']).optional(), dismissed: z.boolean().optional() }))
    const t = c.var.tenant
    const { db } = c.var.deps
    const [w] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, t.workspaceId))
    const st = (w.settings ?? {}) as { onboarding?: { completed?: string[]; dismissed?: boolean } }
    const onboarding = { ...(st.onboarding ?? {}), completed: [...new Set([...(st.onboarding?.completed ?? []), ...(input.complete ? [input.complete] : [])])], dismissed: input.dismissed ?? st.onboarding?.dismissed ?? false }
    await db.update(workspace).set({ settings: { ...st, onboarding }, updatedAt: new Date(), updatedBy: t.userId }).where(eq(workspace.id, t.workspaceId))
    if (input.complete) await track(db, 'onboarding_step_completed', { userId: t.userId, workspaceId: t.workspaceId, props: { step: input.complete } })
    if (input.dismissed) await track(db, 'onboarding_completed', { userId: t.userId, workspaceId: t.workspaceId, props: { skipped: onboarding.completed.length < 5 } })
    return c.json({ ok: true })
  })

/**
 * Daily digest: each member's own open commitments that are overdue or due soon, one email per workspace per day.
 * Queried under the member's own RLS context so it never includes records they can't see.
 */
export async function sendCommitmentDigests(deps: Deps, now = new Date()) {
  const { db, env } = deps
  const day = now.toISOString().slice(0, 10)
  const subs = await db.select().from(subscription)
  let sent = 0
  for (const s of subs) {
    if (accessFor(stateOf(s), now.getTime()).level !== 'full') continue
    const soon = (await aiSettings(db, s.workspaceId)).thresholds.dueSoonDays
    const horizon = new Date(now.getTime() + soon * 86_400_000).toISOString().slice(0, 10)
    const [w] = await db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, s.workspaceId))
    const members = await db.select({ userId: membership.userId, role: membership.role }).from(membership).where(and(eq(membership.workspaceId, s.workspaceId), isNull(membership.removedAt)))
    for (const m of members) {
      const rows = await withTenant(db, { workspaceId: s.workspaceId, userId: m.userId, role: m.role }, t => t.select({ id: commitment.id, key: commitment.key, title: commitment.title, dueDate: commitment.dueDate })
        .from(commitment).where(and(eq(commitment.ownerId, m.userId), inArray(commitment.status, ['open', 'in_progress']), isNull(commitment.archivedAt), lte(commitment.dueDate, horizon)))
        .orderBy(asc(commitment.dueDate)).limit(20))
      if (!rows.length) continue
      const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      const overdue = rows.filter(r => r.dueDate! < day).map(r => ({ label: `${r.key} ${r.title}`, meta: `Overdue since ${fmt(r.dueDate!)}` }))
      const due = rows.filter(r => r.dueDate! >= day).map(r => ({ label: `${r.key} ${r.title}`, meta: `Due ${fmt(r.dueDate!)}` }))
      const r = await notify(deps, { userId: m.userId, workspaceId: s.workspaceId, type: 'commitments_digest', dedupeKey: `digest:${day}:${s.workspaceId}`,
        title: `${rows.length} commitment${rows.length === 1 ? '' : 's'} need${rows.length === 1 ? 's' : ''} attention`, href: '/commitments?view=mine',
        email: { template: 'commitments_digest', data: { workspaceName: w.name, overdue, due, url: `${env.APP_URL}/commitments?view=mine` } } })
      if (!('skipped' in r)) sent++
    }
  }
  return sent
}

