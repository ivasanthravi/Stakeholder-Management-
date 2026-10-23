// Development/test billing simulator. It behaves like a provider from the app's point of view — hosted checkout page,
// HMAC-signed webhooks delivered over HTTP, subscriptions fetched by id — so the real ingestion path (signature check,
// dedupe, out-of-order handling, sync) is exercised without provider keys. No money moves. Refused in production.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import type { PlanId, SubscriptionStatus } from '../../shared/plans'
import type { BillingProvider, CheckoutInput, Interval, InvoiceSummary, SubscriptionSnapshot, VerifiedEvent } from './provider'

interface SimSub {
  id: string; customerId: string; workspaceId: string; plan: PlanId; interval: Interval; seats: number; status: SubscriptionStatus
  periodStart: number; periodEnd: number; cancelAtPeriodEnd: boolean; endedAt: number | null; updatedAt: number
}
interface SimCheckout { id: string; input: CheckoutInput; customerId: string; done: boolean }
interface SimState { subs: Record<string, SimSub>; checkouts: Record<string, SimCheckout>; invoices: Record<string, InvoiceSummary[]> }

export type Deliver = (rawBody: string, headers: Record<string, string>) => Promise<void>

const SIG_TOLERANCE_S = 300
const PERIOD = { month: 30 * 86_400_000, year: 365 * 86_400_000 }
/** Placeholder amounts in minor units, clearly fake: the simulator never shows real prices. */
const SIM_AMOUNT = 100

