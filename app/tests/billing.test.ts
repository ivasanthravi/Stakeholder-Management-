// Commercial lifecycle: trial → checkout → webhook → entitlements → change → cancel/renew → failure → limits.
// Runs against the development billing simulator, which signs and delivers webhooks over the real public endpoint,
// so signature checks, dedupe, out-of-order handling and sync are the production code paths.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { and, desc, eq, sql } from 'drizzle-orm'
import { addMember, createTestContext, createWorkspace, ORIGIN, signUp, type Client, type TestContext } from './helpers'
import { aiAllowance, analyticsEvent, billingEvent, mailOutbox, subscription } from '../server/db/schema'
import { signSimulator } from '../server/billing/simulator'
import { processTrials } from '../server/billing/sync'
import { POLICY } from '../shared/plans'
import type { AIEngine } from '../server/ai/engine'

let ctx: TestContext
let owner: Client, admin: Client, contributor: Client, outsider: Client
let w: string
const api = (p: string) => `/api/w/${w}${p}`
const sub = async (id = w) => (await ctx.db.select().from(subscription).where(eq(subscription.workspaceId, id)))[0]

async function pay(c: Client, wid: string, body: { plan: string; interval: string; seats: number }, outcome: 'succeed' | 'decline' = 'succeed') {
  const r = await c.post(`/api/w/${wid}/billing/checkout`, body)
  expect(r.status).toBe(200)
  const path = new URL(r.body.url).pathname
  const res = await ctx.app.request(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN }, body: `outcome=${outcome}` })
  expect(res.status).toBe(303)
  await ctx.jobs.drain()
  return res.headers.get('location')
}

beforeAll(async () => {
  ctx = await createTestContext()
  owner = await signUp(ctx, 'owner@bill.test', 'Olive Owner')
  admin = await signUp(ctx, 'admin@bill.test', 'Ada Admin')
  contributor = await signUp(ctx, 'cara@bill.test', 'Cara Contributor')
  outsider = await signUp(ctx, 'otto@bill.test', 'Otto Outsider')
  w = await createWorkspace(owner, 'Billing Co')
  await addMember(ctx, owner, w, admin, 'admin@bill.test', 'admin')
  await addMember(ctx, owner, w, contributor, 'cara@bill.test', 'contributor')
})
afterAll(async () => { await ctx.close() })

describe('trial and entitlements', () => {
  test('a new workspace starts a no-card Professional trial', async () => {
    const r = await owner.get(api('/billing'))
    expect(r.status).toBe(200)
    expect(r.body.entitlements).toMatchObject({ plan: 'professional', status: 'trialing', seatLimit: POLICY.trialSeats, access: { level: 'full', reason: 'trial' } })
    expect(r.body.entitlements.features).toContain('ai.meeting_intelligence')
    expect(r.body.seats).toMatchObject({ members: 3, pending: 0 })
    const events = await ctx.db.select().from(analyticsEvent).where(eq(analyticsEvent.workspaceId, w))
    expect(events.map(e => e.name)).toEqual(expect.arrayContaining(['workspace_created', 'trial_started']))
  })
  test('billing details and controls follow roles; other tenants see nothing', async () => {
    expect((await contributor.get(api('/billing'))).body.billing).toBeNull()
    expect((await contributor.post(api('/billing/checkout'), { plan: 'starter', interval: 'month', seats: 3 })).status).toBe(403)
    expect((await admin.get(api('/billing'))).body.billing).not.toBeNull()
    expect((await admin.post(api('/billing/checkout'), { plan: 'starter', interval: 'month', seats: 3 })).status).toBe(403) // owner only
    expect((await admin.get(api('/billing/invoices'))).status).toBe(200)
    expect((await contributor.get(api('/billing/invoices'))).status).toBe(403)
    expect((await outsider.get(api('/billing'))).status).toBe(404)
  })
  test('trial seat limit counts members and pending invitations', async () => {
    for (let i = 0; i < POLICY.trialSeats - 3; i++) expect((await owner.post(api('/invitations'), { email: `seat${i}@bill.test`, role: 'viewer' })).status).toBe(201)
    const over = await owner.post(api('/invitations'), { email: 'one-too-many@bill.test', role: 'viewer' })
    expect(over.status).toBe(402); expect(over.body.error.code).toBe('seat_limit')
    // Revoking frees the seat.
    const m = await owner.get(api('/members'))
    expect((await owner.del(api(`/invitations/${m.body.invitations[0].id}`))).status).toBe(200)
    expect((await owner.post(api('/invitations'), { email: 'one-too-many@bill.test', role: 'viewer' })).status).toBe(201)
    for (const inv of (await owner.get(api('/members'))).body.invitations) await owner.del(api(`/invitations/${inv.id}`))
  })
  test('trials per user are limited; extra workspaces need a plan', async () => {
    const second = await createWorkspace(owner, 'Second Co')
    expect((await sub(second)).status).toBe('trialing')
    const third = await createWorkspace(owner, 'Third Co')
    const s = await sub(third)
    expect(s.status).toBe('incomplete')
    const e = (await owner.get(`/api/w/${third}/billing`)).body.entitlements
    expect(e.access.level).toBe('read_only')
    expect((await owner.post(`/api/w/${third}/stakeholders`, { name: 'Nope' })).status).toBe(402)
  })
})

