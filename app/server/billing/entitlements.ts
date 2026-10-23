// Entitlements: the one place that turns a workspace's subscription into what it may do.
// Every restricted operation calls into here on the server; the client receives the same resolved view to explain it.
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import type { DB } from '../db/client'
import { aiAllowance, invitation, membership, subscription } from '../db/schema'
import { ApiError } from '../http'
import type { AppEnv, Ctx } from '../context'
import {
  accessFor, aiAllowance as planAllowance, FEATURES, hasFeature, PLANS, POLICY, seatLimitFor,
  type AccessLevel, type Feature, type PlanId, type SubscriptionState, type SubscriptionStatus,
} from '../../shared/plans'

export type SubscriptionRow = typeof subscription.$inferSelect

export interface Entitlements {
  plan: PlanId
  planName: string
  status: SubscriptionStatus
  access: { level: AccessLevel; reason: string; until: string | null }
  features: Feature[]
  seatLimit: number | null
  aiTokenAllowance: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  provider: SubscriptionRow['provider']
  interval: SubscriptionRow['interval']
  seats: number
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)
export const stateOf = (r: SubscriptionRow): SubscriptionState => ({
  plan: r.plan, status: r.status, seats: r.seats, trialEndsAt: iso(r.trialEndsAt), currentPeriodEnd: iso(r.currentPeriodEnd),
  cancelAtPeriodEnd: r.cancelAtPeriodEnd, pastDueSince: iso(r.pastDueSince), endedAt: iso(r.endedAt),
})

export function resolve(r: SubscriptionRow, now = Date.now()): Entitlements {
  const s = stateOf(r)
  const access = accessFor(s, now)
  return {
    plan: r.plan, planName: PLANS[r.plan].name, status: r.status, access,
    features: (Object.keys(FEATURES) as Feature[]).filter(f => hasFeature(r.plan, f)),
    seatLimit: r.status === 'trialing' ? POLICY.trialSeats : PLANS[r.plan].seatLimit === null ? (r.seats || null) : seatLimitFor(s),
    aiTokenAllowance: planAllowance(s),
    trialEndsAt: s.trialEndsAt, currentPeriodEnd: s.currentPeriodEnd, cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    provider: r.provider, interval: r.interval, seats: r.seats,
  }
}

/** Starts the no-card trial for a new workspace. Runs inside the workspace-creation transaction. */
export async function startTrial(t: DB, workspaceId: string, userId: string) {
  await t.insert(subscription).values({
    workspaceId, plan: POLICY.trialPlan, status: 'trialing', seats: POLICY.trialSeats, provider: 'none',
    trialEndsAt: new Date(Date.now() + POLICY.trialDays * 86_400_000), trialStartedBy: userId,
  })
}

/** How many trials this user has already started (abuse limit before a new workspace gets one). */
export async function trialsStartedBy(db: DB, userId: string) {
  const [r] = await db.select({ n: count() }).from(subscription).where(eq(subscription.trialStartedBy, userId))
  return r?.n ?? 0
}

export async function loadSubscription(db: DB, workspaceId: string): Promise<SubscriptionRow> {
  const [r] = await db.select().from(subscription).where(eq(subscription.workspaceId, workspaceId))
  if (r) return r
  // Every workspace gets a row at creation (and by migration); this is a defensive fallback for inconsistent data.
  throw new ApiError(500, 'no_subscription', 'This workspace has no subscription record. Contact support.')
}

export async function entitlementsFor(db: DB, workspaceId: string) {
  return resolve(await loadSubscription(db, workspaceId))
}

/** Seats in use = active members + pending invitations (an invitation holds a seat until it expires or is revoked). */
export async function seatUsage(db: DB, workspaceId: string) {
  const [m] = await db.select({ n: count() }).from(membership).where(and(eq(membership.workspaceId, workspaceId), isNull(membership.removedAt)))
  const [i] = await db.select({ n: count() }).from(invitation)
    .where(and(eq(invitation.workspaceId, workspaceId), isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date())))
  return { members: m?.n ?? 0, pending: i?.n ?? 0, used: (m?.n ?? 0) + (i?.n ?? 0) }
}

/**
 * Seat check for invitations and acceptances. Locks the subscription row so two concurrent invitations can't both
 * take the last seat. `counting` says whether the seat being taken is already counted (accepting a pending invite).
 */
