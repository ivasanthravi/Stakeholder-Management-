// Release-blocking: multi-tenant isolation. Tenant A holds every kind of record; tenant B (and a revoked member)
// attack with A's ids through every route family, search, AI retrieval, exports and background jobs.
// A pass means: 404 (never 403, so ids can't be probed) and no A content anywhere in B's responses.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { addMember, createTestContext, createWorkspace, sse, signUp, type Client, type TestContext } from './helpers'
import { auditEvent, mailOutbox, notification } from '../server/db/schema'
import { withTenant } from '../server/db/client'
import { sendCommitmentDigests } from '../server/modules/notifications'

let ctx: TestContext
let aOwner: Client, aMember: Client, bOwner: Client
let A: string, B: string
const ids: Record<string, string> = {}
const SECRET = ['Aurelia Vance', 'Project Halcyon', 'Halcyon Holdings', 'Confidential land swap', 'HALC']
const leaks = (body: unknown) => SECRET.filter(s => JSON.stringify(body ?? '').includes(s))

beforeAll(async () => {
  ctx = await createTestContext()
  aOwner = await signUp(ctx, 'owner@tenant-a.test', 'Alma Owner')
  aMember = await signUp(ctx, 'member@tenant-a.test', 'Arlo Member')
  bOwner = await signUp(ctx, 'owner@tenant-b.test', 'Bram Owner')
  A = await createWorkspace(aOwner, 'Tenant A')
  B = await createWorkspace(bOwner, 'Tenant B')
  await addMember(ctx, aOwner, A, aMember, 'member@tenant-a.test', 'contributor')
  const a = (p: string) => `/api/w/${A}${p}`
  ids.org = (await aOwner.post(a('/organizations'), { name: 'Halcyon Holdings', type: 'company' })).body.id
  ids.init = (await aOwner.post(a('/initiatives'), { code: 'HALC', name: 'Project Halcyon' })).body.id
  ids.person = (await aOwner.post(a('/stakeholders'), { name: 'Aurelia Vance', influence: 4, initiativeIds: [ids.init] })).body.id
  const other = (await aOwner.post(a('/stakeholders'), { name: 'Second Person', initiativeIds: [ids.init] })).body.id
  ids.rel = (await aOwner.post(a('/relationships'), { source: { kind: 'stakeholder', id: ids.person }, target: { kind: 'stakeholder', id: other }, type: 'influences' })).body.id
  ids.eng = (await aOwner.post(a('/engagements'), { kind: 'meeting', title: 'Confidential land swap', occurredAt: '2026-10-01T10:00:00.000Z', initiativeId: ids.init, participantIds: [ids.person],
    notes: 'Aurelia Vance confirmed the council will not oppose the land swap. We will send the valuation by 30 October.' })).body.id
  ids.dec = (await aOwner.post(a('/decisions'), { title: 'Confidential land swap approval', initiativeId: ids.init, stakeholders: [{ stakeholderId: ids.person, role: 'approver' }] })).body.id
  const ownerId = (await aOwner.get('/api/me')).body.user.id
  ids.com = (await aOwner.post(a('/commitments'), { title: 'Send Project Halcyon valuation', stakeholderId: ids.person, ownerId, dueDate: '2026-01-02' })).body.id
  const analysis = (await aOwner.post(a(`/ai/meetings/${ids.eng}/analyze`))).body
  ids.proposal = analysis.proposals[0].id
  const conv = await sse(ctx, aOwner, a('/ai/copilot'), { message: 'Brief me on Aurelia Vance', context: { stakeholderId: ids.person } })
  ids.conv = conv.events[0].data.conversationId
  await aOwner.post(a('/data/export'))
  await ctx.jobs.drain()
  ids.export = (await aOwner.get(a('/data/requests'))).body.requests[0].id
})
afterAll(async () => { await ctx.close() })

