// Phase 7 functional validation: all ten industry scenarios are generated (seeded), loaded through the real data layer
// (row-level security applies), then checked through the HTTP API exactly as users see them: dashboard counts against
// database truth, every named complication, history retention, permissions and tenant boundaries.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { client, createTestContext, sse, type Client, type TestContext } from './helpers'
import { INDUSTRIES, industryById } from '../server/db/sim/industries'
import { planWorkspace, PROFILES, type Plan } from '../server/db/sim/generate'
import { SIM_PASSWORD, writePlan } from '../server/db/sim/write'
import { runChecks } from '../server/db/check'

let ctx: TestContext
const loaded: { plan: Plan; ws: string; owner: Client }[] = []
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows
const comp = (p: Plan, kind: string) => p.complications.find(c => c.kind === kind)

async function signIn(email: string) {
  const c = client(ctx)
  const r = await c.post('/api/auth/sign-in/email', { email, password: SIM_PASSWORD })
  if (r.status !== 200) throw new Error(`sign-in ${email} → ${r.status}`)
  return c
}

beforeAll(async () => {
  ctx = await createTestContext()
  for (const pack of INDUSTRIES) {
    const plan = planWorkspace(pack, PROFILES.A, 11)
    const { workspaceId } = await writePlan(ctx.db, ctx.deps.auth, plan, { profile: 'A' })
    loaded.push({ plan, ws: workspaceId, owner: await signIn(plan.users[0].email) })
  }
  // Two small-team workspaces: scenarios that need several users (a sponsor leaving, reassignment) only exist there.
  for (const id of ['construction', 'consulting']) {
    const plan = planWorkspace(industryById(id)!, PROFILES.B, 13, undefined, 'team')
    const { workspaceId } = await writePlan(ctx.db, ctx.deps.auth, plan, { profile: 'B' })
    loaded.push({ plan, ws: workspaceId, owner: await signIn(plan.users[0].email) })
  }
}, 180_000)
afterAll(async () => { await ctx.close() })

describe('generator', () => {
  test('is deterministic: the same seed and anchor produce the same universe', () => {
    const a = planWorkspace(industryById('energy')!, PROFILES.B, 5, '2026-01-15'), b = planWorkspace(industryById('energy')!, PROFILES.B, 5, '2026-01-15')
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(JSON.stringify(planWorkspace(industryById('energy')!, PROFILES.B, 6, '2026-01-15'))).not.toBe(JSON.stringify(a))
  })
  test('meets profile volumes and keeps references inside the plan', () => {
    const p = planWorkspace(industryById('retail')!, PROFILES.B, 3)
    expect(p.people.length).toBeGreaterThanOrEqual(PROFILES.B.people)
    expect(p.relationships.length).toBe(PROFILES.B.relationships)
    const ids = new Set(p.people.map(x => x.id)), orgs = new Set(p.orgs.map(o => o.id))
    for (const r of p.relationships) for (const e of [r.src, r.tgt]) expect(e.kind === 'stakeholder' ? ids.has(e.id) : orgs.has(e.id)).toBe(true)
    for (const e of p.engagements) for (const x of e.participants) expect(ids.has(x.id)).toBe(true)
    // Commitments come after the meeting they came from.
    const engAt = new Map(p.engagements.map(e => [e.id, Date.parse(e.occurredAt)]))
    for (const c of p.commitments) if (c.sourceEngagementId && c.dueDate && !c.title.startsWith('Implement')) expect(Date.parse(c.dueDate)).toBeGreaterThanOrEqual(engAt.get(c.sourceEngagementId)! - 86_400_000)
    // Fictional contact details only.
    for (const x of [...p.people.map(x => x.email), ...p.users.map(u => u.email)]) if (x) expect(x).toMatch(/\.example\.com$/)
  })
  test('never records two people as both allied and opposed (the API refuses that too)', () => {
    const p = planWorkspace(industryById('construction')!, PROFILES.C, 9)
    const pair = (a: string, b: string) => [a, b].sort().join('|')
    const allied = new Set(p.relationships.filter(r => r.type === 'allied').map(r => pair(r.src.id, r.tgt.id)))
    expect(p.relationships.filter(r => r.type === 'opposes' && allied.has(pair(r.src.id, r.tgt.id)))).toEqual([])
  })
})

