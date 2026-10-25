// Deterministic synthetic business universe. `planWorkspace(industry, scale, seed, anchor)` returns a complete,
// referentially consistent plan (no database access); `write.ts` loads it through the tenant-scoped data layer.
// Same seed + same anchor date ⇒ identical plan. Every record is fictional; emails use example.com sub-domains.
//
// Realism rules: people belong to organisations and initiatives; relationships follow those memberships (reporting
// lines inside organisations, colleagues, cross-organisation influence along shared initiatives, regulators regulate,
// funders fund); engagement volume is heavy-tailed (a few people dominate, some were never engaged, some went quiet);
// commitments come out of meetings with due dates after them; statuses follow dates; named complications are explicit
// records listed in `complications` so tests can find them.
import { createRng, subSeed, type Rng } from './rng'
import { FAMILY, GIVEN, type IndustryPack } from './industries'

const DAY = 86_400_000
const STANCES = ['champion', 'supporter', 'neutral', 'concerned', 'opposed'] as const
type Stance = typeof STANCES[number] | 'unknown'
export type Role = 'owner' | 'admin' | 'manager' | 'contributor' | 'viewer'

export interface Scale { users: number; people: number; relationships: number; activity: number }
/** Engineering test profiles (not plan limits). E is 50 workspaces of the per-workspace scale below. */
export const PROFILES: Record<'A' | 'B' | 'C' | 'D', Scale> & { E: Scale & { workspaces: number } } = {
  A: { users: 1, people: 25, relationships: 50, activity: 100 },
  B: { users: 5, people: 250, relationships: 1000, activity: 2000 },
  C: { users: 25, people: 1000, relationships: 5000, activity: 10000 },
  D: { users: 100, people: 5000, relationships: 25000, activity: 50000 },
  E: { users: 3, people: 200, relationships: 1000, activity: 2000, workspaces: 50 },
}

export interface Plan {
  industry: string; seed: number; anchor: string
  workspace: { name: string; slug: string; template: string }
  users: { key: string; name: string; email: string; role: Role; departed: boolean }[]
  orgs: { id: string; name: string; short: string; type: string; parentId: string | null; archived: boolean }[]
  people: { id: string; name: string; title: string | null; email: string | null; location: string | null; type: string; influence: number | null; interest: number | null; stance: Stance; engagementStatus: 'not_engaged' | 'active' | 'dormant' | 'do_not_contact'; ownerKey: string | null; restricted: boolean; archived: boolean; notes: string | null }[]
  affiliations: { stakeholderId: string; orgId: string; role: string | null; isPrimary: boolean; validFrom: string | null; validTo: string | null }[]
  initiatives: { id: string; code: string; name: string; description: string; status: 'planned' | 'active' | 'on_hold' | 'completed'; ownerKey: string; startDate: string; endDate: string }[]
  members: { initiativeId: string; stakeholderId: string; role: string | null }[]
  relationships: { id: string; src: { kind: 'stakeholder' | 'organization'; id: string }; tgt: { kind: 'stakeholder' | 'organization'; id: string }; type: string; directed: boolean; strength: number; status: 'confirmed' | 'inferred'; initiativeId: string | null; validFrom: string | null; validTo: string | null; archived: boolean }[]
  engagements: { id: string; key: string; kind: string; title: string; occurredAt: string; initiativeId: string | null; summary: string | null; notes: string | null; ownerKey: string | null; participants: { id: string; attendance: 'attended' | 'apologies' | 'invited' }[] }[]
  decisions: { id: string; key: string; title: string; description: string | null; context: string | null; initiativeId: string | null; ownerKey: string | null; status: 'proposed' | 'under_review' | 'approved' | 'rejected' | 'deferred'; dueDate: string | null; outcome: string | null; decidedAt: string | null; sourceEngagementId: string | null; participants: { id: string; role: 'approver' | 'consulted' | 'informed' | 'affected' }[] }[]
  commitments: { id: string; key: string; title: string; description: string | null; ownerKey: string | null; stakeholderId: string | null; initiativeId: string | null; direction: 'ours' | 'theirs'; dueDate: string | null; status: 'open' | 'in_progress' | 'completed' | 'cancelled'; completedAt: string | null; sourceEngagementId: string | null }[]
  events: { actorKey: string | null; entityType: string; entityId: string; verb: string; summary: string; changes: Record<string, { from: unknown; to: unknown }> | null; createdAt: string }[]
  access: { stakeholderId: string; userKey: string }[]
  /** Named real-world complications, each pointing at the records that represent it. */
  complications: { kind: string; description: string; refs: Record<string, string> }[]
}

