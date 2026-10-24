// Read models for the Command Center, Stakeholder Universe, search and pickers.
// Everything runs under the tenant RLS context, so restricted and foreign records never appear.
import { Hono } from 'hono'
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import { activityEvent, initiative, membership, organization, user } from '../db/schema'
import { tx, type AppEnv } from '../context'
import type { Tx } from '../db/client'
import { aiSettings } from '../ai/usage'
import { rowsOf, STANCE_LABEL } from './_shared'
import { z } from 'zod'

const DAY = 86_400_000

export interface Signal {
  id: string
  kind: 'overdue' | 'due-soon' | 'decision-waiting' | 'cooling' | 'unowned' | 'stance-shift' | 'unassigned' | 'repeated-delay'
  severity: 1 | 2 | 3
  title: string
  reason: string
  rule: string
  stakeholder?: { id: string; name: string; title: string | null; stance: string } | null
  commitmentId?: string
  commitmentVersion?: number
  decisionId?: string
  ownerId?: string | null
  ownerName?: string | null
  initiativeCode?: string | null
  evidence: { id: string; key: string; title: string; occurredAt: string }[]
  at: number
  next?: { text: string; action: 'follow_up_commitment' | 'log_engagement' | 'review_decision' | 'assign_owner' | 'open_record' } | null
}

export interface Thresholds { noContactDays: number; dueSoonDays: number; decisionStaleDays: number; coolingRatio: number }

const NEXT_STEP: Record<string, (s: Signal) => { text: string; action: NonNullable<Signal['next']>['action'] }> = {
  overdue: s => ({ text: s.stakeholder ? `Contact ${s.stakeholder.name.split(' ')[0]} with an update and agree a new date, or mark it complete.` : 'Complete it or agree a new date.', action: 'follow_up_commitment' }),
  'due-soon': () => ({ text: 'Confirm it is on track with the owner.', action: 'open_record' }),
  'decision-waiting': () => ({ text: 'Review what the approvers still need and set or confirm the decision date.', action: 'review_decision' }),
  cooling: s => ({ text: `Plan contact with ${s.stakeholder?.name.split(' ')[0] ?? 'them'}; review open items first.`, action: 'log_engagement' }),
  unowned: () => ({ text: 'Assign a relationship owner.', action: 'assign_owner' }),
  'stance-shift': s => ({ text: `Find out what changed for ${s.stakeholder?.name.split(' ')[0] ?? 'them'} and record it.`, action: 'log_engagement' }),
  unassigned: () => ({ text: 'Assign an accountable owner.', action: 'assign_owner' }),
  'repeated-delay': () => ({ text: 'Agree a realistic date with the owner, or escalate.', action: 'follow_up_commitment' }),
}

