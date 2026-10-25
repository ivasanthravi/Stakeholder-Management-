// Copilot tools: read-only, permission-scoped queries. Every call runs inside the caller's tenant RLS
// context, so restricted records and other workspaces are unreachable no matter what the model asks for.
// Each returned record is registered with a ref ("r7") — the only identifier the model can cite.
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant, type DB, type TenantContext, type Tx } from '../../db/client'
import { commitment, decision, decisionStakeholder, engagement, engagementParticipant, initiative, organization, relationship, stakeholder, stakeholderOrganization, user } from '../../db/schema'
import { rowsOf, STANCE_LABEL } from '../../modules/_shared'
import { recentChanges } from '../../modules/changes'
import { daysFromToday } from '../../../shared/dates'

export interface Ref { ref: string; type: string; id: string; label: string; href: string; at?: string | null }

export class RefRegistry {
  refs: Ref[] = []
  add(type: string, id: string, label: string, at?: string | null): string {
    const hit = this.refs.find(r => r.type === type && r.id === id)
    if (hit) return hit.ref
    const ref = `r${this.refs.length + 1}`
    const href = type === 'stakeholder' ? `/stakeholders/${id}` : type === 'organization' ? `/organizations/${id}` : type === 'initiative' ? `/initiatives/${id}`
      : type === 'engagement' ? `/engagements/${id}` : type === 'decision' ? `/decisions?open=${id}` : type === 'commitment' ? `/commitments?open=${id}` : '#'
    this.refs.push({ ref, type, id, label, href, at: at ?? null })
    return ref
  }
  allowed() { return new Set(this.refs.map(r => r.ref)) }
}

const uuid = z.uuid()
const DAY = 86_400_000
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? null : String(d))

export const TOOL_DEFS = {
  search_records: { description: 'Find stakeholders, organizations, initiatives, decisions and commitments by name, title or key (e.g. "C-142").', input: z.object({ query: z.string().min(1).max(100) }) },
  get_stakeholder: { description: 'Full context for one stakeholder: role, organizations, stance, influence, owner, last engagement, open commitments, pending decisions and top relationships.', input: z.object({ stakeholder_id: uuid }) },
  list_stakeholders: { description: 'List stakeholders, optionally within an initiative or organization, sorted by influence or by least recent engagement.', input: z.object({ initiative_id: uuid.nullable(), organization_id: uuid.nullable(), sort: z.enum(['influence', 'least_recently_engaged']), min_influence: z.number().int().min(1).max(4).nullable(), limit: z.number().int().min(1).max(25) }) },
  list_commitments: { description: 'List commitments. filter: overdue | due_soon (next 14 days) | open | unassigned.', input: z.object({ filter: z.enum(['overdue', 'due_soon', 'open', 'unassigned']), initiative_id: uuid.nullable(), stakeholder_id: uuid.nullable(), limit: z.number().int().min(1).max(25) }) },
  list_decisions: { description: 'List decisions. status: pending (proposed or under review) | decided | all.', input: z.object({ status: z.enum(['pending', 'decided', 'all']), initiative_id: uuid.nullable(), stakeholder_id: uuid.nullable(), limit: z.number().int().min(1).max(25) }) },
  engagement_history: { description: 'Recorded engagements (meetings, calls, emails…) for a stakeholder, organization or initiative, newest first.', input: z.object({ stakeholder_id: uuid.nullable(), organization_id: uuid.nullable(), initiative_id: uuid.nullable(), since_days: z.number().int().min(1).max(730).nullable(), limit: z.number().int().min(1).max(25) }) },
  recent_changes: { description: 'What changed recently: stance changes, decisions decided, commitments completed and stakeholders added, with counts and the latest examples.', input: z.object({ days: z.number().int().min(1).max(90), initiative_id: uuid.nullable() }) },
  get_initiative: { description: 'An initiative with its status, owner, stakeholder count, open and overdue commitments and pending decisions.', input: z.object({ initiative_id: uuid }) },
  relationship_path: { description: 'Shortest chain of recorded relationships between two stakeholders (up to 4 hops).', input: z.object({ from_stakeholder_id: uuid, to_stakeholder_id: uuid }) },
} as const
export type ToolName = keyof typeof TOOL_DEFS