const iso = (ms: number) => new Date(ms).toISOString()
const dayIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Deterministic UUID-shaped ids from the seeded stream (version 4 layout). */
function idMaker(r: Rng) {
  const hex = () => Math.floor(r.next() * 16).toString(16)
  return () => {
    let s = ''
    for (let i = 0; i < 32; i++) s += hex()
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${'89ab'[Math.floor(r.next() * 4)]}${s.slice(17, 20)}-${s.slice(20, 32)}`
  }
}

/** Cumulative-weight sampler (binary search) for heavy-tailed engagement. */
function sampler<T>(items: T[], weights: number[], r: Rng) {
  const cum: number[] = []; let t = 0
  for (const w of weights) { t += w; cum.push(t) }
  return () => {
    const x = r.next() * t
    let lo = 0, hi = cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < x) lo = mid + 1; else hi = mid }
    return items[lo]
  }
}

export function planWorkspace(pack: IndustryPack, scale: Scale, seed: number, anchor = new Date().toISOString().slice(0, 10), label = ''): Plan {
  const r = createRng(subSeed(seed, `${pack.id}:${label}`))
  const id = idMaker(createRng(subSeed(seed, `${pack.id}:${label}:ids`)))
  const now = Date.parse(anchor + 'T12:00:00Z')
  const daysAgo = (d: number) => now - d * DAY
  const place = () => r.pick(pack.places)
  const wsName = label ? `${pack.client.name} ${label}` : pack.client.name
  const domain = `${slug(pack.client.short)}${label ? '-' + slug(label) : ''}.example.com`
  const plan: Plan = {
    industry: pack.id, seed, anchor,
    workspace: { name: `${wsName} (simulation)`, slug: `sim-${slug(pack.id)}${label ? '-' + slug(label) : ''}-${seed}`, template: pack.template },
    users: [], orgs: [], people: [], affiliations: [], initiatives: [], members: [], relationships: [], engagements: [], decisions: [], commitments: [], events: [], access: [], complications: [],
  }
  const usedNames = new Set<string>()
  const personName = () => {
    for (let i = 0; i < 40; i++) { const n = `${r.pick(GIVEN)} ${r.pick(FAMILY)}`; if (!usedNames.has(n)) { usedNames.add(n); return n } }
    const n = `${r.pick(GIVEN)} ${String.fromCharCode(65 + r.int(0, 25))}. ${r.pick(FAMILY)}`; usedNames.add(n); return n
  }

  // ── Users (the client's team). Roles: one owner, then a realistic mix. ──
  for (let i = 0; i < scale.users; i++) {
    const name = personName()
    const role: Role = i === 0 ? 'owner' : r.weighted([['admin', 0.06], ['manager', 0.22], ['contributor', 0.57], ['viewer', 0.15]] as const)
    plan.users.push({ key: `u${i}`, name, email: `${slug(name).replace(/-/g, '.')}@${domain}`, role, departed: false })
  }
  const owners = plan.users.filter(u => u.role === 'owner' || u.role === 'admin' || u.role === 'manager')
  const ownerPool = owners.length ? owners : plan.users
  const anyUser = () => r.pick(plan.users).key
  const leadUser = () => r.pick(ownerPool).key

  // ── Organisations: the client, its departments, and external organisations by kind. ──
  const home = { id: id(), name: pack.client.name, short: pack.client.short, type: 'company', parentId: null, archived: false }
  plan.orgs.push(home)
  const depts = pack.departments.map(d => ({ id: id(), name: `${pack.client.short} ${d}`, short: d.split(/\s+/).map(w => w[0]).join('').toUpperCase(), type: 'department', parentId: home.id, archived: false }))
  plan.orgs.push(...depts)
  const externalCount = Math.max(3, Math.min(400, Math.round(scale.people / 18)))
  const kindOf = new Map<string, IndustryPack['orgKinds'][number]>()
  const usedOrgNames = new Set<string>()
  for (let i = 0; i < externalCount; i++) {
    const kind = r.weighted(pack.orgKinds.map(k => [k, k.weight] as const))
    let name = r.pick(kind.names).replace('{place}', place())
    if (usedOrgNames.has(name)) name = `${name} ${['North', 'South', 'East', 'West', 'Central'][i % 5]}${i >= 5 ? ` ${Math.floor(i / 5) + 1}` : ''}`
    usedOrgNames.add(name)
    const o = { id: id(), name, short: name.split(/\s+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join('').slice(0, 5) || name.slice(0, 3).toUpperCase(), type: kind.type, parentId: null, archived: false }
    plan.orgs.push(o); kindOf.set(o.id, kind)
  }
  const externals = plan.orgs.filter(o => kindOf.has(o.id))

  // ── Initiatives ──
  const initCount = Math.min(pack.initiatives.length + (scale.users >= 25 ? 4 : 0), Math.max(2, Math.ceil(scale.people / 120)))
  for (let i = 0; i < initCount; i++) {
    const base = pack.initiatives[i % pack.initiatives.length]
    const wave = Math.floor(i / pack.initiatives.length)
    const start = daysAgo(r.int(300, 700))
    plan.initiatives.push({
      id: id(), code: wave ? `${base.code}${wave + 1}` : base.code, name: wave ? `${base.name} — phase ${wave + 1}` : base.name,
      description: base.objective + '.', status: i === initCount - 1 && initCount > 2 ? 'completed' : 'active', ownerKey: leadUser(),
      startDate: dayIso(start), endDate: dayIso(now + r.int(60, 500) * DAY),
    })
  }
  const activeInits = plan.initiatives.filter(i => i.status !== 'completed')

  // ── People ──
  const internalShare = 0.14
  const personOrg = new Map<string, string>()
  const personInits = new Map<string, string[]>()
  for (let i = 0; i < scale.people; i++) {
    const internal = i < Math.max(2, Math.round(scale.people * internalShare))
    const org = internal ? r.pick(depts) : r.pick(externals)
    const kind = kindOf.get(org.id)
    const title = internal ? r.pick(pack.internalRoles) : r.pick(kind!.roles)
    const senior = /director|chief|head|partner|president|chair|principal|vp|dean|owner|commission|supervis|pro vice/i.test(title)
    const influence = senior ? r.int(3, 4) : r.weighted([[1, 3], [2, 4], [3, 2], [4, 0.5]] as const)
    const interest = r.int(1, 4)
    const stance: Stance = r.chance(0.12) ? 'unknown' : internal ? r.weighted([['champion', 2], ['supporter', 5], ['neutral', 2], ['concerned', 1], ['opposed', 0.3]] as const) : r.weighted(STANCES.map((s, k) => [s, kind!.stance[k]] as const))
    const name = personName()
    const missing = r.chance(0.05)
    const p = {
      id: id(), name, title: missing && r.chance(0.6) ? null : title, email: missing ? null : `${slug(name).replace(/-/g, '.')}@${slug(org.name).slice(0, 24)}.example.com`,
      location: r.chance(0.8) ? place() : null, type: internal ? 'internal' : kind!.personType, influence: missing && r.chance(0.5) ? null : influence, interest: missing && r.chance(0.5) ? null : interest,
      stance, engagementStatus: 'not_engaged' as const, ownerKey: r.chance(0.88) ? anyUser() : null, restricted: false, archived: false, notes: null as string | null,
    }
    plan.people.push(p)
    personOrg.set(p.id, org.id)
    plan.affiliations.push({ stakeholderId: p.id, orgId: org.id, role: title, isPrimary: true, validFrom: dayIso(daysAgo(r.int(400, 2000))), validTo: null })
    // 1–3 initiatives (internal people sit on more).
    const k = internal ? r.int(1, Math.min(3, activeInits.length)) : r.weighted([[1, 6], [2, 3], [3, 1]] as const)
    const inits = r.sample(plan.initiatives, Math.min(k, plan.initiatives.length)).map(x => x.id)
    personInits.set(p.id, inits)
    for (const ini of inits) plan.members.push({ initiativeId: ini, stakeholderId: p.id, role: internal ? r.pick(['Workstream lead', 'Sponsor', 'Delivery lead', null]) : r.pick(['Key stakeholder', 'Consultee', 'Approver', 'Partner', null]) })
  }
  const byId = new Map(plan.people.map(p => [p.id, p]))
  const peopleOfOrg = new Map<string, string[]>()
  for (const [pid, oid] of personOrg) peopleOfOrg.set(oid, [...(peopleOfOrg.get(oid) ?? []), pid])
  const peopleOfInit = new Map<string, string[]>()
  for (const m of plan.members) peopleOfInit.set(m.initiativeId, [...(peopleOfInit.get(m.initiativeId) ?? []), m.stakeholderId])

  // ── Relationships, in order of how organisations really connect, until the target is reached. ──
  const relKeys = new Set<string>()
  const SYM = new Set(['colleague', 'allied', 'opposes', 'partner_of'])
  const addRel = (src: Plan['relationships'][number]['src'], tgt: Plan['relationships'][number]['tgt'], type: string, initiativeId: string | null = null) => {
    if (plan.relationships.length >= scale.relationships || src.id === tgt.id) return false
    const k = `${type}|${src.id}|${tgt.id}`, rev = `${type}|${tgt.id}|${src.id}`
    if (relKeys.has(k) || (SYM.has(type) && relKeys.has(rev))) return false
    // Same rule as the API: two people can't be recorded as both allied and opposed.
    const contra = type === 'allied' ? 'opposes' : type === 'opposes' ? 'allied' : null
    if (contra && (relKeys.has(`${contra}|${src.id}|${tgt.id}`) || relKeys.has(`${contra}|${tgt.id}|${src.id}`))) return false
    relKeys.add(k)
    plan.relationships.push({ id: id(), src, tgt, type, directed: !SYM.has(type), strength: r.weighted([[1, 2], [2, 5], [3, 3]] as const), status: r.chance(0.06) ? 'inferred' : 'confirmed', initiativeId, validFrom: null, validTo: null, archived: false })
    return true
  }
  const S = (pid: string) => ({ kind: 'stakeholder' as const, id: pid }), O = (oid: string) => ({ kind: 'organization' as const, id: oid })
  // 1. Reporting lines inside each organisation (most senior at the top).
  for (const [, pids] of peopleOfOrg) {
    const sorted = pids.slice().sort((a, b) => (byId.get(b)!.influence ?? 0) - (byId.get(a)!.influence ?? 0))
    for (let i = 1; i < sorted.length; i++) addRel(S(sorted[i]), S(sorted[Math.max(0, Math.floor((i - 1) / 4))]), 'reports_to')
  }
  // 2. Organisation-level links (regulators regulate the client, funders fund, partners partner).
  for (const o of externals) { const link = kindOf.get(o.id)!.link; if (link) addRel(O(o.id), O(home.id), link) }
  // 3. Colleagues within an organisation, then cross-organisation ties along shared initiatives.
  const stanceSide = (s: Stance) => (s === 'champion' || s === 'supporter' ? 1 : s === 'concerned' || s === 'opposed' ? -1 : 0)
  let guard = 0
  const initList = plan.initiatives.map(i => i.id)
  while (plan.relationships.length < scale.relationships && guard++ < scale.relationships * 30) {
    if (r.chance(0.3)) {
      const pids = peopleOfOrg.get(r.pick(plan.orgs).id) ?? []
      if (pids.length > 1) addRel(S(r.pick(pids)), S(r.pick(pids)), 'colleague')
    } else {
      const ini = r.pick(initList); const pids = peopleOfInit.get(ini) ?? []
      if (pids.length < 2) continue
      const a = byId.get(r.pick(pids))!, b = byId.get(r.pick(pids))!
      if (personOrg.get(a.id) === personOrg.get(b.id)) continue
      const ka = kindOf.get(personOrg.get(a.id)!), kb = kindOf.get(personOrg.get(b.id)!)
      const side = stanceSide(a.stance) * stanceSide(b.stance)
      const type = ka?.link === 'regulates' && kb?.link !== 'regulates' ? 'regulates'
        : ka?.link === 'advises' ? 'advises'
        : side > 0 ? r.weighted([['allied', 3], ['influences', 2]] as const)
        : side < 0 ? r.weighted([['opposes', 3], ['influences', 1]] as const)
        : r.weighted([['influences', 3], ['advises', 1], ['member_of', 0.3]] as const)
      if (type === 'member_of') addRel(S(a.id), O(personOrg.get(b.id)!), type, ini)
      else addRel(S(a.id), S(b.id), type, ini)
    }
  }

  // ── Engagements: heavy-tailed, more recent than old, owned by the team. ──
  const engN = Math.round(scale.activity * 0.7), decN = Math.max(3, Math.round(scale.activity * 0.04)), comN = Math.round(scale.activity * 0.18)
  const evN = Math.max(0, scale.activity - engN - decN - comN)
  const never = new Set(r.sample(plan.people.filter(p => p.type !== 'internal'), Math.round(scale.people * 0.08)).map(p => p.id))
  const quiet = new Set(r.sample(plan.people.filter(p => !never.has(p.id)), Math.round(scale.people * 0.07)).map(p => p.id))
  const weights = plan.people.map(p => (never.has(p.id) ? 0 : r.pareto() * (0.6 + (p.influence ?? 2) * 0.3)))
  const longHistory = plan.people.filter(p => !never.has(p.id) && !quiet.has(p.id)).sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0))[0]
  const longTarget = Math.max(12, Math.min(300, Math.round(engN * 0.02)))
  weights[plan.people.indexOf(longHistory)] = 0
  const pickPerson = sampler(plan.people, weights, r)
  const kinds = [['meeting', 5], ['call', 4], ['email', 4], ['workshop', 1.2], ['consultation', 1], ['site_visit', 0.6], ['note', 1.5]] as const
  const engDates: number[] = []
  for (let i = 0; i < engN; i++) engDates.push(now - Math.floor(Math.pow(r.next(), 1.6) * 720 * DAY) - r.int(1, 600) * 60_000)
  engDates.sort((a, b) => a - b)
  const lastEng = new Map<string, number>()
  const engOf = new Map<string, number>()
  for (let i = 0; i < engN; i++) {
    let at = engDates[i]
    const forced = i % Math.max(1, Math.floor(engN / longTarget)) === 0
    let primary = forced ? longHistory : pickPerson()
    if (quiet.has(primary.id) && at > daysAgo(400)) primary = pickPerson()
    if (quiet.has(primary.id) && at > daysAgo(400)) at = daysAgo(r.int(420, 700))
    const kind = r.weighted(kinds)
    const inits = personInits.get(primary.id) ?? []
    const initiativeId = inits.length && r.chance(0.9) ? r.pick(inits) : null
    const pool = initiativeId ? peopleOfInit.get(initiativeId)! : peopleOfOrg.get(personOrg.get(primary.id)!)!
    const extra = kind === 'workshop' || kind === 'consultation' ? r.int(2, 6) : kind === 'meeting' ? r.int(0, 3) : kind === 'email' ? r.int(0, 1) : 0
    const ids = new Set([primary.id, ...r.sample(pool.filter(x => !never.has(x) && !(quiet.has(x) && at > daysAgo(400))), extra)])
    const org = plan.orgs.find(o => o.id === personOrg.get(primary.id))!
    const topic = r.pick(pack.topics)
    const missingNotes = r.chance(0.12)
    plan.engagements.push({
      id: id(), key: '', kind, title: `${topic} — ${org.short}`, occurredAt: iso(at), initiativeId,
      summary: missingNotes ? null : `${topic} with ${org.name}${initiativeId ? ` on ${plan.initiatives.find(x => x.id === initiativeId)!.code}` : ''}: ${r.pick(['agreed next steps', 'raised concerns about timing', 'asked for more information', 'confirmed support', 'requested a follow-up', 'reviewed open actions'])}.`,
      notes: missingNotes || r.chance(0.7) ? null : `Discussed ${topic.toLowerCase()} with ${primary.name}. Follow-ups recorded separately.`,
      ownerKey: r.chance(0.95) ? anyUser() : null,
      participants: [...ids].map(pid => ({ id: pid, attendance: r.weighted([['attended', 0.88], ['apologies', 0.08], ['invited', 0.04]] as const) })),
    })
    for (const pid of ids) { lastEng.set(pid, Math.max(lastEng.get(pid) ?? 0, at)); engOf.set(pid, (engOf.get(pid) ?? 0) + 1) }
  }
  plan.engagements.forEach((e, i) => { e.key = `E-${101 + i}` })
  for (const p of plan.people) {
    const last = lastEng.get(p.id)
    p.engagementStatus = !last ? 'not_engaged' : last > daysAgo(90) ? 'active' : 'dormant'
  }

  // ── Decisions ──
  const finalStatus = ['approved', 'rejected', 'deferred'] as const
  for (let i = 0; i < decN; i++) {
    const ini = r.pick(plan.initiatives)
    const due = now + r.int(-300, 90) * DAY
    const past = due < now
    const status = past ? r.weighted([['approved', 6], ['rejected', 1.5], ['deferred', 1.5], ['under_review', 1.2], ['proposed', 0.4]] as const) : r.weighted([['proposed', 3], ['under_review', 4], ['approved', 1]] as const)
    const members = peopleOfInit.get(ini.id) ?? []
    const seniors = members.filter(pid => (byId.get(pid)!.influence ?? 0) >= 3)
    const approvers = r.sample(seniors.length ? seniors : members, r.int(1, 2))
    const others = r.sample(members.filter(x => !approvers.includes(x)), r.int(1, 6))
    const src = plan.engagements.filter(e => e.initiativeId === ini.id && Date.parse(e.occurredAt) < due)
    const title = pack.decisions[i % pack.decisions.length] + (i >= pack.decisions.length ? ` (${place()})` : '')
    plan.decisions.push({
      id: id(), key: `D-${101 + i}`, title, description: null, context: r.chance(0.6) ? `Raised during ${ini.name}.` : null, initiativeId: ini.id,
      ownerKey: r.chance(0.95) ? leadUser() : null, status, dueDate: dayIso(due),
      outcome: (finalStatus as readonly string[]).includes(status) ? r.pick(['Agreed with conditions.', 'Agreed as proposed.', 'Not agreed; revisit next quarter.', 'Deferred pending survey results.']) : null,
      decidedAt: (finalStatus as readonly string[]).includes(status) ? iso(Math.min(now - DAY, due + r.int(-10, 10) * DAY)) : null,
      sourceEngagementId: src.length && r.chance(0.4) ? r.pick(src).id : null,
      participants: [...approvers.map(pid => ({ id: pid, role: 'approver' as const })), ...others.map(pid => ({ id: pid, role: r.weighted([['consulted', 3], ['informed', 2], ['affected', 1]] as const) }))],
    })
  }

  // ── Commitments: most come out of meetings (several per meeting, different deadlines). ──
  const meetings = plan.engagements.filter(e => e.kind === 'meeting' || e.kind === 'workshop' || e.kind === 'call' || e.kind === 'consultation')
  for (let i = 0; i < comN; i++) {
    const fromMeeting = meetings.length && r.chance(0.75)
    const e = fromMeeting ? r.pick(meetings) : null
    const pid = e ? r.pick(e.participants).id : r.pick(plan.people).id
    const org = plan.orgs.find(o => o.id === personOrg.get(pid))!
    const direction = r.chance(0.68) ? 'ours' as const : 'theirs' as const
    const tpl = r.pick(direction === 'ours' ? pack.ours : pack.theirs)
    const start = e ? Date.parse(e.occurredAt) : now - r.int(0, 400) * DAY
    const due = start + r.int(3, 45) * DAY
    const overdue = due < now
    const status = overdue ? r.weighted([['completed', 6.5], ['open', 1.6], ['in_progress', 0.9], ['cancelled', 1]] as const) : r.weighted([['open', 6], ['in_progress', 3], ['completed', 1]] as const)
    plan.commitments.push({
      id: id(), key: `C-${101 + i}`, title: tpl.replace('{org}', org.short === org.name ? org.name : org.name).replace('{place}', place()), description: null,
      ownerKey: r.chance(0.94) ? (e?.ownerKey ?? anyUser()) : null, stakeholderId: pid, initiativeId: e?.initiativeId ?? null, direction,
      dueDate: r.chance(0.97) ? dayIso(due) : null, status, completedAt: status === 'completed' ? iso(Math.min(now - 3600_000, due - r.int(-5, 10) * DAY)) : null,
      sourceEngagementId: e?.id ?? null,
    })
  }

  // ── History that matches current state (stance shifts, status changes, ownership changes). ──
  const actor = () => anyUser()
  for (let i = 0; i < evN; i++) {
    const at = iso(now - r.int(1, 500) * DAY)
    const roll = r.next()
    if (roll < 0.45) {
      const p = r.pick(plan.people); if (p.stance === 'unknown') continue
      const from = r.pick(STANCES.filter(s => s !== p.stance))
      plan.events.push({ actorKey: actor(), entityType: 'stakeholder', entityId: p.id, verb: 'stance_changed', summary: `Stance changed from ${from} to ${p.stance}`, changes: { stance: { from, to: p.stance } }, createdAt: at })
    } else if (roll < 0.8) {
      const c = r.pick(plan.commitments); if (c.status === 'open') continue
      plan.events.push({ actorKey: c.ownerKey ?? actor(), entityType: 'commitment', entityId: c.id, verb: 'status_changed', summary: `${c.key} ${c.status === 'completed' ? 'completed' : c.status === 'cancelled' ? 'cancelled' : 'started'}`, changes: { status: { from: 'open', to: c.status } }, createdAt: c.completedAt ?? at })
    } else {
      const d = r.pick(plan.decisions); if (d.status === 'proposed') continue
      plan.events.push({ actorKey: d.ownerKey ?? actor(), entityType: 'decision', entityId: d.id, verb: 'status_changed', summary: `${d.key} ${d.status.replace('_', ' ')}`, changes: { status: { from: 'proposed', to: d.status } }, createdAt: d.decidedAt ?? at })
    }
  }

  // ── Named complications: explicit records the tests look up. ──
  const C = (kind: string, description: string, refs: Record<string, string>) => plan.complications.push({ kind, description, refs })
  const externalsWithPeople = externals.filter(o => (peopleOfOrg.get(o.id) ?? []).length >= 2)

  // A stakeholder changes organisation during an initiative; history stays with the old organisation.
  const mover = plan.people.find(p => p.type !== 'internal' && (engOf.get(p.id) ?? 0) >= 2 && !never.has(p.id))
  if (mover && externalsWithPeople.length > 1) {
    const oldAff = plan.affiliations.find(a => a.stakeholderId === mover.id && a.isPrimary)!
    const target = externalsWithPeople.find(o => o.id !== oldAff.orgId)!
    const moveAt = daysAgo(120)
    oldAff.validTo = dayIso(moveAt); oldAff.isPrimary = false
    plan.affiliations.push({ stakeholderId: mover.id, orgId: target.id, role: mover.title, isPrimary: true, validFrom: dayIso(moveAt + DAY), validTo: null })
    plan.events.push({ actorKey: actor(), entityType: 'stakeholder', entityId: mover.id, verb: 'organization_ended', summary: `Left ${plan.orgs.find(o => o.id === oldAff.orgId)!.name}`, changes: null, createdAt: iso(moveAt) })
    plan.events.push({ actorKey: actor(), entityType: 'stakeholder', entityId: mover.id, verb: 'organization_added', summary: `Joined ${target.name}`, changes: null, createdAt: iso(moveAt + DAY) })
    C('changed_organization', `${mover.name} moved from ${plan.orgs.find(o => o.id === oldAff.orgId)!.name} to ${target.name} 120 days ago; earlier engagements keep the old organisation.`, { stakeholderId: mover.id, fromOrgId: oldAff.orgId, toOrgId: target.id })
  }

  // A project sponsor leaves the company: removed from the workspace, still named on records they owned.
  if (plan.users.length > 2) {
    const leaver = plan.users.find(u => u.role === 'manager') ?? plan.users[plan.users.length - 1]
    leaver.departed = true
    const owned = plan.initiatives.find(i => i.ownerKey === leaver.key) ?? plan.initiatives[0]
    const successor = plan.users.find(u => !u.departed && u.role !== 'viewer' && u.key !== leaver.key)!
    const prev = owned.ownerKey; owned.ownerKey = successor.key
    plan.events.push({ actorKey: plan.users[0].key, entityType: 'initiative', entityId: owned.id, verb: 'updated', summary: 'Updated ownerId', changes: { ownerId: { from: prev, to: successor.key } }, createdAt: iso(daysAgo(30)) })
    const orphaned = plan.commitments.filter(c => c.ownerKey === leaver.key && (c.status === 'open' || c.status === 'in_progress')).length
    C('sponsor_left', `${leaver.name} left; initiative ${owned.code} was handed to ${successor.name}. ${orphaned} open commitment(s) still name ${leaver.name} as owner.`, { userKey: leaver.key, initiativeId: owned.id, successorKey: successor.key })
  }

  // Two departments disagree about ownership of a decision: no owner, approvers from both.
  const internalByDept = depts.map(d => (peopleOfOrg.get(d.id) ?? []))
  const [da, db] = internalByDept.filter(x => x.length).slice(0, 2)
  if (da && db && plan.decisions.length) {
    const d = plan.decisions.find(x => x.status === 'under_review') ?? plan.decisions[0]
    d.ownerKey = null; d.status = 'under_review'; d.decidedAt = null; d.outcome = null
    d.participants = [{ id: da[0], role: 'approver' }, { id: db[0], role: 'approver' }, ...d.participants.filter(p => p.id !== da[0] && p.id !== db[0] && p.role !== 'approver')]
    byId.get(da[0])!.stance = 'supporter'; byId.get(db[0])!.stance = 'concerned'
    C('ownership_dispute', `${d.key} has no owner: approvers from two departments disagree on who owns it.`, { decisionId: d.id, approverA: da[0], approverB: db[0] })
  }

  // A decision is approved but its dependent commitment remains unfinished (and overdue).
  const approved = plan.decisions.find(d => d.status === 'approved' && d.initiativeId)
  if (approved) {
    const pid = (peopleOfInit.get(approved.initiativeId!) ?? [plan.people[0].id])[0]
    const c = { id: id(), key: `C-${101 + plan.commitments.length}`, title: `Implement ${approved.key}: ${approved.title.toLowerCase()}`, description: `Required to implement ${approved.key}, which was approved.`, ownerKey: leadUser(), stakeholderId: pid, initiativeId: approved.initiativeId, direction: 'ours' as const, dueDate: dayIso(daysAgo(14)), status: 'in_progress' as const, completedAt: null, sourceEngagementId: approved.sourceEngagementId }
    plan.commitments.push(c)
    C('approved_decision_unfinished_commitment', `${approved.key} is approved but ${c.key}, needed to implement it, is 14 days overdue.`, { decisionId: approved.id, commitmentId: c.id })
  }

  // An overdue commitment affects a pending decision.
  const pending = plan.decisions.find(d => d.status === 'under_review' && d.initiativeId && d.ownerKey)
  if (pending) {
    const pid = (peopleOfInit.get(pending.initiativeId!) ?? [plan.people[0].id]).at(-1)!
    const c = { id: id(), key: `C-${101 + plan.commitments.length}`, title: `Provide information needed for ${pending.key}`, description: `${pending.key} can't be decided until this arrives.`, ownerKey: pending.ownerKey, stakeholderId: pid, initiativeId: pending.initiativeId, direction: 'theirs' as const, dueDate: dayIso(daysAgo(9)), status: 'open' as const, completedAt: null, sourceEngagementId: null }
    plan.commitments.push(c)
    C('overdue_commitment_blocks_decision', `${pending.key} is waiting on ${c.key}, which the stakeholder owes and is 9 days overdue.`, { decisionId: pending.id, commitmentId: c.id })
  }

  // One meeting generates several commitments with different deadlines.
  const busy = plan.engagements.filter(e => e.kind === 'meeting' && e.participants.length >= 2 && Date.parse(e.occurredAt) > daysAgo(20)).at(-1)
  if (busy) {
    const made: string[] = []
    for (const [days, dir] of [[2, 'ours'], [7, 'theirs'], [21, 'ours']] as const) {
      const pid = busy.participants[made.length % busy.participants.length].id
      const c = { id: id(), key: `C-${101 + plan.commitments.length}`, title: `${dir === 'ours' ? 'Send' : 'Receive'} follow-up ${made.length + 1} from ${busy.key}`, description: null, ownerKey: busy.ownerKey, stakeholderId: pid, initiativeId: busy.initiativeId, direction: dir, dueDate: dayIso(Date.parse(busy.occurredAt) + days * DAY), status: 'open' as const, completedAt: null, sourceEngagementId: busy.id }
      plan.commitments.push(c); made.push(c.id)
    }
    C('meeting_many_commitments', `${busy.key} produced three commitments due 2, 7 and 21 days after the meeting.`, { engagementId: busy.id, commitmentIds: made.join(',') })
  }

  // An initiative is paused while engagements continue.
  const paused = activeInits.length > 1 ? activeInits[1] : null
  if (paused) {
    paused.status = 'on_hold'
    const recent = plan.engagements.filter(e => e.initiativeId === paused.id && Date.parse(e.occurredAt) > daysAgo(30)).length
    C('paused_initiative_active_engagement', `${paused.code} is on hold; ${recent} engagement(s) on it in the last 30 days.`, { initiativeId: paused.id })
  }

  // A relationship becomes inactive. The product ends a relationship by archiving it (kept in history); the API has
  // no end date for relationships, so the simulation uses the product's own mechanism.
  const ended = plan.relationships.find(x => (x.type === 'allied' || x.type === 'influences') && x.src.kind === 'stakeholder')
  if (ended) {
    ended.archived = true
    plan.events.push({ actorKey: actor(), entityType: 'stakeholder', entityId: ended.src.id, verb: 'relationship_removed', summary: `Relationship removed: ${byId.get(ended.src.id)?.name ?? 'stakeholder'} ${ended.type} ${ended.tgt.kind === 'stakeholder' ? byId.get(ended.tgt.id)?.name : 'organisation'}`, changes: null, createdAt: iso(daysAgo(60)) })
    C('relationship_ended', 'A relationship ended 60 days ago (archived, with a history entry).', { relationshipId: ended.id })
  }

  // An organisation is archived; its historical decisions must stay accessible.
  const histOrg = externalsWithPeople.find(o => plan.decisions.some(d => (d.status === 'approved' || d.status === 'rejected') && d.participants.some(p => personOrg.get(p.id) === o.id)))
  if (histOrg) {
    histOrg.archived = true
    const d = plan.decisions.find(x => (x.status === 'approved' || x.status === 'rejected') && x.participants.some(p => personOrg.get(p.id) === histOrg.id))!
    C('archived_org_history', `${histOrg.name} is archived; ${d.key} (decided) involved its people and must remain accessible.`, { orgId: histOrg.id, decisionId: d.id })
  }

  // Duplicate stakeholder records (same person entered twice with partial information).
  const dupOf = plan.people.find(p => p.email && p.title && p.type !== 'internal')
  if (dupOf) {
    const dup = { ...dupOf, id: id(), email: dupOf.email!.replace('@', '+old@'), title: null, ownerKey: null, stance: 'unknown' as Stance, engagementStatus: 'not_engaged' as const, notes: 'Entered from an old contact list.' }
    plan.people.push(dup)
    plan.affiliations.push({ stakeholderId: dup.id, orgId: personOrg.get(dupOf.id)!, role: null, isPrimary: true, validFrom: null, validTo: null })
    C('duplicate_stakeholder', `${dupOf.name} exists twice (the second record has partial information).`, { originalId: dupOf.id, duplicateId: dup.id })
  }

  // A stakeholder belongs to two organisations at once (e.g. a board seat).
  const multi = plan.people.find(p => p.type !== 'internal' && (p.influence ?? 0) >= 3 && p.id !== mover?.id)
  if (multi && externals.length > 1) {
    const second = externals.find(o => o.id !== personOrg.get(multi.id))!
    plan.affiliations.push({ stakeholderId: multi.id, orgId: second.id, role: 'Board member', isPrimary: false, validFrom: dayIso(daysAgo(800)), validTo: null })
    C('multiple_organizations', `${multi.name} holds roles at two organisations.`, { stakeholderId: multi.id, secondOrgId: second.id })
  }

  // A decision is reopened after approval; another is deferred; one rejected.
  const reopened = plan.decisions.find(d => d.status === 'approved' && d !== approved && d.ownerKey)
  if (reopened) {
    reopened.status = 'under_review'; reopened.decidedAt = null; reopened.outcome = null
    plan.events.push({ actorKey: reopened.ownerKey, entityType: 'decision', entityId: reopened.id, verb: 'status_changed', summary: `${reopened.key} approved`, changes: { status: { from: 'under_review', to: 'approved' } }, createdAt: iso(daysAgo(40)) })
    plan.events.push({ actorKey: reopened.ownerKey, entityType: 'decision', entityId: reopened.id, verb: 'status_changed', summary: `${reopened.key} reopened`, changes: { status: { from: 'approved', to: 'under_review' } }, createdAt: iso(daysAgo(6)) })
    C('decision_reopened', `${reopened.key} was approved, then reopened for review.`, { decisionId: reopened.id })
  }

  // A commitment is reassigned; another reopened after completion.
  const reassign = plan.commitments.find(c => c.status === 'open' && c.ownerKey && c.direction === 'ours')
  if (reassign && plan.users.length > 1) {
    const to = plan.users.find(u => u.key !== reassign.ownerKey && !u.departed)!.key
    plan.events.push({ actorKey: plan.users[0].key, entityType: 'commitment', entityId: reassign.id, verb: 'updated', summary: 'Updated ownerId', changes: { ownerId: { from: reassign.ownerKey, to } }, createdAt: iso(daysAgo(3)) })
    reassign.ownerKey = to
    C('commitment_reassigned', `${reassign.key} was reassigned 3 days ago.`, { commitmentId: reassign.id })
  }
  const reopenedC = plan.commitments.find(c => c.status === 'open' && c !== reassign && c.dueDate && Date.parse(c.dueDate) > now)
  if (reopenedC) {
    plan.events.push({ actorKey: reopenedC.ownerKey, entityType: 'commitment', entityId: reopenedC.id, verb: 'status_changed', summary: `${reopenedC.key} completed`, changes: { status: { from: 'open', to: 'completed' } }, createdAt: iso(daysAgo(10)) })
    plan.events.push({ actorKey: reopenedC.ownerKey, entityType: 'commitment', entityId: reopenedC.id, verb: 'status_changed', summary: `${reopenedC.key} reopened`, changes: { status: { from: 'completed', to: 'open' } }, createdAt: iso(daysAgo(4)) })
    C('commitment_reopened', `${reopenedC.key} was completed, then reopened.`, { commitmentId: reopenedC.id })
  }

  // Restricted and archived stakeholders (permissions and history).
  const restricted = plan.people.filter(p => (p.influence ?? 0) >= 3 && p.id !== mover?.id && p.id !== multi?.id).slice(0, Math.max(1, Math.round(scale.people * 0.01)))
  for (const p of restricted) { p.restricted = true; if (p.ownerKey) plan.access.push({ stakeholderId: p.id, userKey: p.ownerKey }) }
  if (restricted[0]) C('restricted_stakeholder', `${restricted.length} restricted stakeholder(s), visible only to owners, admins and their access list.`, { stakeholderId: restricted[0].id })
  // Never archive a record another complication depends on (the duplicate, the mover, the long history…).
  const keep = new Set(plan.complications.flatMap(c => Object.values(c.refs).flatMap(v => v.split(','))))
  const archivedPeople = plan.people.filter(p => p.type !== 'internal' && !p.restricted && !keep.has(p.id) && p.id !== longHistory.id).slice(-Math.max(1, Math.round(scale.people * 0.02)))
  for (const p of archivedPeople) p.archived = true
  C('archived_stakeholders', `${archivedPeople.length} archived stakeholder(s) with history.`, { stakeholderId: archivedPeople[0].id })
  C('long_history', `${longHistory.name} has ${engOf.get(longHistory.id) ?? 0} engagements.`, { stakeholderId: longHistory.id })
  const missing = plan.people.find(p => !p.title && !p.email)
  if (missing) C('missing_information', `${missing.name} has no title or email.`, { stakeholderId: missing.id })
  C('never_engaged', `${never.size} stakeholder(s) were never engaged.`, { stakeholderId: [...never][0] ?? '' })
  C('gone_quiet', `${quiet.size} stakeholder(s) have not been engaged for more than 400 days.`, { stakeholderId: [...quiet][0] ?? '' })
  return plan
}

/** Profile E: fifty isolated workspaces across all ten industries. */
export function planTenants(packs: IndustryPack[], seed: number, anchor?: string) {
  const s = PROFILES.E
  return Array.from({ length: s.workspaces }, (_, i) => planWorkspace(packs[i % packs.length], s, seed, anchor, `T${String(i + 1).padStart(2, '0')}`))
}

export function counts(p: Plan) {
  return {
    users: p.users.length, organizations: p.orgs.length, stakeholders: p.people.length, relationships: p.relationships.length,
    engagements: p.engagements.length, participants: p.engagements.reduce((s, e) => s + e.participants.length, 0),
    decisions: p.decisions.length, commitments: p.commitments.length, events: p.events.length,
    activity: p.engagements.length + p.decisions.length + p.commitments.length + p.events.length,
    complications: p.complications.length,
  }
}