describe('direct object references from another tenant', () => {
  const routes = () => [
    `/stakeholders/${ids.person}`, `/stakeholders/${ids.person}/overview`, `/stakeholders/${ids.person}/activity`,
    `/organizations/${ids.org}`, `/initiatives/${ids.init}`, `/engagements/${ids.eng}`, `/decisions/${ids.dec}`, `/commitments/${ids.com}`,
    `/ai/meetings/${ids.eng}`, `/ai/briefings/stakeholders/${ids.person}`, `/ai/briefings/decisions/${ids.dec}`, `/ai/conversations/${ids.conv}`,
    `/data/exports/${ids.export}`, `/ai/paths?from=${ids.person}&to=${ids.person}`,
  ]
  test('reads of A’s ids inside B’s workspace return 404 or nothing, never A content', async () => {
    for (const r of routes()) {
      const res = await bOwner.get(`/api/w/${B}${r}`)
      expect([404, 200].includes(res.status), r).toBe(true)
      if (res.status === 200) expect(leaks(res.body), r).toEqual([]) // e.g. paths: found=false
      else expect(res.body.error.code, r).toBe('not_found')
    }
  })
  test('B can’t enter A’s workspace at all (membership gate → 404, not 403)', async () => {
    for (const r of ['', '/stakeholders', '/dashboard', '/billing', '/audit', '/members', ...routes()]) {
      const res = await bOwner.get(`/api/w/${A}${r}`)
      expect(res.status, r).toBe(404)
      expect(leaks(res.body)).toEqual([])
    }
  })
  test('writes to A’s records from B fail and change nothing', async () => {
    const b = (p: string) => `/api/w/${B}${p}`
    const attempts = [
      bOwner.patch(b(`/stakeholders/${ids.person}`), { name: 'Pwned', version: 1 }),
      bOwner.post(b(`/stakeholders/${ids.person}/archive`)),
      bOwner.patch(b(`/commitments/${ids.com}`), { status: 'completed', version: 1 }),
      bOwner.patch(b(`/decisions/${ids.dec}`), { status: 'approved', version: 1 }),
      bOwner.post(b(`/ai/proposals/${ids.proposal}/accept`), { version: 1 }),
      bOwner.post(b(`/ai/meetings/${ids.eng}/analyze`)),
      bOwner.del(b(`/ai/conversations/${ids.conv}`)),
      bOwner.post(b('/commitments'), { title: 'x', stakeholderId: ids.person }), // foreign key into A
      bOwner.post(b('/relationships'), { source: { kind: 'stakeholder', id: ids.person }, target: { kind: 'organization', id: ids.org }, type: 'member_of' }),
    ]
    const statuses = (await Promise.all(attempts)).map(r => r.status)
    for (const st of statuses) expect([404, 422].includes(st), String(statuses)).toBe(true)
    const p = (await aOwner.get(`/api/w/${A}/stakeholders/${ids.person}`)).body
    expect(p.name).toBe('Aurelia Vance'); expect(p.archivedAt).toBeNull()
    expect((await aOwner.get(`/api/w/${A}/ai/conversations/${ids.conv}`)).status).toBe(200)
  })
})

describe('search, aggregates and AI retrieval stay in-tenant', () => {
  test('search, lists, graph, dashboard and activity in B show none of A', async () => {
    const b = (p: string) => `/api/w/${B}${p}`
    for (const r of ['/search?q=Aurelia', '/search?q=Halcyon', '/search?q=HALC', '/stakeholders?q=Aurelia', '/organizations', '/initiatives', '/engagements', '/decisions', '/commitments', '/dashboard', '/lookups', '/activity', `/graph?initiativeId=${ids.init}`]) {
      const res = await bOwner.get(b(r))
      expect(leaks(res.body), r).toEqual([])
    }
  })
  test('copilot in B can’t retrieve A’s records, even when asked by name or id', async () => {
    for (const message of ['Brief me on Aurelia Vance', 'Which commitments are overdue?', 'What decisions are pending?', `Tell me about ${ids.person}`, 'How is Aurelia Vance connected to Second Person?']) {
      const r = await sse(ctx, bOwner, `/api/w/${B}/ai/copilot`, { message, context: { stakeholderId: ids.person, initiativeId: ids.init } })
      expect(leaks(r.events), message).toEqual([])
    }
    const brief = await bOwner.get(`/api/w/${B}/ai/briefings/workspace`)
    expect(leaks(brief.body)).toEqual([])
  })
  test('conversation lists, notifications, data requests and usage are per tenant/user', async () => {
    const b = (p: string) => `/api/w/${B}${p}`
    for (const r of ['/ai/conversations', '/notifications', '/data/requests', '/ai/usage', '/billing', '/billing/invoices', '/audit']) {
      const res = await bOwner.get(b(r))
      // B's own conversation titles echo what B typed (the previous test asked about A's names), so only ids are checked there.
      if (r !== '/ai/conversations') expect(leaks(res.body), r).toEqual([])
      expect(JSON.stringify(res.body), r).not.toContain(ids.conv)
      expect(JSON.stringify(res.body), r).not.toContain(ids.export)
    }
    // Inside A, conversations are private to their author.
    expect((await aMember.get(`/api/w/${A}/ai/conversations/${ids.conv}`)).status).toBe(404)
  })
})

