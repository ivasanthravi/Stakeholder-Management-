// Release-blocking: tenant isolation and server-side authorization.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { sql } from 'drizzle-orm'
import { addMember, client, createTestContext, createWorkspace, signUp, type Client, type TestContext } from './helpers'

let ctx: TestContext
let alice: Client, bob: Client, vic: Client, cara: Client
let wa: string, wb: string
let aliceStakeholder: string, aliceOrg: string, aliceInitiative: string

beforeAll(async () => {
  ctx = await createTestContext()
  alice = await signUp(ctx, 'alice@tenant-a.test', 'Alice A')
  bob = await signUp(ctx, 'bob@tenant-b.test', 'Bob B')
  vic = await signUp(ctx, 'vic@tenant-a.test', 'Vic Viewer')
  cara = await signUp(ctx, 'cara@tenant-a.test', 'Cara Contributor')
  wa = await createWorkspace(alice, 'Tenant A')
  wb = await createWorkspace(bob, 'Tenant B')
  await addMember(ctx, alice, wa, vic, 'vic@tenant-a.test', 'viewer')
  await addMember(ctx, alice, wa, cara, 'cara@tenant-a.test', 'contributor')
  aliceOrg = (await alice.post(`/api/w/${wa}/organizations`, { name: 'Westshire Council', type: 'government' })).body.id
  aliceStakeholder = (await alice.post(`/api/w/${wa}/stakeholders`, { name: 'Bea Ellwood', organizations: [{ organizationId: aliceOrg }] })).body.id
  aliceInitiative = (await alice.post(`/api/w/${wa}/initiatives`, { code: 'NRL', name: 'Northern Rail Link' })).body.id
})
afterAll(async () => { await ctx.close() })

describe('Tenant A data is invisible to Tenant B', () => {
  test('B cannot use A’s workspace id (membership verified server-side)', async () => {
    for (const path of ['', '/stakeholders', `/stakeholders/${aliceStakeholder}`, '/organizations', '/dashboard', '/graph', '/members', '/search?q=Bea']) {
      const r = await bob.get(`/api/w/${wa}${path}`)
      expect(r.status, path).toBe(404)
    }
  })
  test('B cannot read A’s records through B’s own workspace (direct object reference)', async () => {
    expect((await bob.get(`/api/w/${wb}/stakeholders/${aliceStakeholder}`)).status).toBe(404)
    expect((await bob.get(`/api/w/${wb}/organizations/${aliceOrg}`)).status).toBe(404)
    expect((await bob.get(`/api/w/${wb}/initiatives/${aliceInitiative}`)).status).toBe(404)
    expect((await bob.get(`/api/w/${wb}/stakeholders/${aliceStakeholder}/overview`)).status).toBe(404)
  })
  test('B’s lists, search, graph and dashboard contain none of A’s data', async () => {
    expect((await bob.get(`/api/w/${wb}/stakeholders`)).body.total).toBe(0)
    const s = await bob.get(`/api/w/${wb}/search?q=Bea`)
    expect(s.body.stakeholders).toEqual([])
    expect((await bob.get(`/api/w/${wb}/graph?initiativeId=all`)).body.nodes).toEqual([])
    expect((await bob.get(`/api/w/${wb}/lookups`)).body.members.map((m: { name: string }) => m.name)).toEqual(['Bob B'])
  })
})

