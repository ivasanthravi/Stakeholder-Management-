// Webhook ingestion and subscription sync.
//
// 1. Verify the signature over the raw body (provider adapter). Unverified requests are rejected before anything is stored.
// 2. Record the event id in billing_event (unique per provider) — a duplicate delivery stops here.
// 3. Queue a sync job for the subscription (deduped while queued). Respond 200 quickly.
// 4. The job fetches the subscription's CURRENT state from the provider and applies it. Because we never apply an
//    event's embedded state, delivery order doesn't matter: a late, old event just triggers another fetch of the truth.
// Checkout redirects never change state; only this path (and reconciliation, which uses the same fetch) does.
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { billingEvent, membership, subscription, user } from '../db/schema'
import type { Jobs } from '../jobs'
import { recordAudit } from '../history'
import type { BillingProvider, SubscriptionSnapshot } from './provider'
import { PLANS, type SubscriptionStatus } from '../../shared/plans'
import { track } from '../analytics'

export interface BillingDeps { db: DB; jobs: Jobs; billing: BillingProvider | null; notify?: (event: BillingNotice) => Promise<void> }
export type BillingNotice =
  | { kind: 'activated' | 'payment_failed' | 'payment_recovered' | 'cancel_scheduled' | 'canceled' | 'plan_changed' | 'trial_ending' | 'trial_ended'; workspaceId: string; plan: string; until?: string | null }

export class WebhookRejected extends Error {}

export async function ingestWebhook(d: BillingDeps, providerId: string, raw: string, headers: Headers) {
  const p = d.billing
  if (!p || p.id !== providerId) throw new WebhookRejected('Unknown billing provider')
  let e
  try { e = await p.verifyWebhook(raw, headers) } catch (err) { throw new WebhookRejected((err as Error).message) }
  const inserted = await d.db.insert(billingEvent).values({
    provider: p.id, eventId: e.id, type: e.type, objectId: e.subscriptionId ?? e.objectId, workspaceId: e.workspaceId && /^[0-9a-f-]{36}$/i.test(e.workspaceId) ? e.workspaceId : null,
    providerCreatedAt: e.createdAt,
  }).onConflictDoNothing().returning({ id: billingEvent.id })
  if (!inserted[0]) return { duplicate: true }
  if (e.subscriptionId) {
    await d.jobs.enqueue('billing.sync', { provider: p.id, subscriptionId: e.subscriptionId }, { dedupeKey: `billing.sync:${p.id}:${e.subscriptionId}` })
  } else {
    await d.db.update(billingEvent).set({ status: 'ignored', processedAt: new Date() }).where(eq(billingEvent.id, inserted[0].id))
  }
  return { duplicate: false }
}

/** Job handler: fetch the provider's current state and apply it. Throws (→ retry with backoff) on provider errors. */
export async function syncSubscription(d: BillingDeps, subscriptionId: string) {
  if (!d.billing) throw new Error('No billing provider configured')
  const snap = await d.billing.fetchSubscription(subscriptionId)
  const result = await applySnapshot(d, snap)
  await d.db.update(billingEvent).set({ status: result.applied ? 'processed' : 'ignored', error: result.applied ? null : result.reason, processedAt: new Date() })
    .where(and(eq(billingEvent.provider, d.billing.id), eq(billingEvent.objectId, subscriptionId), eq(billingEvent.status, 'received')))
  return result
}

const LIVE: SubscriptionStatus[] = ['trialing', 'active', 'past_due']

