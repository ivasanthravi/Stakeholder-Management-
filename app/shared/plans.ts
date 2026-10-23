// Plan catalog and access policy: the single source of truth for what each plan includes.
// The server enforces these through server/billing/entitlements.ts; the client only uses them to explain and hide.
// Prices are NOT here: they live with the billing provider (price ids in env) and in shared/pricing.ts,
// and are shown publicly only once approved.

export const PLAN_IDS = ['starter', 'professional', 'enterprise'] as const
export type PlanId = typeof PLAN_IDS[number]

export const FEATURES = {
  'ai.copilot': 'AI copilot',
  'ai.briefings': 'Stakeholder and decision briefings',
  'ai.meeting_intelligence': 'Meeting intelligence',
  'map.path_finder': 'Relationship path finder',
  'records.restricted': 'Restricted records',
  'audit.log': 'Workspace audit log',
  'security.sso': 'SSO / SAML',
} as const
export type Feature = keyof typeof FEATURES

export interface PlanDef {
  id: PlanId
  name: string
  tagline: string
  /** Maximum members (active + invited). null = set by contract. */
  seatLimit: number | null
  /** Model tokens per workspace per calendar month, per paid or trial seat. The built-in rules engine is never metered. */
  aiTokensPerSeat: number
  features: Feature[]
  /** Can be bought through self-serve checkout. Enterprise is sales-led. */
  selfServe: boolean
}

export const PLANS: Record<PlanId, PlanDef> = {
  starter: {
    id: 'starter', name: 'Starter', tagline: 'For a small team getting its stakeholder work in one place.',
    seatLimit: 5, aiTokensPerSeat: 150_000,
    features: ['ai.copilot', 'ai.briefings'],
    selfServe: true,
  },
  professional: {
    id: 'professional', name: 'Professional', tagline: 'For teams running several initiatives with many stakeholders.',
    seatLimit: 100, aiTokensPerSeat: 600_000,
    features: ['ai.copilot', 'ai.briefings', 'ai.meeting_intelligence', 'map.path_finder', 'records.restricted', 'audit.log'],
    selfServe: true,
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise', tagline: 'For organizations with security, scale and contract requirements.',
    seatLimit: null, aiTokensPerSeat: 1_000_000,
    // SSO is listed for Enterprise but not implemented yet; the UI marks it as planned.
    features: ['ai.copilot', 'ai.briefings', 'ai.meeting_intelligence', 'map.path_finder', 'records.restricted', 'audit.log', 'security.sso'],
    selfServe: false,
  },
}

/** Features listed on plans that the product does not have yet. Never shown as available. */
export const PLANNED_FEATURES: Feature[] = ['security.sso']

export const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'expired', 'suspended', 'incomplete'] as const
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number]

/** Application access, derived from (but distinct from) billing status. */
export type AccessLevel = 'full' | 'read_only' | 'locked'

export const POLICY = {
  /** New workspaces start a no-card trial of this plan. */
  trialPlan: 'professional' as PlanId,
  trialDays: 14,
  /** Seats available during a trial. */
  trialSeats: 10,
  /** Model tokens for a whole trial workspace per month: a fixed cap, so an unpaid trial has a bounded cost. */
  trialAiTokens: 1_000_000,
  /** Trials a single user may start (abuse limit); more workspaces need a subscription. */
  trialsPerUser: 2,
  /** After a failed renewal, full access continues this long while the provider retries payment. */
  pastDueGraceDays: 14,
  /** After a subscription ends (cancellation or expired trial), the workspace is read-only for this long; data is kept. */
  readOnlyRetentionDays: 90,
} as const

export interface SubscriptionState {
  plan: PlanId
  status: SubscriptionStatus
  seats: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  pastDueSince: string | null
  endedAt: string | null
}

const DAY = 86_400_000

/**
 * Access policy. Billing status says what the provider thinks about money; access says what people can do.
 * - trialing / active → full
 * - past_due → full during the grace period, then read-only
 * - trial ended, canceled or expired → read-only for the retention window (view, export, manage billing), then locked
 * - suspended → locked
 * Data is never deleted by a status change.
 */
export function accessFor(s: SubscriptionState, now = Date.now()): { level: AccessLevel; reason: string; until: string | null } {
  const iso = (t: number) => new Date(t).toISOString()
  switch (s.status) {
    case 'trialing': {
      const end = s.trialEndsAt ? Date.parse(s.trialEndsAt) : 0
      if (end > now) return { level: 'full', reason: 'trial', until: s.trialEndsAt }
      return readOnlyAfter(end, 'trial_ended')
    }
    case 'active':
      return { level: 'full', reason: s.cancelAtPeriodEnd ? 'canceling' : 'active', until: s.cancelAtPeriodEnd ? s.currentPeriodEnd : null }
    case 'past_due': {
      const since = s.pastDueSince ? Date.parse(s.pastDueSince) : now
      const graceEnd = since + POLICY.pastDueGraceDays * DAY
      if (graceEnd > now) return { level: 'full', reason: 'past_due_grace', until: iso(graceEnd) }
      return readOnlyAfter(graceEnd, 'past_due')
    }
    case 'canceled':
    case 'expired':
    case 'incomplete':
      return readOnlyAfter(Date.parse(s.endedAt ?? s.currentPeriodEnd ?? s.trialEndsAt ?? iso(now)), s.status === 'canceled' ? 'canceled' : 'expired')
    case 'suspended':
      return { level: 'locked', reason: 'suspended', until: null }
  }
  function readOnlyAfter(from: number, reason: string) {
    const end = from + POLICY.readOnlyRetentionDays * DAY
    return end > now ? { level: 'read_only' as const, reason, until: iso(end) } : { level: 'locked' as const, reason, until: null }
  }
}

export function seatLimitFor(s: Pick<SubscriptionState, 'plan' | 'status' | 'seats'>) {
  if (s.status === 'trialing') return POLICY.trialSeats
  const cap = PLANS[s.plan].seatLimit
  // Paid plans are bought per seat: the purchased quantity is the limit, never above the plan's cap.
  return cap === null ? s.seats : Math.min(s.seats, cap)
}

export const hasFeature = (plan: PlanId, f: Feature) => PLANS[plan].features.includes(f) && !PLANNED_FEATURES.includes(f)

export function aiAllowance(s: Pick<SubscriptionState, 'plan' | 'status' | 'seats'>) {
  if (s.status === 'trialing') return POLICY.trialAiTokens
  return PLANS[s.plan].aiTokensPerSeat * Math.max(1, seatLimitFor(s))
}
