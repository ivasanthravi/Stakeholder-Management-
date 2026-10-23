// Stripe Billing adapter: hosted Checkout, Customer Portal, subscription updates with proration, signed webhooks.
// Written against stripe@23 (API version 2026-09-30.endive), where the billing period lives on subscription items.
import Stripe from 'stripe'
import type { PlanId, SubscriptionStatus } from '../../shared/plans'
import { BillingConfigError, planFromPrice, priceFromEnv, type BillingProvider, type Interval, type SubscriptionSnapshot, type VerifiedEvent } from './provider'

const STATUS: Record<string, SubscriptionStatus> = {
  trialing: 'trialing', active: 'active', past_due: 'past_due', unpaid: 'past_due',
  canceled: 'canceled', incomplete: 'incomplete', incomplete_expired: 'expired', paused: 'suspended',
}
const date = (s: number | null | undefined) => (s ? new Date(s * 1000) : null)
const idOf = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id ?? null)

export function createStripeProvider(env: Record<string, string | undefined>, opts: { httpClient?: Stripe.HttpClient } = {}): BillingProvider {
  const key = env.STRIPE_SECRET_KEY
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!key || !secret) throw new BillingConfigError('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required for BILLING_PROVIDER=stripe')
  const testMode = key.startsWith('sk_test_') || key.startsWith('rk_test_')
  if (!testMode && env.BILLING_LIVE_APPROVED !== 'true') throw new BillingConfigError('Live Stripe keys need BILLING_LIVE_APPROVED=true (explicit approval for real charges)')
  const stripe = new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, ...(opts.httpClient ? { httpClient: opts.httpClient } : {}) })

  function snapshot(s: Stripe.Subscription): SubscriptionSnapshot {
    const item = s.items.data[0]
    const mapped = planFromPrice(env, item?.price?.id)
    const pm = s.default_payment_method && typeof s.default_payment_method === 'object' ? s.default_payment_method : null
    return {
      providerSubscriptionId: s.id,
      providerCustomerId: idOf(s.customer as string | { id: string })!,
      workspaceId: s.metadata?.workspaceId ?? null,
      plan: mapped?.plan ?? null,
      interval: mapped?.interval ?? null,
      seats: item?.quantity ?? 1,
      status: STATUS[s.status] ?? 'incomplete',
      trialEndsAt: date(s.trial_end),
      currentPeriodStart: date(item?.current_period_start),
      currentPeriodEnd: date(item?.current_period_end),
      cancelAtPeriodEnd: s.cancel_at_period_end,
      endedAt: date(s.ended_at),
      paymentMethodSummary: pm?.card ? `${pm.card.brand} ending ${pm.card.last4}` : null,
    }
  }

  return {
    id: 'stripe', label: testMode ? 'Stripe (test mode)' : 'Stripe', testMode,
    priceId: (plan, interval) => priceFromEnv(env, plan, interval),

    async createCheckout(i) {
      const price = priceFromEnv(env, i.plan, i.interval)
      if (!price) throw new BillingConfigError(`No Stripe price configured for ${i.plan}/${i.interval}`)
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price, quantity: i.seats }],
        ...(i.customerId ? { customer: i.customerId } : { customer_email: i.email }),
        client_reference_id: i.workspaceId,
        subscription_data: { metadata: { workspaceId: i.workspaceId } },
        metadata: { workspaceId: i.workspaceId },
        success_url: i.successUrl,
        cancel_url: i.cancelUrl,
        allow_promotion_codes: false,
      })
      if (!session.url) throw new Error('Stripe returned no checkout URL')
      return { url: session.url }
    },

    async createPortal(customerId, returnUrl) {
      const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })
      return { url: s.url }
    },

    async fetchSubscription(id) {
      return snapshot(await stripe.subscriptions.retrieve(id, { expand: ['default_payment_method'] }))
    },

    async updateSubscription(id, change) {
      const price = priceFromEnv(env, change.plan, change.interval)
      if (!price) throw new BillingConfigError(`No Stripe price configured for ${change.plan}/${change.interval}`)
      const sub = await stripe.subscriptions.retrieve(id)
      const item = sub.items.data[0]
      await stripe.subscriptions.update(id, {
        items: [{ id: item.id, price, quantity: change.seats }],
        proration_behavior: 'create_prorations',
        cancel_at_period_end: false,
      })
    },

    async cancel(id, { atPeriodEnd }) {
      if (atPeriodEnd) await stripe.subscriptions.update(id, { cancel_at_period_end: true })
      else await stripe.subscriptions.cancel(id)
    },

    async resume(id) { await stripe.subscriptions.update(id, { cancel_at_period_end: false }) },

    async listInvoices(customerId) {
      const list = await stripe.invoices.list({ customer: customerId, limit: 24 })
      return list.data.map(inv => ({
        id: inv.id!, number: inv.number, status: inv.status ?? 'draft', total: inv.total, amountPaid: inv.amount_paid, currency: inv.currency,
        createdAt: new Date(inv.created * 1000).toISOString(), periodStart: date(inv.period_start)?.toISOString() ?? null, periodEnd: date(inv.period_end)?.toISOString() ?? null,
        url: inv.hosted_invoice_url ?? inv.invoice_pdf ?? null,
      }))
    },

    async verifyWebhook(raw, headers) {
      const sig = headers.get('stripe-signature')
      if (!sig) throw new Error('Missing Stripe-Signature header')
      const e = await stripe.webhooks.constructEventAsync(raw, sig, secret)
      const obj = e.data.object as unknown as Record<string, unknown> & { id?: string; object?: string; metadata?: Record<string, string> }
      const subscriptionId = obj.object === 'subscription' ? obj.id ?? null
        : obj.object === 'checkout.session' ? idOf(obj.subscription as string | null)
          : obj.object === 'invoice' ? idOf(((obj.parent as { subscription_details?: { subscription?: string } } | null)?.subscription_details?.subscription) ?? (obj.subscription as string | null) ?? null)
            : null
      return {
        id: e.id, type: e.type, createdAt: new Date(e.created * 1000), objectId: obj.id ?? null, subscriptionId,
        customerId: idOf(obj.customer as string | null), workspaceId: obj.metadata?.workspaceId ?? (obj.client_reference_id as string | undefined) ?? null,
        paymentFailed: e.type === 'invoice.payment_failed',
      } satisfies VerifiedEvent
    },
  }
}

export type { Interval, PlanId }