/** Read model for the Command Center. Pure SQL + rules; thresholds come from workspace settings. */
export async function computeDashboard(t: Tx, me: string, th: Thresholds) {
      const now = Date.now()
      const commitments = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select cm.id, cm.key, cm.title, cm.status, cm.due_date as "dueDate", cm.owner_id as "ownerId", u.name as "ownerName",
          cm.stakeholder_id as "stakeholderId", s.name as "stakeholderName", s.title as "stakeholderTitle", s.stance as "stakeholderStance",
          i.code as "initiativeCode", e.id as "evId", e.key as "evKey", e.title as "evTitle", e.occurred_at as "evAt", cm.version
        from commitment cm left join "user" u on u.id = cm.owner_id left join stakeholder s on s.id = cm.stakeholder_id
          left join initiative i on i.id = cm.initiative_id left join engagement e on e.id = cm.source_engagement_id
        where cm.archived_at is null and cm.status in ('open','in_progress') and cm.due_date is not null
          and cm.due_date between current_date - 60 and current_date + 30
          and (cm.stakeholder_id is null or s.id is not null)`))
      const decisions = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select d.id, d.key, d.title, d.status, d.due_date as "dueDate", d.created_at as "createdAt", d.owner_id as "ownerId", u.name as "ownerName",
          i.code as "initiativeCode",
          (select count(*) from decision_stakeholder ds join stakeholder s on s.id = ds.stakeholder_id where ds.decision_id = d.id and ds.role = 'approver')::int as approvers
        from decision d left join "user" u on u.id = d.owner_id left join initiative i on i.id = d.initiative_id
        where d.archived_at is null and d.status in ('proposed','under_review')
        order by d.due_date nulls last, d.created_at`))
      const people = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select s.id, s.name, s.title, s.stance, s.influence, s.owner_id as "ownerId", u.name as "ownerName",
          count(e.id) filter (where e.occurred_at > now() - make_interval(days => ${th.noContactDays}))::int as recent,
          count(e.id) filter (where e.occurred_at <= now() - make_interval(days => ${th.noContactDays}) and e.occurred_at > now() - make_interval(days => ${th.noContactDays * 2}))::int as prior,
          max(e.occurred_at) as "lastAt"
        from stakeholder s left join "user" u on u.id = s.owner_id
          left join engagement_participant ep on ep.stakeholder_id = s.id
          left join engagement e on e.id = ep.engagement_id and e.archived_at is null
        where s.archived_at is null and s.engagement_status <> 'do_not_contact'
        group by s.id, u.name`))
      const recentEv = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select distinct on (ep.stakeholder_id) ep.stakeholder_id as sid, e.id, e.key, e.title, e.occurred_at as "occurredAt"
        from engagement_participant ep join engagement e on e.id = ep.engagement_id
        where e.archived_at is null order by ep.stakeholder_id, e.occurred_at desc`))
      const evBy = new Map(recentEv.map(r => [r.sid as string, r]))
      const shifts = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select a.entity_id as sid, a.changes, a.created_at as at, s.name, s.title, s.stance
        from activity_event a join stakeholder s on s.id = a.entity_id
        where a.entity_type = 'stakeholder' and a.verb = 'stance_changed' and a.created_at > now() - interval '30 days' and s.archived_at is null
        order by a.created_at desc`))

      const signals: Signal[] = []
      const counterparty = (r: Record<string, unknown>) =>
        ({ id: r.stakeholderId as string, name: r.stakeholderName as string, title: r.stakeholderTitle as string | null, stance: r.stakeholderStance as string })
      for (const cm of commitments) {
        const due = Date.parse(String(cm.dueDate) + 'T23:59:59Z')
        const days = Math.floor((due - now) / DAY)
        const ev = cm.evId ? [{ id: cm.evId as string, key: cm.evKey as string, title: cm.evTitle as string, occurredAt: new Date(cm.evAt as string).toISOString() }] : []
        const base = { title: `${cm.key} ${cm.title}`, stakeholder: cm.stakeholderId ? counterparty(cm) : null, commitmentId: cm.id as string, commitmentVersion: cm.version as number, ownerId: cm.ownerId as string | null, ownerName: cm.ownerName as string | null, initiativeCode: cm.initiativeCode as string | null, evidence: ev, at: due }
        if (days < 0) signals.push({ ...base, id: `o-${cm.id}`, kind: 'overdue', severity: 3, reason: `${-days} day${days === -1 ? '' : 's'} overdue${cm.stakeholderName ? ` · promised to ${cm.stakeholderName}` : ''}`, rule: 'Open commitment past its due date' })
        else if (days <= th.dueSoonDays) signals.push({ ...base, id: `d-${cm.id}`, kind: 'due-soon', severity: 2, reason: `${days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`}${cm.stakeholderName ? ` · ${cm.stakeholderName}` : ''}`, rule: `Open commitment due within ${th.dueSoonDays} days` })
      }
      for (const d of decisions) {
        const age = Math.floor((now - new Date(d.createdAt as string).getTime()) / DAY)
        const due = d.dueDate ? Math.floor((Date.parse(String(d.dueDate) + 'T23:59:59Z') - now) / DAY) : null
        if ((due !== null && due < th.dueSoonDays) || age >= th.decisionStaleDays) {
          signals.push({
            id: `w-${d.id}`, kind: 'decision-waiting', severity: due !== null && due < 0 ? 3 : 2, title: `${d.key} ${d.title}`,
            reason: due !== null ? (due < 0 ? `${-due} days past its decision date · ${String(d.status).replace('_', ' ')}` : `Decision due in ${due} day${due === 1 ? '' : 's'}`) : `Open for ${age} days · ${String(d.status).replace('_', ' ')}`,
            rule: `Decision still proposed or under review within ${th.dueSoonDays} days of (or after) its due date, or open ${th.decisionStaleDays}+ days`,
            decisionId: d.id as string, ownerId: d.ownerId as string | null, ownerName: d.ownerName as string | null, initiativeCode: d.initiativeCode as string | null, evidence: [], at: due ?? age,
          })
        }
      }
      for (const p of people) {
        if ((p.influence as number) >= 3 && (p.prior as number) >= 3 && (p.recent as number) <= (p.prior as number) * th.coolingRatio) {
          const ev = evBy.get(p.id as string)
          signals.push({
            id: `c-${p.id}`, kind: 'cooling', severity: p.influence === 4 ? 2 : 1, title: p.name as string,
            reason: `${p.recent} engagement${p.recent === 1 ? '' : 's'} in the last ${th.noContactDays} days, down from ${p.prior} in the ${th.noContactDays} before`,
            rule: `High-influence stakeholder; engagements in the last ${th.noContactDays} days ≤ ${Math.round(th.coolingRatio * 100)}% of the previous ${th.noContactDays}`,
            stakeholder: { id: p.id as string, name: p.name as string, title: p.title as string | null, stance: p.stance as string }, ownerId: p.ownerId as string | null, ownerName: p.ownerName as string | null,
            evidence: ev ? [{ id: ev.id as string, key: ev.key as string, title: ev.title as string, occurredAt: new Date(ev.occurredAt as string).toISOString() }] : [], at: p.lastAt ? new Date(p.lastAt as string).getTime() : 0,
          })
        }
        if (p.influence === 4 && !p.ownerId) signals.push({ id: `u-${p.id}`, kind: 'unowned', severity: 1, title: p.name as string, reason: 'Very high influence with no relationship owner', rule: 'Influence = Very high and no relationship owner assigned', stakeholder: { id: p.id as string, name: p.name as string, title: p.title as string | null, stance: p.stance as string }, evidence: [], at: 0 })
      }
      const seenShift = new Set<string>()
      for (const sft of shifts) {
        if (seenShift.has(sft.sid as string)) continue
        seenShift.add(sft.sid as string)
        const ch = (sft.changes as { stance?: { from: string; to: string } } | null)?.stance
        if (!ch || !['concerned', 'opposed'].includes(ch.to)) continue
        signals.push({ id: `s-${sft.sid}`, kind: 'stance-shift', severity: 2, title: sft.name as string, reason: `Stance changed from ${STANCE_LABEL[ch.from]} to ${STANCE_LABEL[ch.to]}`, rule: 'Stance moved toward Concerned/Opposed in the last 30 days', stakeholder: { id: sft.sid as string, name: sft.name as string, title: sft.title as string | null, stance: sft.stance as string }, evidence: [], at: new Date(sft.at as string).getTime() })
      }
      // Unassigned open commitments (accountability gap) and repeated delays (due date moved 2+ times).
      const unassigned = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select cm.id, cm.key, cm.title, cm.due_date as "dueDate", cm.version, s.id as sid, s.name as sname, s.title as stitle, s.stance as sstance, i.code
        from commitment cm left join stakeholder s on s.id = cm.stakeholder_id left join initiative i on i.id = cm.initiative_id
        where cm.archived_at is null and cm.status in ('open','in_progress') and cm.owner_id is null and (cm.stakeholder_id is null or s.id is not null)
        order by cm.due_date nulls last limit 50`))
      for (const u of unassigned) signals.push({ id: `n-${u.id}`, kind: 'unassigned', severity: 2, title: `${u.key} ${u.title}`, reason: `No accountable owner${u.dueDate ? ` · due ${u.dueDate}` : ''}`, rule: 'Open commitment with no owner', commitmentId: u.id as string, commitmentVersion: u.version as number, stakeholder: u.sid ? { id: u.sid as string, name: u.sname as string, title: u.stitle as string | null, stance: u.sstance as string } : null, ownerId: null, ownerName: null, initiativeCode: u.code as string | null, evidence: [], at: 0 })
      const delayed = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select cm.id, cm.key, cm.title, cm.due_date as "dueDate", cm.version, cm.owner_id as "ownerId", u.name as "ownerName", s.id as sid, s.name as sname, s.title as stitle, s.stance as sstance, count(a.id)::int as moves
        from commitment cm join activity_event a on a.entity_type = 'commitment' and a.entity_id = cm.id and a.changes ? 'dueDate'
          left join "user" u on u.id = cm.owner_id left join stakeholder s on s.id = cm.stakeholder_id
        where cm.archived_at is null and cm.status in ('open','in_progress') and (cm.stakeholder_id is null or s.id is not null)
        group by cm.id, u.name, s.id having count(a.id) >= 2 limit 50`))
      for (const d of delayed) signals.push({ id: `r-${d.id}`, kind: 'repeated-delay', severity: 2, title: `${d.key} ${d.title}`, reason: `Due date moved ${d.moves} times${d.dueDate ? ` · now ${d.dueDate}` : ''}`, rule: 'Open commitment whose due date has been changed two or more times', commitmentId: d.id as string, commitmentVersion: d.version as number, stakeholder: d.sid ? { id: d.sid as string, name: d.sname as string, title: d.stitle as string | null, stance: d.sstance as string } : null, ownerId: d.ownerId as string | null, ownerName: d.ownerName as string | null, initiativeCode: null, evidence: [], at: 0 })

      // Recommended next step per signal (deterministic; the action is offered for the user to approve).
      for (const sg of signals) sg.next = NEXT_STEP[sg.kind]?.(sg) ?? null
      signals.sort((a, b) => b.severity - a.severity || a.at - b.at)

      const horizon = commitments.map(cm => ({ id: cm.id, key: cm.key, title: cm.title, dueDate: cm.dueDate, stakeholderId: cm.stakeholderId, stakeholderName: cm.stakeholderName, ownerId: cm.ownerId }))
      const recentEngagements = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select e.id, e.key, e.kind, e.title, e.occurred_at as "occurredAt", i.code as "initiativeCode",
          (select count(*) from engagement_participant ep where ep.engagement_id = e.id)::int as participants
        from engagement e left join initiative i on i.id = e.initiative_id
        where e.archived_at is null order by e.occurred_at desc limit 8`))
      const initiatives = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select i.id, i.code, i.name, i.status,
          (select count(*) from initiative_stakeholder x join stakeholder s on s.id = x.stakeholder_id where x.initiative_id = i.id and s.archived_at is null and s.influence >= 3)::int as "keyTotal",
          (select count(*) from initiative_stakeholder x join stakeholder s on s.id = x.stakeholder_id
             where x.initiative_id = i.id and s.archived_at is null and s.influence >= 3
               and exists (select 1 from engagement_participant ep join engagement e on e.id = ep.engagement_id
                 where ep.stakeholder_id = s.id and e.archived_at is null and e.occurred_at > now() - interval '60 days'))::int as "keyEngaged",
          (select count(*) from engagement e where e.initiative_id = i.id and e.archived_at is null and e.occurred_at > now() - interval '30 days')::int as "engagements30",
          (select count(*) from commitment cm where cm.initiative_id = i.id and cm.archived_at is null and cm.status in ('open','in_progress'))::int as "openCommitments",
          (select count(*) from decision d where d.initiative_id = i.id and d.archived_at is null and d.status in ('proposed','under_review'))::int as "pendingDecisions"
        from initiative i where i.archived_at is null order by array_position(array['active','planned','on_hold','completed'], i.status), i.code`))
      const stanceCounts = rowsOf<{ stance: string; n: number }>(await t.execute(sql`select stance, count(*)::int as n from stakeholder where archived_at is null group by stance`))
      return {
        generatedAt: new Date().toISOString(), me,
        signals: signals.slice(0, 200), horizon, decisions, recentEngagements, initiatives,
        stakeholders: { total: stanceCounts.reduce((a, r) => a + r.n, 0), byStance: Object.fromEntries(stanceCounts.map(r => [r.stance, r.n])) },
      }
}

