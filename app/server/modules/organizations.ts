import { Hono } from 'hono'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { engagement, engagementParticipant, initiative, initiativeStakeholder, organization, stakeholder, stakeholderOrganization } from '../db/schema'
import type { Tx } from '../db/client'
import { jsonBody, patchBody, need, query, tx, type AppEnv, type Ctx } from '../context'
import { diff, recordActivity } from '../history'
import { getOr404, rowsOf, versionedUpdate } from './_shared'
import { listQuerySchema, organizationCreateSchema, organizationUpdateSchema } from '../../shared/schemas'

export const organizationRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const q = query(c, listQuerySchema.extend({ type: listQuerySchema.shape.q }))
    const res = await tx(c, async t => rowsOf<Record<string, unknown>>(await t.execute(sql`
      select o.id, o.name, o.short_name as "shortName", o.type, o.tags, o.website, o.version, o.archived_at as "archivedAt",
        (select count(*) from stakeholder_organization so join stakeholder s on s.id = so.stakeholder_id
           where so.organization_id = o.id and so.valid_to is null and s.archived_at is null)::int as "stakeholderCount",
        (select max(e.occurred_at) from stakeholder_organization so
           join engagement_participant ep on ep.stakeholder_id = so.stakeholder_id
           join engagement e on e.id = ep.engagement_id
           where so.organization_id = o.id and so.valid_to is null and e.archived_at is null) as "lastEngagedAt",
        count(*) over ()::int as total
      from organization o
      where ${q.archived === 'true' ? sql`o.archived_at is not null` : sql`o.archived_at is null`}
        ${q.q ? sql`and (o.name ilike ${'%' + q.q + '%'} or o.short_name ilike ${'%' + q.q + '%'})` : sql``}
        ${q.type ? sql`and o.type = ${q.type}` : sql``}
      order by ${q.sort === 'stakeholders' ? sql`"stakeholderCount" desc,` : sql``} lower(o.name) asc, o.id
      limit ${q.limit} offset ${q.offset}`)))
    return c.json({ items: res.map(({ total: _t, ...r }) => r), total: (res[0]?.total as number) ?? 0 })
  })

  .post('/', async c => {
    need(c, 'organization.create')
    const input = await jsonBody(c, organizationCreateSchema)
    const tn = c.var.tenant
    const o = await tx(c, async t => {
      const [row] = await t.insert(organization).values({ ...input, workspaceId: tn.workspaceId, createdBy: tn.userId, updatedBy: tn.userId }).returning()
      await recordActivity(t, tn, { entityType: 'organization', entityId: row.id, verb: 'created', summary: `Added ${row.name}` })
      return row
    })
    return c.json(o, 201)
  })

  .get('/:id', async c => c.json(await tx(c, t => orgDetail(t, c.req.param('id')))))

  .patch('/:id', async c => {
    need(c, 'organization.update')
    const input = await patchBody(c, organizationUpdateSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const before = await getOr404(t, organization, c.req.param('id'), 'Organization', isNull(organization.archivedAt))
      const { version, ...patch } = input
      const after = await versionedUpdate(t, organization, before.id as string, version, patch, tn.userId)
      const changes = diff(before, after, Object.keys(patch))
      if (Object.keys(changes).length) await recordActivity(t, tn, { entityType: 'organization', entityId: before.id as string, verb: 'updated', summary: `Updated ${Object.keys(changes).join(', ')}`, changes })
    })
    return c.json(await tx(c, t => orgDetail(t, c.req.param('id'))))
  })

  .post('/:id/archive', c => archive(c, true))
  .post('/:id/restore', c => archive(c, false))

async function archive(c: Ctx, on: boolean) {
  const id = c.req.param('id') ?? ''
  need(c, 'organization.archive')
  const tn = c.var.tenant
  await tx(c, async t => {
    const o = await getOr404(t, organization, id, 'Organization')
    if (!!o.archivedAt === on) return
    await t.update(organization).set({ archivedAt: on ? new Date() : null, updatedAt: new Date(), updatedBy: tn.userId, version: sql`${organization.version} + 1` }).where(eq(organization.id, o.id as string))
    await recordActivity(t, tn, { entityType: 'organization', entityId: o.id as string, verb: on ? 'archived' : 'restored', summary: `${on ? 'Archived' : 'Restored'} ${o.name}` })
  })
  return c.json(await tx(c, t => orgDetail(t, id)))
}

async function orgDetail(t: Tx, id: string) {
  const o = await getOr404(t, organization, id, 'Organization')
  const people = await t.select({
    associationId: stakeholderOrganization.id, id: stakeholder.id, name: stakeholder.name, title: stakeholder.title, stance: stakeholder.stance,
    influence: stakeholder.influence, role: stakeholderOrganization.role, validFrom: stakeholderOrganization.validFrom, validTo: stakeholderOrganization.validTo,
  }).from(stakeholderOrganization).innerJoin(stakeholder, eq(stakeholder.id, stakeholderOrganization.stakeholderId))
    .where(and(eq(stakeholderOrganization.organizationId, id), isNull(stakeholder.archivedAt)))
    .orderBy(sql`${stakeholderOrganization.validTo} is not null`, desc(stakeholder.influence), stakeholder.name)
  const currentIds = people.filter(p => !p.validTo).map(p => p.id)
  const initiatives = currentIds.length ? await t.selectDistinct({ id: initiative.id, code: initiative.code, name: initiative.name, status: initiative.status })
    .from(initiativeStakeholder).innerJoin(initiative, eq(initiative.id, initiativeStakeholder.initiativeId))
    .where(and(inArray(initiativeStakeholder.stakeholderId, currentIds), isNull(initiative.archivedAt))) : []
  const engagements = currentIds.length ? await t.selectDistinct({ id: engagement.id, key: engagement.key, kind: engagement.kind, title: engagement.title, occurredAt: engagement.occurredAt })
    .from(engagementParticipant).innerJoin(engagement, eq(engagement.id, engagementParticipant.engagementId))
    .where(and(inArray(engagementParticipant.stakeholderId, currentIds), isNull(engagement.archivedAt)))
    .orderBy(desc(engagement.occurredAt)).limit(30) : []
  return { ...o, people, initiatives, engagements }
}
