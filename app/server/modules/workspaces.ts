import { Hono } from 'hono'
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { auditEvent, invitation, membership, user, workspace } from '../db/schema'
import type { DB } from '../db/client'
import { jsonBody, patchBody, meta, need, requireUser, type AppEnv } from '../context'
import { ApiError, conflict, forbidden, notFound } from '../http'
import { recordAudit } from '../history'
import { canChangeRole, type Role } from '../../shared/permissions'
import { inviteSchema, roleUpdateSchema, workspaceCreateSchema, workspaceSettingsSchema } from '../../shared/schemas'

const hash = (t: string) => createHash('sha256').update(t).digest('hex')
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace'
const INVITE_TTL_DAYS = 7

/** Routes that operate across workspaces for the signed-in user. */
export const accountRoutes = new Hono<AppEnv>()
  .get('/me', async c => {
    const u = requireUser(c)
    const { db } = c.var.deps
    const workspaces = await db.select({ id: workspace.id, name: workspace.name, slug: workspace.slug, role: membership.role })
      .from(membership).innerJoin(workspace, eq(workspace.id, membership.workspaceId))
      .where(and(eq(membership.userId, u.id), isNull(membership.removedAt), isNull(workspace.archivedAt)))
      .orderBy(workspace.name)
    const invitations = await db.select({ id: invitation.id, workspaceName: workspace.name, role: invitation.role, expiresAt: invitation.expiresAt })
      .from(invitation).innerJoin(workspace, eq(workspace.id, invitation.workspaceId))
      .where(and(sql`lower(${invitation.email}) = ${u.email.toLowerCase()}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date())))
    return c.json({ user: u, workspaces, invitations })
  })

  .post('/workspaces', async c => {
    const u = requireUser(c)
    if (!u.emailVerified && c.var.deps.env.REQUIRE_EMAIL_VERIFICATION) throw forbidden('Verify your email before creating a workspace')
    const input = await jsonBody(c, workspaceCreateSchema)
    const { db } = c.var.deps
    const ws = await db.transaction(async t => {
      const [w] = await t.insert(workspace).values({
        name: input.name, slug: `${slugify(input.name)}-${randomBytes(3).toString('hex')}`,
        settings: {}, createdBy: u.id, updatedBy: u.id,
      }).returning()
      await t.insert(membership).values({ workspaceId: w.id, userId: u.id, role: 'owner', createdBy: u.id, updatedBy: u.id })
      await recordAudit(t as never, { workspaceId: w.id, actorId: u.id, action: 'workspace.created', entityType: 'workspace', entityId: w.id }, meta(c))
      return w
    })
    return c.json({ id: ws.id, name: ws.name, slug: ws.slug, role: 'owner' }, 201)
  })

  // Invitation preview is readable before sign-in so the accept page can explain itself.
  .get('/invitations/:token', async c => {
    const { db } = c.var.deps
    const rows = await db.select({ email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, acceptedAt: invitation.acceptedAt, revokedAt: invitation.revokedAt, workspaceName: workspace.name, inviter: user.name })
      .from(invitation).innerJoin(workspace, eq(workspace.id, invitation.workspaceId)).leftJoin(user, eq(user.id, invitation.invitedBy))
      .where(eq(invitation.tokenHash, hash(c.req.param('token')))).limit(1)
    const inv = rows[0]
    if (!inv) throw notFound('Invitation')
    const status = inv.revokedAt ? 'revoked' : inv.acceptedAt ? 'accepted' : inv.expiresAt < new Date() ? 'expired' : 'pending'
    return c.json({ workspaceName: inv.workspaceName, inviter: inv.inviter, role: inv.role, email: inv.email, status })
  })

  .post('/invitations/:token/accept', async c => {
    const u = requireUser(c)
    const { db } = c.var.deps
    const result = await db.transaction(async t => {
      const [inv] = await t.select().from(invitation).where(eq(invitation.tokenHash, hash(c.req.param('token')))).for('update').limit(1)
      if (!inv || inv.revokedAt) throw notFound('Invitation')
      if (inv.acceptedAt) throw conflict('This invitation has already been used')
      if (inv.expiresAt < new Date()) throw new ApiError(410, 'expired', 'This invitation has expired. Ask for a new one.')
      if (inv.email.toLowerCase() !== u.email.toLowerCase()) throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that address to accept it.`)
      if (!u.emailVerified && c.var.deps.env.REQUIRE_EMAIL_VERIFICATION) throw forbidden('Verify your email before joining a workspace')
      const existing = await t.select({ id: membership.id }).from(membership)
        .where(and(eq(membership.workspaceId, inv.workspaceId), eq(membership.userId, u.id), isNull(membership.removedAt))).limit(1)
      if (!existing[0]) await t.insert(membership).values({ workspaceId: inv.workspaceId, userId: u.id, role: inv.role, createdBy: inv.invitedBy, updatedBy: u.id })
      await t.update(invitation).set({ acceptedAt: new Date(), acceptedBy: u.id }).where(eq(invitation.id, inv.id))
      await recordAudit(t as never, { workspaceId: inv.workspaceId, actorId: u.id, action: 'member.joined', entityType: 'invitation', entityId: inv.id, metadata: { role: inv.role } }, meta(c))
      return { workspaceId: inv.workspaceId }
    })
    return c.json(result)
  })

