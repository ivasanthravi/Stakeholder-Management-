import { Hono } from 'hono'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { decision, decisionStakeholder, engagement, initiative, stakeholder, user } from '../db/schema'
import type { TenantContext, Tx } from '../db/client'
import type { z } from 'zod'
import { jsonBody, patchBody, need, query, tx, type AppEnv } from '../context'
import { diff, nextKey, recordActivity } from '../history'
import { csv, getOr404, rowsOf, versionedUpdate } from './_shared'
import { assertMember } from './stakeholders'
import { decisionCreateSchema, decisionListQuerySchema, decisionUpdateSchema } from '../../shared/schemas'

const STATUS_LABEL: Record<string, string> = { proposed: 'Proposed', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', deferred: 'Deferred' }
const FINAL = new Set(['approved', 'rejected'])

export const decisionRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const q = query(c, decisionListQuerySchema)
    const statuses = csv(q.status)
    const rows = await tx(c, async t => rowsOf<Record<string, unknown>>(await t.execute(sql`
      select d.id, d.key, d.title, d.status, d.due_date as "dueDate", d.decided_at as "decidedAt", d.outcome,
        d.initiative_id as "initiativeId", i.code as "initiativeCode", d.owner_id as "ownerId", u.name as "ownerName", d.version, d.updated_at as "updatedAt",
        (select count(*) from decision_stakeholder ds join stakeholder s on s.id = ds.stakeholder_id where ds.decision_id = d.id)::int as "stakeholderCount",
        count(*) over ()::int as total
      from decision d left join initiative i on i.id = d.initiative_id left join "user" u on u.id = d.owner_id
      where ${q.archived === 'true' ? sql`d.archived_at is not null` : sql`d.archived_at is null`}
        ${statuses.length ? sql`and d.status in (${sql.join(statuses.map(s => sql`${s}`), sql`, `)})` : sql``}
        ${q.initiativeId ? sql`and d.initiative_id = ${q.initiativeId}` : sql``}
        ${q.stakeholderId ? sql`and exists (select 1 from decision_stakeholder ds where ds.decision_id = d.id and ds.stakeholder_id = ${q.stakeholderId})` : sql``}
        ${q.q ? sql`and (d.title ilike ${'%' + q.q + '%'} or d.key ilike ${q.q + '%'})` : sql``}
      order by array_position(array['under_review','proposed','deferred','approved','rejected'], d.status), d.due_date nulls last, d.created_at desc
      limit ${q.limit} offset ${q.offset}`)))
    return c.json({ items: rows.map(({ total: _t, ...r }) => r), total: (rows[0]?.total as number) ?? 0 })
  })

  .post('/', async c => {
    need(c, 'decision.create')
    const input = await jsonBody(c, decisionCreateSchema)
    const tn = c.var.tenant
    // Contributors may propose; only managers+ can create a decision in a decided state.
    if (input.status !== 'proposed') need(c, 'decision.update')
    const id = await tx(c, async t => (await createDecision(t, tn, input)).id)
    return c.json(await tx(c, t => decisionDetail(t, id)), 201)
  })

  .get('/:id', async c => c.json(await tx(c, t => decisionDetail(t, c.req.param('id')))))

  .patch('/:id', async c => {
    need(c, 'decision.update')
    const input = await patchBody(c, decisionUpdateSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const before = await getOr404(t, decision, c.req.param('id'), 'Decision', isNull(decision.archivedAt))
      if (input.ownerId !== undefined) await assertMember(t, input.ownerId)
      const { version, stakeholders, ...rest } = input
      const patch: Record<string, unknown> = { ...rest }
      if (input.status && input.status !== before.status) patch.decidedAt = FINAL.has(input.status) ? new Date() : null
      const after = await versionedUpdate(t, decision, before.id as string, version, patch, tn.userId)
      if (stakeholders) await setStakeholders(t, tn.workspaceId, before.id as string, stakeholders)
      const changes = diff(before, after, Object.keys(rest))
      if (changes.status) await recordActivity(t, tn, { entityType: 'decision', entityId: before.id as string, verb: 'status_changed', summary: `${before.key} ${STATUS_LABEL[changes.status.from as string]} → ${STATUS_LABEL[changes.status.to as string]}`, changes: { status: changes.status } })
      delete changes.status
      if (Object.keys(changes).length || stakeholders) await recordActivity(t, tn, { entityType: 'decision', entityId: before.id as string, verb: 'updated', summary: `Updated ${[...Object.keys(changes), ...(stakeholders ? ['stakeholders'] : [])].join(', ')}`, changes })
    })
    return c.json(await tx(c, t => decisionDetail(t, c.req.param('id'))))
  })

  .post('/:id/archive', async c => {
    need(c, 'decision.archive')
    const tn = c.var.tenant
    await tx(c, async t => {
      const d = await getOr404(t, decision, c.req.param('id'), 'Decision', isNull(decision.archivedAt))
      await t.update(decision).set({ archivedAt: new Date(), updatedAt: new Date(), updatedBy: tn.userId }).where(eq(decision.id, d.id as string))
      await recordActivity(t, tn, { entityType: 'decision', entityId: d.id as string, verb: 'archived', summary: `Archived ${d.key}` })
    })
    return c.json({ ok: true })
  })