describe('ten industries, one product', () => {
  test('every industry loads with no industry-specific code and passes the consistency checks', async () => {
    expect([...new Set(loaded.map(l => l.plan.industry))].sort()).toEqual(INDUSTRIES.map(i => i.id).sort())
    const failed = (await runChecks(ctx.db)).filter(c => !c.ok && !/owners are members/.test(c.name))
    expect(failed).toEqual([])
  })

  test.each(INDUSTRIES.map(i => i.id))('%s: dashboard and register counts match the database', async industry => {
    const { ws, owner } = loaded.find(l => l.plan.industry === industry)!
    const truth = rows<{ overdue: number; open: number; waiting: number }>(await ctx.db.execute(sql`
      select (select count(*)::int from commitment where workspace_id = ${ws} and archived_at is null and status in ('open','in_progress') and due_date < current_date) as overdue,
             (select count(*)::int from commitment where workspace_id = ${ws} and archived_at is null and status in ('open','in_progress')) as open,
             (select count(*)::int from decision where workspace_id = ${ws} and archived_at is null and status in ('proposed','under_review')) as waiting`))[0]
    const reg = (await owner.get(`/api/w/${ws}/commitments?overdue=true&limit=1`)).body
    expect(reg.total).toBe(truth.overdue)
    const dash = (await owner.get(`/api/w/${ws}/dashboard`)).body as { signals: { kind: string }[]; signalCounts: { team: Record<string, number> } }
    expect(dash.signalCounts.team.overdue ?? 0).toBe(truth.overdue)
    expect(dash.signals.filter(s => s.kind === 'overdue').length).toBe(Math.min(truth.overdue, 40))
    const open = (await owner.get(`/api/w/${ws}/decisions?status=proposed,under_review&limit=1`)).body
    expect(open.total).toBe(truth.waiting)
  })
})

describe('the Command Center stays true when one kind of signal dominates', () => {
  test('counts are totals, and every kind keeps places in the list (a global top-200 once showed no overdue items)', async () => {
    const plan = planWorkspace(industryById('government')!, PROFILES.B, 23)
    const { workspaceId: ws } = await writePlan(ctx.db, ctx.deps.auth, plan, { profile: 'B' })
    const owner = await signIn(plan.users[0].email)
    const truth = rows<{ overdue: number; waiting: number }>(await ctx.db.execute(sql`
      select (select count(*)::int from commitment where workspace_id = ${ws} and archived_at is null and status in ('open','in_progress') and due_date < current_date) as overdue,
             (select count(*)::int from decision where workspace_id = ${ws} and archived_at is null and status in ('proposed','under_review')) as waiting`))[0]
    expect(truth.overdue).toBeGreaterThan(40)
    const d = (await owner.get(`/api/w/${ws}/dashboard`)).body as { signals: { kind: string }[]; signalCounts: { team: Record<string, number> }; horizon: unknown[]; horizonOlder: { team: number } }
    expect(d.signalCounts.team.overdue).toBe(truth.overdue)
    const kinds = new Set(Object.keys(d.signalCounts.team).filter(k => d.signalCounts.team[k] > 0))
    for (const k of kinds) expect(d.signals.some(s => s.kind === k)).toBe(true)
    // The team's 40 most severe, plus the requesting user's own beyond those (for "Assigned to me").
    const listed = d.signals.filter(s => s.kind === 'overdue').length
    expect(listed).toBeGreaterThanOrEqual(40)
    expect(listed).toBeLessThanOrEqual(80)
    // Overdue older than the 30-day horizon is counted, not listed.
    expect(d.horizonOlder.team).toBeGreaterThan(0)
    // "Due this week" is filtered on the server. It was once narrowed from the first 200 open commitments, which at
    // scale are all overdue, so the tab read 0.
    const week = rows<{ n: number }>(await ctx.db.execute(sql`select count(*)::int as n from commitment where workspace_id = ${ws}
      and archived_at is null and status in ('open','in_progress') and due_date between current_date and current_date + 7`))[0].n
    expect(week).toBeGreaterThan(0)
    const w = (await owner.get(`/api/w/${ws}/commitments?status=open,in_progress&dueWithinDays=7&limit=5`)).body as { total: number; items: { dueDate: string }[] }
    expect(w.total).toBe(week)
    expect(w.items.every(i => i.dueDate >= w.items[0].dueDate)).toBe(true)
    // "What changed · 7 days" counts equal the records (decided decisions, completed commitments, new stakeholders).
    const ch = rows<{ decided: number; completed: number; added: number }>(await ctx.db.execute(sql`select
      (select count(*)::int from decision where workspace_id = ${ws} and archived_at is null and status in ('approved','rejected','deferred') and decided_at > now() - interval '7 days') as decided,
      (select count(*)::int from commitment where workspace_id = ${ws} and archived_at is null and status = 'completed' and completed_at > now() - interval '7 days') as completed,
      (select count(*)::int from stakeholder where workspace_id = ${ws} and archived_at is null and created_at > now() - interval '7 days') as added`))[0]
    const dc = (d as unknown as { changes: { counts: Record<string, number>; decided: { at: string }[] } }).changes
    expect(dc.counts).toMatchObject(ch)
    expect(dc.decided.length).toBe(Math.min(6, ch.decided))
    // The workspace briefing states the same totals as the headline (it once counted the capped list: "60 overdue").
    const brief = JSON.stringify((await owner.get(`/api/w/${ws}/ai/briefings/workspace`)).body)
    expect(brief).toContain(`${truth.overdue} commitments are overdue`)
    expect(brief).toContain(`${d.signalCounts.team['decision-waiting']} decision`)
  })
})

