// Phase 7 failure simulation: the database going away, a background job that keeps failing, and the billing
// provider being unreachable. Each case checks what the user sees, that nothing is half-saved, and that it recovers.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { createTestContext, createWorkspace, signUp, type Client, type TestContext } from './helpers'
import { auditEvent, job, subscription } from '../server/db/schema'
import { createStripeProvider } from '../server/billing/stripe'

describe('database unavailable', () => {
  let ctx: TestContext, owner: Client, w: string
  beforeAll(async () => {
    ctx = await createTestContext()
    owner = await signUp(ctx, 'db@failure.test', 'Dara Down')
    w = await createWorkspace(owner, 'Outage Co')
  })

  test('readiness turns 503 and requests fail with a plain message, no internals', async () => {
    expect((await ctx.app.request('/api/ready')).status).toBe(200)
    await ctx.close()
    const ready = await ctx.app.request('/api/ready')
    expect(ready.status).toBe(503)
    expect(await ready.json()).toEqual({ ok: false, db: { ok: false } })
    const write = await owner.post(`/api/w/${w}/stakeholders`, { name: 'Written During Outage' })
    expect(write.status).toBeGreaterThanOrEqual(500)
    const text = JSON.stringify(write.body)
    expect(text).not.toMatch(/stack|at .*\.ts|PGlite|pg_|select |insert /i)
    if (write.status === 500) expect(write.body.error.message).toMatch(/not saved/)
  })
})

describe('background job failure', () => {
  let ctx: TestContext
  beforeAll(async () => { ctx = await createTestContext() })
  afterAll(async () => { await ctx.close() })

  test('a failing job is retried with backoff, then parked as dead and reported by readiness; others keep running', async () => {
    let calls = 0, ok = 0
    ctx.jobs.register('sim.flaky', async () => { calls++; throw new Error('downstream timeout') })
    ctx.jobs.register('sim.fine', async () => { ok++ })
    await ctx.jobs.enqueue('sim.flaky', {}, { maxAttempts: 2 })
    await ctx.jobs.enqueue('sim.fine', {})
    await ctx.jobs.drain()
    expect(calls).toBe(1)
    expect(ok).toBe(1)
    let [j] = await ctx.db.select().from(job).where(eq(job.kind, 'sim.flaky'))
    expect(j).toMatchObject({ status: 'queued', attempts: 1, lastError: 'downstream timeout' })
    expect(j.runAt.getTime()).toBeGreaterThan(Date.now()) // backed off, not hot-looping
    await ctx.jobs.drain()
    expect(calls).toBe(1)
    await ctx.db.update(job).set({ runAt: new Date(Date.now() - 1000) }).where(eq(job.id, j.id))
    await ctx.jobs.drain()
    ;[j] = await ctx.db.select().from(job).where(eq(job.kind, 'sim.flaky'))
    expect(j).toMatchObject({ status: 'dead', attempts: 2 })
    const ready = await (await ctx.app.request('/api/ready')).json() as { jobs: { dead: number } }
    expect(ready.jobs.dead).toBe(1)
  })
})

describe('billing provider unavailable (Stripe adapter against an unreachable fake)', () => {
  const secret = 'whsec_failure_test'
  const now = () => Math.floor(Date.now() / 1000)
  let down = true
  let ctx: TestContext, owner: Client, w: string
  const fake = async (url: string | URL, init?: RequestInit) => {
    if (down) throw new TypeError('fetch failed')
    const u = new URL(String(url)); const method = init?.method ?? 'GET'
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } })
    if (method === 'POST' && u.pathname === '/v1/checkout/sessions') return json({ id: 'cs_f', object: 'checkout.session', url: 'https://checkout.stripe.test/c/pay/cs_f' })
    if (u.pathname === '/v1/subscriptions/sub_f') return json({ id: 'sub_f', object: 'subscription', customer: 'cus_f', status: 'active', cancel_at_period_end: false, trial_end: null, ended_at: null, metadata: { workspaceId: w }, default_payment_method: null,
      items: { object: 'list', data: [{ id: 'si_f', object: 'subscription_item', quantity: 3, current_period_start: now(), current_period_end: now() + 2_592_000, price: { id: 'price_starter_m', object: 'price' } }] } })
    return new Response('{}', { status: 404 })
  }
  const deliver = async (type: string, object: Record<string, unknown>) => {
    const payload = JSON.stringify({ id: 'evt_failure_1', object: 'event', type, created: now(), data: { object } })
    return ctx.app.request('/api/billing/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload, secret }) }, body: payload })
  }
  const sub = async () => (await ctx.db.select().from(subscription).where(eq(subscription.workspaceId, w)))[0]

  beforeAll(async () => {
    const provider = createStripeProvider({ STRIPE_SECRET_KEY: 'sk_test_failure', STRIPE_WEBHOOK_SECRET: secret, BILLING_PRICE_STARTER_MONTHLY: 'price_starter_m', BILLING_PRICE_STARTER_ANNUAL: 'price_starter_y', BILLING_PRICE_PROFESSIONAL_MONTHLY: 'price_pro_m', BILLING_PRICE_PROFESSIONAL_ANNUAL: 'price_pro_y' },
      { httpClient: Stripe.createFetchHttpClient(fake as typeof fetch) })
    ctx = await createTestContext({ billing: provider })
    owner = await signUp(ctx, 'billing@failure.test', 'Bo Billing')
    w = await createWorkspace(owner, 'Provider Down Co')
  })
  afterAll(async () => { await ctx.close() })

  test('checkout says billing is unavailable, changes nothing and records no checkout', async () => {
    const r = await owner.post(`/api/w/${w}/billing/checkout`, { plan: 'starter', interval: 'month', seats: 3 })
    expect(r.status).toBe(503)
    expect(r.body.error).toMatchObject({ code: 'billing_unavailable' })
    expect(r.body.error.message).toMatch(/try again/i)
    expect((await sub()).status).toBe('trialing')
    const audits = await ctx.db.select().from(auditEvent).where(eq(auditEvent.workspaceId, w))
    expect(audits.some(a => a.action === 'billing.checkout_started')).toBe(false)
  })

  test('a webhook received while the provider is down is kept and synced once it is back', async () => {
    const r = await deliver('checkout.session.completed', { id: 'cs_f', object: 'checkout.session', subscription: 'sub_f', customer: 'cus_f', client_reference_id: w, metadata: { workspaceId: w } })
    expect(r.status).toBe(200)
    await ctx.jobs.drain()
    expect((await sub()).status).toBe('trialing') // sync failed, nothing half-applied
    const pending = (await ctx.db.select().from(job)).filter(j => j.status === 'queued' && j.lastError)
    expect(pending.length).toBe(1)
    down = false
    await ctx.db.update(job).set({ runAt: new Date(Date.now() - 1000) }).where(eq(job.id, pending[0].id))
    await ctx.jobs.drain()
    expect(await sub()).toMatchObject({ status: 'active', plan: 'starter', providerSubscriptionId: 'sub_f' })
  })
})