/** Routes mounted under /api/w/:workspaceId (tenant middleware already verified membership). */
export const workspaceRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const t = c.var.tenant
    const [w] = await c.var.deps.db.select().from(workspace).where(eq(workspace.id, t.workspaceId))
    return c.json({ id: w.id, name: w.name, slug: w.slug, settings: w.settings, role: t.role })
  })

  .patch('/settings', async c => {
    need(c, 'workspace.update')
    const input = await jsonBody(c, workspaceSettingsSchema)
    const t = c.var.tenant
    const { db } = c.var.deps
    const [before] = await db.select().from(workspace).where(eq(workspace.id, t.workspaceId))
    const { name, ...rest } = input
    const settings = { ...(before.settings as object), ...rest }
    const [w] = await db.update(workspace).set({ name: name ?? before.name, settings, updatedAt: new Date(), updatedBy: t.userId }).where(eq(workspace.id, t.workspaceId)).returning()
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'workspace.settings_updated', entityType: 'workspace', entityId: t.workspaceId, metadata: { fields: Object.keys(input) } }, meta(c))
    return c.json({ id: w.id, name: w.name, slug: w.slug, settings: w.settings, role: t.role })
  })

  .get('/members', async c => {
    need(c, 'members.read')
    const t = c.var.tenant
    const { db } = c.var.deps
    const members = await db.select({ id: membership.id, userId: user.id, name: user.name, email: user.email, role: membership.role, joinedAt: membership.createdAt })
      .from(membership).innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.workspaceId, t.workspaceId), isNull(membership.removedAt))).orderBy(user.name)
    const canManage = ['owner', 'admin'].includes(t.role)
    const invitations = canManage ? await db.select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt })
      .from(invitation).where(and(eq(invitation.workspaceId, t.workspaceId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date())))
      .orderBy(desc(invitation.createdAt)) : []
    return c.json({ members, invitations })
  })

  .post('/invitations', async c => {
    need(c, 'members.invite')
    const input = await jsonBody(c, inviteSchema)
    const t = c.var.tenant
    const { db, env, mailer } = c.var.deps
    const already = await db.select({ id: membership.id }).from(membership).innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.workspaceId, t.workspaceId), isNull(membership.removedAt), sql`lower(${user.email}) = ${input.email}`)).limit(1)
    if (already[0]) throw conflict(`${input.email} is already a member`)
    const token = randomBytes(32).toString('base64url')
    const inv = await db.transaction(async tr => {
      // Re-inviting replaces any pending invitation for the same address.
      await tr.update(invitation).set({ revokedAt: new Date() })
        .where(and(eq(invitation.workspaceId, t.workspaceId), sql`lower(${invitation.email}) = ${input.email}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt)))
      const [row] = await tr.insert(invitation).values({
        workspaceId: t.workspaceId, email: input.email, role: input.role, tokenHash: hash(token), invitedBy: t.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      }).returning()
      await recordAudit(tr as never, { workspaceId: t.workspaceId, actorId: t.userId, action: 'member.invited', entityType: 'invitation', entityId: row.id, metadata: { email: input.email, role: input.role } }, meta(c))
      return row
    })
    const url = `${env.APP_URL}/invite/${token}`
    await mailer.send({ to: input.email, subject: `You’re invited to ${t.workspaceName} on Meridian`, text: `${requireUser(c).name} invited you to join ${t.workspaceName} as ${input.role}.\nAccept: ${url}\nThis link expires in ${INVITE_TTL_DAYS} days.`, url, kind: 'invite' })
    return c.json({ id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt }, 201)
  })

  .delete('/invitations/:id', async c => {
    need(c, 'members.invite')
    const t = c.var.tenant
    const res = await c.var.deps.db.update(invitation).set({ revokedAt: new Date() })
      .where(and(eq(invitation.id, c.req.param('id')), eq(invitation.workspaceId, t.workspaceId), isNull(invitation.acceptedAt))).returning({ id: invitation.id })
    if (!res[0]) throw notFound('Invitation')
    await recordAudit(c.var.deps.db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'member.invitation_revoked', entityType: 'invitation', entityId: res[0].id }, meta(c))
    return c.json({ ok: true })
  })

  .patch('/members/:id', async c => {
    const { role: next } = await patchBody(c, roleUpdateSchema)
    const t = c.var.tenant
    const { db } = c.var.deps
    const result = await db.transaction(async tr => {
      const [m] = await tr.select().from(membership).where(and(eq(membership.id, c.req.param('id')), eq(membership.workspaceId, t.workspaceId), isNull(membership.removedAt))).for('update')
      if (!m) throw notFound('Member')
      if (!canChangeRole(t.role, m.role as Role, next)) throw forbidden('You can’t assign that role')
      if (m.role === 'owner' && next !== 'owner') await assertAnotherOwner(tr as never, t.workspaceId, m.id)
      const [u] = await tr.update(membership).set({ role: next, updatedAt: new Date(), updatedBy: t.userId }).where(eq(membership.id, m.id)).returning()
      await recordAudit(tr as never, { workspaceId: t.workspaceId, actorId: t.userId, action: 'member.role_changed', entityType: 'membership', entityId: m.id, metadata: { userId: m.userId, from: m.role, to: next } }, meta(c))
      return u
    })
    return c.json({ id: result.id, role: result.role })
  })

  .delete('/members/:id', async c => {
    const t = c.var.tenant
    const { db } = c.var.deps
    await db.transaction(async tr => {
      const [m] = await tr.select().from(membership).where(and(eq(membership.id, c.req.param('id')), eq(membership.workspaceId, t.workspaceId), isNull(membership.removedAt))).for('update')
      if (!m) throw notFound('Member')
      const self = m.userId === t.userId
      if (!self) {
        need(c, 'members.remove')
        if (m.role === 'owner' && t.role !== 'owner') throw forbidden('Only an owner can remove another owner')
      }
      if (m.role === 'owner') await assertAnotherOwner(tr as never, t.workspaceId, m.id)
      await tr.update(membership).set({ removedAt: new Date(), updatedAt: new Date(), updatedBy: t.userId }).where(eq(membership.id, m.id))
      await recordAudit(tr as never, { workspaceId: t.workspaceId, actorId: t.userId, action: self ? 'member.left' : 'member.removed', entityType: 'membership', entityId: m.id, metadata: { userId: m.userId, role: m.role } }, meta(c))
    })
    return c.json({ ok: true })
  })

  .get('/audit', async c => {
    need(c, 'audit.read')
    const t = c.var.tenant
    const before = Number(c.req.query('before')) || undefined
    const rows = await c.var.deps.db.select({ id: auditEvent.id, action: auditEvent.action, entityType: auditEvent.entityType, entityId: auditEvent.entityId, metadata: auditEvent.metadata, createdAt: auditEvent.createdAt, actor: user.name })
      .from(auditEvent).leftJoin(user, eq(user.id, auditEvent.actorId))
      .where(and(eq(auditEvent.workspaceId, t.workspaceId), before ? lt(auditEvent.id, before) : undefined))
      .orderBy(desc(auditEvent.id)).limit(100)
    return c.json({ events: rows, next: rows.length === 100 ? rows[rows.length - 1].id : null })
  })

async function assertAnotherOwner(tr: DB, workspaceId: string, excludingId: string) {
  const owners = await tr.select({ id: membership.id }).from(membership)
    .where(and(eq(membership.workspaceId, workspaceId), eq(membership.role, 'owner'), isNull(membership.removedAt), sql`${membership.id} <> ${excludingId}`)).limit(1)
  if (!owners[0]) throw conflict('A workspace must keep at least one owner. Make someone else an owner first.')
}