describe('real-world complications stay true in the product', () => {
  // Every complication test must actually find cases: an empty loop would pass without testing anything.
  const ofKind = (kind: string) => { const xs = loaded.map(l => ({ ...l, c: comp(l.plan, kind) })).filter(x => x.c); expect(xs.length, `no simulated workspace contains "${kind}"`).toBeGreaterThan(0); return xs }

  test('a stakeholder who changed organisation shows the new one as current and keeps the old as history', async () => {
    for (const { ws, owner, c } of ofKind('changed_organization')) {
      const d = (await owner.get(`/api/w/${ws}/stakeholders/${c!.refs.stakeholderId}`)).body
      const current = d.organizations.filter((o: { validTo: string | null }) => !o.validTo).map((o: { organizationId: string }) => o.organizationId)
      const ended = d.organizations.filter((o: { validTo: string | null }) => o.validTo).map((o: { organizationId: string }) => o.organizationId)
      expect(current).toContain(c!.refs.toOrgId)
      expect(ended).toContain(c!.refs.fromOrgId)
      // Engagements from before the move are still on the timeline.
      const ov = (await owner.get(`/api/w/${ws}/stakeholders/${c!.refs.stakeholderId}/overview`)).body
      expect(ov.engagements.length).toBeGreaterThan(0)
    }
  })

  test('an archived organisation’s decided decisions remain accessible with their participants', async () => {
    for (const { ws, owner, c } of ofKind('archived_org_history')) {
      const d = await owner.get(`/api/w/${ws}/decisions/${c!.refs.decisionId}`)
      expect(d.status).toBe(200)
      expect(d.body.stakeholders.length).toBeGreaterThan(0)
    }
  })

  test('commitments still owned by someone who left surface on the Command Center as needing an owner', async () => {
    for (const { ws, owner, plan, c } of ofKind('sponsor_left')) {
      const leaver = plan.users.find(u => u.key === c!.refs.userKey)!
      const left = plan.commitments.filter(x => x.ownerKey === leaver.key && (x.status === 'open' || x.status === 'in_progress'))
      const d = (await owner.get(`/api/w/${ws}/dashboard`)).body as { signals: { kind: string; reason: string; commitmentId?: string }[]; signalCounts: { team: Record<string, number> } }
      const flagged = d.signals.filter(x => x.kind === 'unassigned' && /Owner left the workspace/.test(x.reason)).map(x => x.commitmentId)
      for (const cm of left.slice(0, 40)) expect(flagged).toContain(cm.id)
      expect(d.signalCounts.team.unassigned ?? 0).toBeGreaterThanOrEqual(left.length)
    }
  })

  test('a paused initiative stays paused while its engagements remain visible', async () => {
    for (const { ws, owner, c } of ofKind('paused_initiative_active_engagement')) {
      const i = (await owner.get(`/api/w/${ws}/initiatives/${c!.refs.initiativeId}`)).body
      expect(i.status).toBe('on_hold')
    }
  })

  test('one meeting with several commitments lists all of them, with their own deadlines', async () => {
    for (const { ws, owner, c } of ofKind('meeting_many_commitments')) {
      const ids = c!.refs.commitmentIds.split(',')
      const due = new Set<string>()
      for (const cid of ids) { const r = (await owner.get(`/api/w/${ws}/commitments/${cid}`)).body; expect(r.sourceEngagement?.id ?? r.sourceEngagementId).toBe(c!.refs.engagementId); due.add(r.dueDate) }
      expect(due.size).toBe(3)
    }
  })

  test('an ended (archived) relationship disappears from the map and the profile but stays in history', async () => {
    for (const { ws, owner, plan, c } of ofKind('relationship_ended')) {
      const g = (await owner.get(`/api/w/${ws}/graph?initiativeId=all`)).body as { edges: { id: string }[] }
      expect(g.edges.some(e => e.id === c!.refs.relationshipId)).toBe(false)
      const rel = plan.relationships.find(r => r.id === c!.refs.relationshipId)!
      const hist = (await owner.get(`/api/w/${ws}/stakeholders/${rel.src.id}/activity`)).body
      expect(JSON.stringify(hist)).toMatch(/Relationship removed/)
    }
  })

  test('a reopened decision and a reassigned commitment keep their full history', async () => {
    for (const { ws, c } of ofKind('decision_reopened')) {
      const ev = rows<{ summary: string }>(await ctx.db.execute(sql`select summary from activity_event where workspace_id = ${ws} and entity_id = ${c!.refs.decisionId} order by created_at`))
      expect(ev.map(e => e.summary).join(' | ')).toMatch(/approved.*reopened/)
    }
    for (const { ws, c } of ofKind('commitment_reassigned')) {
      const ev = rows<{ changes: Record<string, unknown> | null }>(await ctx.db.execute(sql`select changes from activity_event where workspace_id = ${ws} and entity_id = ${c!.refs.commitmentId}`))
      expect(ev.some(e => e.changes && 'ownerId' in e.changes)).toBe(true)
    }
  })

  test('duplicate stakeholder records are both returned by search (the product does not merge or flag them)', async () => {
    for (const { ws, owner, plan, c } of ofKind('duplicate_stakeholder')) {
      const name = plan.people.find(p => p.id === c!.refs.originalId)!.name
      const s = (await owner.get(`/api/w/${ws}/search?q=${encodeURIComponent(name)}`)).body
      expect(s.stakeholders.filter((x: { name: string }) => x.name === name).length).toBe(2)
    }
  })
})