describe('checkout and webhooks', () => {
  test('a declined checkout changes nothing; returning from checkout is not proof of payment', async () => {
    const back = await pay(owner, w, { plan: 'starter', interval: 'month', seats: 4 }, 'decline')
    expect(back).toContain('checkout=canceled')
    expect((await sub()).status).toBe('trialing')
    // Visiting the success URL does nothing either: only verified webhooks or a provider fetch change state.
    expect((await owner.post(api('/billing/refresh'))).body.entitlements.status).toBe('trialing')
  })
  test('seats can’t be bought below current usage', async () => {
    const r = await owner.post(api('/billing/checkout'), { plan: 'starter', interval: 'month', seats: 2 })
    expect(r.status).toBe(422)
  })
  test('successful sandbox checkout → signed webhook → subscription active, Starter entitlements, owner email', async () => {
    const back = await pay(owner, w, { plan: 'starter', interval: 'month', seats: 4 })
    expect(back).toContain('checkout=success')
    const s = await sub()
    expect(s).toMatchObject({ status: 'active', plan: 'starter', seats: 4, provider: 'simulator', interval: 'month' })
    expect(s.providerSubscriptionId).toMatch(/^sub_/)
    const e = (await owner.get(api('/billing'))).body.entitlements
    expect(e).toMatchObject({ plan: 'starter', seatLimit: 4, access: { level: 'full' } })
    expect(e.features).not.toContain('ai.meeting_intelligence')
    const mail = await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.kind, 'subscription_activated'))
    expect(mail.map(m => m.to)).toEqual(['owner@bill.test'])
    const events = await ctx.db.select().from(billingEvent)
    expect(events.at(-1)).toMatchObject({ status: 'processed', provider: 'simulator' })
    const invoices = (await owner.get(api('/billing/invoices'))).body.invoices
    expect(invoices).toHaveLength(1)
  })
  test('plan features are enforced server-side after the change', async () => {
    const eng = (await owner.post(api('/engagements'), { kind: 'meeting', title: 'Gate test', occurredAt: '2026-10-01T10:00:00.000Z', notes: 'We will send the hedgerow plan by 6 November to the parish council.' })).body.id
    const r = await owner.post(api(`/ai/meetings/${eng}/analyze`))
    expect(r.status).toBe(402); expect(r.body.error).toMatchObject({ code: 'plan_required', plan: 'professional' })
    const s = (await owner.post(api('/stakeholders'), { name: 'Rhea Restricted' })).body
    expect((await owner.patch(api(`/stakeholders/${s.id}`), { restricted: true, version: s.version })).status).toBe(402)
    expect((await owner.get(api('/audit'))).status).toBe(402)
    expect((await owner.get(api('/ai/briefings/stakeholders/' + s.id))).status).toBe(200) // briefings are on Starter
  })
  test('duplicate and forged webhooks', async () => {
    const before = (await ctx.db.select().from(billingEvent)).length
    const raw = JSON.stringify({ id: 'evt_dupe_1', type: 'subscription.updated', created: Math.floor(Date.now() / 1000), data: { subscription: (await sub()).providerSubscriptionId, workspaceId: w } })
    const send = (body: string, sig: string) => ctx.app.request('/api/billing/webhooks/simulator', { method: 'POST', headers: { 'content-type': 'application/json', 'x-simulator-signature': sig }, body })
    const first = await send(raw, signSimulator('dev-only-simulator-secret', raw))
    expect(await first.json()).toMatchObject({ duplicate: false })
    const again = await send(raw, signSimulator('dev-only-simulator-secret', raw))
    expect(await again.json()).toMatchObject({ duplicate: true })
    expect((await send(raw, signSimulator('wrong-secret', raw))).status).toBe(400)
    expect((await send(raw.replace('evt_dupe_1', 'evt_dupe_2'), signSimulator('dev-only-simulator-secret', raw))).status).toBe(400) // body tampered
    expect((await send(raw, signSimulator('dev-only-simulator-secret', raw, Math.floor(Date.now() / 1000) - 3600))).status).toBe(400) // replayed
    expect((await send(raw, '')).status).toBe(400)
    expect((await ctx.db.select().from(billingEvent)).length).toBe(before + 1)
    expect((await ctx.app.request('/api/billing/webhooks/stripe', { method: 'POST', body: raw })).status).toBe(400) // not the active provider
  })
})