/** Shared by the API route and AI proposal acceptance. Callers check permissions first. */
export async function createDecision(t: Tx, tn: TenantContext, input: z.output<typeof decisionCreateSchema>) {
  await assertMember(t, input.ownerId)
  const { stakeholders, ...fields } = input
  const key = await nextKey(t, tn.workspaceId, 'D', 100)
  const [d] = await t.insert(decision).values({
    ...fields, key, ownerId: input.ownerId ?? tn.userId, decidedAt: FINAL.has(input.status) ? new Date() : null,
    workspaceId: tn.workspaceId, createdBy: tn.userId, updatedBy: tn.userId,
  }).returning()
  await setStakeholders(t, tn.workspaceId, d.id, stakeholders)
  await recordActivity(t, tn, { entityType: 'decision', entityId: d.id, verb: 'created', summary: `${d.key} recorded as ${STATUS_LABEL[d.status]}` })
  for (const s of stakeholders) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: s.stakeholderId, verb: 'decision_linked', summary: `${s.role[0].toUpperCase() + s.role.slice(1)} on ${d.key} ${d.title}` })
  return d
}

async function setStakeholders(t: Tx, workspaceId: string, decisionId: string, list: { stakeholderId: string; role: 'approver' | 'consulted' | 'informed' | 'affected' }[]) {
  await t.delete(decisionStakeholder).where(eq(decisionStakeholder.decisionId, decisionId))
  const seen = new Set<string>()
  const rows = list.filter(s => !seen.has(s.stakeholderId) && seen.add(s.stakeholderId)).map(s => ({ workspaceId, decisionId, ...s }))
  if (rows.length) await t.insert(decisionStakeholder).values(rows)
}

export async function decisionDetail(t: Tx, id: string) {
  const d = await getOr404(t, decision, id, 'Decision')
  const stakeholders = await t.select({ id: stakeholder.id, name: stakeholder.name, title: stakeholder.title, stance: stakeholder.stance, role: decisionStakeholder.role })
    .from(decisionStakeholder).innerJoin(stakeholder, eq(stakeholder.id, decisionStakeholder.stakeholderId))
    .where(eq(decisionStakeholder.decisionId, id)).orderBy(stakeholder.name)
  const owner = d.ownerId ? (await t.select({ id: user.id, name: user.name }).from(user).where(eq(user.id, d.ownerId as string)))[0] ?? null : null
  const init = d.initiativeId ? (await t.select({ id: initiative.id, code: initiative.code, name: initiative.name }).from(initiative).where(eq(initiative.id, d.initiativeId as string)))[0] ?? null : null
  const source = d.sourceEngagementId ? (await t.select({ id: engagement.id, key: engagement.key, title: engagement.title }).from(engagement).where(and(eq(engagement.id, d.sourceEngagementId as string))))[0] ?? null : null
  return { ...d, stakeholders, owner, initiative: init, sourceEngagement: source }
}