export async function assertSeatAvailable(t: DB, workspaceId: string, opts: { counting?: 'new' | 'pending' } = {}) {
  const [row] = await t.select().from(subscription).where(eq(subscription.workspaceId, workspaceId)).for('update')
  if (!row) throw new ApiError(500, 'no_subscription', 'This workspace has no subscription record. Contact support.')
  const e = resolve(row)
  if (e.access.level !== 'full') throw subscriptionInactive(e)
  if (e.seatLimit === null) return
  const usage = await seatUsage(t, workspaceId)
  const after = usage.used + (opts.counting === 'pending' ? 0 : 1)
  if (after > e.seatLimit) {
    throw new ApiError(402, 'seat_limit', e.status === 'trialing'
      ? `Trials include ${e.seatLimit} seats, and all are in use or invited. Choose a plan to add more people.`
      : `All ${e.seatLimit} seats on this plan are in use or invited. An owner can add seats in Settings › Billing.`, { seatLimit: e.seatLimit, used: usage.used })
  }
}

export function subscriptionInactive(e: Entitlements) {
  const msg = e.access.level === 'locked'
    ? 'This workspace is locked. An owner can restore access in Settings › Billing.'
    : e.access.reason === 'trial_ended' ? 'The trial has ended. The workspace is read-only until an owner chooses a plan.'
      : e.access.reason === 'past_due' ? 'Payment is overdue, so the workspace is read-only. An owner can update the payment method in Settings › Billing.'
        : 'The subscription has ended. The workspace is read-only until an owner restarts it.'
  return new ApiError(402, 'subscription_inactive', msg, { access: e.access })
}

export function requireFeature(e: Entitlements, feature: Feature) {
  if (e.features.includes(feature)) return
  const plan = (['starter', 'professional', 'enterprise'] as PlanId[]).find(p => hasFeature(p, feature))
  throw new ApiError(402, 'plan_required', `${FEATURES[feature]} is included in the ${plan ? PLANS[plan].name : 'Enterprise'} plan.`, { feature, plan: plan ?? 'enterprise' })
}

/**
 * Writes allowed while a workspace is read-only: leaving or tidying membership, billing, notifications,
 * and data export or deletion. Everything else that changes data needs full access.
 */
const READ_ONLY_ALLOWED = [/^\/billing(\/|$)/, /^\/members\/[^/]+$/, /^\/invitations\/[^/]+$/, /^\/data(\/|$)/, /^\/notifications(\/|$)/, /^\/ai\/conversations(\/|$)/]

/** Loads entitlements for the tenant (after tenantMiddleware) and blocks writes when access isn't full. */
export const entitlementMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const e = await entitlementsFor(c.var.deps.db, c.var.tenant.workspaceId)
  c.set('entitlements', e)
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && e.access.level !== 'full') {
    const rel = c.req.path.replace(/^\/api\/w\/[^/]+/, '') || '/'
    const allowed = READ_ONLY_ALLOWED.some(r => r.test(rel)) && !(e.access.level === 'locked' && !/^\/(billing|data)(\/|$)/.test(rel))
    if (!allowed) throw subscriptionInactive(e)
  }
  await next()
}

export const entitlements = (c: Ctx) => c.var.entitlements

// ── AI allowance ────────────────────────────────────────────────────────────
export interface AiReservation { workspaceId: string; period: string; estimate: number }
export const currentPeriod = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`

/**
 * Reserves an estimate of model tokens before a call. A single conditional UPDATE means concurrent requests can't
 * jointly exceed the allowance: each must fit alongside everything already used or reserved.
 */
export async function reserveAi(db: DB, workspaceId: string, allowance: number, estimate: number): Promise<AiReservation> {
  const period = currentPeriod()
  await db.insert(aiAllowance).values({ workspaceId, period, used: 0, reserved: 0 }).onConflictDoNothing()
  const rows = await db.update(aiAllowance).set({ reserved: sql`${aiAllowance.reserved} + ${estimate}` })
    .where(and(eq(aiAllowance.workspaceId, workspaceId), eq(aiAllowance.period, period), sql`${aiAllowance.used} + ${aiAllowance.reserved} + ${estimate} <= ${allowance}`))
    .returning({ used: aiAllowance.used })
  if (!rows[0]) throw new ApiError(429, 'quota_exceeded', 'This workspace has used its AI allowance for this month. Recorded facts and rule-based features keep working; an owner can see usage in Settings › Usage.', { allowance })
  return { workspaceId, period, estimate }
}

/** Replaces the estimate with the actual tokens used (0 for failures, cache hits and cancellations). */
export async function settleAi(db: DB, r: AiReservation, actualTokens: number) {
  await db.update(aiAllowance).set({ used: sql`${aiAllowance.used} + ${actualTokens}`, reserved: sql`greatest(${aiAllowance.reserved} - ${r.estimate}, 0)` })
    .where(and(eq(aiAllowance.workspaceId, r.workspaceId), eq(aiAllowance.period, r.period)))
}

export async function aiLedger(db: DB, workspaceId: string) {
  const [r] = await db.select().from(aiAllowance).where(and(eq(aiAllowance.workspaceId, workspaceId), eq(aiAllowance.period, currentPeriod())))
  return { period: currentPeriod(), used: r?.used ?? 0, reserved: r?.reserved ?? 0 }
}
