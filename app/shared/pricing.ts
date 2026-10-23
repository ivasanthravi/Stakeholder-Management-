// Public price display. Nothing here is shown until `approved` is true for a plan — the pricing page and plan
// cards say "Pricing on request" instead. Approving a price is a business decision recorded in
// docs/commercial/pricing-strategy.md; the amount charged always comes from the billing provider's price object,
// so these figures must match the provider catalog exactly when approved.
import type { PlanId } from './plans'

export interface DisplayPrice {
  approved: boolean
  currency: 'USD'
  /** Per seat per month, in whole currency units. */
  monthly: number | null
  /** Per seat per month when billed annually. */
  annualMonthly: number | null
}

export const DISPLAY_PRICES: Record<PlanId, DisplayPrice> = {
  starter: { approved: false, currency: 'USD', monthly: null, annualMonthly: null },
  professional: { approved: false, currency: 'USD', monthly: null, annualMonthly: null },
  enterprise: { approved: false, currency: 'USD', monthly: null, annualMonthly: null },
}
