// "What changed recently": stance changes, decisions decided, commitments completed and stakeholders added. One
// definition for the Command Center and the copilot's recent_changes tool. Every row is read through its record, so
// RLS hides anything the user can't see (restricted stakeholders never leak through history text).
import { sql } from 'drizzle-orm'
import type { Tx } from '../db/client'
import { rowsOf } from './_shared'

export interface RecentChanges {
  days: number
  counts: { stance: number; decided: number; completed: number; added: number }
  stance: { id: string; name: string; from: string | null; to: string | null; at: string }[]
  decided: { id: string; key: string; title: string; status: string; at: string }[]
  completed: { id: string; key: string; title: string; stakeholderId: string | null; at: string }[]
  added: { id: string; name: string; title: string | null; at: string }[]
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v))

/** Exact counts over the window, plus the latest `limit` of each kind. */
export async function recentChanges(t: Tx, opts: { days: number; initiativeId?: string | null; limit?: number }): Promise<RecentChanges> {
  const { days } = opts, ini = opts.initiativeId ?? null, limit = opts.limit ?? 5
  const since = sql`now() - make_interval(days => ${days})`
  const inInit = (col: ReturnType<typeof sql>) => (ini ? sql`and exists (select 1 from initiative_stakeholder x where x.stakeholder_id = ${col} and x.initiative_id = ${ini})` : sql``)
  const stanceFrom = sql`from activity_event a join stakeholder s on s.id = a.entity_id
    where a.entity_type = 'stakeholder' and a.verb = 'stance_changed' and a.created_at > ${since} and s.archived_at is null ${inInit(sql`s.id`)}`
  const decidedFrom = sql`from decision d where d.archived_at is null and d.status in ('approved','rejected','deferred') and d.decided_at > ${since}
    ${ini ? sql`and d.initiative_id = ${ini}` : sql``}`
  const completedFrom = sql`from commitment c where c.archived_at is null and c.status = 'completed' and c.completed_at > ${since}
    ${ini ? sql`and c.initiative_id = ${ini}` : sql``}`
  const addedFrom = sql`from stakeholder s where s.archived_at is null and s.created_at > ${since} ${inInit(sql`s.id`)}`

  const [counts] = rowsOf<RecentChanges['counts']>(await t.execute(sql`select
    (select count(distinct s.id) ${stanceFrom})::int as stance,
    (select count(*) ${decidedFrom})::int as decided,
    (select count(*) ${completedFrom})::int as completed,
    (select count(*) ${addedFrom})::int as added`))
  const stance = rowsOf<{ id: string; name: string; changes: { stance?: { from: string; to: string } } | null; at: unknown }>(await t.execute(sql`
    select * from (select distinct on (s.id) s.id, s.name, a.changes, a.created_at as at ${stanceFrom} order by s.id, a.created_at desc) x
    order by at desc limit ${limit}`))
  const decided = rowsOf<{ id: string; key: string; title: string; status: string; at: unknown }>(await t.execute(sql`
    select d.id, d.key, d.title, d.status, d.decided_at as at ${decidedFrom} order by d.decided_at desc limit ${limit}`))
  const completed = rowsOf<{ id: string; key: string; title: string; stakeholderId: string | null; at: unknown }>(await t.execute(sql`
    select c.id, c.key, c.title, c.stakeholder_id as "stakeholderId", c.completed_at as at ${completedFrom} order by c.completed_at desc limit ${limit}`))
  const added = rowsOf<{ id: string; name: string; title: string | null; at: unknown }>(await t.execute(sql`
    select s.id, s.name, s.title, s.created_at as at ${addedFrom} order by s.created_at desc limit ${limit}`))
  return {
    days, counts,
    stance: stance.map(r => ({ id: r.id, name: r.name, from: r.changes?.stance?.from ?? null, to: r.changes?.stance?.to ?? null, at: iso(r.at) })),
    decided: decided.map(r => ({ ...r, at: iso(r.at) })),
    completed: completed.map(r => ({ ...r, at: iso(r.at) })),
    added: added.map(r => ({ ...r, at: iso(r.at) })),
  }
}
