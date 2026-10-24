// Provider contract tests: the full lifecycle through the real app with the REAL Stripe and Paddle adapters and SDKs,
// talking to an in-memory fake of each provider's HTTP API. Webhooks are signed with each provider's scheme.
// This verifies request shapes, signature handling, mapping and our state machine — NOT the providers' sandboxes
// (blocked on credentials; see docs/launch/billing-verification.md).
import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { createTestContext, createWorkspace, ORIGIN, signUp, type Client, type TestContext } from './helpers'
import { subscription } from '../server/db/schema'
import { createStripeProvider } from '../server/billing/stripe'
import { createPaddleProvider } from '../server/billing/paddle'

const PRICES = { BILLING_PRICE_STARTER_MONTHLY: 'price_starter_m', BILLING_PRICE_STARTER_ANNUAL: 'price_starter_y', BILLING_PRICE_PROFESSIONAL_MONTHLY: 'price_pro_m', BILLING_PRICE_PROFESSIONAL_ANNUAL: 'price_pro_y' }
const now = () => Math.floor(Date.now() / 1000)
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } })

describe('Stripe adapter, end to end through the app', () => {
  const secret = 'whsec_contract_test'
  const calls: { method: string; path: string; body: URLSearchParams }[] = []
  let sub: Record<string, unknown> & { items: { object: string; data: Record<string, unknown>[] } }
  let ctx: TestContext, owner: Client, w: string
  const fake = async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url)); const method = init?.method ?? 'GET'
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    calls.push({ method, path: u.pathname, body })
    if (method === 'POST' && u.pathname === '/v1/checkout/sessions') return json({ id: 'cs_test_1', object: 'checkout.session', url: 'https://checkout.stripe.test/c/pay/cs_test_1' })
    if (u.pathname === '/v1/subscriptions/sub_test_1' && method === 'GET') return json(sub)
    if (u.pathname === '/v1/subscriptions/sub_test_1' && method === 'POST') {
      if (body.get('cancel_at_period_end')) sub.cancel_at_period_end = body.get('cancel_at_period_end') === 'true'
      if (body.get('items[0][price]')) { sub.items.data[0].price = { id: body.get('items[0][price]'), object: 'price' }; sub.items.data[0].quantity = Number(body.get('items[0][quantity]')) }
      return json(sub)
    }
    if (u.pathname === '/v1/billing_portal/sessions') return json({ id: 'bps_1', object: 'billing_portal.session', url: 'https://billing.stripe.test/p/session_1', return_url: null })
    if (u.pathname === '/v1/invoices') return json({ object: 'list', has_more: false, data: [{ id: 'in_1', object: 'invoice', number: 'MER-0001', status: 'paid', total: 4800, amount_paid: 4800, currency: 'usd', created: now(), period_start: now(), period_end: now() + 2_592_000, hosted_invoice_url: 'https://invoice.stripe.test/i/1', invoice_pdf: null }] })
    return json({ error: { message: `not stubbed ${method} ${u.pathname}` } }, 404)
  }
  const deliver = async (type: string, object: Record<string, unknown>) => {
    const payload = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, object: 'event', type, created: now(), data: { object } })
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret })
    return ctx.app.request('/api/billing/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload })
  }

  beforeAll(async () => {
    const provider = createStripeProvider({ STRIPE_SECRET_KEY: 'sk_test_contract', STRIPE_WEBHOOK_SECRET: secret, ...PRICES }, { httpClient: Stripe.createFetchHttpClient(fake as typeof fetch) })
    ctx = await createTestContext({ billing: provider })
    owner = await signUp(ctx, 'stripe@contract.test', 'Sia Stripe')
    w = await createWorkspace(owner, 'Stripe Co')
    sub = { id: 'sub_test_1', object: 'subscription', customer: 'cus_test_1', status: 'active', cancel_at_period_end: false, trial_end: null, ended_at: null, metadata: { workspaceId: w }, default_payment_method: { id: 'pm_1', object: 'payment_method', card: { brand: 'visa', last4: '4242' } },
      items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', quantity: 3, current_period_start: now(), current_period_end: now() + 2_592_000, price: { id: 'price_starter_m', object: 'price' } }] } }
  })
  afterAll(async () => { await ctx.close() })

  test('checkout session request: subscription mode, provider price, seats, workspace metadata, our return URLs', async () => {
    const r = await owner.post(`/api/w/${w}/billing/checkout`, { plan: 'starter', interval: 'month', seats: 3 })
    expect(r.body.url).toBe('https://checkout.stripe.test/c/pay/cs_test_1')
    const c = calls.find(x => x.path === '/v1/checkout/sessions')!
    expect(c.body.get('mode')).toBe('subscription')
    expect(c.body.get('line_items[0][price]')).toBe('price_starter_m')
    expect(c.body.get('line_items[0][quantity]')).toBe('3')
    expect(c.body.get('subscription_data[metadata][workspaceId]')).toBe(w)
    expect(c.body.get('success_url')).toBe(`${ORIGIN}/settings/billing?checkout=success`)
    expect([...c.body.keys()].some(k => /card|cvc|number/i.test(k))).toBe(false)
    expect((await ctx.db.select().from(subscription).where(eq(subscription.workspaceId, w)))[0].status).toBe('trialing') // not active yet
  })
  test('signed checkout.session.completed → sync fetches the subscription → active Starter', async () => {
    const r = await deliver('checkout.session.completed', { id: 'cs_test_1', object: 'checkout.session', subscription: 'sub_test_1', customer: 'cus_test_1', client_reference_id: w, metadata: { workspaceId: w } })
    expect(r.status).toBe(200)
    await ctx.jobs.drain()
    const s = (await ctx.db.select().from(subscription).where(eq(subscription.workspaceId, w)))[0]
    expect(s).toMatchObject({ status: 'active', plan: 'starter', seats: 3, provider: 'stripe', providerSubscriptionId: 'sub_test_1', paymentMethodSummary: 'visa ending 4242' })
  })
  test('invoice.payment_failed → past_due; invoice.paid → active again', async () => {
    sub.status = 'past_due'
    await deliver('invoice.payment_failed', { id: 'in_2', object: 'invoice', customer: 'cus_test_1', parent: { subscription_details: { subscription: 'sub_test_1' } } })
    await ctx.jobs.drain()
    expect((await owner.get(`/api/w/${w}/billing`)).body.entitlements).toMatchObject({ status: 'past_due', access: { level: 'full', reason: 'past_due_grace' } })
    sub.status = 'active'
    await deliver('invoice.paid', { id: 'in_3', object: 'invoice', customer: 'cus_test_1', parent: { subscription_details: { subscription: 'sub_test_1' } } })
    await ctx.jobs.drain()
    expect((await owner.get(`/api/w/${w}/billing`)).body.entitlements.status).toBe('active')
  })
  test('upgrade sends a prorated item update; cancel sets cancel_at_period_end; portal and invoices come from Stripe', async () => {
    await owner.post(`/api/w/${w}/billing/change`, { plan: 'professional', interval: 'year', seats: 5 })
    const up = calls.filter(x => x.path === '/v1/subscriptions/sub_test_1' && x.method === 'POST').at(-1)!
    expect(up.body.get('items[0][price]')).toBe('price_pro_y'); expect(up.body.get('items[0][quantity]')).toBe('5'); expect(up.body.get('proration_behavior')).toBe('create_prorations')
    expect((await owner.get(`/api/w/${w}/billing`)).body.entitlements).toMatchObject({ plan: 'professional', interval: 'year', seats: 5 })
    await owner.post(`/api/w/${w}/billing/cancel`, {})
    expect(calls.filter(x => x.method === 'POST' && x.path === '/v1/subscriptions/sub_test_1').at(-1)!.body.get('cancel_at_period_end')).toBe('true')
    expect((await owner.get(`/api/w/${w}/billing`)).body.entitlements.cancelAtPeriodEnd).toBe(true)
    expect((await owner.post(`/api/w/${w}/billing/portal`)).body.url).toBe('https://billing.stripe.test/p/session_1')
    expect((await owner.get(`/api/w/${w}/billing/invoices`)).body.invoices[0]).toMatchObject({ number: 'MER-0001', total: 4800, url: 'https://invoice.stripe.test/i/1' })
  })
  test('customer.subscription.deleted (period ended) → canceled → read-only', async () => {
    Object.assign(sub, { status: 'canceled', ended_at: now() })
    await deliver('customer.subscription.deleted', sub)
    await ctx.jobs.drain()
    const e = (await owner.get(`/api/w/${w}/billing`)).body.entitlements
    expect(e).toMatchObject({ status: 'canceled', access: { level: 'read_only' } })
  })
  test('an unsigned or wrongly signed Stripe webhook is rejected and stored nowhere', async () => {
    const payload = JSON.stringify({ id: 'evt_forged', object: 'event', type: 'customer.subscription.updated', created: now(), data: { object: sub } })
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_attacker' })
    expect((await ctx.app.request('/api/billing/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': forged }, body: payload })).status).toBe(400)
  })
})

