import { Hono } from 'hono'
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import {
  activityEvent, commitment, decision, decisionStakeholder, engagement, engagementParticipant, initiative, initiativeStakeholder,
  membership, organization, stakeholder, stakeholderAccess, stakeholderOrganization, user,
} from '../db/schema'
import type { Tx } from '../db/client'
import { jsonBody, patchBody, meta, need, query, tx, type AppEnv, type Ctx } from '../context'
import { trackFirst } from '../analytics'
import { requireFeature } from '../billing/entitlements'
import { ApiError } from '../http'
import { diff, recordActivity, recordAudit } from '../history'
import { csv, getOr404, rowsOf, STANCE_LABEL, versionedUpdate } from './_shared'
import { buildBriefing } from './briefing'
import { associationCreateSchema, associationEndSchema, stakeholderCreateSchema, stakeholderListQuerySchema, stakeholderUpdateSchema } from '../../shared/schemas'
import { z } from 'zod'

const WEEK = 7 * 86_400_000

/** Owners must be members of this workspace (user ids are global, so this is checked explicitly). */
export async function assertMember(t: Tx, userId: string | null | undefined) {
  if (!userId) return
  const m = await t.select({ id: membership.id }).from(membership).where(and(eq(membership.userId, userId), isNull(membership.removedAt))).limit(1)
  if (!m[0]) throw new ApiError(422, 'invalid', 'Owner must be a member of this workspace', { fields: { ownerId: 'Not a member of this workspace' } })
}

/** Weekly engagement counts (oldest → newest) for a set of stakeholders. */
export async function weeklySeries(t: Tx, ids: string[], weeks: number) {
  const out = new Map<string, number[]>()
  if (!ids.length) return out
  const since = new Date(Date.now() - weeks * WEEK)
  const rows = await t.select({ sid: engagementParticipant.stakeholderId, at: engagement.occurredAt })
    .from(engagementParticipant).innerJoin(engagement, eq(engagement.id, engagementParticipant.engagementId))
    .where(and(inArray(engagementParticipant.stakeholderId, ids), gte(engagement.occurredAt, since), isNull(engagement.archivedAt)))
  const now = Date.now()
  for (const r of rows) {
    const w = Math.floor((now - r.at.getTime()) / WEEK)
    if (w < 0 || w >= weeks) continue
    let a = out.get(r.sid); if (!a) out.set(r.sid, a = new Array(weeks).fill(0))
    a[weeks - 1 - w]++
  }
  return out
}

const SORTS: Record<string, string> = {
  name: 'lower(name)', influence: 'coalesce(influence, 0) * 10 + coalesce(interest, 0)', last: 'last_engaged_at',
  open: 'open_commitments', updated: 'updated_at', stance: `array_position(array['opposed','concerned','neutral','supporter','champion','unknown'], stance)`,
}