/** JSON Schema for the Messages API (strict, no extra properties). */
export function toolSchemas() {
  return (Object.entries(TOOL_DEFS) as [ToolName, (typeof TOOL_DEFS)[ToolName]][]).map(([name, d]) => ({
    name, description: d.description, strict: true, eager_input_streaming: true,
    input_schema: { ...(z.toJSONSchema(d.input) as Record<string, unknown>), additionalProperties: false },
  }))
}

type Result = Record<string, unknown>

async function lastEngaged(t: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, Date>()
  const rows = await t.select({ sid: engagementParticipant.stakeholderId, at: sql<Date>`max(${engagement.occurredAt})` }).from(engagementParticipant)
    .innerJoin(engagement, eq(engagement.id, engagementParticipant.engagementId))
    .where(and(inArray(engagementParticipant.stakeholderId, ids), isNull(engagement.archivedAt))).groupBy(engagementParticipant.stakeholderId)
  return new Map(rows.map(r => [r.sid, new Date(r.at)]))
}

export async function runTool(db: DB, tn: TenantContext, reg: RefRegistry, name: ToolName, rawInput: unknown): Promise<Result> {
  const def = TOOL_DEFS[name]
  if (!def) return { error: `Unknown tool ${name}` }
  const parsed = def.input.safeParse(rawInput)
  if (!parsed.success) return { error: 'INVALID_INPUT', detail: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') }
  const a = parsed.data as Record<string, unknown>
  return withTenant(db, tn, async t => {
    switch (name) {
      case 'search_records': {
        const q = `%${String(a.query).replace(/[%_]/g, m => '\\' + m)}%`
        const [ss, os, is, ds, cs] = await Promise.all([
          t.select({ id: stakeholder.id, name: stakeholder.name, title: stakeholder.title }).from(stakeholder).where(and(isNull(stakeholder.archivedAt), or(ilike(stakeholder.name, q), ilike(stakeholder.title, q)))).limit(8),
          t.select({ id: organization.id, name: organization.name }).from(organization).where(and(isNull(organization.archivedAt), or(ilike(organization.name, q), ilike(organization.shortName, q)))).limit(5),
          t.select({ id: initiative.id, code: initiative.code, name: initiative.name }).from(initiative).where(and(isNull(initiative.archivedAt), or(ilike(initiative.name, q), ilike(initiative.code, q)))).limit(5),
          t.select({ id: decision.id, key: decision.key, title: decision.title }).from(decision).where(and(isNull(decision.archivedAt), or(ilike(decision.title, q), ilike(decision.key, q)))).limit(5),
          t.select({ id: commitment.id, key: commitment.key, title: commitment.title }).from(commitment).where(and(isNull(commitment.archivedAt), or(ilike(commitment.title, q), ilike(commitment.key, q)))).limit(5),
        ])
        return {
          stakeholders: ss.map(s => ({ ref: reg.add('stakeholder', s.id, s.name), id: s.id, name: s.name, title: s.title })),
          organizations: os.map(o => ({ ref: reg.add('organization', o.id, o.name), id: o.id, name: o.name })),
          initiatives: is.map(i => ({ ref: reg.add('initiative', i.id, `${i.code} ${i.name}`), id: i.id, code: i.code, name: i.name })),
          decisions: ds.map(d => ({ ref: reg.add('decision', d.id, `${d.key} ${d.title}`), id: d.id, key: d.key, title: d.title })),
          commitments: cs.map(c => ({ ref: reg.add('commitment', c.id, `${c.key} ${c.title}`), id: c.id, key: c.key, title: c.title })),
        }
      }
      case 'get_stakeholder': {
        const [s] = await t.select().from(stakeholder).where(eq(stakeholder.id, a.stakeholder_id as string)).limit(1)
        if (!s) return { error: 'Not found or not visible to you' }
        const orgs = await t.select({ id: organization.id, name: organization.name, role: stakeholderOrganization.role, validTo: stakeholderOrganization.validTo }).from(stakeholderOrganization)
          .innerJoin(organization, eq(organization.id, stakeholderOrganization.organizationId)).where(eq(stakeholderOrganization.stakeholderId, s.id))
        const owner = s.ownerId ? (await t.select({ name: user.name }).from(user).where(eq(user.id, s.ownerId)))[0]?.name ?? null : null
        const engs = await t.select({ id: engagement.id, key: engagement.key, title: engagement.title, kind: engagement.kind, summary: engagement.summary, at: engagement.occurredAt }).from(engagementParticipant)
          .innerJoin(engagement, eq(engagement.id, engagementParticipant.engagementId)).where(and(eq(engagementParticipant.stakeholderId, s.id), isNull(engagement.archivedAt))).orderBy(desc(engagement.occurredAt)).limit(5)
        const cms = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, due: commitment.dueDate, direction: commitment.direction }).from(commitment)
          .where(and(eq(commitment.stakeholderId, s.id), isNull(commitment.archivedAt), inArray(commitment.status, ['open', 'in_progress']))).orderBy(asc(commitment.dueDate)).limit(8)
        const decs = await t.select({ id: decision.id, key: decision.key, title: decision.title, status: decision.status, role: decisionStakeholder.role }).from(decisionStakeholder)
          .innerJoin(decision, eq(decision.id, decisionStakeholder.decisionId)).where(and(eq(decisionStakeholder.stakeholderId, s.id), isNull(decision.archivedAt), inArray(decision.status, ['proposed', 'under_review'])))
        const now = Date.now()
        return {
          ref: reg.add('stakeholder', s.id, s.name), name: s.name, title: s.title, stance: STANCE_LABEL[s.stance], influence: s.influence, interest: s.interest, relationship_owner: owner,
          organizations: orgs.map(o => ({ ref: reg.add('organization', o.id, o.name), name: o.name, role: o.role, current: !o.validTo })),
          recent_engagements: engs.map(e => ({ ref: reg.add('engagement', e.id, `${e.key} ${e.title}`, iso(e.at)), date: iso(e.at)?.slice(0, 10), kind: e.kind, title: e.title, summary: e.summary })),
          days_since_last_engagement: engs[0] ? Math.round((now - engs[0].at.getTime()) / DAY) : null,
          open_commitments: cms.map(c => ({ ref: reg.add('commitment', c.id, `${c.key} ${c.title}`, c.due), key: c.key, title: c.title, due: c.due, overdue: !!c.due && Date.parse(c.due + 'T23:59:59Z') < now, owed_by: c.direction === 'ours' ? 'us' : 'them' })),
          pending_decisions: decs.map(d => ({ ref: reg.add('decision', d.id, `${d.key} ${d.title}`), key: d.key, title: d.title, status: d.status, their_role: d.role })),
        }
      }
      case 'list_stakeholders': {
        const rows = await t.select({ id: stakeholder.id, name: stakeholder.name, title: stakeholder.title, stance: stakeholder.stance, influence: stakeholder.influence, ownerId: stakeholder.ownerId }).from(stakeholder)
          .where(and(isNull(stakeholder.archivedAt),
            a.initiative_id ? sql`exists (select 1 from initiative_stakeholder x where x.stakeholder_id = ${stakeholder.id} and x.initiative_id = ${a.initiative_id})` : undefined,
            a.organization_id ? sql`exists (select 1 from stakeholder_organization so where so.stakeholder_id = ${stakeholder.id} and so.organization_id = ${a.organization_id} and so.valid_to is null)` : undefined,
            a.min_influence ? sql`${stakeholder.influence} >= ${a.min_influence}` : undefined))
          .limit(500)
        const last = await lastEngaged(t, rows.map(r => r.id))
        const now = Date.now()
        const sorted = rows.map(r => ({ ...r, last: last.get(r.id) ?? null }))
          .sort((x, y) => a.sort === 'influence' ? (y.influence ?? 0) - (x.influence ?? 0) || x.name.localeCompare(y.name) : (x.last?.getTime() ?? 0) - (y.last?.getTime() ?? 0))
          .slice(0, a.limit as number)
        return {
          total_matching: rows.length,
          stakeholders: sorted.map(r => ({ ref: reg.add('stakeholder', r.id, r.name), name: r.name, title: r.title, stance: STANCE_LABEL[r.stance], influence: r.influence, has_owner: !!r.ownerId, days_since_last_engagement: r.last ? Math.round((now - r.last.getTime()) / DAY) : null })),
        }
      }
      case 'list_commitments': {
        const today = new Date().toISOString().slice(0, 10)
        const soon = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10)
        const rows = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, due: commitment.dueDate, status: commitment.status, direction: commitment.direction, ownerName: user.name, sid: commitment.stakeholderId, sname: stakeholder.name })
          .from(commitment).leftJoin(user, eq(user.id, commitment.ownerId)).leftJoin(stakeholder, eq(stakeholder.id, commitment.stakeholderId))
          .where(and(isNull(commitment.archivedAt), inArray(commitment.status, ['open', 'in_progress']), sql`(${commitment.stakeholderId} is null or ${stakeholder.id} is not null)`,
            a.filter === 'overdue' ? lt(commitment.dueDate, today) : a.filter === 'due_soon' ? sql`${commitment.dueDate} between ${today} and ${soon}` : a.filter === 'unassigned' ? isNull(commitment.ownerId) : undefined,
            a.initiative_id ? eq(commitment.initiativeId, a.initiative_id as string) : undefined, a.stakeholder_id ? eq(commitment.stakeholderId, a.stakeholder_id as string) : undefined))
          .orderBy(asc(commitment.dueDate)).limit(a.limit as number)
        const [{ n }] = rowsOf<{ n: number }>(await t.execute(sql`select count(*)::int as n from commitment c left join stakeholder s on s.id = c.stakeholder_id where c.archived_at is null and c.status in ('open','in_progress') and (c.stakeholder_id is null or s.id is not null)
          ${a.filter === 'overdue' ? sql`and c.due_date < ${today}` : a.filter === 'due_soon' ? sql`and c.due_date between ${today} and ${soon}` : a.filter === 'unassigned' ? sql`and c.owner_id is null` : sql``}
          ${a.initiative_id ? sql`and c.initiative_id = ${a.initiative_id}` : sql``} ${a.stakeholder_id ? sql`and c.stakeholder_id = ${a.stakeholder_id}` : sql``}`))
        return {
          total_matching: n, filter: a.filter,
          commitments: rows.map(r => ({ ref: reg.add('commitment', r.id, `${r.key} ${r.title}`, r.due), key: r.key, title: r.title, due: r.due, days_overdue: r.due && r.due < today ? -daysFromToday(r.due) : 0, owed_by: r.direction === 'ours' ? 'us' : 'them', owner: r.ownerName, stakeholder: r.sname ? { ref: reg.add('stakeholder', r.sid!, r.sname), name: r.sname } : null })),
        }
      }
      case 'list_decisions': {
        // Totals over every matching decision, not just the rows returned (answers state counts; a page of 10 isn't the total).
        const rows = await t.select({ id: decision.id, key: decision.key, title: decision.title, status: decision.status, due: decision.dueDate, created: decision.createdAt, ownerName: user.name, code: initiative.code,
          total: sql<number>`count(*) over ()`.mapWith(Number),
          lateTotal: sql<number>`count(*) filter (where ${decision.dueDate} < current_date and ${decision.status} in ('proposed','under_review')) over ()`.mapWith(Number) })
          .from(decision).leftJoin(user, eq(user.id, decision.ownerId)).leftJoin(initiative, eq(initiative.id, decision.initiativeId))
          .where(and(isNull(decision.archivedAt),
            a.status === 'pending' ? inArray(decision.status, ['proposed', 'under_review']) : a.status === 'decided' ? inArray(decision.status, ['approved', 'rejected']) : undefined,
            a.initiative_id ? eq(decision.initiativeId, a.initiative_id as string) : undefined,
            a.stakeholder_id ? sql`exists (select 1 from decision_stakeholder ds where ds.decision_id = ${decision.id} and ds.stakeholder_id = ${a.stakeholder_id})` : undefined))
          .orderBy(sql`${decision.dueDate} nulls last`).limit(a.limit as number)
        const today = new Date().toISOString().slice(0, 10)
        return { total_matching: rows[0]?.total ?? 0, late_matching: rows[0]?.lateTotal ?? 0, decisions: rows.map(r => ({ ref: reg.add('decision', r.id, `${r.key} ${r.title}`, r.due), key: r.key, title: r.title, status: r.status, needed_by: r.due, late: !!r.due && r.due < today && ['proposed', 'under_review'].includes(r.status), days_open: Math.round((Date.now() - r.created.getTime()) / DAY), owner: r.ownerName, initiative: r.code })) }
      }
      case 'engagement_history': {
        const since = a.since_days ? new Date(Date.now() - (a.since_days as number) * DAY) : null
        const rows = await t.selectDistinct({ id: engagement.id, key: engagement.key, title: engagement.title, kind: engagement.kind, summary: engagement.summary, at: engagement.occurredAt })
          .from(engagement).leftJoin(engagementParticipant, eq(engagementParticipant.engagementId, engagement.id))
          .where(and(isNull(engagement.archivedAt), since ? sql`${engagement.occurredAt} >= ${since}` : undefined,
            a.stakeholder_id ? eq(engagementParticipant.stakeholderId, a.stakeholder_id as string) : undefined,
            a.initiative_id ? eq(engagement.initiativeId, a.initiative_id as string) : undefined,
            a.organization_id ? sql`${engagementParticipant.stakeholderId} in (select stakeholder_id from stakeholder_organization where organization_id = ${a.organization_id} and valid_to is null)` : undefined))
          .orderBy(desc(engagement.occurredAt)).limit(a.limit as number)
        return { engagements: rows.map(e => ({ ref: reg.add('engagement', e.id, `${e.key} ${e.title}`, iso(e.at)), date: iso(e.at)?.slice(0, 10), kind: e.kind, title: e.title, summary: e.summary })) }
      }
      case 'recent_changes': {
        const r = await recentChanges(t, { days: a.days as number, initiativeId: (a.initiative_id as string | null) ?? null, limit: 5 })
        return {
          days: r.days, stance_changes: r.counts.stance, decisions_decided: r.counts.decided, commitments_completed: r.counts.completed, stakeholders_added: r.counts.added,
          latest_stance_changes: r.stance.map(x => ({ ref: reg.add('stakeholder', x.id, x.name), name: x.name, from: x.from ? STANCE_LABEL[x.from] : null, to: x.to ? STANCE_LABEL[x.to] : null })),
          latest_decisions: r.decided.map(d => ({ ref: reg.add('decision', d.id, `${d.key} ${d.title}`), key: d.key, title: d.title, status: d.status, on: d.at.slice(0, 10) })),
          latest_completed: r.completed.map(c => ({ ref: reg.add('commitment', c.id, `${c.key} ${c.title}`), key: c.key, title: c.title, on: c.at.slice(0, 10) })),
        }
      }
      case 'get_initiative': {
        const [i] = await t.select({ id: initiative.id, code: initiative.code, name: initiative.name, status: initiative.status, description: initiative.description, ownerName: user.name }).from(initiative).leftJoin(user, eq(user.id, initiative.ownerId)).where(eq(initiative.id, a.initiative_id as string))
        if (!i) return { error: 'Not found or not visible to you' }
        const [stats] = rowsOf<Record<string, number>>(await t.execute(sql`select
          (select count(*) from initiative_stakeholder x join stakeholder s on s.id = x.stakeholder_id where x.initiative_id = ${i.id} and s.archived_at is null)::int as stakeholders,
          (select count(*) from commitment where initiative_id = ${i.id} and archived_at is null and status in ('open','in_progress'))::int as open_commitments,
          (select count(*) from commitment where initiative_id = ${i.id} and archived_at is null and status in ('open','in_progress') and due_date < current_date)::int as overdue_commitments,
          (select count(*) from decision where initiative_id = ${i.id} and archived_at is null and status in ('proposed','under_review'))::int as pending_decisions`))
        return { ref: reg.add('initiative', i.id, `${i.code} ${i.name}`), code: i.code, name: i.name, status: i.status, owner: i.ownerName, description: i.description, ...stats }
      }
      case 'relationship_path': {
        const path = await relationshipPath(t, a.from_stakeholder_id as string, a.to_stakeholder_id as string)
        if (!path) return { found: false, note: 'No chain of recorded relationships (up to 4 hops) connects these people in records you can see.' }
        return { found: true, hops: path.map(h => ({ from: { ref: reg.add('stakeholder', h.from.id, h.from.name), name: h.from.name }, relationship: h.type, status: h.status, to: { ref: reg.add('stakeholder', h.to.id, h.to.name), name: h.to.name } })) }
      }
    }
  })
}

