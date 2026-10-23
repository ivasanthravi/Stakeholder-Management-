// Customer data management: workspace export, scheduled workspace deletion (with a cooling-off period and cancel),
// personal data export and account closure. Ownership rules:
//   - Workspace data belongs to the workspace. A member leaving or closing their account never deletes shared records;
//     their name is removed from authorship (created_by → null) by the database.
//   - Only an owner can schedule workspace deletion, and it runs after DELETION_COOLING_OFF_DAYS unless canceled.
//   - Exports are generated in the background, stored for EXPORT_TTL_DAYS, and downloadable only by admins/owners.
import { Hono } from 'hono'
import { z } from 'zod'
import { and, desc, eq, getTableColumns, inArray, isNull, lt, sql } from 'drizzle-orm'
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { PgTable } from 'drizzle-orm/pg-core'
import * as s from '../db/schema'
import type { DB } from '../db/client'
import { jsonBody, meta, need, requireUser, type AppEnv, type Deps } from '../context'
import { ApiError, conflict, notFound } from '../http'
import { recordAudit } from '../history'
import { track } from '../analytics'
import { notify } from '../notify'

export const DELETION_COOLING_OFF_DAYS = 14
export const EXPORT_TTL_DAYS = 7
const DAY = 86_400_000
const exportDir = (deps: Pick<Deps, 'env'>) => path.resolve((deps.env as unknown as Record<string, string | undefined>).EXPORT_DIR ?? path.join(deps.env.PGLITE_DIR, '..', 'exports'))

/** Tenant tables included in a workspace export (everything the workspace owns; no auth secrets, no usage internals). */
const EXPORT_TABLES: [string, PgTable & { workspaceId: unknown }][] = [
  ['organizations', s.organization], ['stakeholders', s.stakeholder], ['stakeholderOrganizations', s.stakeholderOrganization], ['stakeholderAccess', s.stakeholderAccess],
  ['stakeholderGroups', s.stakeholderGroup], ['stakeholderGroupMembers', s.stakeholderGroupMember], ['initiatives', s.initiative], ['initiativeStakeholders', s.initiativeStakeholder],
  ['relationships', s.relationship], ['engagements', s.engagement], ['engagementParticipants', s.engagementParticipant], ['decisions', s.decision],
  ['decisionStakeholders', s.decisionStakeholder], ['commitments', s.commitment], ['activity', s.activityEvent], ['meetingAnalyses', s.meetingAnalysis], ['aiProposals', s.aiProposal],
] as never

export async function buildWorkspaceExport(db: DB, workspaceId: string) {
  const [w] = await db.select().from(s.workspace).where(eq(s.workspace.id, workspaceId))
  const members = await db.select({ name: s.user.name, email: s.user.email, role: s.membership.role, joinedAt: s.membership.createdAt })
    .from(s.membership).innerJoin(s.user, eq(s.user.id, s.membership.userId)).where(and(eq(s.membership.workspaceId, workspaceId), isNull(s.membership.removedAt)))
  const out: Record<string, unknown> = {
    format: 'meridian-workspace-export', version: 1, exportedAt: new Date().toISOString(),
    workspace: { id: w.id, name: w.name, settings: w.settings, createdAt: w.createdAt }, members,
  }
  for (const [key, table] of EXPORT_TABLES) {
    const cols = getTableColumns(table) as Record<string, unknown>
    out[key] = await db.select().from(table).where(eq(cols.workspaceId as never, workspaceId))
  }
  const audit = await db.select().from(s.auditEvent).where(eq(s.auditEvent.workspaceId, workspaceId)).orderBy(desc(s.auditEvent.id)).limit(5000)
  out.auditLog = audit.map(({ ip: _ip, userAgent: _ua, ...rest }) => rest)
  return out
}