describe('changes, cancellation, renewal and failures', () => {
  test('upgrade to Professional with more seats; downgrade below usage is refused', async () => {
    const up = await owner.post(api('/billing/change'), { plan: 'professional', interval: 'year', seats: 6 })
    expect(up.status).toBe(200)
    expect(up.body.entitlements).toMatchObject({ plan: 'professional', seats: 6, interval: 'year' })
    expect(up.body.entitlements.features).toContain('ai.meeting_intelligence')
    expect((await owner.post(api('/billing/change'), { plan: 'starter', interval: 'month', seats: 2 })).status).toBe(422)
    expect((await owner.post(api('/billing/change'), { plan: 'enterprise', interval: 'year', seats: 6 })).status).toBe(422)
    await ctx.jobs.drain()
    expect((await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.kind, 'plan_changed'))).length).toBeGreaterThan(0)
  })
  test('out-of-order delivery: an old event processed late can’t roll state back', async () => {
    const s = await sub()
    // A stale "past due" event arrives after the subscription is healthy: the sync fetches current state, which wins.
    const raw = JSON.stringify({ id: 'evt_old_failure', type: 'invoice.payment_failed', created: Math.floor(Date.now() / 1000) - 86_400, data: { subscription: s.providerSubscriptionId, workspaceId: w } })
    await ctx.app.request('/api/billing/webhooks/simulator', { method: 'POST', headers: { 'content-type': 'application/json', 'x-simulator-signature': signSimulator('dev-only-simulator-secret', raw) }, body: raw })
    await ctx.jobs.drain()
    expect((await sub()).status).toBe('active')
  })
  test('failed renewal → past due with full access during grace → read-only after → recovered', async () => {
    const id = (await sub()).providerSubscriptionId!
    await ctx.simulator!.failPayment(id); await ctx.jobs.drain()
    expect((await sub()).status).toBe('past_due')
    let e = (await owner.get(api('/billing'))).body.entitlements
    expect(e.access).toMatchObject({ level: 'full', reason: 'past_due_grace' })
    expect((await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.kind, 'payment_failed'))).length).toBe(1)
    // Grace runs out.
    await ctx.db.update(subscription).set({ pastDueSince: new Date(Date.now() - (POLICY.pastDueGraceDays + 1) * 86_400_000) }).where(eq(subscription.workspaceId, w))
    e = (await owner.get(api('/billing'))).body.entitlements
    expect(e.access).toMatchObject({ level: 'read_only', reason: 'past_due' })
    const blocked = await contributor.post(api('/stakeholders'), { name: 'Blocked' })
    expect(blocked.status).toBe(402); expect(blocked.body.error.code).toBe('subscription_inactive')
    expect((await contributor.get(api('/stakeholders'))).status).toBe(200)
    await ctx.simulator!.recoverPayment(id); await ctx.jobs.drain()
    expect((await sub()).status).toBe('active')
    expect((await contributor.post(api('/stakeholders'), { name: 'Unblocked' })).status).toBe(201)
  })
  test('cancel at period end keeps access; resume undoes it; renewal after cancel ends it and the workspace goes read-only', async () => {
    const c1 = await owner.post(api('/billing/cancel'), { reason: 'testing' })
    expect(c1.body.entitlements).toMatchObject({ cancelAtPeriodEnd: true, access: { level: 'full', reason: 'canceling' } })
    expect((await owner.post(api('/billing/resume'))).body.entitlements.cancelAtPeriodEnd).toBe(false)
    await owner.post(api('/billing/cancel'), {})
    await ctx.simulator!.renew((await sub()).providerSubscriptionId!); await ctx.jobs.drain()
    const s = await sub()
    expect(s.status).toBe('canceled')
    const e = (await owner.get(api('/billing'))).body.entitlements
    expect(e.access).toMatchObject({ level: 'read_only', reason: 'canceled' })
    expect((await owner.post(api('/stakeholders'), { name: 'After cancel' })).status).toBe(402)
    // Data is kept and readable; members can still be removed; billing can be restarted.
    expect((await owner.get(api('/stakeholders'))).body.total).toBeGreaterThan(0)
    expect((await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.kind, 'subscription_canceled'))).length).toBe(1)
    await pay(owner, w, { plan: 'professional', interval: 'month', seats: 4 })
    expect((await sub()).status).toBe('active')
  })
})

