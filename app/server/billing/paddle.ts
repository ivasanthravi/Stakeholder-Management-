// Paddle Billing adapter (merchant of record: Paddle collects and remits sales tax/VAT/GST).
// Written against @paddle/paddle-node-sdk@3.10. Checkout uses a server-created transaction whose hosted checkout URL
// comes from the default payment link configured in the Paddle dashboard.
import { Environment, Paddle, type Subscription, type Transaction } from '@paddle/paddle-node-sdk'
import type { SubscriptionStatus } from '../../shared/plans'
import { BillingConfigError, planFromPrice, priceFromEnv, type BillingProvider, type InvoiceSummary, type SubscriptionSnapshot } from './provider'

const STATUS: Record<string, SubscriptionStatus> = { trialing: 'trialing', active: 'active', past_due: 'past_due', canceled: 'canceled', paused: 'suspended' }
const d = (s: string | null | undefined) => (s ? new Date(s) : null)

export function createPaddleProvider(env: Record<string, string | undefined>): BillingProvider & { invoiceUrl(transactionId: string): Promise<string | null> } {
  const key = env.PADDLE_API_KEY
  const secret = env.PADDLE_WEBHOOK_SECRET
  if (!key || !secret) throw new BillingConfigError('PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET are required for BILLING_PROVIDER=paddle')
  const testMode = (env.PADDLE_ENVIRONMENT ?? 'sandbox') === 'sandbox'
  if (!testMode && env.BILLING_LIVE_APPROVED !== 'true') throw new BillingConfigError('PADDLE_ENVIRONMENT=production needs BILLING_LIVE_APPROVED=true (explicit approval for real charges)')
  const paddle = new Paddle(key, { environment: testMode ? Environment.sandbox : Environment.production })

  function snapshot(s: Subscription): SubscriptionSnapshot {
    const item = s.items[0]
    const mapped = planFromPrice(env, item?.price?.id)
    return {
      providerSubscriptionId: s.id,
      providerCustomerId: s.customerId,
      workspaceId: (s.customData as Record<string, string> | null)?.workspaceId ?? null,
      plan: mapped?.plan ?? null,
      interval: mapped?.interval ?? null,
      seats: item?.quantity ?? 1,
      status: STATUS[s.status] ?? 'incomplete',
      trialEndsAt: s.status === 'trialing' ? d(item?.trialDates?.endsAt) : null,
      currentPeriodStart: d(s.currentBillingPeriod?.startsAt),
      currentPeriodEnd: d(s.currentBillingPeriod?.endsAt),
      cancelAtPeriodEnd: s.scheduledChange?.action === 'cancel',
      endedAt: s.status === 'canceled' ? d(s.canceledAt) : null,
      paymentMethodSummary: null,
    }
  }

  return {
    id: 'paddle', label: testMode ? 'Paddle (sandbox)' : 'Paddle', testMode,
    priceId: (plan, interval) => priceFromEnv(env, plan, interval),

    async createCheckout(i) {
      const priceId = priceFromEnv(env, i.plan, i.interval)
      if (!priceId) throw new BillingConfigError(`No Paddle price configured for ${i.plan}/${i.interval}`)
      const txn: Transaction = await paddle.transactions.create({
        items: [{ priceId, quantity: i.seats }],
        ...(i.customerId ? { customerId: i.customerId } : {}),
        customData: { workspaceId: i.workspaceId },
        // checkout.url is the page that HOSTS Paddle checkout (it must load Paddle.js), not a return URL. Omitted so the
        // default payment link from the Paddle dashboard is used. That page doesn't exist in this app yet — see
        // docs/launch/billing-verification.md (Paddle checkout page: blocker for the Paddle path).
      })
      if (!txn.checkout?.url) throw new BillingConfigError('Paddle returned no checkout URL — set a default payment link in the Paddle dashboard')
      return { url: txn.checkout.url }
    },

    async createPortal(customerId, _returnUrl, subscriptionId) {
      const s = await paddle.customerPortalSessions.create(customerId, subscriptionId ? [subscriptionId] : [])
      return { url: s.urls.general.overview }
    },

    async fetchSubscription(id) { return snapshot(await paddle.subscriptions.get(id)) },

    async updateSubscription(id, change) {
      const priceId = priceFromEnv(env, change.plan, change.interval)
      if (!priceId) throw new BillingConfigError(`No Paddle price configured for ${change.plan}/${change.interval}`)
      await paddle.subscriptions.update(id, { items: [{ priceId, quantity: change.seats }], prorationBillingMode: 'prorated_immediately' })
    },

    async cancel(id, { atPeriodEnd }) {
      await paddle.subscriptions.cancel(id, { effectiveFrom: atPeriodEnd ? 'next_billing_period' : 'immediately' })
    },

    async resume(id) { await paddle.subscriptions.update(id, { scheduledChange: null }) },

    async listInvoices(customerId) {
      const out: InvoiceSummary[] = []
      const page = await paddle.transactions.list({ customerId: [customerId], perPage: 24 }).next()
      for (const t of page) {
        if (!t.invoiceId && t.status !== 'past_due') continue
        out.push({
          id: t.id, number: t.invoiceNumber, status: t.status, total: Number(t.details?.totals?.grandTotal ?? 0), amountPaid: t.status === 'completed' ? Number(t.details?.totals?.grandTotal ?? 0) : 0,
          currency: t.currencyCode, createdAt: t.createdAt, periodStart: t.billingPeriod?.startsAt ?? null, periodEnd: t.billingPeriod?.endsAt ?? null, url: null,
        })
      }
      return out
    },

    async invoiceUrl(transactionId) { return (await paddle.transactions.getInvoicePDF(transactionId)).url ?? null },

    async verifyWebhook(raw, headers) {
      const sig = headers.get('paddle-signature')
      if (!sig) throw new Error('Missing Paddle-Signature header')
      const e = await paddle.webhooks.unmarshal(raw, secret, sig)
      const data = e.data as { id?: string; customerId?: string | null; subscriptionId?: string | null; customData?: Record<string, string> | null }
      const isSub = e.eventType.startsWith('subscription.')
      return {
        id: e.eventId, type: e.eventType, createdAt: new Date(e.occurredAt), objectId: data.id ?? null,
        subscriptionId: isSub ? data.id ?? null : data.subscriptionId ?? null, customerId: data.customerId ?? null,
        workspaceId: data.customData?.workspaceId ?? null, paymentFailed: e.eventType === 'transaction.payment_failed',
      }
    },
  }
}