export const insightRoutes = new Hono<AppEnv>()
  .get('/dashboard', async c => {
    const th = (await aiSettings(c.var.deps.db, c.var.tenant.workspaceId)).thresholds
    return c.json(await tx(c, t => computeDashboard(t, c.var.tenant.userId, th)))
  })

  .get('/graph', async c => {
    const initiativeId = c.req.query('initiativeId')
    const scoped = initiativeId && initiativeId !== 'all'
    if (scoped && !z.uuid().safeParse(initiativeId).success) return c.json({ nodes: [], orgs: [], edges: [] })
    const data = await tx(c, async t => {
      const nodes = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select s.id, s.name, s.title, s.stance, s.influence, s.interest, s.owner_id as "ownerId", prim.oid as "orgId", last.at as "lastEngagedAt"
        from stakeholder s
          left join lateral (
            select max(e.occurred_at) as at from engagement_participant ep join engagement e on e.id = ep.engagement_id
            where ep.stakeholder_id = s.id and e.archived_at is null
          ) last on true
          left join lateral (
            select so.organization_id as oid from stakeholder_organization so
            where so.stakeholder_id = s.id and so.valid_to is null order by so.is_primary desc, so.created_at limit 1
          ) prim on true
        where s.archived_at is null
          ${scoped ? sql`and exists (select 1 from initiative_stakeholder x where x.stakeholder_id = s.id and x.initiative_id = ${initiativeId})` : sql``}
        limit 2000`))
      const ids = new Set(nodes.map(n => n.id as string))
      const orgIds = [...new Set(nodes.map(n => n.orgId).filter(Boolean))] as string[]
      const orgs = orgIds.length ? rowsOf<Record<string, unknown>>(await t.execute(sql`select id, name, short_name as "shortName", type from organization where id in (${sql.join(orgIds.map(i => sql`${i}`), sql`, `)})`)) : []
      const edgesRaw = rowsOf<Record<string, unknown>>(await t.execute(sql`
        select id, type, directed, strength, status, source_stakeholder_id as s1, target_stakeholder_id as t1, source_organization_id as so, target_organization_id as tor
        from relationship where archived_at is null`))
      const orgSet = new Set(orgIds)
      const edges = edgesRaw.flatMap(r => {
        const source = (r.s1 ?? r.so) as string, target = (r.t1 ?? r.tor) as string
        const ok = (id: string, isOrg: boolean) => (isOrg ? orgSet.has(id) : ids.has(id))
        if (!ok(source, !r.s1) || !ok(target, !r.t1)) return []
        return [{ id: r.id, source, target, sourceKind: r.s1 ? 'stakeholder' : 'organization', targetKind: r.t1 ? 'stakeholder' : 'organization', type: r.type, directed: r.directed, strength: r.strength, status: r.status }]
      })
      const now = Date.now()
      return {
        nodes: nodes.map(n => ({ ...n, gap: (n.influence as number) >= 3 && (!n.ownerId || !n.lastEngagedAt || now - new Date(n.lastEngagedAt as string).getTime() > 60 * DAY) })),
        orgs, edges,
      }
    })
    return c.json(data)
  })

  .get('/search', async c => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 100)
    if (!q) return c.json({ stakeholders: [], organizations: [], initiatives: [], commitments: [], decisions: [], engagements: [] })
    const like = '%' + q.replace(/[%_]/g, m => '\\' + m) + '%'
    const data = await tx(c, async t => {
      const run = async (query: ReturnType<typeof sql>) => rowsOf<Record<string, unknown>>(await t.execute(query))
      const [stakeholders, organizations, initiatives, commitments, decisions, engagements] = [
        await run(sql`select s.id, s.name, s.title, s.stance,
            (select o.short_name from stakeholder_organization so join organization o on o.id = so.organization_id where so.stakeholder_id = s.id and so.valid_to is null order by so.is_primary desc limit 1) as org
          from stakeholder s where s.archived_at is null and (s.name ilike ${like} or s.title ilike ${like} or s.email ilike ${like})
          order by (lower(s.name) like lower(${q + '%'})) desc, s.influence desc nulls last limit 8`),
        await run(sql`select id, name, short_name as "shortName", type from organization where archived_at is null and (name ilike ${like} or short_name ilike ${like}) order by name limit 5`),
        await run(sql`select id, code, name, status from initiative where archived_at is null and (name ilike ${like} or code ilike ${like}) order by code limit 5`),
        await run(sql`select cm.id, cm.key, cm.title, cm.status, cm.stakeholder_id as "stakeholderId" from commitment cm left join stakeholder s on s.id = cm.stakeholder_id
          where cm.archived_at is null and (cm.stakeholder_id is null or s.id is not null) and (cm.title ilike ${like} or cm.key ilike ${q + '%'}) order by cm.due_date nulls last limit 5`),
        await run(sql`select id, key, title, status from decision where archived_at is null and (title ilike ${like} or key ilike ${q + '%'}) order by created_at desc limit 5`),
        await run(sql`select id, key, title, kind, occurred_at as "occurredAt" from engagement where archived_at is null and (title ilike ${like} or key ilike ${q + '%'}) order by occurred_at desc limit 5`),
      ]
      return { stakeholders, organizations, initiatives, commitments, decisions, engagements }
    })
    return c.json(data)
  })

  .get('/lookups', async c => {
    const data = await tx(c, async t => ({
      members: await t.select({ id: user.id, name: user.name, email: user.email, role: membership.role }).from(membership).innerJoin(user, eq(user.id, membership.userId)).where(isNull(membership.removedAt)).orderBy(user.name),
      initiatives: await t.select({ id: initiative.id, code: initiative.code, name: initiative.name, status: initiative.status }).from(initiative).where(isNull(initiative.archivedAt)).orderBy(initiative.code),
      organizations: await t.select({ id: organization.id, name: organization.name, shortName: organization.shortName, type: organization.type }).from(organization).where(isNull(organization.archivedAt)).orderBy(organization.name).limit(1000),
    }))
    return c.json(data)
  })

  .get('/activity', async c => {
    const entityType = c.req.query('entityType')
    const entityId = c.req.query('entityId')
    const before = Number(c.req.query('before')) || undefined
    const rows = await tx(c, t => t.select({ id: activityEvent.id, entityType: activityEvent.entityType, entityId: activityEvent.entityId, verb: activityEvent.verb, summary: activityEvent.summary, changes: activityEvent.changes, createdAt: activityEvent.createdAt, actor: user.name })
      .from(activityEvent).leftJoin(user, eq(user.id, activityEvent.actorId))
      .where(and(
        entityType ? eq(activityEvent.entityType, entityType) : undefined,
        entityId && z.uuid().safeParse(entityId).success ? eq(activityEvent.entityId, entityId) : undefined,
        before ? lt(activityEvent.id, before) : undefined,
        // History of a stakeholder the viewer can't see (restricted) is hidden with the record itself (RLS on stakeholder).
        sql`(${activityEvent.entityType} <> 'stakeholder' or exists (select 1 from stakeholder s where s.id = ${activityEvent.entityId}))`,
      ))
      .orderBy(desc(activityEvent.id)).limit(50))
    return c.json({ events: rows, next: rows.length === 50 ? rows[rows.length - 1].id : null })
  })