export async function runExport(deps: Deps, requestId: string) {
  const { db } = deps
  const [r] = await db.select().from(s.dataRequest).where(eq(s.dataRequest.id, requestId))
  if (!r || r.status === 'ready' || !r.workspaceId) return
  await db.update(s.dataRequest).set({ status: 'processing' }).where(eq(s.dataRequest.id, requestId))
  const data = await buildWorkspaceExport(db, r.workspaceId)
  const dir = exportDir(deps)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${requestId}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  const expiresAt = new Date(Date.now() + EXPORT_TTL_DAYS * DAY)
  await db.update(s.dataRequest).set({ status: 'ready', file, fileExpiresAt: expiresAt, completedAt: new Date() }).where(eq(s.dataRequest.id, requestId))
  if (r.requestedBy) {
    const [u] = await db.select({ email: s.user.email }).from(s.user).where(eq(s.user.id, r.requestedBy))
    if (u) await deps.mailer.send({ to: u.email, userId: r.requestedBy, workspaceId: r.workspaceId, template: 'data_export_ready', data: { url: `${deps.env.APP_URL}/settings/data`, expiresAt: expiresAt.toISOString() } })
  }
}

/** Hourly: run due workspace deletions and purge expired export files. */
export async function processDataRequests(deps: Deps) {
  const { db } = deps
  const due = await db.select().from(s.dataRequest).where(and(eq(s.dataRequest.kind, 'workspace_deletion'), eq(s.dataRequest.status, 'scheduled'), lt(s.dataRequest.scheduledFor, new Date())))
  for (const r of due) {
    if (!r.workspaceId) continue
    const [sub] = await db.select().from(s.subscription).where(eq(s.subscription.workspaceId, r.workspaceId))
    // Stop billing first; if the provider call fails the job retries and nothing is deleted.
    if (sub?.providerSubscriptionId && deps.billing && sub.provider === deps.billing.id && ['active', 'trialing', 'past_due'].includes(sub.status)) {
      await deps.billing.cancel(sub.providerSubscriptionId, { atPeriodEnd: false })
    }
    await db.transaction(async t => {
      await recordAudit(t as never, { workspaceId: null, actorId: r.requestedBy, action: 'workspace.deleted', entityType: 'workspace', entityId: r.workspaceId!, metadata: { name: r.label, requestId: r.id } })
      await t.update(s.dataRequest).set({ status: 'completed', completedAt: new Date() }).where(eq(s.dataRequest.id, r.id))
      await t.delete(s.workspace).where(eq(s.workspace.id, r.workspaceId!))
    })
  }
  const expired = await db.select().from(s.dataRequest).where(and(eq(s.dataRequest.status, 'ready'), lt(s.dataRequest.fileExpiresAt, new Date())))
  for (const r of expired) {
    if (r.file && existsSync(r.file)) rmSync(r.file)
    await db.update(s.dataRequest).set({ status: 'completed', file: null }).where(eq(s.dataRequest.id, r.id))
  }
  return { deleted: due.length, purged: expired.length }
}

const requestView = (r: typeof s.dataRequest.$inferSelect) => ({
  id: r.id, kind: r.kind, status: r.status, label: r.label, scheduledFor: r.scheduledFor, createdAt: r.createdAt, completedAt: r.completedAt,
  fileExpiresAt: r.fileExpiresAt, downloadable: r.status === 'ready' && !!r.file,
})

