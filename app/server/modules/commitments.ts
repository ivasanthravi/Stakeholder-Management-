import { Hono } from 'hono'
import { eq, isNull, sql } from 'drizzle-orm'
import { commitment, engagement, initiative, stakeholder, user } from '../db/schema'
import type { Tx } from '../db/client'
import { jsonBody, patchBody, need, query, tx, type AppEnv } from '../context'
import { diff, nextKey, recordActivity } from '../history'
import { csv, getOr404, rowsOf, versionedUpdate } from './_shared'
import { assertMember } from './stakeholders'
import { commitmentCreateSchema, commitmentListQuerySchema, commitmentUpdateSchema } from '../../shared/schemas'

const STATUS_VERB: Record<string, string> = { completed: 'completed', open: 'reopened', in_progress: 'started', cancelled: 'cancelled' }

export const commitmentRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const q = query(c, commitmentListQuerySchema)
    const statuses = csv(q.status)
    const rows = await tx(c, async t => rowsOf<Record<string, unknown>>(await t.execute(sql`
      select cm.id, cm.key, cm.title, cm.status, cm.direction, cm.due_date as "dueDate", cm.completed_at as "completedAt",
        cm.owner_id as "ownerId", u.name as "ownerName", cm.stakeholder_id as "stakeholderId", s.name as "stakeholderName",
        cm.initiative_id as "initiativeId", i.code as "initiativeCode", cm.source_engagement_id as "sourceEngagementId", e.key as "sourceKey",
        cm.version, cm.updated_at as "updatedAt",
        count(*) over ()::int as total
      from commitment cm left join "user" u on u.id = cm.owner_id left join stakeholder s on s.id = cm.stakeholder_id
        left join initiative i on i.id = cm.initiative_id left join engagement e on e.id = cm.source_engagement_id
      where ${q.archived === 'true' ? sql`cm.archived_at is not null` : sql`cm.archived_at is null`}
        and (cm.stakeholder_id is null or s.id is not null)
        ${statuses.length ? sql`and cm.status in (${sql.join(statuses.map(s => sql`${s}`), sql`, `)})` : sql``}
        ${q.overdue === 'true' ? sql`and cm.status in ('open','in_progress') and cm.due_date < current_date` : sql``}
        ${q.initiativeId ? sql`and cm.initiative_id = ${q.initiativeId}` : sql``}
        ${q.stakeholderId ? sql`and cm.stakeholder_id = ${q.stakeholderId}` : sql``}
        ${q.ownerId ? sql`and cm.owner_id = ${q.ownerId}` : sql``}
        ${q.q ? sql`and (cm.title ilike ${'%' + q.q + '%'} or cm.key ilike ${q.q + '%'})` : sql``}
      order by (cm.status in ('completed','cancelled')), cm.due_date nulls last, cm.created_at desc
      limit ${q.limit} offset ${q.offset}`)))
    return c.json({ items: rows.map(({ total: _t, ...r }) => r), total: (rows[0]?.total as number) ?? 0 })
  })

  .post('/', async c => {
    need(c, 'commitment.create')
    const input = await jsonBody(c, commitmentCreateSchema)
    const tn = c.var.tenant
    const id = await tx(c, async t => {
      await assertMember(t, input.ownerId)
      const key = await nextKey(t, tn.workspaceId, 'C', 100)
      const [row] = await t.insert(commitment).values({
        ...input, key, ownerId: input.ownerId ?? tn.userId, completedAt: input.status === 'completed' ? new Date() : null,
        workspaceId: tn.workspaceId, createdBy: tn.userId, updatedBy: tn.userId,
      }).returning()
      await recordActivity(t, tn, { entityType: 'commitment', entityId: row.id, verb: 'created', summary: `${row.key} “${row.title}”` })
      if (row.stakeholderId) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: row.stakeholderId, verb: 'commitment_added', summary: `Commitment ${row.key}: ${row.title}` })
      return row.id
    })
    return c.json(await tx(c, t => commitmentDetail(t, id)), 201)
  })

  .get('/:id', async c => c.json(await tx(c, t => commitmentDetail(t, c.req.param('id')))))

  .patch('/:id', async c => {
    need(c, 'commitment.update')
    const input = await patchBody(c, commitmentUpdateSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const before = await getOr404(t, commitment, c.req.param('id'), 'Commitment', isNull(commitment.archivedAt))
      if (input.ownerId !== undefined) await assertMember(t, input.ownerId)
      const { version, ...rest } = input
      const patch: Record<string, unknown> = { ...rest }
      if (input.status && input.status !== before.status) patch.completedAt = input.status === 'completed' ? new Date() : null
      const after = await versionedUpdate(t, commitment, before.id as string, version, patch, tn.userId)
      const changes = diff(before, after, Object.keys(rest))
      if (changes.status) {
        const verb = STATUS_VERB[changes.status.to as string] ?? 'updated'
        await recordActivity(t, tn, { entityType: 'commitment', entityId: before.id as string, verb, summary: `${before.key} ${verb}`, changes: { status: changes.status } })
        if (after.stakeholderId) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: after.stakeholderId as string, verb: `commitment_${verb}`, summary: `${before.key} ${verb}: ${after.title}` })
        delete changes.status
      }
      if (Object.keys(changes).length) await recordActivity(t, tn, { entityType: 'commitment', entityId: before.id as string, verb: 'updated', summary: `Updated ${Object.keys(changes).join(', ')}`, changes })
    })
    return c.json(await tx(c, t => commitmentDetail(t, c.req.param('id'))))
  })

  .post('/:id/archive', async c => {
    need(c, 'commitment.archive')
    const tn = c.var.tenant
    await tx(c, async t => {
      const cm = await getOr404(t, commitment, c.req.param('id'), 'Commitment', isNull(commitment.archivedAt))
      await t.update(commitment).set({ archivedAt: new Date(), updatedAt: new Date(), updatedBy: tn.userId }).where(eq(commitment.id, cm.id as string))
      await recordActivity(t, tn, { entityType: 'commitment', entityId: cm.id as string, verb: 'archived', summary: `Archived ${cm.key}` })
    })
    return c.json({ ok: true })
  })

async function commitmentDetail(t: Tx, id: string) {
  const cm = await getOr404(t, commitment, id, 'Commitment')
  const owner = cm.ownerId ? (await t.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, cm.ownerId as string)))[0] ?? null : null
  const sh = cm.stakeholderId ? (await t.select({ id: stakeholder.id, name: stakeholder.name }).from(stakeholder).where(eq(stakeholder.id, cm.stakeholderId as string)))[0] ?? null : null
  const init = cm.initiativeId ? (await t.select({ id: initiative.id, code: initiative.code, name: initiative.name }).from(initiative).where(eq(initiative.id, cm.initiativeId as string)))[0] ?? null : null
  const source = cm.sourceEngagementId ? (await t.select({ id: engagement.id, key: engagement.key, title: engagement.title }).from(engagement).where(eq(engagement.id, cm.sourceEngagementId as string)))[0] ?? null : null
  return { ...cm, owner, stakeholder: sh, initiative: init, sourceEngagement: source }
}