export function signSimulator(secret: string, raw: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`
}

export function createSimulator(opts: { secret: string; appUrl: string; persistPath?: string; deliver?: Deliver }) {
  const state: SimState = opts.persistPath && existsSync(opts.persistPath) ? JSON.parse(readFileSync(opts.persistPath, 'utf8')) : { subs: {}, checkouts: {}, invoices: {} }
  const save = () => { if (opts.persistPath) writeFileSync(opts.persistPath, JSON.stringify(state)) }
  let deliver = opts.deliver

  const snap = (s: SimSub): SubscriptionSnapshot => ({
    providerSubscriptionId: s.id, providerCustomerId: s.customerId, workspaceId: s.workspaceId, plan: s.plan, interval: s.interval, seats: s.seats, status: s.status,
    trialEndsAt: null, currentPeriodStart: new Date(s.periodStart), currentPeriodEnd: new Date(s.periodEnd), cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    endedAt: s.endedAt ? new Date(s.endedAt) : null, paymentMethodSummary: 'Simulator test card',
  })
  async function emit(type: string, s: SimSub, extra: Record<string, unknown> = {}) {
    s.updatedAt = Date.now(); save()
    const raw = JSON.stringify({ id: `evt_${randomUUID()}`, type, created: Math.floor(Date.now() / 1000), data: { subscription: s.id, customer: s.customerId, workspaceId: s.workspaceId, ...extra } })
    if (!deliver) throw new Error('Simulator has no webhook delivery configured')
    await deliver(raw, { 'content-type': 'application/json', 'x-simulator-signature': signSimulator(opts.secret, raw) })
    return raw
  }
  const invoice = (s: SimSub, status: 'paid' | 'open') => {
    ;(state.invoices[s.customerId] ??= []).unshift({
      id: `in_${randomUUID().slice(0, 8)}`, number: `SIM-${String((state.invoices[s.customerId]?.length ?? 0) + 1).padStart(4, '0')}`, status,
      total: SIM_AMOUNT * s.seats, amountPaid: status === 'paid' ? SIM_AMOUNT * s.seats : 0, currency: 'usd',
      createdAt: new Date().toISOString(), periodStart: new Date(s.periodStart).toISOString(), periodEnd: new Date(s.periodEnd).toISOString(), url: null,
    })
  }
  const need = (id: string) => { const s = state.subs[id]; if (!s) throw new Error(`No such simulator subscription ${id}`); return s }

  const provider: BillingProvider = {
    id: 'simulator', label: 'Development billing simulator (no real payments)', testMode: true,
    priceId: () => 'sim_price',
    async createCheckout(input) {
      const id = `cs_${randomUUID()}`
      state.checkouts[id] = { id, input, customerId: input.customerId ?? `cus_${randomUUID().slice(0, 12)}`, done: false }
      save()
      return { url: `${opts.appUrl}/api/billing/simulator/checkout/${id}` }
    },
    async createPortal() { return null },
    async fetchSubscription(id) { return snap(need(id)) },
    async updateSubscription(id, c) {
      const s = need(id); Object.assign(s, { plan: c.plan, interval: c.interval, seats: c.seats, cancelAtPeriodEnd: false })
      invoice(s, 'paid')
      await emit('subscription.updated', s)
    },
    async cancel(id, { atPeriodEnd }) {
      const s = need(id)
      if (atPeriodEnd) s.cancelAtPeriodEnd = true
      else Object.assign(s, { status: 'canceled', endedAt: Date.now() })
      await emit(atPeriodEnd ? 'subscription.updated' : 'subscription.canceled', s)
    },
    async resume(id) { const s = need(id); s.cancelAtPeriodEnd = false; await emit('subscription.updated', s) },
    async listInvoices(customerId) { return state.invoices[customerId] ?? [] },
    async verifyWebhook(raw, headers) {
      const sig = headers.get('x-simulator-signature') ?? ''
      const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig)
      if (!m) throw new Error('Missing or malformed simulator signature')
      if (Math.abs(Date.now() / 1000 - Number(m[1])) > SIG_TOLERANCE_S) throw new Error('Simulator signature timestamp outside tolerance')
      const expected = createHmac('sha256', opts.secret).update(`${m[1]}.${raw}`).digest()
      const given = Buffer.from(m[2], 'hex')
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new Error('Simulator signature mismatch')
      const e = JSON.parse(raw) as { id: string; type: string; created: number; data: { subscription?: string; customer?: string; workspaceId?: string } }
      return { id: e.id, type: e.type, createdAt: new Date(e.created * 1000), objectId: e.data.subscription ?? null, subscriptionId: e.data.subscription ?? null, customerId: e.data.customer ?? null, workspaceId: e.data.workspaceId ?? null, paymentFailed: e.type === 'invoice.payment_failed' } satisfies VerifiedEvent
    },
  }

  return {
    provider,
    setDeliver(d: Deliver) { deliver = d },
    checkout(id: string) { return state.checkouts[id] ?? null },
    /** The hosted "pay" step: decline creates nothing; success creates the subscription and sends signed webhooks. */
    async completeCheckout(id: string, outcome: 'succeed' | 'decline') {
      const co = state.checkouts[id]
      if (!co || co.done) throw new Error('Unknown or completed checkout')
      if (outcome === 'decline') return { url: co.input.cancelUrl }
      co.done = true
      const now = Date.now()
      const s: SimSub = { id: `sub_${randomUUID().slice(0, 12)}`, customerId: co.customerId, workspaceId: co.input.workspaceId, plan: co.input.plan, interval: co.input.interval, seats: co.input.seats, status: 'active', periodStart: now, periodEnd: now + PERIOD[co.input.interval], cancelAtPeriodEnd: false, endedAt: null, updatedAt: now }
      state.subs[s.id] = s
      invoice(s, 'paid')
      await emit('checkout.completed', s)
      return { url: co.input.successUrl, subscriptionId: s.id }
    },
    /** Test controls: move a subscription through its lifecycle, sending the events a provider would. */
    async renew(id: string) { const s = need(id); s.periodStart = s.periodEnd; s.periodEnd += PERIOD[s.interval]; if (s.cancelAtPeriodEnd) { Object.assign(s, { status: 'canceled', endedAt: s.periodStart }); return emit('subscription.canceled', s) } s.status = 'active'; invoice(s, 'paid'); return emit('invoice.paid', s) },
    async failPayment(id: string) { const s = need(id); s.status = 'past_due'; invoice(s, 'open'); return emit('invoice.payment_failed', s) },
    async recoverPayment(id: string) { const s = need(id); s.status = 'active'; return emit('invoice.paid', s) },
    /** Re-sends a previously delivered raw event (duplicate delivery). */
    async redeliver(raw: string) { if (!deliver) throw new Error('no delivery'); await deliver(raw, { 'content-type': 'application/json', 'x-simulator-signature': signSimulator(opts.secret, raw) }) },
    sub(id: string) { return state.subs[id] ?? null },
  }
}

export type Simulator = ReturnType<typeof createSimulator>