describe('exports and background jobs', () => {
  test('B’s export contains only B’s data', async () => {
    await bOwner.post(`/api/w/${B}/stakeholders`, { name: 'Bea B' })
    await bOwner.post(`/api/w/${B}/data/export`)
    await ctx.jobs.drain()
    const req = (await bOwner.get(`/api/w/${B}/data/requests`)).body.requests[0]
    const dl = await bOwner.get(`/api/w/${B}/data/exports/${req.id}`)
    expect(dl.status).toBe(200)
    expect(leaks(dl.body)).toEqual([])
    expect(dl.body.stakeholders.map((s: { name: string }) => s.name)).toEqual(['Bea B'])
    // and A's download link is unreachable from B's workspace
    expect((await bOwner.get(`/api/w/${B}/data/exports/${ids.export}`)).status).toBe(404)
  })
  test('digest emails only include the recipient’s own tenant records', async () => {
    const bId = (await bOwner.get('/api/me')).body.user.id
    await bOwner.post(`/api/w/${B}/commitments`, { title: 'B commitment', ownerId: bId, dueDate: '2026-01-03' })
    await sendCommitmentDigests(ctx.deps)
    const bMail = await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.to, 'owner@tenant-b.test'))
    expect(bMail.some(m => m.text.includes('B commitment'))).toBe(true)
    expect(bMail.map(m => leaks(m.text)).flat()).toEqual([])
    const bNotes = await ctx.db.select().from(notification).where(eq(notification.workspaceId, B))
    expect(leaks(bNotes)).toEqual([])
  })
})

describe('membership changes take effect immediately', () => {
  test('a demoted member loses write access on the next request; a removed member loses all access', async () => {
    const members = (await aOwner.get(`/api/w/${A}/members`)).body.members
    const m = members.find((x: { email: string }) => x.email === 'member@tenant-a.test')
    expect((await aMember.post(`/api/w/${A}/stakeholders`, { name: 'Allowed' })).status).toBe(201)
    await aOwner.patch(`/api/w/${A}/members/${m.id}`, { role: 'viewer' })
    expect((await aMember.post(`/api/w/${A}/stakeholders`, { name: 'Denied' })).status).toBe(403)
    expect((await aMember.get(`/api/w/${A}/stakeholders`)).status).toBe(200)
    await aOwner.del(`/api/w/${A}/members/${m.id}`)
    for (const r of ['', '/stakeholders', `/stakeholders/${ids.person}`, '/search?q=Aurelia', '/dashboard']) {
      const res = await aMember.get(`/api/w/${A}${r}`)
      expect(res.status, r).toBe(404)
    }
    expect((await sse(ctx, aMember, `/api/w/${A}/ai/copilot`, { message: 'Brief me on Aurelia Vance' })).status).toBe(404)
    expect((await aMember.get('/api/me')).body.workspaces.map((w: { id: string }) => w.id)).not.toContain(A)
  })
})

describe('database backstop', () => {
  test('a tenant transaction can’t write audit events into another workspace', async () => {
    const tenant = { workspaceId: A, userId: 'u-test', role: 'owner' }
    await withTenant(ctx.db, tenant, t => t.insert(auditEvent).values({ workspaceId: A, action: 'test.own' }))
    await withTenant(ctx.db, tenant, t => t.insert(auditEvent).values({ workspaceId: null, action: 'test.account' }))
    await expect(withTenant(ctx.db, tenant, t => t.insert(auditEvent).values({ workspaceId: B, action: 'test.forged' }))).rejects.toThrow()
  })
  test('every table the tenant role can touch has row-level security; the rest grant it nothing', async () => {
    const r = await ctx.db.execute(sql`
      select c.relname as t, c.relrowsecurity as rls,
        (select count(*)::int from information_schema.table_privileges p where p.table_schema = 'public' and p.table_name = c.relname and p.grantee = 'app_user') as grants,
        (select count(*)::int from information_schema.column_privileges p where p.table_schema = 'public' and p.table_name = c.relname and p.grantee = 'app_user') as column_grants
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`)
    const rows = (r as unknown as { rows: { t: string; rls: boolean; grants: number; column_grants: number }[] }).rows
    expect(rows.length).toBeGreaterThan(30)
    const exposed = rows.filter(x => !x.rls && (x.grants > 0 || x.column_grants > 0)).map(x => x.t)
    // The user table is the one deliberate exception: app_user may read id, name, email and image (no secrets) so
    // member lists and owners render; credentials live in `account`, which grants nothing.
    expect(exposed.filter(t => t !== 'user')).toEqual([])
    if (exposed.includes('user')) {
      const cols = await ctx.db.execute(sql`select column_name from information_schema.column_privileges where table_schema = 'public' and table_name = 'user' and grantee = 'app_user' and privilege_type = 'SELECT' order by 1`)
      expect((cols as unknown as { rows: { column_name: string }[] }).rows.map(x => x.column_name)).toEqual(['email', 'id', 'image', 'name'])
    }
  })
})
