import { Hono } from 'hono'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { commitment, decision, initiative, initiativeStakeholder, stakeholder, user } from '../db/schema'
import type { Tx } from '../db/client'
import { jsonBody, patchBody, need, query, tx, type AppEnv, type Ctx } from '../context'
import { ApiError } from '../http'
import { diff, recordActivity } from '../history'
import { getOr404, rowsOf, versionedUpdate } from './_shared'
import { assertMember } from './stakeholders'
import { initiativeCreateSchema, initiativeMemberSchema, initiativeUpdateSchema, listQuerySchema } from '../../shared/schemas'

export const initiativeRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const q = query(c, listQuerySchema)
    const rows = await tx(c, async t => rowsOf<Record<string, unknown>>(await t.execute(sql`
      select i.id, i.code, i.name, i.description, i.status, i.owner_id as "ownerId", u.name as "ownerName",
        i.start_date as "startDate", i.end_date as "endDate", i.version, i.archived_at as "archivedAt",
        (select count(*) from initiative_stakeholder x join stakeholder s on s.id = x.stakeholder_id where x.initiative_id = i.id and s.archived_at is null)::int as "stakeholderCount",
        (select count(*) from commitment cm where cm.initiative_id = i.id and cm.status in ('open','in_progress') and cm.archived_at is null)::int as "openCommitments",
        (select count(*) from commitment cm where cm.initiative_id = i.id and cm.status in ('open','in_progress') and cm.due_date < current_date and cm.archived_at is null)::int as "overdueCommitments",
        (select count(*) from decision d where d.initiative_id = i.id and d.status in ('proposed','under_review') and d.archived_at is null)::int as "pendingDecisions",
        (select max(e.occurred_at) from engagement e where e.initiative_id = i.id and e.archived_at is null) as "lastActivityAt"
      from initiative i left join "user" u on u.id = i.owner_id
      where ${q.archived === 'true' ? sql`i.archived_at is not null` : sql`i.archived_at is null`}
        ${q.q ? sql`and (i.name ilike ${'%' + q.q + '%'} or i.code ilike ${'%' + q.q + '%'})` : sql``}
      order by array_position(array['active','planned','on_hold','completed'], i.status), i.code
      limit ${q.limit} offset ${q.offset}`)))
    return c.json({ items: rows, total: rows.length })
  })

  .post('/', async c => {
    need(c, 'initiative.create')
    const input = await jsonBody(c, initiativeCreateSchema)
    const tn = c.var.tenant
    const row = await tx(c, async t => {
      await assertMember(t, input.ownerId)
      const [i] = await t.insert(initiative).values({ ...input, ownerId: input.ownerId ?? tn.userId, workspaceId: tn.workspaceId, createdBy: tn.userId, updatedBy: tn.userId }).returning()
      await recordActivity(t, tn, { entityType: 'initiative', entityId: i.id, verb: 'created', summary: `Created ${i.code} ${i.name}` })
      return i
    })
    return c.json(row, 201)
  })

  .get('/:id', async c => c.json(await tx(c, t => initiativeDetail(t, c.req.param('id')))))

  .patch('/:id', async c => {
    need(c, 'initiative.update')
    const input = await patchBody(c, initiativeUpdateSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const before = await getOr404(t, initiative, c.req.param('id'), 'Initiative', isNull(initiative.archivedAt))
      if (input.ownerId !== undefined) await assertMember(t, input.ownerId)
      const start = input.startDate !== undefined ? input.startDate : before.startDate
      const end = input.endDate !== undefined ? input.endDate : before.endDate
      if (start && end && String(start) > String(end)) throw new ApiError(422, 'invalid', 'End date must be after start date', { fields: { endDate: 'End date must be after start date' } })
      const { version, ...patch } = input
      const after = await versionedUpdate(t, initiative, before.id as string, version, patch, tn.userId)
      const changes = diff(before, after, Object.keys(patch))
      if (changes.status) await recordActivity(t, tn, { entityType: 'initiative', entityId: before.id as string, verb: 'status_changed', summary: `Status changed to ${String(changes.status.to).replace('_', ' ')}`, changes: { status: changes.status } })
      delete changes.status
      if (Object.keys(changes).length) await recordActivity(t, tn, { entityType: 'initiative', entityId: before.id as string, verb: 'updated', summary: `Updated ${Object.keys(changes).join(', ')}`, changes })
    })
    return c.json(await tx(c, t => initiativeDetail(t, c.req.param('id'))))
  })

  .post('/:id/archive', c => archive(c, true))
  .post('/:id/restore', c => archive(c, false))

  .post('/:id/stakeholders', async c => {
    need(c, 'initiative.members')
    const input = await jsonBody(c, initiativeMemberSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const i = await getOr404(t, initiative, c.req.param('id'), 'Initiative')
      const s = await getOr404(t, stakeholder, input.stakeholderId, 'Stakeholder')
      await t.insert(initiativeStakeholder).values({ workspaceId: tn.workspaceId, initiativeId: i.id as string, stakeholderId: s.id as string, role: input.role, createdBy: tn.userId })
        .onConflictDoUpdate({ target: [initiativeStakeholder.initiativeId, initiativeStakeholder.stakeholderId], set: { role: input.role ?? null } })
      await recordActivity(t, tn, { entityType: 'initiative', entityId: i.id as string, verb: 'stakeholder_added', summary: `Added ${s.name}${input.role ? ` as ${input.role}` : ''}` })
      await recordActivity(t, tn, { entityType: 'stakeholder', entityId: s.id as string, verb: 'initiative_added', summary: `Added to ${i.code} ${i.name}` })
    })
    return c.json(await tx(c, t => initiativeDetail(t, c.req.param('id'))), 201)
  })

  .delete('/:id/stakeholders/:sid', async c => {
    need(c, 'initiative.members')
    const tn = c.var.tenant
    await tx(c, async t => {
      const i = await getOr404(t, initiative, c.req.param('id'), 'Initiative')
      const res = await t.delete(initiativeStakeholder).where(and(eq(initiativeStakeholder.initiativeId, i.id as string), eq(initiativeStakeholder.stakeholderId, c.req.param('sid')))).returning()
      if (!res[0]) return
      const [s] = await t.select({ name: stakeholder.name }).from(stakeholder).where(eq(stakeholder.id, c.req.param('sid')))
      await recordActivity(t, tn, { entityType: 'initiative', entityId: i.id as string, verb: 'stakeholder_removed', summary: `Removed ${s?.name ?? 'a stakeholder'}` })
      await recordActivity(t, tn, { entityType: 'stakeholder', entityId: c.req.param('sid'), verb: 'initiative_removed', summary: `Removed from ${i.code} ${i.name}` })
    })
    return c.json(await tx(c, t => initiativeDetail(t, c.req.param('id'))))
  })