export const stakeholderRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const q = query(c, stakeholderListQuerySchema)
    const stances = csv(q.stance)
    const sortExpr = SORTS[q.sort ?? 'influence'] ?? SORTS.influence
    const dir = q.sort ? (q.dir === 'desc' ? 'desc' : 'asc') : 'desc'
    const result = await tx(c, async t => {
      const filters = [
        q.archived === 'true' ? sql`s.archived_at is not null` : sql`s.archived_at is null`,
        q.q ? sql`(s.name ilike ${'%' + q.q + '%'} or s.title ilike ${'%' + q.q + '%'} or s.email ilike ${'%' + q.q + '%'}
          or exists (select 1 from stakeholder_organization so join organization o on o.id = so.organization_id
            where so.stakeholder_id = s.id and so.valid_to is null and o.name ilike ${'%' + q.q + '%'}))` : undefined,
        stances.length ? sql`s.stance in (${sql.join(stances.map(x => sql`${x}`), sql`, `)})` : undefined,
        q.minInfluence ? sql`s.influence >= ${q.minInfluence}` : undefined,
        q.initiativeId ? sql`exists (select 1 from initiative_stakeholder i where i.stakeholder_id = s.id and i.initiative_id = ${q.initiativeId})` : undefined,
        q.organizationId ? sql`exists (select 1 from stakeholder_organization so where so.stakeholder_id = s.id and so.organization_id = ${q.organizationId} and so.valid_to is null)` : undefined,
        q.ownerId ? sql`s.owner_id = ${q.ownerId}` : undefined,
      ].filter(Boolean)
      // Sorting on the stakeholder's own columns doesn't need the per-person lookups: pick the page first (on the table
      // alone), then compute details for those rows only. At 5,000 stakeholders the single-query form computed the
      // lookups for everyone before taking 50 (docs/simulation/performance-results.md).
      const pageFirst = q.cold !== 'true' && ['name', 'influence', 'updated', 'stance'].includes(q.sort ?? 'influence')
      const res = pageFirst ? await t.execute(sql`
        with picked as (
          select s.id, count(*) over ()::int as total,
            row_number() over (order by ${sql.raw(sortExpr)} ${sql.raw(dir)} nulls last, lower(s.name) asc, s.id asc) as ord
          from stakeholder s
          where ${sql.join(filters as never[], sql` and `)}
          order by ${sql.raw(sortExpr)} ${sql.raw(dir)} nulls last, lower(s.name) asc, s.id asc
          limit ${q.limit} offset ${q.offset}
        )
        select s.id, s.name, s.title, s.email, s.stance, s.influence, s.interest, s.engagement_status, s.tags, s.owner_id,
          s.restricted, s.version, s.updated_at, u.name as owner_name, prim.org as primary_org,
          last.at as last_engaged_at, coalesce(openc.n, 0) as open_commitments, picked.total
        from picked join stakeholder s on s.id = picked.id left join "user" u on u.id = s.owner_id
          left join lateral (
            select max(e.occurred_at) as at from engagement_participant ep join engagement e on e.id = ep.engagement_id
            where ep.stakeholder_id = s.id and e.archived_at is null
          ) last on true
          left join lateral (
            select count(*)::int as n from commitment c
            where c.stakeholder_id = s.id and c.status in ('open', 'in_progress') and c.archived_at is null
          ) openc on true
          left join lateral (
            select json_build_object('id', o.id, 'name', o.name, 'shortName', o.short_name) as org
            from stakeholder_organization so join organization o on o.id = so.organization_id
            where so.stakeholder_id = s.id and so.valid_to is null order by so.is_primary desc, so.created_at limit 1
          ) prim on true
        order by picked.ord`) : await t.execute(sql`
        -- Per-stakeholder LATERAL lookups (indexed) instead of workspace-wide aggregates joined by filter: the aggregate form
        -- went quadratic at a few thousand stakeholders (see docs/launch/performance-report.md).
        with base as (
          select s.id, s.name, s.title, s.email, s.stance, s.influence, s.interest, s.engagement_status, s.tags, s.owner_id,
            s.restricted, s.version, s.updated_at, u.name as owner_name, prim.org as primary_org,
            last.at as last_engaged_at, coalesce(openc.n, 0) as open_commitments
          from stakeholder s left join "user" u on u.id = s.owner_id
            left join lateral (
              select max(e.occurred_at) as at from engagement_participant ep join engagement e on e.id = ep.engagement_id
              where ep.stakeholder_id = s.id and e.archived_at is null
            ) last on true
            left join lateral (
              select count(*)::int as n from commitment c
              where c.stakeholder_id = s.id and c.status in ('open', 'in_progress') and c.archived_at is null
            ) openc on true
            left join lateral (
              select json_build_object('id', o.id, 'name', o.name, 'shortName', o.short_name) as org
              from stakeholder_organization so join organization o on o.id = so.organization_id
              where so.stakeholder_id = s.id and so.valid_to is null order by so.is_primary desc, so.created_at limit 1
            ) prim on true
        where ${sql.join(filters as never[], sql` and `)}
        )
        select *, count(*) over ()::int as total from base
        ${q.cold === 'true' ? sql`where last_engaged_at is null or last_engaged_at < now() - interval '60 days'` : sql``}
        order by ${sql.raw(sortExpr)} ${sql.raw(dir)} nulls last, lower(name) asc, id asc
        limit ${q.limit} offset ${q.offset}`)
      const rows = rowsOf<Record<string, unknown>>(res)
      const series = await weeklySeries(t, rows.map(r => r.id as string), 26)
      return {
        total: (rows[0]?.total as number | undefined) ?? 0,
        items: rows.map(r => ({
          id: r.id, name: r.name, title: r.title, email: r.email, stance: r.stance, influence: r.influence, interest: r.interest,
          engagementStatus: r.engagement_status, tags: r.tags, ownerId: r.owner_id, ownerName: r.owner_name, restricted: r.restricted,
          version: r.version, updatedAt: r.updated_at, primaryOrg: r.primary_org, lastEngagedAt: r.last_engaged_at,
          openCommitments: r.open_commitments, series: series.get(r.id as string) ?? new Array(26).fill(0),
        })),
      }
    })
    return c.json(result)
  })

  .post('/', async c => {
    need(c, 'stakeholder.create')
    const input = await jsonBody(c, stakeholderCreateSchema)
    const tn = c.var.tenant
    const created = await tx(c, async t => {
      await assertMember(t, input.ownerId)
      const { organizations, initiativeIds, ...fields } = input
      const [s] = await t.insert(stakeholder).values({ ...fields, workspaceId: tn.workspaceId, createdBy: tn.userId, updatedBy: tn.userId }).returning()
      if (organizations.length) {
        await t.insert(stakeholderOrganization).values(organizations.map((o, i) => ({
          workspaceId: tn.workspaceId, stakeholderId: s.id, organizationId: o.organizationId, role: o.role, isPrimary: o.isPrimary || i === 0,
          validFrom: o.validFrom ?? null, createdBy: tn.userId, updatedBy: tn.userId,
        })))
      }
      if (initiativeIds.length) {
        await t.insert(initiativeStakeholder).values(initiativeIds.map(id => ({ workspaceId: tn.workspaceId, initiativeId: id, stakeholderId: s.id, createdBy: tn.userId })))
      }
      await recordActivity(t, tn, { entityType: 'stakeholder', entityId: s.id, verb: 'created', summary: `Added ${s.name}` })
      return s
    })
    await trackFirst(c.var.deps.db, 'first_stakeholder_added', tn.workspaceId, tn.userId)
    return c.json(await tx(c, t => detail(t, created.id)), 201)
  })

  .get('/:id', async c => c.json(await tx(c, t => detail(t, c.req.param('id')))))

  .patch('/:id', async c => {
    const input = await patchBody(c, stakeholderUpdateSchema)
    const tn = c.var.tenant
    need(c, 'stakeholder.update')
    if (input.restricted !== undefined) need(c, 'stakeholder.restrict')
    // Restricting needs the plan feature; lifting a restriction is always allowed (e.g. after a downgrade).
    if (input.restricted === true) requireFeature(c.var.entitlements, 'records.restricted')
    await tx(c, async t => {
      const before = await getOr404(t, stakeholder, c.req.param('id'), 'Stakeholder', isNull(stakeholder.archivedAt))
      if (input.ownerId !== undefined) await assertMember(t, input.ownerId)
      const { version, ...patch } = input
      const after = await versionedUpdate(t, stakeholder, before.id as string, version, patch, tn.userId)
      const changes = diff(before, after, Object.keys(patch))
      if (changes.stance) {
        await recordActivity(t, tn, { entityType: 'stakeholder', entityId: before.id as string, verb: 'stance_changed', summary: `Stance changed from ${STANCE_LABEL[changes.stance.from as string]} to ${STANCE_LABEL[changes.stance.to as string]}`, changes: { stance: changes.stance } })
        delete changes.stance
      }
      if (Object.keys(changes).length) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: before.id as string, verb: 'updated', summary: `Updated ${Object.keys(changes).join(', ')}`, changes })
      if (input.restricted !== undefined && input.restricted !== before.restricted) {
        await recordAudit(t, { workspaceId: tn.workspaceId, actorId: tn.userId, action: input.restricted ? 'stakeholder.restricted' : 'stakeholder.unrestricted', entityType: 'stakeholder', entityId: before.id as string }, meta(c))
      }
    })
    return c.json(await tx(c, t => detail(t, c.req.param('id'))))
  })

  .post('/:id/archive', async c => archiveToggle(c, true))
  .post('/:id/restore', async c => archiveToggle(c, false))

  .post('/:id/organizations', async c => {
    need(c, 'stakeholder.update')
    const input = await jsonBody(c, associationCreateSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const s = await getOr404(t, stakeholder, c.req.param('id'), 'Stakeholder')
      const org = await getOr404(t, organization, input.organizationId, 'Organization')
      if (input.isPrimary) await t.update(stakeholderOrganization).set({ isPrimary: false }).where(eq(stakeholderOrganization.stakeholderId, s.id as string))
      await t.insert(stakeholderOrganization).values({ workspaceId: tn.workspaceId, stakeholderId: s.id as string, organizationId: input.organizationId, role: input.role, isPrimary: input.isPrimary, validFrom: input.validFrom ?? null, createdBy: tn.userId, updatedBy: tn.userId })
      await recordActivity(t, tn, { entityType: 'stakeholder', entityId: s.id as string, verb: 'organization_added', summary: `Associated with ${org.name}${input.role ? ` as ${input.role}` : ''}` })
    })
    return c.json(await tx(c, t => detail(t, c.req.param('id'))), 201)
  })

  /** Ending an association keeps it as history (valid_to) rather than deleting it. */
  .post('/:id/organizations/:assocId/end', async c => {
    need(c, 'stakeholder.update')
    const input = await jsonBody(c, associationEndSchema)
    const tn = c.var.tenant
    await tx(c, async t => {
      const a = await getOr404(t, stakeholderOrganization, c.req.param('assocId'), 'Association', eq(stakeholderOrganization.stakeholderId, c.req.param('id')))
      if (a.validTo) throw new ApiError(409, 'conflict', 'This association has already ended')
      await t.update(stakeholderOrganization).set({ validTo: input.validTo, isPrimary: false, updatedAt: new Date(), updatedBy: tn.userId }).where(eq(stakeholderOrganization.id, a.id as string))
      const [org] = await t.select({ name: organization.name }).from(organization).where(eq(organization.id, a.organizationId as string))
      await recordActivity(t, tn, { entityType: 'stakeholder', entityId: c.req.param('id'), verb: 'organization_ended', summary: `Left ${org?.name ?? 'organization'}` })
    })
    return c.json(await tx(c, t => detail(t, c.req.param('id'))))
  })

  .put('/:id/access', async c => {
    need(c, 'stakeholder.restrict')
    requireFeature(c.var.entitlements, 'records.restricted')
    const { userIds } = await jsonBody(c, z.object({ userIds: z.array(z.string().min(1)).max(200) }))
    const tn = c.var.tenant
    await tx(c, async t => {
      await getOr404(t, stakeholder, c.req.param('id'), 'Stakeholder')
      for (const u of userIds) await assertMember(t, u)
      await t.delete(stakeholderAccess).where(eq(stakeholderAccess.stakeholderId, c.req.param('id')))
      if (userIds.length) await t.insert(stakeholderAccess).values(userIds.map(userId => ({ workspaceId: tn.workspaceId, stakeholderId: c.req.param('id'), userId })))
      await recordAudit(t, { workspaceId: tn.workspaceId, actorId: tn.userId, action: 'stakeholder.access_changed', entityType: 'stakeholder', entityId: c.req.param('id'), metadata: { count: userIds.length } }, meta(c))
    })
    return c.json({ ok: true })
  })

  .get('/:id/activity', async c => {
    const before = Number(c.req.query('before')) || undefined
    const rows = await tx(c, async t => {
      await getOr404(t, stakeholder, c.req.param('id'), 'Stakeholder')
      return t.select({ id: activityEvent.id, verb: activityEvent.verb, summary: activityEvent.summary, changes: activityEvent.changes, createdAt: activityEvent.createdAt, actor: user.name })
        .from(activityEvent).leftJoin(user, eq(user.id, activityEvent.actorId))
        .where(and(eq(activityEvent.entityType, 'stakeholder'), eq(activityEvent.entityId, c.req.param('id')), before ? lt(activityEvent.id, before) : undefined))
        .orderBy(desc(activityEvent.id)).limit(50)
    })
    return c.json({ events: rows, next: rows.length === 50 ? rows[rows.length - 1].id : null })
  })

  /** Everything the profile workspace needs in one round trip. */
  .get('/:id/overview', async c => c.json(await tx(c, t => overview(t, c.req.param('id')))))

  /**
   * Timeline: everything recorded about one person, newest first — engagements they took part in, commitments to or
   * from them (raised and completed), decisions they're part of (opened and decided), and changes to their record.
   * Keyset-paged on (time, id); `kinds` filters. Row-level security applies to every source table, and the person
   * must be visible to the caller (restricted records 404).
   */
  .get('/:id/timeline', async c => {
    const id = c.req.param('id')
    const q = query(c, z.object({
      kinds: z.string().optional(),
      before: z.string().regex(/^[0-9T:.\-+Z]+\|[0-9a-z-]+$/i).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
    }))
    const kinds = new Set((q.kinds ?? 'engagement,commitment,decision,change').split(',').filter(Boolean))
    const [beforeAt, beforeId] = q.before ? q.before.split('|') : [null, null]
    return c.json(await tx(c, async t => {
      await getOr404(t, stakeholder, id, 'Stakeholder')
      const parts = []
      if (kinds.has('engagement')) parts.push(sql`
        select 'engagement' as kind, e.id::text as id, e.id as record_id, e.key, e.title, e.summary as detail, e.kind as sub, null::text as status, e.occurred_at as at, i.code as initiative_code
        from engagement_participant ep join engagement e on e.id = ep.engagement_id left join initiative i on i.id = e.initiative_id
        where ep.stakeholder_id = ${id} and e.archived_at is null`)
      if (kinds.has('commitment')) parts.push(sql`
        select 'commitment' as kind, 'c' || cm.id as id, cm.id as record_id, cm.key, cm.title, null as detail, cm.direction as sub, cm.status, cm.created_at as at, i.code as initiative_code
        from commitment cm left join initiative i on i.id = cm.initiative_id where cm.stakeholder_id = ${id} and cm.archived_at is null
        union all
        select 'commitment_done', 'd' || cm.id, cm.id, cm.key, cm.title, null, cm.direction, cm.status, cm.completed_at, i.code
        from commitment cm left join initiative i on i.id = cm.initiative_id where cm.stakeholder_id = ${id} and cm.archived_at is null and cm.completed_at is not null`)
      if (kinds.has('decision')) parts.push(sql`
        select 'decision' as kind, 'o' || d.id as id, d.id as record_id, d.key, d.title, d.outcome as detail, ds.role as sub, d.status, d.created_at as at, i.code as initiative_code
        from decision_stakeholder ds join decision d on d.id = ds.decision_id left join initiative i on i.id = d.initiative_id
        where ds.stakeholder_id = ${id} and d.archived_at is null
        union all
        select 'decision_decided', 'x' || d.id, d.id, d.key, d.title, d.outcome, ds.role, d.status, d.decided_at, i.code
        from decision_stakeholder ds join decision d on d.id = ds.decision_id left join initiative i on i.id = d.initiative_id
        where ds.stakeholder_id = ${id} and d.archived_at is null and d.decided_at is not null`)
      // Record changes; verbs that only echo an engagement, commitment or decision above are left out.
      if (kinds.has('change')) parts.push(sql`
        select 'change' as kind, 'a' || a.id as id, null::uuid as record_id, null as key, a.summary as title, u.name as detail, a.verb as sub, null as status, a.created_at as at, null as initiative_code
        from activity_event a left join "user" u on u.id = a.actor_id
        where a.entity_type = 'stakeholder' and a.entity_id = ${id} and a.verb not in ('engaged', 'commitment_added', 'decision_linked')`)
      if (!parts.length) return { items: [], next: null }
      const rows = rowsOf<{ kind: string; id: string; record_id: string | null; key: string | null; title: string; detail: string | null; sub: string | null; status: string | null; at: Date | string; initiative_code: string | null }>(await t.execute(sql`
        select * from (${sql.join(parts, sql` union all `)}) x
        ${beforeAt ? sql`where (x.at, x.id) < (${beforeAt}::timestamptz, ${beforeId})` : sql``}
        order by x.at desc, x.id desc limit ${q.limit + 1}`))
      const page = rows.slice(0, q.limit)
      const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString())
      const last = page[page.length - 1]
      return {
        items: page.map(r => ({ kind: r.kind, id: r.id, recordId: r.record_id, key: r.key, title: r.title, detail: r.detail, sub: r.sub, status: r.status, at: iso(r.at), initiativeCode: r.initiative_code })),
        next: rows.length > q.limit && last ? `${iso(last.at)}|${last.id}` : null,
      }
    }))
  })