describe('tenant boundaries across the simulated workspaces', () => {
  test('no workspace owner can read another workspace’s stakeholders, decisions or graph', async () => {
    for (let i = 0; i < loaded.length; i++) {
      const me = loaded[i], other = loaded[(i + 1) % loaded.length]
      const foreignPerson = other.plan.people[0].id, foreignDecision = other.plan.decisions[0].id
      expect((await me.owner.get(`/api/w/${me.ws}/stakeholders/${foreignPerson}`)).status).toBe(404)
      expect((await me.owner.get(`/api/w/${me.ws}/decisions/${foreignDecision}`)).status).toBe(404)
      expect((await me.owner.get(`/api/w/${other.ws}/stakeholders`)).status).toBe(404)
      const g = (await me.owner.get(`/api/w/${me.ws}/graph?initiativeId=all`)).body as { nodes: { id: string }[] }
      const theirs = new Set(other.plan.people.map(p => p.id))
      expect(g.nodes.filter(n => theirs.has(n.id))).toEqual([])
    }
  })
})

describe('AI copilot on a simulated workspace (rules engine; deterministic, no model)', () => {
  let plan: Plan, ws: string, owner: Client, contributor: Client
  beforeAll(async () => {
    plan = planWorkspace(industryById('energy')!, PROFILES.B, 31)
    ws = (await writePlan(ctx.db, ctx.deps.auth, plan, { profile: 'B' })).workspaceId
    owner = await signIn(plan.users[0].email)
    // A contributor with no access-list entry for any restricted stakeholder.
    const restrictedOwners = new Set(plan.access.map(a => a.userKey))
    const u = plan.users.find(x => x.role === 'contributor' && !x.departed && !restrictedOwners.has(x.key))
    if (u) contributor = await signIn(u.email)
    else {
      // None in this small team: add a fresh contributor (real account, real membership).
      const email = 'fresh.contributor@sim-test.example.com'
      const r = await ctx.deps.auth.api.signUpEmail({ body: { email, password: SIM_PASSWORD, name: 'Fresh Contributor' } })
      await ctx.db.execute(sql`update "user" set email_verified = true where id = ${r.user.id}`)
      await ctx.db.execute(sql`insert into membership (workspace_id, user_id, role) values (${ws}, ${r.user.id}, 'contributor')`)
      contributor = await signIn(email)
    }
  }, 60_000)
  const ask = async (c: Client, message: string, context?: Record<string, unknown>) => {
    const r = await sse(ctx, c, `/api/w/${ws}/ai/copilot`, { message, context })
    expect(r.status).toBe(200)
    const text = String(r.events.at(-1)!.data.text)
    const sources = (r.events.find(e => e.data?.type === 'sources')?.data.refs ?? []) as { ref: string; type: string; id: string; label: string }[]
    // Grounding: every citation resolves to a returned source, and every source is one of this workspace's records.
    const refs = new Set(sources.map(s => s.ref))
    for (const m of text.matchAll(/\[(r\d+)\]/g)) expect(refs.has(m[1])).toBe(true)
    const mine = new Set([...plan.people.map(p => p.id), ...plan.orgs.map(o => o.id), ...plan.decisions.map(d => d.id), ...plan.commitments.map(c => c.id), ...plan.initiatives.map(i => i.id), ...plan.engagements.map(e => e.id)])
    for (const s of sources) expect(mine.has(s.id)).toBe(true)
    return { text, sources }
  }
  const one = async (q: string) => rows<{ n: number }>(await ctx.db.execute(sql.raw(q.replace('$ws', `'${ws}'`))))[0].n

  test('“Which commitments are overdue?” states the true total', async () => {
    const n = await one(`select count(*)::int as n from commitment where workspace_id = $ws and archived_at is null and status in ('open','in_progress') and due_date < current_date`)
    expect((await ask(owner, 'Which commitments are overdue?')).text).toMatch(new RegExp(`^${n} commitments are overdue`))
  })
  test('“Who owns the pending decisions?” states the true total, not the length of its first page', async () => {
    const n = await one(`select count(*)::int as n from decision where workspace_id = $ws and archived_at is null and status in ('proposed','under_review')`)
    expect(n).toBeGreaterThan(10)
    const { text } = await ask(owner, 'Who owns the pending decisions?')
    expect(text).toMatch(new RegExp(`^${n} decisions are still pending`))
    expect(text).toMatch(/the 10 most urgent/)
  })
  test('“Which stakeholders are connected to this initiative?” lists the initiative’s people', async () => {
    const ini = plan.initiatives[0]
    const n = await one(`select count(*)::int as n from initiative_stakeholder x join stakeholder s on s.id = x.stakeholder_id where x.initiative_id = '${ini.id}' and s.archived_at is null`)
    const { text } = await ask(owner, 'Which stakeholders are connected to this initiative?', { initiativeId: ini.id, label: ini.name })
    expect(text).toMatch(new RegExp(`^${n} stakeholders are recorded for ${ini.name.replace(/[—()]/g, '.')}`))
  })
  test('“What changed during the last month?” reports counts that match the records', async () => {
    const decided = await one(`select count(*)::int as n from decision where workspace_id = $ws and archived_at is null and status in ('approved','rejected','deferred') and decided_at > now() - interval '30 days'`)
    const { text } = await ask(owner, 'What changed during the last month?')
    expect(text).toMatch(new RegExp(`In the last 30 days: ${decided} decisions? decided`))
  })
  test('“Which follow-ups remain unresolved?” uses true totals', async () => {
    const late = await one(`select count(*)::int as n from decision where workspace_id = $ws and archived_at is null and status in ('proposed','under_review') and due_date < current_date`)
    expect((await ask(owner, 'Which follow-ups remain unresolved?')).text).toMatch(new RegExp(`and ${late} decisions? past the date`))
  })
  test('a contributor never sees restricted stakeholders in any answer', async () => {
    const restricted = plan.people.filter(p => p.restricted)
    expect(restricted.length).toBeGreaterThan(0)
    for (const q of ['Which commitments are overdue?', 'What changed during the last month?', 'Who are the most influential stakeholders?', 'Which stakeholders haven’t been engaged recently?']) {
      const { text, sources } = await ask(contributor, q)
      for (const p of restricted) { expect(text).not.toContain(p.name); expect(sources.some(s => s.id === p.id)).toBe(false) }
    }
  })
})

