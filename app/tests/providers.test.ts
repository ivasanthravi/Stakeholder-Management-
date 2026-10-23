// Provider adapters, offline: webhook signature verification and response mapping against the official SDKs, using
// the SDKs' own signing helpers and fixture API responses. This verifies our integration code, not the providers'
// sandboxes (which need keys — see docs/commercial/test-results.md).
import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, test, vi } from 'vitest'
import Stripe from 'stripe'
import { createStripeProvider } from '../server/billing/stripe'
import { createPaddleProvider } from '../server/billing/paddle'
import { BillingConfigError } from '../server/billing/provider'

const PRICES = {
  BILLING_PRICE_STARTER_MONTHLY: 'price_starter_m', BILLING_PRICE_STARTER_ANNUAL: 'price_starter_y',
  BILLING_PRICE_PROFESSIONAL_MONTHLY: 'price_pro_m', BILLING_PRICE_PROFESSIONAL_ANNUAL: 'price_pro_y',
}

describe('Stripe adapter', () => {
  const env = { STRIPE_SECRET_KEY: 'sk_test_offline', STRIPE_WEBHOOK_SECRET: 'whsec_offline_secret', ...PRICES }
  const subFixture = {
    id: 'sub_123', object: 'subscription', customer: 'cus_123', status: 'past_due', cancel_at_period_end: true, trial_end: null, ended_at: null,
    metadata: { workspaceId: '11111111-1111-4111-8111-111111111111' }, default_payment_method: { id: 'pm_1', object: 'payment_method', card: { brand: 'visa', last4: '4242' } },
    items: { object: 'list', data: [{ id: 'si_1', object: 'subscription_item', quantity: 7, current_period_start: 1_790_000_000, current_period_end: 1_792_592_000, price: { id: 'price_pro_y', object: 'price' } }] },
  }
  const fakeFetch = vi.fn(async (url: string | URL) => {
    if (String(url).includes('/v1/subscriptions/sub_123')) return new Response(JSON.stringify(subFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ error: { message: 'not stubbed' } }), { status: 404 })
  })
  const provider = createStripeProvider(env, { httpClient: Stripe.createFetchHttpClient(fakeFetch as unknown as typeof fetch) })

  test('refuses live keys without explicit approval', () => {
    expect(() => createStripeProvider({ ...env, STRIPE_SECRET_KEY: 'sk_live_x' })).toThrow(BillingConfigError)
    expect(createStripeProvider({ ...env, STRIPE_SECRET_KEY: 'sk_live_x', BILLING_LIVE_APPROVED: 'true' }).testMode).toBe(false)
    expect(provider.testMode).toBe(true)
  })
  test('verifies webhook signatures with the SDK and extracts the subscription', async () => {
    const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.payment_failed', created: Math.floor(Date.now() / 1000), data: { object: { id: 'in_1', object: 'invoice', customer: 'cus_123', parent: { subscription_details: { subscription: 'sub_123' } } } } })
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET })
    const e = await provider.verifyWebhook(payload, new Headers({ 'stripe-signature': header }))
    expect(e).toMatchObject({ id: 'evt_1', subscriptionId: 'sub_123', customerId: 'cus_123', paymentFailed: true })
    await expect(provider.verifyWebhook(payload.replace('evt_1', 'evt_2'), new Headers({ 'stripe-signature': header }))).rejects.toThrow()
    const wrong = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' })
    await expect(provider.verifyWebhook(payload, new Headers({ 'stripe-signature': wrong }))).rejects.toThrow()
    await expect(provider.verifyWebhook(payload, new Headers())).rejects.toThrow(/Missing/)
  })
  test('maps a subscription (period from the item, price → plan, card summary)', async () => {
    const s = await provider.fetchSubscription('sub_123')
    expect(s).toMatchObject({ plan: 'professional', interval: 'year', seats: 7, status: 'past_due', cancelAtPeriodEnd: true, workspaceId: '11111111-1111-4111-8111-111111111111', paymentMethodSummary: 'visa ending 4242' })
    expect(s.currentPeriodEnd?.toISOString()).toBe(new Date(1_792_592_000 * 1000).toISOString())
  })
})