async function archiveToggle(c: Ctx, archive: boolean) {
  const id = c.req.param('id') ?? ''
  need(c, 'stakeholder.archive')
  const tn = c.var.tenant
  await tx(c, async t => {
    const s = await getOr404(t, stakeholder, id, 'Stakeholder')
    if (!!s.archivedAt === archive) return
    await t.update(stakeholder).set({ archivedAt: archive ? new Date() : null, updatedAt: new Date(), updatedBy: tn.userId, version: sql`${stakeholder.version} + 1` }).where(eq(stakeholder.id, s.id as string))
    await recordActivity(t, tn, { entityType: 'stakeholder', entityId: s.id as string, verb: archive ? 'archived' : 'restored', summary: `${archive ? 'Archived' : 'Restored'} ${s.name}` })
  })
  return c.json(await tx(c, t => detail(t, id)))
}

export async function detail(t: Tx, id: string) {
  const s = await getOr404(t, stakeholder, id, 'Stakeholder')
  const owner = s.ownerId ? (await t.select({ id: user.id, name: user.name, email: user.email }).from(user).where(eq(user.id, s.ownerId as string)))[0] ?? null : null
  const organizations = await t.select({
    id: stakeholderOrganization.id, organizationId: organization.id, name: organization.name, shortName: organization.shortName, type: organization.type,
    role: stakeholderOrganization.role, isPrimary: stakeholderOrganization.isPrimary, validFrom: stakeholderOrganization.validFrom, validTo: stakeholderOrganization.validTo,
  }).from(stakeholderOrganization).innerJoin(organization, eq(organization.id, stakeholderOrganization.organizationId))
    .where(eq(stakeholderOrganization.stakeholderId, id))
    .orderBy(sql`${stakeholderOrganization.validTo} is not null`, desc(stakeholderOrganization.isPrimary), desc(stakeholderOrganization.createdAt))
  const initiatives = await t.select({ id: initiative.id, code: initiative.code, name: initiative.name, role: initiativeStakeholder.role })
    .from(initiativeStakeholder).innerJoin(initiative, eq(initiative.id, initiativeStakeholder.initiativeId))
    .where(and(eq(initiativeStakeholder.stakeholderId, id), isNull(initiative.archivedAt))).orderBy(initiative.code)
  const access = s.restricted ? await t.select({ userId: stakeholderAccess.userId, name: user.name }).from(stakeholderAccess).leftJoin(user, eq(user.id, stakeholderAccess.userId)).where(eq(stakeholderAccess.stakeholderId, id)) : []
  return { ...s, owner, organizations, initiatives, access }
}

