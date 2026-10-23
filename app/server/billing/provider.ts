// Billing provider contract. Each adapter (Stripe, Paddle, development simulator) translates its own API into these
// shapes; the rest of the app never sees provider objects. Card details never pass through this server: checkout and
// payment-method changes happen on provider-hosted pages.
import type { PlanId, SubscriptionStatus } from '../../shared/plans'

export type ProviderId = 'stripe' | 'paddle' | 'simulator'
export type Interval = 'month' | 'year'

/** Provider state for one subscription, normalised. Always fetched fresh from the provider before it's applied. */
export interface SubscriptionSnapshot {
  providerSubscriptionId: string
  providerCustomerId: string
  /** Our workspace id, from metadata we attached at checkout. */
  workspaceId: string | null
  plan: PlanId | null
  interval: Interval | null
  seats: number
  status: SubscriptionStatus
  trialEndsAt: Date | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  endedAt: Date | null
  paymentMethodSummary: string | null
}

/** A webhook after signature verification, reduced to what routing needs. Payloads are not kept. */
export interface VerifiedEvent {
  id: string
  type: string
  createdAt: Date
  objectId: string | null
  subscriptionId: string | null
  customerId: string | null
  workspaceId: string | null
  /** Whether this event signals a failed payment (used for the payment-failure notice). */
  paymentFailed?: boolean
}

export interface InvoiceSummary {
  id: string
  number: string | null
  status: string
  /** Minor units (cents). */
  total: number
  amountPaid: number
  currency: string
  createdAt: string
  periodStart: string | null
  periodEnd: string | null
  /** Provider-hosted invoice page or PDF; we never render invoices ourselves. */
  url: string | null
}

export interface CheckoutInput {
  workspaceId: string
  workspaceName: string
  email: string
  customerId: string | null
  plan: PlanId
  interval: Interval
  seats: number
  successUrl: string
  cancelUrl: string
}

export class BillingConfigError extends Error {}

export interface BillingProvider {
  id: ProviderId
  label: string
  /** True for sandbox/test keys. Live mode needs explicit approval (BILLING_LIVE_APPROVED=true). */
  testMode: boolean
  /** Configured provider price id for a plan and interval, or null when that combination isn't sold. */
  priceId(plan: PlanId, interval: Interval): string | null
  createCheckout(input: CheckoutInput): Promise<{ url: string }>
  /** Provider-hosted portal for payment methods, invoices and cancellation. */
  createPortal(customerId: string, returnUrl: string, subscriptionId: string | null): Promise<{ url: string } | null>
  fetchSubscription(subscriptionId: string): Promise<SubscriptionSnapshot>
  /** Change plan, interval or seat count, with proration. */
  updateSubscription(subscriptionId: string, change: { plan: PlanId; interval: Interval; seats: number }): Promise<void>
  cancel(subscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void>
  resume(subscriptionId: string): Promise<void>
  listInvoices(customerId: string): Promise<InvoiceSummary[]>
  /** Verifies the signature over the raw body and parses the event. Throws on any failure. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedEvent>
}

/** Price ids come from env so sandbox and live catalogs are just configuration. */
export function priceFromEnv(env: Record<string, string | undefined>, plan: PlanId, interval: Interval) {
  return env[`BILLING_PRICE_${plan.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'ANNUAL'}`] || null
}

/** Reverse lookup: provider price id → plan and interval. */
export function planFromPrice(env: Record<string, string | undefined>, priceId: string | null | undefined): { plan: PlanId; interval: Interval } | null {
  if (!priceId) return null
  for (const plan of ['starter', 'professional', 'enterprise'] as PlanId[]) {
    for (const interval of ['month', 'year'] as Interval[]) if (priceFromEnv(env, plan, interval) === priceId) return { plan, interval }
  }
  return null
}