describe('Paddle adapter', () => {
  const env = { PADDLE_API_KEY: 'pdl_sdbx_apikey_offline', PADDLE_WEBHOOK_SECRET: 'pdl_ntfset_secret', PADDLE_ENVIRONMENT: 'sandbox', ...PRICES }
  afterEach(() => vi.unstubAllGlobals())
  const sign = (raw: string, secret = env.PADDLE_WEBHOOK_SECRET, ts = Math.floor(Date.now() / 1000)) => `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${raw}`).digest('hex')}`
  const subscriptionData = {
    id: 'sub_01pdl', status: 'active', customer_id: 'ctm_01', address_id: 'add_01', business_id: null, currency_code: 'USD', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z',
    started_at: '2026-10-01T00:00:00Z', first_billed_at: '2026-10-01T00:00:00Z', next_billed_at: '2026-11-01T00:00:00Z', paused_at: null, canceled_at: null, discount: null, collection_mode: 'automatic', billing_details: null,
    current_billing_period: { starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-11-01T00:00:00Z' }, billing_cycle: { interval: 'month', frequency: 1 },
    scheduled_change: { action: 'cancel', effective_at: '2026-11-01T00:00:00Z', resume_at: null }, management_urls: null, custom_data: { workspaceId: '22222222-2222-4222-8222-222222222222' }, import_meta: null,
    items: [{ status: 'active', quantity: 3, recurring: true, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', previously_billed_at: null, next_billed_at: null, trial_dates: null,
      price: { id: 'price_starter_m', product_id: 'pro_01', description: 'Starter', type: 'standard', name: null, billing_cycle: { interval: 'month', frequency: 1 }, trial_period: null, tax_mode: 'account_setting', unit_price: { amount: '0', currency_code: 'USD' }, unit_price_overrides: [], quantity: { minimum: 1, maximum: 100 }, status: 'active', custom_data: null, import_meta: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' },
      product: { id: 'pro_01', name: 'Meridian Starter', tax_category: 'saas', type: 'standard', description: null, image_url: null, custom_data: null, status: 'active', import_meta: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' } }],
  }

  test('refuses production without explicit approval', () => {
    expect(() => createPaddleProvider({ ...env, PADDLE_ENVIRONMENT: 'production' })).toThrow(BillingConfigError)
  })
  test('verifies Paddle-Signature (ts;h1 over ts:body) with the SDK', async () => {
    const p = createPaddleProvider(env)
    const raw = JSON.stringify({ event_id: 'evt_01pdl', event_type: 'subscription.updated', occurred_at: '2026-10-02T00:00:00Z', notification_id: 'ntf_01', data: subscriptionData })
    const e = await p.verifyWebhook(raw, new Headers({ 'paddle-signature': sign(raw) }))
    expect(e).toMatchObject({ id: 'evt_01pdl', type: 'subscription.updated', subscriptionId: 'sub_01pdl', customerId: 'ctm_01', workspaceId: '22222222-2222-4222-8222-222222222222' })
    await expect(p.verifyWebhook(raw, new Headers({ 'paddle-signature': sign(raw, 'other-secret') }))).rejects.toThrow()
    await expect(p.verifyWebhook(raw + ' ', new Headers({ 'paddle-signature': sign(raw) }))).rejects.toThrow()
  })
  test('maps a subscription (scheduled cancel, period, price → plan)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: subscriptionData, meta: { request_id: 'r1' } }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const p = createPaddleProvider(env)
    const s = await p.fetchSubscription('sub_01pdl')
    expect(s).toMatchObject({ plan: 'starter', interval: 'month', seats: 3, status: 'active', cancelAtPeriodEnd: true, providerCustomerId: 'ctm_01' })
    expect(s.currentPeriodEnd?.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })
})