describe('Tenant A records cannot be modified by Tenant B', () => {
  test('update / archive / relate through B’s workspace are rejected', async () => {
    expect((await bob.patch(`/api/w/${wb}/stakeholders/${aliceStakeholder}`, { name: 'Hacked', version: 1 })).status).toBe(404)
    expect((await bob.post(`/api/w/${wb}/stakeholders/${aliceStakeholder}/archive`)).status).toBe(404)
    expect((await bob.post(`/api/w/${wb}/initiatives/${aliceInitiative}/stakeholders`, { stakeholderId: aliceStakeholder })).status).toBe(404)
  })
  test('B cannot link B’s records to A’s ids (same-tenant foreign keys)', async () => {
    const r1 = await bob.post(`/api/w/${wb}/stakeholders`, { name: 'Mole', organizations: [{ organizationId: aliceOrg }] })
    expect(r1.status).toBe(422)
    const r2 = await bob.post(`/api/w/${wb}/commitments`, { title: 'Steal', stakeholderId: aliceStakeholder })
    expect(r2.status).toBe(422)
    const mine = (await bob.post(`/api/w/${wb}/stakeholders`, { name: 'Own person' })).body.id
    const r3 = await bob.post(`/api/w/${wb}/relationships`, { source: { kind: 'stakeholder', id: mine }, target: { kind: 'stakeholder', id: aliceStakeholder }, type: 'influences' })
    expect(r3.status).toBe(404)
  })
  test('B cannot assign a user from another tenant as owner', async () => {
    const aliceId = (await alice.get('/api/me')).body.user.id
    const r = await bob.post(`/api/w/${wb}/stakeholders`, { name: 'X', ownerId: aliceId })
    expect(r.status).toBe(422)
  })
  test('A’s data is unchanged', async () => {
    const r = await alice.get(`/api/w/${wa}/stakeholders/${aliceStakeholder}`)
    expect(r.body.name).toBe('Bea Ellwood')
    expect(r.body.archivedAt).toBeNull()
  })
  test('Database RLS blocks cross-tenant writes even if application code forgot a filter', async () => {
    const { withTenant } = await import('../server/db/client')
    const bobId = (await bob.get('/api/me')).body.user.id
    const n = await withTenant(ctx.db, { workspaceId: wb, userId: bobId, role: 'owner' }, async t => {
      const res = await t.execute(sql`update stakeholder set name = 'pwned' where workspace_id = ${wa} returning id`)
      return ((res as { rows?: unknown[] }).rows ?? []).length
    })
    expect(n).toBe(0)
  })
})

describe('Role restrictions are enforced server-side', () => {
  test('viewer cannot create, update or archive', async () => {
    expect((await vic.post(`/api/w/${wa}/stakeholders`, { name: 'Nope' })).status).toBe(403)
    expect((await vic.patch(`/api/w/${wa}/stakeholders/${aliceStakeholder}`, { name: 'Nope', version: 1 })).status).toBe(403)
    expect((await vic.post(`/api/w/${wa}/stakeholders/${aliceStakeholder}/archive`)).status).toBe(403)
    expect((await vic.get(`/api/w/${wa}/stakeholders/${aliceStakeholder}`)).status).toBe(200)
  })
  test('contributor can create stakeholders but not initiatives, archive, or approve decisions', async () => {
    expect((await cara.post(`/api/w/${wa}/stakeholders`, { name: 'Contrib Added' })).status).toBe(201)
    expect((await cara.post(`/api/w/${wa}/initiatives`, { code: 'X1', name: 'Nope' })).status).toBe(403)
    expect((await cara.post(`/api/w/${wa}/stakeholders/${aliceStakeholder}/archive`)).status).toBe(403)
    expect((await cara.post(`/api/w/${wa}/decisions`, { title: 'Self-approved', status: 'approved' })).status).toBe(403)
    expect((await cara.post(`/api/w/${wa}/decisions`, { title: 'Proposal' })).status).toBe(201)
  })
  test('unauthorized users cannot access workspace settings, invitations or audit', async () => {
    expect((await vic.patch(`/api/w/${wa}/settings`, { name: 'Renamed' })).status).toBe(403)
    expect((await cara.patch(`/api/w/${wa}/settings`, { name: 'Renamed' })).status).toBe(403)
    expect((await cara.post(`/api/w/${wa}/invitations`, { email: 'x@y.test', role: 'viewer' })).status).toBe(403)
    expect((await vic.get(`/api/w/${wa}/audit`)).status).toBe(403)
    expect((await alice.get(`/api/w/${wa}/audit`)).status).toBe(200)
  })
  test('nobody can grant a role above their own; last owner cannot be demoted', async () => {
    const members = (await alice.get(`/api/w/${wa}/members`)).body.members
    const caraM = members.find((m: { email: string }) => m.email === 'cara@tenant-a.test')
    const aliceM = members.find((m: { email: string }) => m.email === 'alice@tenant-a.test')
    expect((await cara.patch(`/api/w/${wa}/members/${caraM.id}`, { role: 'admin' })).status).toBe(403)
    expect((await alice.patch(`/api/w/${wa}/members/${aliceM.id}`, { role: 'admin' })).status).toBe(409)
    expect((await alice.del(`/api/w/${wa}/members/${aliceM.id}`)).status).toBe(409)
  })
  test('unauthenticated requests are rejected', async () => {
    const anon = client(ctx)
    expect((await anon.get(`/api/w/${wa}/stakeholders`)).status).toBe(401)
    expect((await anon.get('/api/me')).status).toBe(401)
  })
})