/** /api/w/:workspaceId/data */
export const dataRoutes = new Hono<AppEnv>()
  .get('/requests', async c => {
    need(c, 'data.export')
    const rows = await c.var.deps.db.select().from(s.dataRequest).where(eq(s.dataRequest.workspaceId, c.var.tenant.workspaceId)).orderBy(desc(s.dataRequest.createdAt)).limit(20)
    return c.json({ requests: rows.map(requestView), coolingOffDays: DELETION_COOLING_OFF_DAYS, exportTtlDays: EXPORT_TTL_DAYS })
  })
  .post('/export', async c => {
    need(c, 'data.export')
    const { db, jobs } = c.var.deps
    const t = c.var.tenant
    const pending = await db.select({ id: s.dataRequest.id }).from(s.dataRequest)
      .where(and(eq(s.dataRequest.workspaceId, t.workspaceId), eq(s.dataRequest.kind, 'workspace_export'), inArray(s.dataRequest.status, ['requested', 'processing'])))
    if (pending[0]) throw conflict('An export is already being prepared.')
    const [r] = await db.insert(s.dataRequest).values({ kind: 'workspace_export', workspaceId: t.workspaceId, userId: t.userId, requestedBy: t.userId, label: t.workspaceName }).returning()
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'data.export_requested', entityType: 'data_request', entityId: r.id }, meta(c))
    await track(db, 'data_export_requested', { userId: t.userId, workspaceId: t.workspaceId, props: { scope: 'workspace' } })
    await jobs!.enqueue('data.export', { requestId: r.id }, { maxAttempts: 3 })
    return c.json(requestView(r), 202)
  })
  .get('/exports/:id', async c => {
    need(c, 'data.export')
    const [r] = await c.var.deps.db.select().from(s.dataRequest).where(and(eq(s.dataRequest.id, c.req.param('id')), eq(s.dataRequest.workspaceId, c.var.tenant.workspaceId)))
    if (!r || r.status !== 'ready' || !r.file || !existsSync(r.file) || (r.fileExpiresAt && r.fileExpiresAt < new Date())) throw notFound('Export')
    await recordAudit(c.var.deps.db, { workspaceId: c.var.tenant.workspaceId, actorId: c.var.tenant.userId, action: 'data.export_downloaded', entityType: 'data_request', entityId: r.id }, meta(c))
    const name = `meridian-export-${(r.label ?? 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${r.createdAt.toISOString().slice(0, 10)}.json`
    return c.body(readFileSync(r.file), 200, { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${name}"`, 'cache-control': 'no-store' })
  })
  .post('/deletion', async c => {
    need(c, 'workspace.deleteRequest')
    const { confirmName } = await jsonBody(c, z.object({ confirmName: z.string() }))
    const t = c.var.tenant
    const { db, env } = c.var.deps
    if (confirmName.trim() !== t.workspaceName) throw new ApiError(422, 'invalid', 'Type the workspace name exactly to confirm.', { fields: { confirmName: 'Doesn’t match the workspace name' } })
    const existing = await db.select().from(s.dataRequest).where(and(eq(s.dataRequest.workspaceId, t.workspaceId), eq(s.dataRequest.kind, 'workspace_deletion'), eq(s.dataRequest.status, 'scheduled')))
    if (existing[0]) throw conflict('Deletion is already scheduled.')
    const when = new Date(Date.now() + DELETION_COOLING_OFF_DAYS * DAY)
    const [r] = await db.insert(s.dataRequest).values({ kind: 'workspace_deletion', workspaceId: t.workspaceId, userId: t.userId, requestedBy: t.userId, label: t.workspaceName, status: 'scheduled', scheduledFor: when }).returning()
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'workspace.deletion_scheduled', entityType: 'workspace', entityId: t.workspaceId, metadata: { when } }, meta(c))
    const actor = requireUser(c).name
    const owners = await db.select({ id: s.user.id }).from(s.membership).innerJoin(s.user, eq(s.user.id, s.membership.userId))
      .where(and(eq(s.membership.workspaceId, t.workspaceId), eq(s.membership.role, 'owner'), isNull(s.membership.removedAt)))
    for (const o of owners) await notify(c.var.deps, { userId: o.id, workspaceId: t.workspaceId, type: 'billing', title: `Workspace scheduled for deletion`, href: '/settings/data',
      email: { template: 'workspace_deletion_scheduled', data: { actorName: actor, workspaceName: t.workspaceName, when: when.toISOString(), url: `${env.APP_URL}/settings/data` } } })
    return c.json(requestView(r), 202)
  })
  .delete('/deletion', async c => {
    need(c, 'workspace.deleteRequest')
    const t = c.var.tenant
    const rows = await c.var.deps.db.update(s.dataRequest).set({ status: 'canceled', completedAt: new Date() })
      .where(and(eq(s.dataRequest.workspaceId, t.workspaceId), eq(s.dataRequest.kind, 'workspace_deletion'), eq(s.dataRequest.status, 'scheduled'))).returning()
    if (!rows[0]) throw notFound('Scheduled deletion')
    await recordAudit(c.var.deps.db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'workspace.deletion_canceled', entityType: 'workspace', entityId: t.workspaceId }, meta(c))
    return c.json({ ok: true })
  })