/** BFS over recorded person-to-person relationships visible to the caller (RLS). Max 4 hops. */
export async function relationshipPath(t: Tx, from: string, to: string) {
  const edges = await t.select({ s: relationship.sourceStakeholderId, d: relationship.targetStakeholderId, type: relationship.type, status: relationship.status, id: relationship.id })
    .from(relationship).innerJoin(stakeholder, eq(stakeholder.id, relationship.sourceStakeholderId))
    .where(and(isNull(relationship.archivedAt), sql`${relationship.targetStakeholderId} is not null`, sql`exists (select 1 from stakeholder t where t.id = ${relationship.targetStakeholderId})`))
  const adj = new Map<string, { to: string; type: string; status: string; id: string }[]>()
  for (const e of edges) {
    if (!e.s || !e.d) continue
    adj.set(e.s, [...(adj.get(e.s) ?? []), { to: e.d, type: e.type, status: e.status, id: e.id }])
    adj.set(e.d, [...(adj.get(e.d) ?? []), { to: e.s, type: e.type, status: e.status, id: e.id }])
  }
  const prev = new Map<string, { from: string; type: string; status: string; id: string }>()
  const seen = new Set([from]); let frontier = [from]
  for (let depth = 0; depth < 4 && frontier.length && !seen.has(to); depth++) {
    const next: string[] = []
    for (const n of frontier) for (const e of adj.get(n) ?? []) if (!seen.has(e.to)) { seen.add(e.to); prev.set(e.to, { from: n, type: e.type, status: e.status, id: e.id }); next.push(e.to) }
    frontier = next
  }
  if (!seen.has(to) || from === to) return null
  const chain: { from: string; to: string; type: string; status: string; id: string }[] = []
  for (let cur = to; cur !== from;) { const p = prev.get(cur)!; chain.unshift({ from: p.from, to: cur, type: p.type, status: p.status, id: p.id }); cur = p.from }
  const ids = [...new Set(chain.flatMap(c => [c.from, c.to]))]
  const names = new Map((await t.select({ id: stakeholder.id, name: stakeholder.name }).from(stakeholder).where(inArray(stakeholder.id, ids))).map(r => [r.id, r.name]))
  return chain.map(c => ({ from: { id: c.from, name: names.get(c.from)! }, to: { id: c.to, name: names.get(c.to)! }, type: c.type, status: c.status, relationshipId: c.id }))
}