export async function applySnapshot(d: BillingDeps, snap: SubscriptionSnapshot): Promise<{ applied: boolean; reason?: string }> {
  if (!snap.plan) return { applied: false, reason: 'Price is not mapped to a plan (check BILLING_PRICE_* settings)' }
  const providerId = d.billing!.id as 'stripe' | 'paddle' | 'simulator'
  const outcome = await d.db.transaction(async t => {
    let [row] = await t.select().from(subscription).where(eq(subscription.providerSubscriptionId, snap.providerSubscriptionId)).for('update')
    if (!row && snap.workspaceId && /^[0-9a-f-]{36}$/i.test(snap.workspaceId)) [row] = await t.select().from(subscription).where(eq(subscription.workspaceId, snap.workspaceId)).for('update')
    if (!row) return { applied: false as const, reason: 'No workspace for this subscription' }
    // A late event for an older subscription must not overwrite a newer live one on the same workspace.
    if (row.providerSubscriptionId && row.providerSubscriptionId !== snap.providerSubscriptionId && LIVE.includes(row.status) && !LIVE.includes(snap.status)) {
      return { applied: false as const, reason: 'Superseded subscription' }
    }
    const before = { ...row }
    const now = new Date()
    const [after] = await t.update(subscription).set({
      plan: snap.plan!, status: snap.status, interval: snap.interval, seats: snap.seats, provider: providerId,
      providerCustomerId: snap.providerCustomerId, providerSubscriptionId: snap.providerSubscriptionId,
      trialEndsAt: snap.status === 'trialing' ? snap.trialEndsAt : before.provider === 'none' ? before.trialEndsAt : null,
      currentPeriodStart: snap.currentPeriodStart, currentPeriodEnd: snap.currentPeriodEnd, cancelAtPeriodEnd: snap.cancelAtPeriodEnd,
      pastDueSince: snap.status === 'past_due' ? (before.status === 'past_due' ? before.pastDueSince : now) : null,
      endedAt: ['canceled', 'expired'].includes(snap.status) ? (snap.endedAt ?? before.endedAt ?? now) : null,
      paymentMethodSummary: snap.paymentMethodSummary ?? before.paymentMethodSummary, providerUpdatedAt: now, updatedAt: now,
    }).where(eq(subscription.workspaceId, row.workspaceId)).returning()
    const changed = before.status !== after.status || before.plan !== after.plan || before.seats !== after.seats || before.cancelAtPeriodEnd !== after.cancelAtPeriodEnd || before.interval !== after.interval
    if (changed) {
      await recordAudit(t as never, { workspaceId: row.workspaceId, actorId: null, action: 'billing.subscription_updated', entityType: 'subscription', entityId: row.workspaceId,
        metadata: { from: { status: before.status, plan: before.plan, seats: before.seats }, to: { status: after.status, plan: after.plan, seats: after.seats, cancelAtPeriodEnd: after.cancelAtPeriodEnd } } }, { ip: null, userAgent: null })
    }
    return { applied: true as const, before, after, changed }
  })
  if (!outcome.applied) return outcome
  const { before, after } = outcome
  const notice = (kind: BillingNotice['kind'], until?: string | null) => d.notify?.({ kind, workspaceId: after.workspaceId, plan: PLANS[after.plan].name, until })
  if (after.status === 'active' && !['active', 'past_due'].includes(before.status)) {
    await notice('activated')
    await track(d.db, 'subscription_activated', { workspaceId: after.workspaceId, props: { plan: after.plan, interval: after.interval ?? 'month', seats: after.seats, from: before.status } })
  } else if (after.status === 'past_due' && before.status !== 'past_due') await notice('payment_failed')
  else if (after.status === 'active' && before.status === 'past_due') await notice('payment_recovered')
  if (after.cancelAtPeriodEnd && !before.cancelAtPeriodEnd) {
    await notice('cancel_scheduled', after.currentPeriodEnd?.toISOString() ?? null)
    await track(d.db, 'subscription_cancel_scheduled', { workspaceId: after.workspaceId, props: { plan: after.plan } })
  }
  if (after.status === 'canceled' && before.status !== 'canceled') {
    await notice('canceled')
    await track(d.db, 'subscription_canceled', { workspaceId: after.workspaceId, props: { plan: after.plan } })
  }
  if (before.status === after.status && LIVE.includes(after.status) && (before.plan !== after.plan || before.seats !== after.seats)) {
    await notice('plan_changed')
    await track(d.db, before.plan !== after.plan ? 'plan_changed' : 'seats_changed', { workspaceId: after.workspaceId, props: { from: before.plan, to: after.plan, seats: after.seats } })
  }
  return { applied: true }
}

/** Daily: re-fetch every provider-backed subscription (catches missed webhooks). */
export async function reconcileAll(d: BillingDeps) {
  if (!d.billing) return 0
  const rows = await d.db.select({ id: subscription.providerSubscriptionId }).from(subscription)
    .where(and(eq(subscription.provider, d.billing.id as 'stripe'), isNotNull(subscription.providerSubscriptionId)))
  for (const r of rows) await d.jobs.enqueue('billing.sync', { provider: d.billing.id, subscriptionId: r.id }, { dedupeKey: `billing.sync:${d.billing.id}:${r.id}` })
  return rows.length
}

/** Hourly: end no-card trials whose time is up, and warn three days before. Idempotent. */
export async function processTrials(d: BillingDeps) {
  const ended = await d.db.update(subscription).set({ status: 'expired', endedAt: sql`${subscription.trialEndsAt}`, updatedAt: new Date() })
    .where(and(eq(subscription.status, 'trialing'), eq(subscription.provider, 'none'), lt(subscription.trialEndsAt, new Date()))).returning()
  for (const s of ended) {
    await d.notify?.({ kind: 'trial_ended', workspaceId: s.workspaceId, plan: PLANS[s.plan].name })
    await track(d.db, 'trial_expired', { workspaceId: s.workspaceId, props: { plan: s.plan } })
  }
  const soon = await d.db.select().from(subscription).where(and(eq(subscription.status, 'trialing'), eq(subscription.provider, 'none'),
    lt(subscription.trialEndsAt, new Date(Date.now() + 3 * 86_400_000))))
  for (const s of soon) await d.notify?.({ kind: 'trial_ending', workspaceId: s.workspaceId, plan: PLANS[s.plan].name, until: s.trialEndsAt?.toISOString() ?? null })
  return { ended: ended.length, warned: soon.length }
}

/** Owners (and admins) of a workspace: who billing notices go to. */
export async function billingContacts(db: DB, workspaceId: string) {
  return db.select({ id: user.id, email: user.email, name: user.name }).from(membership).innerJoin(user, eq(user.id, membership.userId))
    .where(and(eq(membership.workspaceId, workspaceId), inArray(membership.role, ['owner']), sql`${membership.removedAt} is null`))
}