/** Personal data: export everything about me, and close my account. Mounted at /api/me. */
export const personalDataRoutes = new Hono<AppEnv>()
  .get('/export', async c => {
    const u = requireUser(c)
    const { db } = c.var.deps
    const [profile] = await db.select({ id: s.user.id, name: s.user.name, email: s.user.email, emailVerified: s.user.emailVerified, createdAt: s.user.createdAt }).from(s.user).where(eq(s.user.id, u.id))
    const memberships = await db.select({ workspace: s.workspace.name, role: s.membership.role, joinedAt: s.membership.createdAt, removedAt: s.membership.removedAt })
      .from(s.membership).innerJoin(s.workspace, eq(s.workspace.id, s.membership.workspaceId)).where(eq(s.membership.userId, u.id))
    const sessions = await db.select({ createdAt: s.session.createdAt, expiresAt: s.session.expiresAt, ipAddress: s.session.ipAddress, userAgent: s.session.userAgent }).from(s.session).where(eq(s.session.userId, u.id))
    const [prefs] = await db.select().from(s.userPreference).where(eq(s.userPreference.userId, u.id))
    const notifications = await db.select({ title: s.notification.title, kind: s.notification.kind, createdAt: s.notification.createdAt, readAt: s.notification.readAt }).from(s.notification).where(eq(s.notification.userId, u.id))
    const conversations = await db.select({ title: s.aiConversation.title, createdAt: s.aiConversation.createdAt }).from(s.aiConversation).where(eq(s.aiConversation.userId, u.id))
    const emails = await db.select({ template: s.emailMessage.template, subject: s.emailMessage.subject, status: s.emailMessage.status, createdAt: s.emailMessage.createdAt }).from(s.emailMessage).where(eq(s.emailMessage.userId, u.id))
    await recordAudit(db, { actorId: u.id, action: 'user.data_exported', entityType: 'user', entityId: u.id }, meta(c))
    const body = JSON.stringify({ format: 'meridian-personal-export', version: 1, exportedAt: new Date().toISOString(), profile, memberships, sessions,
      preferences: prefs ? { notifications: prefs.notifications, analyticsOptOut: prefs.analyticsOptOut } : null, notifications, copilotConversations: conversations, emails }, null, 2)
    return c.body(body, 200, { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="meridian-personal-data.json"', 'cache-control': 'no-store' })
  })
  .post('/close', async c => {
    const u = requireUser(c)
    const { confirmEmail } = await jsonBody(c, z.object({ confirmEmail: z.string() }))
    const { db, mailer } = c.var.deps
    if (confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) throw new ApiError(422, 'invalid', 'Type your email address exactly to confirm.', { fields: { confirmEmail: 'Doesn’t match your email' } })
    // Shared workspaces must keep an owner: the last owner has to hand over or delete the workspace first.
    const owned = await db.select({ id: s.workspace.id, name: s.workspace.name }).from(s.membership).innerJoin(s.workspace, eq(s.workspace.id, s.membership.workspaceId))
      .where(and(eq(s.membership.userId, u.id), eq(s.membership.role, 'owner'), isNull(s.membership.removedAt)))
    const blocking: string[] = []
    for (const w of owned) {
      const [o] = await db.select({ n: sql<number>`count(*)::int` }).from(s.membership).where(and(eq(s.membership.workspaceId, w.id), eq(s.membership.role, 'owner'), isNull(s.membership.removedAt)))
      const deletion = await db.select({ id: s.dataRequest.id }).from(s.dataRequest).where(and(eq(s.dataRequest.workspaceId, w.id), eq(s.dataRequest.kind, 'workspace_deletion'), eq(s.dataRequest.status, 'scheduled')))
      if (o.n <= 1 && !deletion[0]) blocking.push(w.name)
    }
    if (blocking.length) throw conflict(`You’re the only owner of ${blocking.join(', ')}. Make someone else an owner, or schedule the workspace for deletion, before closing your account.`, { workspaces: blocking })
    await db.transaction(async t => {
      await t.insert(s.dataRequest).values({ kind: 'account_closure', userId: null, requestedBy: null, label: 'Account closed', status: 'completed', completedAt: new Date() })
      await recordAudit(t as never, { actorId: null, action: 'user.account_closed', entityType: 'user', entityId: u.id }, meta(c))
      await t.delete(s.aiConversation).where(eq(s.aiConversation.userId, u.id))
      await t.delete(s.aiCache).where(eq(s.aiCache.userId, u.id))
      await t.delete(s.invitation).where(and(sql`lower(${s.invitation.email}) = ${u.email.toLowerCase()}`, isNull(s.invitation.acceptedAt)))
      // Cascades: sessions, accounts (password), memberships, notifications, preferences. Authorship columns → null.
      await t.delete(s.user).where(eq(s.user.id, u.id))
    })
    await mailer.send({ to: u.email, template: 'account_closed', data: {} }).catch(() => {})
    return c.json({ ok: true })
  })