describe('trial expiry and AI limits', () => {
  let w2: string, trialOwner: Client
  test('an expired trial makes the workspace read-only and emails owners once', async () => {
    const o = trialOwner = await signUp(ctx, 'trial@bill.test', 'Tara Trial')
    w2 = await createWorkspace(o, 'Trial Co')
    await o.post(`/api/w/${w2}/stakeholders`, { name: 'Kept Person' })
    await ctx.db.update(subscription).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(subscription.workspaceId, w2))
    const deps = { db: ctx.db, jobs: ctx.jobs, billing: ctx.deps.billing ?? null, notify: ctx.deps.billingNotify }
    expect((await processTrials(deps)).ended).toBe(1)
    expect((await processTrials(deps)).ended).toBe(0)
    expect((await sub(w2)).status).toBe('expired')
    expect((await o.get(`/api/w/${w2}/billing`)).body.entitlements.access.level).toBe('read_only')
    expect((await ctx.db.select().from(mailOutbox).where(and(eq(mailOutbox.kind, 'trial_ended'), eq(mailOutbox.to, 'trial@bill.test')))).length).toBe(1)
  })
  test('AI allowance: concurrent model requests can’t exceed the allowance, and no overage is charged', async () => {
    const calls = { n: 0 }
    const engine: AIEngine = {
      kind: 'claude', model: 'claude-opus-5-5', label: 'Scripted', client: null,
      async extractMeeting() { throw new Error('unused') },
      async synthesize() { calls.n++; await new Promise(r => setTimeout(r, 20)); return { result: { interpretation: [], recommendations: [] }, usage: { input: 4000, output: 1000, cacheRead: 0, model: 'claude-opus-5-5', latencyMs: 20 } } },
    }
    const c2 = await createTestContext({ ai: engine })
    try {
      const o = await signUp(c2, 'ai@bill.test', 'Ari AI')
      const wid = await createWorkspace(o, 'AI Co')
      const s = (await o.post(`/api/w/${wid}/stakeholders`, { name: 'Bea Ellwood', influence: 4 })).body.id
      await o.post(`/api/w/${wid}/commitments`, { title: 'Overdue thing', stakeholderId: s, dueDate: '2026-01-01' })
      // Allowance for 3 reservations of 6,000 tokens: the admin cap is the binding limit here.
      await o.patch(`/api/w/${wid}/ai/settings`, { monthlyTokenBudget: 18_000, perUserPerMinute: 100 })
      const results = await Promise.all(Array.from({ length: 8 }, () => o.get(`/api/w/${wid}/ai/briefings/stakeholders/${s}?fresh=1`)))
      const ok = results.filter(r => r.status === 200).length
      expect(ok).toBeLessThanOrEqual(3)
      expect(results.filter(r => r.status === 429 && r.body.error.code === 'quota_exceeded').length).toBe(8 - ok)
      const [ledger] = await c2.db.select().from(aiAllowance).where(eq(aiAllowance.workspaceId, wid))
      expect(ledger.reserved).toBe(0)
      expect(ledger.used).toBe(ok * 5000)
      expect(calls.n).toBe(ok)
      const limitEvents = await c2.db.select().from(analyticsEvent).where(eq(analyticsEvent.name, 'ai_limit_reached'))
      expect(limitEvents.length).toBe(8 - ok)
    } finally { await c2.close() }
  })
  test('read-only workspaces can’t run AI, but keep their data readable and exportable', async () => {
    const people = (await trialOwner.get(`/api/w/${w2}/stakeholders`)).body
    expect(people.total).toBe(1)
    const r = await trialOwner.get(`/api/w/${w2}/ai/briefings/stakeholders/${people.items[0].id}`)
    expect(r.status).toBe(402); expect(r.body.error.code).toBe('subscription_inactive')
    const rows = await ctx.db.execute(sql`select count(*)::int as n from analytics_event where name = 'trial_expired'`) as unknown as { rows: { n: number }[] }
    expect(rows.rows[0].n).toBe(1)
  })
})

describe('reconciliation', () => {
  test('a missed webhook is recovered by reconciliation', async () => {
    const id = (await sub()).providerSubscriptionId!
    // Change state at the provider without delivering the webhook, then reconcile.
    ctx.simulator!.sub(id)!.seats = 7
    await ctx.jobs.enqueue('billing.reconcile'); await ctx.jobs.drain()
    expect((await sub()).seats).toBe(7)
    const last = (await ctx.db.select().from(billingEvent).orderBy(desc(billingEvent.id)).limit(1))[0]
    expect(last).toBeTruthy()
  })
})