export async function overview(t: Tx, id: string) {
  const s = await detail(t, id)
  const engagements = await t.select({ id: engagement.id, key: engagement.key, kind: engagement.kind, title: engagement.title, occurredAt: engagement.occurredAt, summary: engagement.summary, initiativeId: engagement.initiativeId })
    .from(engagementParticipant).innerJoin(engagement, eq(engagement.id, engagementParticipant.engagementId))
    .where(and(eq(engagementParticipant.stakeholderId, id), isNull(engagement.archivedAt)))
    .orderBy(desc(engagement.occurredAt)).limit(200)
  const commitments = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, status: commitment.status, dueDate: commitment.dueDate, direction: commitment.direction, ownerId: commitment.ownerId, ownerName: user.name, version: commitment.version, sourceEngagementId: commitment.sourceEngagementId })
    .from(commitment).leftJoin(user, eq(user.id, commitment.ownerId))
    .where(and(eq(commitment.stakeholderId, id), isNull(commitment.archivedAt))).orderBy(commitment.dueDate)
  const decisions = await t.select({ id: decision.id, key: decision.key, title: decision.title, status: decision.status, dueDate: decision.dueDate, role: decisionStakeholder.role, initiativeId: decision.initiativeId })
    .from(decisionStakeholder).innerJoin(decision, eq(decision.id, decisionStakeholder.decisionId))
    .where(and(eq(decisionStakeholder.stakeholderId, id), isNull(decision.archivedAt))).orderBy(desc(decision.createdAt))
  const relRows = rowsOf<Record<string, unknown>>(await t.execute(sql`
    select r.id, r.type, r.directed, r.strength, r.status, r.description, r.version,
      case when r.source_stakeholder_id = ${id} then 'out' else 'in' end as direction,
      coalesce(case when r.source_stakeholder_id = ${id} then r.target_stakeholder_id else r.source_stakeholder_id end,
               case when r.source_stakeholder_id = ${id} then r.target_organization_id else r.source_organization_id end) as other_id,
      case when coalesce(case when r.source_stakeholder_id = ${id} then r.target_stakeholder_id else r.source_stakeholder_id end, null) is not null then 'stakeholder' else 'organization' end as other_kind
    from relationship r
    where r.archived_at is null and (r.source_stakeholder_id = ${id} or r.target_stakeholder_id = ${id})`))
  const otherS = relRows.filter(r => r.other_kind === 'stakeholder').map(r => r.other_id as string)
  const otherO = relRows.filter(r => r.other_kind === 'organization').map(r => r.other_id as string)
  const people = otherS.length ? await t.select({ id: stakeholder.id, name: stakeholder.name, stance: stakeholder.stance, influence: stakeholder.influence, title: stakeholder.title }).from(stakeholder).where(inArray(stakeholder.id, otherS)) : []
  const orgs = otherO.length ? await t.select({ id: organization.id, name: organization.name, shortName: organization.shortName }).from(organization).where(inArray(organization.id, otherO)) : []
  // Relationships to records the viewer cannot see (restricted) are omitted entirely.
  const relationships = relRows.map(r => {
    const other = r.other_kind === 'stakeholder' ? people.find(p => p.id === r.other_id) : orgs.find(o => o.id === r.other_id)
    return other ? { id: r.id, type: r.type, directed: r.directed, strength: r.strength, status: r.status, description: r.description, version: r.version, direction: r.direction, otherKind: r.other_kind, other } : null
  }).filter(Boolean)
  const series = (await weeklySeries(t, [id], 52)).get(id) ?? new Array(52).fill(0)
  const briefing = buildBriefing({ s: s as never, engagements, commitments, decisions, relationships: relationships as never[] })
  // The timeline returns the latest 200; the total is counted separately so the profile never presents 200 as "all".
  const engagementTotal = engagements.length < 200 ? engagements.length : Number(rowsOf<{ n: number }>(await t.execute(sql`
    select count(*)::int as n from engagement_participant ep join engagement e on e.id = ep.engagement_id
    where ep.stakeholder_id = ${id} and e.archived_at is null`))[0]?.n ?? engagements.length)
  return { stakeholder: s, engagements, engagementTotal, commitments, decisions, relationships, series, briefing }
}