describe('Restricted stakeholders (record-level permission)', () => {
  test('restricted record is hidden from contributors and viewers everywhere, visible to admins and the access list', async () => {
    const secret = (await alice.post(`/api/w/${wa}/stakeholders`, { name: 'Confidential Source', initiativeIds: [aliceInitiative] })).body
    expect((await alice.patch(`/api/w/${wa}/stakeholders/${secret.id}`, { restricted: true, version: secret.version })).status).toBe(200)
    for (const who of [cara, vic]) {
      expect((await who.get(`/api/w/${wa}/stakeholders/${secret.id}`)).status).toBe(404)
      expect((await who.get(`/api/w/${wa}/stakeholders?q=Confidential`)).body.total).toBe(0)
      expect((await who.get(`/api/w/${wa}/search?q=Confidential`)).body.stakeholders).toEqual([])
      expect((await who.get(`/api/w/${wa}/graph?initiativeId=${aliceInitiative}`)).body.nodes.map((n: { name: string }) => n.name)).not.toContain('Confidential Source')
    }
    expect((await cara.patch(`/api/w/${wa}/stakeholders/${secret.id}`, { restricted: false, version: 2 })).status).toBe(403)
    const caraId = (await cara.get('/api/me')).body.user.id
    expect((await alice.put(`/api/w/${wa}/stakeholders/${secret.id}/access`, { userIds: [caraId] })).status).toBe(200)
    expect((await cara.get(`/api/w/${wa}/stakeholders/${secret.id}`)).status).toBe(200)
    expect((await vic.get(`/api/w/${wa}/stakeholders/${secret.id}`)).status).toBe(404)
    // History of a restricted record doesn't leak through the activity feed.
    expect((await vic.get(`/api/w/${wa}/activity?entityType=stakeholder&entityId=${secret.id}`)).body.events).toEqual([])
    expect((await vic.get(`/api/w/${wa}/stakeholders/${secret.id}/activity`)).status).toBe(404)
  })
})

describe('Membership lifecycle', () => {
  test('removed members lose access immediately', async () => {
    const dan = await signUp(ctx, 'dan@tenant-a.test', 'Dan')
    await addMember(ctx, alice, wa, dan, 'dan@tenant-a.test', 'manager')
    expect((await dan.get(`/api/w/${wa}/stakeholders`)).status).toBe(200)
    const danM = (await alice.get(`/api/w/${wa}/members`)).body.members.find((m: { email: string }) => m.email === 'dan@tenant-a.test')
    expect((await alice.del(`/api/w/${wa}/members/${danM.id}`)).status).toBe(200)
    expect((await dan.get(`/api/w/${wa}/stakeholders`)).status).toBe(404)
    expect((await dan.get('/api/me')).body.workspaces).toEqual([])
  })
  test('invitation can only be accepted by the invited address, once', async () => {
    const eve = await signUp(ctx, 'eve@elsewhere.test', 'Eve')
    await alice.post(`/api/w/${wa}/invitations`, { email: 'fay@tenant-a.test', role: 'viewer' })
    const { lastMail } = await import('./helpers')
    const token = new URL((await lastMail(ctx, 'fay@tenant-a.test', 'invite')).url!).pathname.split('/').pop()
    expect((await eve.post(`/api/invitations/${token}/accept`)).status).toBe(403)
    const fay = await signUp(ctx, 'fay@tenant-a.test', 'Fay')
    expect((await fay.post(`/api/invitations/${token}/accept`)).status).toBe(200)
    expect((await fay.post(`/api/invitations/${token}/accept`)).status).toBe(409)
  })
  test('unverified users cannot sign in', async () => {
    const c = client(ctx)
    await c.post('/api/auth/sign-up/email', { email: 'unverified@x.test', password: 'correct-horse-battery', name: 'U' })
    const r = await c.post('/api/auth/sign-in/email', { email: 'unverified@x.test', password: 'correct-horse-battery' })
    expect(r.status).toBe(403)
  })
})

describe('Audit trail', () => {
  test('security-relevant actions are recorded with actor and tenant', async () => {
    const events = (await alice.get(`/api/w/${wa}/audit`)).body.events.map((e: { action: string }) => e.action)
    for (const a of ['workspace.created', 'member.invited', 'member.joined', 'member.removed', 'stakeholder.restricted', 'stakeholder.access_changed']) expect(events).toContain(a)
  })
})