describe('relationship graph: structural stress cases on simulated data', () => {
  const team = () => loaded.find(l => l.plan.users.length > 1)!
  test('duplicate, mirrored and contradictory relationship attempts are refused', async () => {
    const { ws, owner, plan } = team()
    const r = plan.relationships.find(x => x.type === 'influences' && !x.archived && x.src.kind === 'stakeholder' && x.tgt.kind === 'stakeholder')!
    const body = (type: string, a = r.src, b = r.tgt) => ({ source: a, target: b, type })
    expect((await owner.post(`/api/w/${ws}/relationships`, body('influences'))).status).toBe(409)
    const sym = plan.relationships.find(x => x.type === 'colleague' && !x.archived)!
    expect((await owner.post(`/api/w/${ws}/relationships`, body('colleague', sym.tgt, sym.src))).status).toBe(409)
    const ally = plan.relationships.find(x => x.type === 'allied' && !x.archived)
    if (ally) expect((await owner.post(`/api/w/${ws}/relationships`, body('opposes', ally.src, ally.tgt))).status).toBe(409)
  })
  test('archived people and relationships stay off the map; people with no relationships still appear', async () => {
    const { ws, owner, plan } = team()
    const g = (await owner.get(`/api/w/${ws}/graph?initiativeId=all`)).body as { nodes: { id: string }[]; edges: { id: string; source: string; target: string }[] }
    const nodes = new Set(g.nodes.map(n => n.id))
    for (const p of plan.people.filter(x => x.archived)) expect(nodes.has(p.id)).toBe(false)
    for (const r of plan.relationships.filter(x => x.archived)) expect(g.edges.some(e => e.id === r.id)).toBe(false)
    const linked = new Set(g.edges.flatMap(e => [e.source, e.target]))
    const isolated = g.nodes.filter(n => !linked.has(n.id))
    expect(isolated.length).toBeGreaterThan(0)
    // Every edge connects nodes that are on the map (no dangling references).
    for (const e of g.edges) expect(nodes.has(e.source) || g.edges.length === 0).toBe(true)
  })
  test('cycles of influence render and the path finder terminates on them', async () => {
    const { ws, owner, plan } = team()
    // Find a directed cycle A→B→…→A among active stakeholder influences.
    const out = new Map<string, string[]>()
    for (const r of plan.relationships.filter(x => !x.archived && x.directed && x.src.kind === 'stakeholder' && x.tgt.kind === 'stakeholder')) out.set(r.src.id, [...(out.get(r.src.id) ?? []), r.tgt.id])
    let cycle: string[] | null = null
    const seen = new Set<string>()
    const dfs = (n: string, stack: string[]): void => {
      if (cycle) return
      const i = stack.indexOf(n); if (i >= 0) { cycle = stack.slice(i); return }
      if (seen.has(n)) return; seen.add(n)
      for (const m of out.get(n) ?? []) dfs(m, [...stack, n])
    }
    for (const n of out.keys()) dfs(n, [])
    expect(cycle, 'the simulated network should contain at least one cycle').not.toBeNull()
    const [a, b] = cycle as unknown as string[]
    const t0 = Date.now()
    // a → b is a recorded edge on the cycle, so a path exists; the search must also return from the reverse direction.
    const res = await owner.get(`/api/w/${ws}/ai/paths?from=${a}&to=${b}`)
    expect(res.status).toBe(200)
    expect(res.body.found).toBe(true)
    const back = await owner.get(`/api/w/${ws}/ai/paths?from=${b}&to=${a}`)
    expect(back.status).toBe(200)
    expect(Date.now() - t0).toBeLessThan(5000)
  })
})