async function archive(c: Ctx, on: boolean) {
  const id = c.req.param('id') ?? ''
  need(c, 'initiative.archive')
  const tn = c.var.tenant
  await tx(c, async t => {
    const i = await getOr404(t, initiative, id, 'Initiative')
    if (!!i.archivedAt === on) return
    await t.update(initiative).set({ archivedAt: on ? new Date() : null, updatedAt: new Date(), updatedBy: tn.userId, version: sql`${initiative.version} + 1` }).where(eq(initiative.id, i.id as string))
    await recordActivity(t, tn, { entityType: 'initiative', entityId: i.id as string, verb: on ? 'archived' : 'restored', summary: `${on ? 'Archived' : 'Restored'} ${i.code}` })
  })
  return c.json(await tx(c, t => initiativeDetail(t, id)))
}

async function initiativeDetail(t: Tx, id: string) {
  const i = await getOr404(t, initiative, id, 'Initiative')
  const owner = i.ownerId ? (await t.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, i.ownerId as string)))[0] ?? null : null
  const stakeholders = await t.select({ id: stakeholder.id, name: stakeholder.name, title: stakeholder.title, stance: stakeholder.stance, influence: stakeholder.influence, interest: stakeholder.interest, role: initiativeStakeholder.role })
    .from(initiativeStakeholder).innerJoin(stakeholder, eq(stakeholder.id, initiativeStakeholder.stakeholderId))
    .where(and(eq(initiativeStakeholder.initiativeId, id), isNull(stakeholder.archivedAt))).orderBy(desc(stakeholder.influence), stakeholder.name)
  const organizations = rowsOf<Record<string, unknown>>(await t.execute(sql`
    select o.id, o.name, o.short_name as "shortName", o.type, count(*)::int as "stakeholderCount"
    from initiative_stakeholder x join stakeholder_organization so on so.stakeholder_id = x.stakeholder_id and so.valid_to is null
      join organization o on o.id = so.organization_id
    where x.initiative_id = ${id} and o.archived_at is null group by o.id order by count(*) desc, o.name`))
  const decisions = await t.select({ id: decision.id, key: decision.key, title: decision.title, status: decision.status, dueDate: decision.dueDate })
    .from(decision).where(and(eq(decision.initiativeId, id), isNull(decision.archivedAt))).orderBy(desc(decision.createdAt))
  const commitments = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, status: commitment.status, dueDate: commitment.dueDate, stakeholderId: commitment.stakeholderId, ownerName: user.name })
    .from(commitment).leftJoin(user, eq(user.id, commitment.ownerId)).where(and(eq(commitment.initiativeId, id), isNull(commitment.archivedAt))).orderBy(commitment.dueDate)
  return { ...i, owner, stakeholders, organizations, decisions, commitments }
}

