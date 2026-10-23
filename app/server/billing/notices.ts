// Billing notices: subscription transitions → email to workspace owners plus an inbox entry.
import { eq } from 'drizzle-orm'
import { workspace } from '../db/schema'
import type { Deps } from '../context'
import { notify } from '../notify'
import type { TemplateName } from '../email/templates'
import { POLICY } from '../../shared/plans'
import { billingContacts, type BillingNotice } from './sync'

const TEMPLATE: Record<BillingNotice['kind'], TemplateName> = {
  activated: 'subscription_activated', payment_failed: 'payment_failed', payment_recovered: 'payment_recovered', cancel_scheduled: 'cancel_scheduled',
  canceled: 'subscription_canceled', plan_changed: 'plan_changed', trial_ending: 'trial_ending', trial_ended: 'trial_ended',
}
const TITLE: Record<BillingNotice['kind'], string> = {
  activated: 'Subscription active', payment_failed: 'Payment failed — update your payment method', payment_recovered: 'Payment received',
  cancel_scheduled: 'Subscription will end at the end of the period', canceled: 'Subscription ended — workspace is read-only',
  plan_changed: 'Plan updated', trial_ending: 'Trial ends soon', trial_ended: 'Trial ended — workspace is read-only',
}

export function createBillingNotifier(deps: Pick<Deps, 'db' | 'mailer' | 'env'>) {
  return async (n: BillingNotice) => {
    const [w] = await deps.db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, n.workspaceId))
    if (!w) return
    const until = n.kind === 'payment_failed' ? new Date(Date.now() + POLICY.pastDueGraceDays * 86_400_000).toISOString() : n.until ?? null
    const url = `${deps.env.APP_URL}/settings/billing`
    // One trial-ending reminder per workspace; other notices are distinct events.
    const dedupeKey = n.kind === 'trial_ending' ? `trial_ending:${n.workspaceId}` : n.kind === 'trial_ended' ? `trial_ended:${n.workspaceId}` : undefined
    for (const owner of await billingContacts(deps.db, n.workspaceId)) {
      await notify(deps, { userId: owner.id, workspaceId: n.workspaceId, type: 'billing', title: TITLE[n.kind], href: '/settings/billing', dedupeKey,
        email: { template: TEMPLATE[n.kind], data: { workspaceName: w.name, planName: n.plan, until, url } } })
    }
  }
}
