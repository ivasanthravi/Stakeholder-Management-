// Integration: core records and operational workflows against a real (PGlite) Postgres.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createTestContext, createWorkspace, signUp, type Client, type TestContext } from './helpers'

let ctx: TestContext
let a: Client
let w: string
const api = (p: string) => `/api/w/${w}${p}`
const today = (d = 0) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  ctx = await createTestContext()
  a = await signUp(ctx, 'owner@flow.test', 'Olive Owner')
  w = await createWorkspace(a, 'Flow Co')
})
afterAll(async () => { await ctx.close() })

describe('end-to-end record workflow', () => {
  let org: string, person: string, other: string, init: string, eng: string, dec: string, com: string

  test('organization CRUD', async () => {
    const r = await a.post(api('/organizations'), { name: 'Westshire County Council', shortName: 'WCC', type: 'government', tags: ['statutory'] })
    expect(r.status).toBe(201); org = r.body.id
    expect((await a.post(api('/organizations'), { name: 'westshire county council' })).status).toBe(409)
    const u = await a.patch(api(`/organizations/${org}`), { description: 'Local authority', version: r.body.version })
    expect(u.status).toBe(200); expect(u.body.description).toBe('Local authority')
    expect((await a.get(api('/organizations?q=westshire'))).body.items).toHaveLength(1)
  })

  test('stakeholder create with organization association, validation, edit, version conflict', async () => {
    const bad = await a.post(api('/stakeholders'), { name: '', email: 'nope', influence: 9 })
    expect(bad.status).toBe(422); expect(Object.keys(bad.body.error.fields)).toEqual(expect.arrayContaining(['name', 'email', 'influence']))
    const r = await a.post(api('/stakeholders'), { name: 'Bea Ellwood', title: 'Head of Highways', influence: 4, interest: 3, stance: 'concerned', organizations: [{ organizationId: org, role: 'Head of Highways' }] })
    expect(r.status).toBe(201); person = r.body.id
    expect(r.body.organizations[0]).toMatchObject({ organizationId: org, isPrimary: true, validTo: null })
    other = (await a.post(api('/stakeholders'), { name: 'Jonah Thorne', influence: 2 })).body.id
    const ok = await a.patch(api(`/stakeholders/${person}`), { stance: 'neutral', version: 1 })
    expect(ok.status).toBe(200); expect(ok.body.version).toBe(2)
    expect(ok.body.title).toBe('Head of Highways')
    const stale = await a.patch(api(`/stakeholders/${person}`), { stance: 'opposed', version: 1 })
    expect(stale.status).toBe(409); expect(stale.body.error.code).toBe('stale_version'); expect(stale.body.error.current.stance).toBe('neutral')
  })

  test('stakeholder list: search, filter, sort, paginate', async () => {
    for (let i = 0; i < 12; i++) await a.post(api('/stakeholders'), { name: `Person ${String(i).padStart(2, '0')}`, influence: (i % 4) + 1 })
    const p1 = await a.get(api('/stakeholders?sort=name&limit=5&offset=0'))
    const p2 = await a.get(api('/stakeholders?sort=name&limit=5&offset=5'))
    expect(p1.body.total).toBe(14); expect(p1.body.items).toHaveLength(5)
    expect(p1.body.items.map((x: { id: string }) => x.id)).not.toContain(p2.body.items[0].id)
    expect((await a.get(api('/stakeholders?q=ellwood'))).body.items[0].primaryOrg.shortName).toBe('WCC')
    expect((await a.get(api('/stakeholders?q=westshire'))).body.total).toBe(1)
    expect((await a.get(api('/stakeholders?minInfluence=4'))).body.items.every((x: { influence: number }) => x.influence === 4)).toBe(true)
    expect((await a.get(api(`/stakeholders?organizationId=${org}`))).body.total).toBe(1)
  })

  test('association history: ending keeps the record', async () => {
    const d = (await a.get(api(`/stakeholders/${person}`))).body
    const r = await a.post(api(`/stakeholders/${person}/organizations/${d.organizations[0].id}/end`), { validTo: today() })
    expect(r.status).toBe(200); expect(r.body.organizations[0].validTo).toBe(today())
    expect((await a.post(api(`/stakeholders/${person}/organizations`), { organizationId: org, role: 'Advisor', isPrimary: true })).status).toBe(201)
  })

  test('initiative CRUD and membership', async () => {
    const r = await a.post(api('/initiatives'), { code: 'nrl', name: 'Northern Rail Link', startDate: today(-30) })
    expect(r.status).toBe(201); expect(r.body.code).toBe('NRL'); init = r.body.id
    expect((await a.post(api('/initiatives'), { code: 'BAD', name: 'Dates', startDate: today(), endDate: today(-1) })).status).toBe(422)
    expect((await a.post(api(`/initiatives/${init}/stakeholders`), { stakeholderId: person, role: 'Approver' })).status).toBe(201)
    expect((await a.post(api(`/initiatives/${init}/stakeholders`), { stakeholderId: other })).status).toBe(201)
    const d = (await a.get(api(`/initiatives/${init}`))).body
    expect(d.stakeholders.map((s: { id: string }) => s.id).sort()).toEqual([person, other].sort())
    expect(d.organizations[0]).toMatchObject({ id: org, stakeholderCount: 1 })
    expect((await a.del(api(`/initiatives/${init}/stakeholders/${other}`))).status).toBe(200)
    expect((await a.post(api(`/initiatives/${init}/stakeholders`), { stakeholderId: other })).status).toBe(201)
    await a.patch(api(`/initiatives/${init}`), { description: 'Delivery phase', version: r.body.version })
    const st = await a.patch(api(`/initiatives/${init}`), { status: 'on_hold', version: r.body.version + 1 })
    expect(st.body.status).toBe('on_hold')
    // Partial update must not clear fields it didn't send.
    expect(st.body.description).toBe('Delivery phase')
  })

  test('relationships: create, duplicate & contradiction guards, inferred stays inferred', async () => {
    const r = await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: other }, target: { kind: 'stakeholder', id: person }, type: 'influences', strength: 2 })
    expect(r.status).toBe(201)
    expect((await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: other }, target: { kind: 'stakeholder', id: person }, type: 'influences' })).status).toBe(409)
    expect((await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: person }, target: { kind: 'stakeholder', id: other }, type: 'allied' })).status).toBe(201)
    expect((await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: other }, target: { kind: 'stakeholder', id: person }, type: 'allied' })).status).toBe(409)
    expect((await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: other }, target: { kind: 'stakeholder', id: person }, type: 'opposes' })).status).toBe(409)
    expect((await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: person }, target: { kind: 'stakeholder', id: person }, type: 'advises' })).status).toBe(422)
    const so = await a.post(api('/relationships'), { source: { kind: 'stakeholder', id: person }, target: { kind: 'organization', id: org }, type: 'advises', status: 'inferred' })
    expect(so.status).toBe(201); expect(so.body.status).toBe('inferred')
    const ov = (await a.get(api(`/stakeholders/${person}/overview`))).body
    expect(ov.relationships).toHaveLength(3)
  })

  test('engagement with participants (idempotent create) and timeline', async () => {
    const body = { kind: 'meeting', title: 'Planning liaison', occurredAt: new Date(Date.now() - 86_400_000).toISOString(), initiativeId: init, participantIds: [person, other], summary: 'Discussed alignment', notes: 'Notes here' }
    const r1 = await a.post(api('/engagements'), body, { 'idempotency-key': 'eng-1' })
    const r2 = await a.post(api('/engagements'), body, { 'idempotency-key': 'eng-1' })
    expect(r1.status).toBe(201); expect(r2.body.id).toBe(r1.body.id)
    eng = r1.body.id
    expect(r1.body.key).toMatch(/^E-\d+$/)
    expect((await a.get(api('/engagements'))).body.total).toBe(1)
    expect((await a.get(api(`/engagements?stakeholderId=${person}`))).body.items[0].participants).toHaveLength(2)
    expect((await a.get(api(`/stakeholders/${person}/overview`))).body.engagements[0].id).toBe(eng)
  })

  test('decision lifecycle: propose → review → approve with outcome', async () => {
    const r = await a.post(api('/decisions'), { title: 'Eastern option withdrawn', initiativeId: init, sourceEngagementId: eng, dueDate: today(5), stakeholders: [{ stakeholderId: person, role: 'approver' }] })
    expect(r.status).toBe(201); expect(r.body.status).toBe('proposed'); expect(r.body.key).toMatch(/^D-\d+$/); dec = r.body.id
    const rv = await a.patch(api(`/decisions/${dec}`), { status: 'under_review', version: r.body.version })
    const ap = await a.patch(api(`/decisions/${dec}`), { status: 'approved', outcome: 'Eastern option removed', version: rv.body.version })
    expect(ap.body.status).toBe('approved'); expect(ap.body.decidedAt).toBeTruthy()
    expect((await a.get(api('/decisions?status=approved'))).body.items).toHaveLength(1)
    const hist = (await a.get(api(`/activity?entityType=decision&entityId=${dec}`))).body.events.map((e: { summary: string }) => e.summary)
    expect(hist.join('|')).toMatch(/Under review → Approved/)
  })

  test('commitment: create, complete, reopen; overdue filter', async () => {
    const r = await a.post(api('/commitments'), { title: 'Share hedgerow plan', stakeholderId: person, initiativeId: init, dueDate: today(-2), sourceEngagementId: eng })
    expect(r.status).toBe(201); com = r.body.id
    expect((await a.get(api('/commitments?overdue=true'))).body.items.map((x: { id: string }) => x.id)).toContain(com)
    const done = await a.patch(api(`/commitments/${com}`), { status: 'completed', version: r.body.version })
    expect(done.body.status).toBe('completed'); expect(done.body.completedAt).toBeTruthy()
    expect((await a.get(api('/commitments?overdue=true'))).body.items).toHaveLength(0)
    const re = await a.patch(api(`/commitments/${com}`), { status: 'open', version: done.body.version })
    expect(re.body.completedAt).toBeNull()
    expect((await a.get(api(`/engagements/${eng}`))).body.commitments.map((x: { id: string }) => x.id)).toContain(com)
  })

  test('partial updates never reset fields they did not send', async () => {
    const d = (await a.get(api(`/decisions/${dec}`))).body
    const d2 = await a.patch(api(`/decisions/${dec}`), { status: 'deferred', version: d.version })
    expect(d2.body.stakeholders.map((x: { id: string }) => x.id)).toEqual([person])
    const theirs = await a.post(api('/commitments'), { title: 'They send survey', stakeholderId: person, direction: 'theirs' })
    const done = await a.patch(api(`/commitments/${theirs.body.id}`), { status: 'completed', version: theirs.body.version })
    expect(done.body.direction).toBe('theirs')
    await a.patch(api(`/commitments/${theirs.body.id}`), { status: 'open', version: done.body.version })
    await a.post(api(`/commitments/${theirs.body.id}/archive`))
    const e = (await a.get(api(`/engagements/${eng}`))).body
    const e2 = await a.patch(api(`/engagements/${eng}`), { title: 'Planning liaison (renamed)', version: e.version })
    expect(e2.body.participants).toHaveLength(2)
    expect(e2.body.notes).toBe('Notes here')
  })

  test('dashboard reflects real data (no fabricated values)', async () => {
    const d = (await a.get(api('/dashboard'))).body
    expect(d.signals.find((s: { commitmentId?: string }) => s.commitmentId === com)?.kind).toBe('overdue')
    expect(d.recentEngagements[0].id).toBe(eng)
    expect(d.initiatives[0]).toMatchObject({ code: 'NRL', openCommitments: 1 })
    expect(d.stakeholders.total).toBe(14)
  })

  test('graph returns authorized nodes and edges for an initiative', async () => {
    const g = (await a.get(api(`/graph?initiativeId=${init}`))).body
    expect(g.nodes.map((n: { id: string }) => n.id).sort()).toEqual([person, other].sort())
    expect(g.edges.filter((e: { sourceKind: string; targetKind: string }) => e.sourceKind === 'stakeholder' && e.targetKind === 'stakeholder')).toHaveLength(2)
  })

  test('activity history records meaningful events', async () => {
    const ev = (await a.get(api(`/stakeholders/${person}/activity`))).body.events.map((e: { verb: string }) => e.verb)
    for (const v of ['created', 'stance_changed', 'organization_ended', 'organization_added', 'initiative_added', 'relationship_added', 'engaged', 'decision_linked', 'commitment_added']) expect(ev).toContain(v)
  })

  test('archive hides from lists; restore brings back', async () => {
    const before = (await a.get(api(`/stakeholders/${other}`))).body
    expect((await a.post(api(`/stakeholders/${other}/archive`))).status).toBe(200)
    expect((await a.get(api('/stakeholders?q=Jonah'))).body.total).toBe(0)
    expect((await a.get(api('/stakeholders?q=Jonah&archived=true'))).body.total).toBe(1)
    expect((await a.patch(api(`/stakeholders/${other}`), { name: 'x', version: before.version + 1 })).status).toBe(404)
    expect((await a.post(api(`/stakeholders/${other}/restore`))).status).toBe(200)
  })

  test('search spans record types', async () => {
    const s = (await a.get(api('/search?q=hedgerow'))).body
    expect(s.commitments).toHaveLength(1)
    expect((await a.get(api('/search?q=E-1'))).body.engagements.length).toBeGreaterThan(0)
  })
})
