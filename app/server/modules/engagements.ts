import { Hono } from 'hono'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { commitment, decision, engagement, engagementParticipant, initiative, stakeholder, user } from '../db/schema'
import type { Tx } from '../db/client'
import { jsonBody, patchBody, need, query, tx, type AppEnv } from '../context'
import { trackFirst } from '../analytics'
import { diff, nextKey, recordActivity } from '../history'
import { csv, getOr404, rowsOf, versionedUpdate } from './_shared'
import { assertMember } from './stakeholders'
import { engagementCreateSchema, engagementListQuerySchema, engagementUpdateSchema } from '../../shared/schemas'

export const engagementRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const q = query(c, engagementListQuerySchema)
    const kinds = csv(q.kind)
    const rows = await tx(c, async t => rowsOf<Record<string, unknown>>(await t.execute(sql`
      select e.id, e.key, e.kind, e.title, e.occurred_at as "occurredAt", e.summary, e.initiative_id as "initiativeId",
        i.code as "initiativeCode", e.owner_id as "ownerId", u.name as "ownerName",
        coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name) order by s.name)
          from engagement_participant ep join stakeholder s on s.id = ep.stakeholder_id where ep.engagement_id = e.id), '[]') as participants,
        count(*) over ()::int as total
      from engagement e left join initiative i on i.id = e.initiative_id left join "user" u on u.id = e.owner_id
      where ${q.archived === 'true' ? sql`e.archived_at is not null` : sql`e.archived_at is null`}
        ${kinds.length ? sql`and e.kind in (${sql.join(kinds.map(k => sql`${k}`), sql`, `)})` : sql``}
        ${q.initiativeId ? sql`and e.initiative_id = ${q.initiativeId}` : sql``}
        ${q.stakeholderId ? sql`and exists (select 1 from engagement_participant ep where ep.engagement_id = e.id and ep.stakeholder_id = ${q.stakeholderId})` : sql``}
        ${q.q ? sql`and (e.title ilike ${'%' + q.q + '%'} or e.summary ilike ${'%' + q.q + '%'} or e.key ilike ${q.q + '%'})` : sql``}
      order by e.occurred_at desc, e.id desc
      limit ${q.limit} offset ${q.offset}`)))
    return c.json({ items: rows.map(({ total: _t, ...r }) => r), total: (rows[0]?.total as number) ?? 0 })
  })

  .post('/', async c => {
    need(c, 'engagement.create')
    const input = await jsonBody(c, engagementCreateSchema)
    const tn = c.var.tenant
    const id = await tx(c, async t => {
      await assertMember(t, input.ownerId)
      const { participantIds, occurredAt, ...fields } = input
      const key = await nextKey(t, tn.workspaceId, 'E', 1000)
      const [e] = await t.insert(engagement).values({ ...fields, occurredAt: new Date(occurredAt), key, ownerId: input.ownerId ?? tn.userId, workspaceId: tn.workspaceId, createdBy: tn.userId, updatedBy: tn.userId }).returning()
      await setParticipants(t, tn.workspaceId, e.id, participantIds)
      await recordActivity(t, tn, { entityType: 'engagement', entityId: e.id, verb: 'created', summary: `Logged ${e.kind.replace('_', ' ')} “${e.title}”` })
      for (const sid of participantIds) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: sid, verb: 'engaged', summary: `${e.kind[0].toUpperCase() + e.kind.slice(1).replace('_', ' ')}: ${e.title}` })
      return e.id
    })
    await trackFirst(c.var.deps.db, 'first_engagement_recorded', c.var.tenant.workspaceId, c.var.tenant.userId)
    return c.json(await tx(c, t => engagementDetail(t, id)), 201)
  })

  .get('/:id', async c => c.json(await tx(c, t => engagementDetail(t, c.req.param('id')))))

  .patch('/:id', async c => {
    need(c, 'engagement.update')
    const input = await patchBody(c, engagementUpdateSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const before = await getOr404(t, engagement, c.req.param('id'), 'Engagement', isNull(engagement.archivedAt))
      if (input.ownerId !== undefined) await assertMember(t, input.ownerId)
      const { version, participantIds, occurredAt, ...rest } = input
      const patch = { ...rest, ...(occurredAt ? { occurredAt: new Date(occurredAt) } : {}) }
      const after = await versionedUpdate(t, engagement, before.id as string, version, patch, tn.userId)
      if (participantIds) await setParticipants(t, tn.workspaceId, before.id as string, participantIds)
      const changes = diff(before, after, Object.keys(patch))
      if (Object.keys(changes).length || participantIds) await recordActivity(t, tn, { entityType: 'engagement', entityId: before.id as string, verb: 'updated', summary: `Updated ${[...Object.keys(changes), ...(participantIds ? ['participants'] : [])].join(', ')}`, changes })
    })
    return c.json(await tx(c, t => engagementDetail(t, c.req.param('id'))))
  })

  .post('/:id/archive', async c => {
    need(c, 'engagement.archive')
    const tn = c.var.tenant
    await tx(c, async t => {
      const e = await getOr404(t, engagement, c.req.param('id'), 'Engagement', isNull(engagement.archivedAt))
      await t.update(engagement).set({ archivedAt: new Date(), updatedAt: new Date(), updatedBy: tn.userId }).where(eq(engagement.id, e.id as string))
      await recordActivity(t, tn, { entityType: 'engagement', entityId: e.id as string, verb: 'archived', summary: `Archived ${e.key}` })
    })
    return c.json({ ok: true })
  })

async function setParticipants(t: Tx, workspaceId: string, engagementId: string, ids: string[]) {
  const unique = [...new Set(ids)]
  await t.delete(engagementParticipant).where(eq(engagementParticipant.engagementId, engagementId))
  if (unique.length) await t.insert(engagementParticipant).values(unique.map(stakeholderId => ({ workspaceId, engagementId, stakeholderId })))
}

async function engagementDetail(t: Tx, id: string) {
  const e = await getOr404(t, engagement, id, 'Engagement')
  const participants = await t.select({ id: stakeholder.id, name: stakeholder.name, title: stakeholder.title, stance: stakeholder.stance, attendance: engagementParticipant.attendance })
    .from(engagementParticipant).innerJoin(stakeholder, eq(stakeholder.id, engagementParticipant.stakeholderId))
    .where(eq(engagementParticipant.engagementId, id)).orderBy(stakeholder.name)
  const owner = e.ownerId ? (await t.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, e.ownerId as string)))[0] ?? null : null
  const init = e.initiativeId ? (await t.select({ id: initiative.id, code: initiative.code, name: initiative.name }).from(initiative).where(eq(initiative.id, e.initiativeId as string)))[0] ?? null : null
  const commitments = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, status: commitment.status, dueDate: commitment.dueDate })
    .from(commitment).where(and(eq(commitment.sourceEngagementId, id), isNull(commitment.archivedAt))).orderBy(desc(commitment.createdAt))
  const decisions = await t.select({ id: decision.id, key: decision.key, title: decision.title, status: decision.status })
    .from(decision).where(and(eq(decision.sourceEngagementId, id), isNull(decision.archivedAt))).orderBy(desc(decision.createdAt))
  return { ...e, participants, owner, initiative: init, commitments, decisions }
}