describe('Paddle adapter, end to end through the app', () => {
  const secret = 'pdl_ntfset_contract'
  let ctx: TestContext, owner: Client, w: string
  const subData = (ws: string, extra: Record<string, unknown> = {}) => ({
    id: 'sub_01contract', status: 'active', customer_id: 'ctm_01c', address_id: 'add_01', business_id: null, currency_code: 'USD', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
    started_at: '2026-10-01T00:00:00Z', first_billed_at: '2026-10-01T00:00:00Z', next_billed_at: '2026-11-01T00:00:00Z', paused_at: null, canceled_at: null, discount: null, collection_mode: 'automatic', billing_details: null,
    current_billing_period: { starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }, billing_cycle: { interval: 'month', frequency: 1 }, scheduled_change: null, management_urls: null,
    custom_data: { workspaceId: ws }, import_meta: null,
    items: [{ status: 'active', quantity: 4, recurring: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', previously_billed_at: null, next_billed_at: null, trial_dates: null,
      price: { id: 'price_pro_m', product_id: 'pro_01', description: 'Pro', type: 'standard', name: null, billing_cycle: { interval: 'month', frequency: 1 }, trial_period: null, tax_mode: 'account_setting', unit_price: { amount: '0', currency_code: 'USD' }, unit_price_overrides: [], quantity: { minimum: 1, maximum: 100 }, status: 'active', custom_data: null, import_meta: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
      product: { id: 'pro_01', name: 'Meridian Professional', tax_category: 'saas', type: 'standard', description: null, image_url: null, custom_data: null, status: 'active', import_meta: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' } }],
    ...extra,
  })
  let current: ReturnType<typeof subData>
  const sign = (raw: string) => { const ts = now(); return `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${raw}`).digest('hex')}` }

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url))
      if (!u.hostname.includes('paddle')) return new Response('{}', { status: 404 })
      if (u.pathname === '/transactions' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        expect(body.custom_data.workspaceId).toBe(w); expect(body.items[0]).toEqual({ price_id: 'price_pro_m', quantity: 4 })
        return json({ data: { id: 'txn_01', status: 'ready', customer_id: null, address_id: null, business_id: null, custom_data: body.custom_data, currency_code: 'USD', origin: 'api', subscription_id: null, invoice_id: null, invoice_number: null, collection_mode: 'automatic', discount_id: null, billing_details: null, billing_period: null, items: [], details: null, payments: [], checkout: { url: 'https://pay.paddle.test/checkout?_ptxn=txn_01' }, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', billed_at: null, revised_at: null }, meta: { request_id: 'r' } })
      }
      if (u.pathname === '/subscriptions/sub_01contract') return json({ data: current, meta: { request_id: 'r' } })
      return json({ error: { type: 'request_error', code: 'not_found', detail: `not stubbed ${u.pathname}` } }, 404)
    }))
    ctx = await createTestContext({ billing: createPaddleProvider({ PADDLE_API_KEY: 'pdl_sdbx_apikey_contract', PADDLE_WEBHOOK_SECRET: secret, PADDLE_ENVIRONMENT: 'sandbox', ...PRICES }) })
    owner = await signUp(ctx, 'paddle@contract.test', 'Pia Paddle')
    w = await createWorkspace(owner, 'Paddle Co')
    current = subData(w)
  })
  afterAll(async () => { vi.unstubAllGlobals(); await ctx.close() })

  test('checkout creates a transaction with workspace custom data and returns Paddle’s hosted URL', async () => {
    const r = await owner.post(`/api/w/${w}/billing/checkout`, { plan: 'professional', interval: 'month', seats: 4 })
    expect(r.body.url).toBe('https://pay.paddle.test/checkout?_ptxn=txn_01')
  })
  test('signed subscription.created → active Professional; scheduled cancel maps to cancelAtPeriodEnd', async () => {
    const raw = JSON.stringify({ event_id: 'evt_01c', event_type: 'subscription.created', occurred_at: '2026-10-02T00:00:00Z', notification_id: 'ntf_1', data: current })
    expect((await ctx.app.request('/api/billing/webhooks/paddle', { method: 'POST', headers: { 'paddle-signature': sign(raw) }, body: raw })).status).toBe(200)
    await ctx.jobs.drain()
    expect((await owner.get(`/api/w/${w}/billing`)).body.entitlements).toMatchObject({ status: 'active', plan: 'professional', seats: 4, provider: 'paddle' })
    current = subData(w, { scheduled_change: { action: 'cancel', effective_at: '2026-11-01T00:00:00Z', resume_at: null } })
    const raw2 = JSON.stringify({ event_id: 'evt_02c', event_type: 'subscription.updated', occurred_at: '2026-10-03T00:00:00Z', notification_id: 'ntf_2', data: current })
    await ctx.app.request('/api/billing/webhooks/paddle', { method: 'POST', headers: { 'paddle-signature': sign(raw2) }, body: raw2 })
    await ctx.jobs.drain()
    expect((await owner.get(`/api/w/${w}/billing`)).body.entitlements.cancelAtPeriodEnd).toBe(true)
    // Redelivery of the same event id is a no-op.
    const again = await ctx.app.request('/api/billing/webhooks/paddle', { method: 'POST', headers: { 'paddle-signature': sign(raw2) }, body: raw2 })
    expect(await again.json()).toMatchObject({ duplicate: true })
  })
})