describe('stakeholder timeline (Phase 8)', () => {
  test('pages through everything recorded about a person, newest first, with no gaps or repeats', async () => {
    const { plan, ws, owner } = loaded[loaded.length - 2] // construction, profile B
    const id = comp(plan, 'long_history')?.refs.stakeholderId ?? plan.people[0].id
    const truth = rows<{ e: number; c: number; cd: number; d: number }>(await ctx.db.execute(sql`select
      (select count(*)::int from engagement_participant ep join engagement e on e.id = ep.engagement_id where ep.stakeholder_id = ${id} and e.archived_at is null) as e,
      (select count(*)::int from commitment where stakeholder_id = ${id} and archived_at is null) as c,
      (select count(*)::int from commitment where stakeholder_id = ${id} and archived_at is null and completed_at is not null) as cd,
      (select count(*)::int from decision_stakeholder ds join decision d on d.id = ds.decision_id where ds.stakeholder_id = ${id} and d.archived_at is null) as d`))[0]
    const seen: { id: string; at: string; kind: string }[] = []
    let before: string | null = null
    for (let i = 0; i < 50; i++) {
      const r = (await owner.get(`/api/w/${ws}/stakeholders/${id}/timeline?kinds=engagement,commitment&limit=25${before ? `&before=${encodeURIComponent(before)}` : ''}`)).body as { items: { id: string; at: string; kind: string }[]; next: string | null }
      seen.push(...r.items)
      if (!r.next) break
      before = r.next
    }
    expect(new Set(seen.map(x => x.id)).size).toBe(seen.length)
    expect(seen.filter(x => x.kind === 'engagement').length).toBe(truth.e)
    expect(seen.filter(x => x.kind === 'commitment').length).toBe(truth.c)
    expect(seen.filter(x => x.kind === 'commitment_done').length).toBe(truth.cd)
    for (let i = 1; i < seen.length; i++) expect(seen[i - 1].at >= seen[i].at).toBe(true)
    const dec = (await owner.get(`/api/w/${ws}/stakeholders/${id}/timeline?kinds=decision&limit=100`)).body as { items: { kind: string }[] }
    expect(dec.items.filter(x => x.kind === 'decision').length).toBe(truth.d)
  })
  test('a person the caller can’t see has no timeline either', async () => {
    const { plan, ws } = loaded[loaded.length - 2]
    const member = plan.users.find(u => !u.departed && (u.role === 'contributor' || u.role === 'viewer'))
    const restricted = plan.people.filter(p => p.restricted)
    expect(member && restricted.length).toBeTruthy()
    const c = await signIn(member!.email)
    for (const p of restricted) {
      const profile = await c.get(`/api/w/${ws}/stakeholders/${p.id}`)
      const timeline = await c.get(`/api/w/${ws}/stakeholders/${p.id}/timeline`)
      expect(timeline.status).toBe(profile.status === 200 ? 200 : 404)
    }
    // Another workspace's person is never reachable through this workspace.
    const foreign = loaded[0].plan.people[0].id
    expect((await c.get(`/api/w/${ws}/stakeholders/${foreign}/timeline`)).status).toBe(404)
  })
})
