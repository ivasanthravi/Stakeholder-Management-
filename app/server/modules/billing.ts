// Billing API. Tenant routes (mounted under /api/w/:workspaceId/billing) let owners buy, change and cancel;
// public routes take provider webhooks and serve the plan catalog. Local subscription state changes only through
// verified webhooks or a fresh fetch from the provider (syncSubscription) — never because a browser came back from checkout.
import { log } from '../log'
import { Hono } from 'hono'
import { z } from 'zod'
import { jsonBody, meta, need, type AppEnv, type Ctx } from '../context'
import { ApiError } from '../http'
import { recordAudit } from '../history'
import { aiLedger, entitlementsFor, loadSubscription, seatUsage } from '../billing/entitlements'
import { ingestWebhook, syncSubscription, WebhookRejected } from '../billing/sync'
import { aiSettings } from '../ai/usage'
import { track } from '../analytics'
import { can, type Role } from '../../shared/permissions'
import { FEATURES, PLAN_IDS, PLANNED_FEATURES, PLANS, POLICY, type PlanId } from '../../shared/plans'
import { DISPLAY_PRICES } from '../../shared/pricing'

const changeSchema = z.object({ plan: z.enum(PLAN_IDS), interval: z.enum(['month', 'year']), seats: z.number().int().min(1).max(10_000) })

function provider(c: Ctx) {
  const p = c.var.deps.billing
  if (!p) throw new ApiError(503, 'billing_unavailable', 'Online billing isn’t set up for this deployment yet. Contact sales to subscribe.')
  return p
}

/** What can be bought right now: self-serve plans whose provider price is configured. */
function catalog(c: Ctx) {
  const p = c.var.deps.billing
  return PLAN_IDS.map(id => ({
    id, name: PLANS[id].name, tagline: PLANS[id].tagline, seatLimit: PLANS[id].seatLimit, aiTokensPerSeat: PLANS[id].aiTokensPerSeat, selfServe: PLANS[id].selfServe,
    features: PLANS[id].features.map(f => ({ id: f, label: FEATURES[f], planned: PLANNED_FEATURES.includes(f) })),
    price: DISPLAY_PRICES[id].approved ? DISPLAY_PRICES[id] : null,
    purchasable: { month: !!(PLANS[id].selfServe && p?.priceId(id, 'month')), year: !!(PLANS[id].selfServe && p?.priceId(id, 'year')) },
  }))
}

async function assertSeatsCover(c: Ctx, plan: PlanId, seats: number) {
  const usage = await seatUsage(c.var.deps.db, c.var.tenant.workspaceId)
  const cap = PLANS[plan].seatLimit
  if (cap !== null && seats > cap) throw new ApiError(422, 'invalid', `${PLANS[plan].name} allows up to ${cap} seats.`, { fields: { seats: `Up to ${cap}` } })
  if (seats < usage.used) throw new ApiError(422, 'invalid', `${usage.used} seats are in use or invited. Remove members or revoke invitations before reducing seats below that.`, { fields: { seats: `At least ${usage.used}` } })
}

export const billingRoutes = new Hono<AppEnv>()
  .get('/', async c => {
    const { db } = c.var.deps
    const t = c.var.tenant
    const row = await loadSubscription(db, t.workspaceId)
    const e = await entitlementsFor(db, t.workspaceId)
    const usage = await seatUsage(db, t.workspaceId)
    const ledger = await aiLedger(db, t.workspaceId)
    const ai = await aiSettings(db, t.workspaceId)
    const detailed = can(t.role as Role, 'billing.read')
    const p = c.var.deps.billing
    return c.json({
      entitlements: e,
      seats: usage,
      ai: { allowance: e.aiTokenAllowance, adminBudget: ai.monthlyTokenBudget, used: ledger.used, reserved: ledger.reserved, period: ledger.period },
      canManage: can(t.role as Role, 'billing.manage'),
      provider: p ? { id: p.id, label: p.label, testMode: p.testMode } : null,
      // Payment details are for admins and owners only.
      billing: detailed ? {
        provider: row.provider, interval: row.interval, currentPeriodStart: row.currentPeriodStart, currentPeriodEnd: row.currentPeriodEnd,
        paymentMethodSummary: row.paymentMethodSummary, hasCustomer: !!row.providerCustomerId, trialDays: POLICY.trialDays,
      } : null,
      plans: catalog(c),
    })
  })

  .get('/invoices', async c => {
    need(c, 'billing.read')
    const row = await loadSubscription(c.var.deps.db, c.var.tenant.workspaceId)
    const p = c.var.deps.billing
    if (!p || !row.providerCustomerId || row.provider !== p.id) return c.json({ invoices: [], source: p?.label ?? null })
    return c.json({ invoices: await p.listInvoices(row.providerCustomerId), source: p.label })
  })

  .post('/checkout', async c => {
    need(c, 'billing.manage')
    const input = await jsonBody(c, changeSchema)
    const p = provider(c)
    const { db, env } = c.var.deps
    const t = c.var.tenant
    if (!PLANS[input.plan].selfServe) throw new ApiError(422, 'sales_led', `${PLANS[input.plan].name} is arranged with our team. Contact sales.`)
    if (!p.priceId(input.plan, input.interval)) throw new ApiError(422, 'not_sold', 'That plan and billing period isn’t available yet.')
    const row = await loadSubscription(db, t.workspaceId)
    if (row.providerSubscriptionId && ['active', 'trialing', 'past_due'].includes(row.status) && row.provider === p.id) {
      throw new ApiError(409, 'conflict', 'This workspace already has a subscription. Change the plan instead.')
    }
    await assertSeatsCover(c, input.plan, input.seats)
    const session = await p.createCheckout({
      workspaceId: t.workspaceId, workspaceName: t.workspaceName, email: c.var.user!.email,
      customerId: row.provider === p.id ? row.providerCustomerId : null, plan: input.plan, interval: input.interval, seats: input.seats,
      successUrl: `${env.APP_URL}/settings/billing?checkout=success`, cancelUrl: `${env.APP_URL}/settings/billing?checkout=canceled`,
    })
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'billing.checkout_started', entityType: 'subscription', entityId: t.workspaceId, metadata: input }, meta(c))
    await track(db, 'checkout_initiated', { userId: t.userId, workspaceId: t.workspaceId, props: input })
    return c.json({ url: session.url })
  })

  .post('/portal', async c => {
    need(c, 'billing.manage')
    const p = provider(c)
    const row = await loadSubscription(c.var.deps.db, c.var.tenant.workspaceId)
    if (!row.providerCustomerId || row.provider !== p.id) throw new ApiError(409, 'conflict', 'There’s no billing account yet. Choose a plan first.')
    const s = await p.createPortal(row.providerCustomerId, `${c.var.deps.env.APP_URL}/settings/billing`, row.providerSubscriptionId)
    if (!s) throw new ApiError(503, 'billing_unavailable', 'The billing portal isn’t available with this provider.')
    return c.json({ url: s.url })
  })

  .post('/change', async c => {
    need(c, 'billing.manage')
    const input = await jsonBody(c, changeSchema)
    const p = provider(c)
    const { db } = c.var.deps
    const t = c.var.tenant
    const row = await loadSubscription(db, t.workspaceId)
    if (!row.providerSubscriptionId || row.provider !== p.id || !['active', 'past_due', 'trialing'].includes(row.status)) throw new ApiError(409, 'conflict', 'There’s no active subscription to change. Choose a plan instead.')
    if (!PLANS[input.plan].selfServe) throw new ApiError(422, 'sales_led', `${PLANS[input.plan].name} is arranged with our team. Contact sales.`)
    if (!p.priceId(input.plan, input.interval)) throw new ApiError(422, 'not_sold', 'That plan and billing period isn’t available yet.')
    await assertSeatsCover(c, input.plan, input.seats)
    await p.updateSubscription(row.providerSubscriptionId, input)
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'billing.change_requested', entityType: 'subscription', entityId: t.workspaceId, metadata: { from: { plan: row.plan, seats: row.seats, interval: row.interval }, to: input } }, meta(c))
    // Refresh from the provider now (same path as webhooks) so the page reflects the change without waiting.
    await syncSubscription(billingDeps(c), row.providerSubscriptionId)
    return c.json({ entitlements: await entitlementsFor(db, t.workspaceId) })
  })

  .post('/cancel', async c => {
    need(c, 'billing.manage')
    const { reason } = await jsonBody(c, z.object({ reason: z.string().trim().max(500).optional() }))
    const p = provider(c)
    const { db } = c.var.deps
    const t = c.var.tenant
    const row = await loadSubscription(db, t.workspaceId)
    if (!row.providerSubscriptionId || row.provider !== p.id) throw new ApiError(409, 'conflict', 'There’s no paid subscription to cancel.')
    // Self-serve cancellation always takes effect at the end of the paid period; nothing is refunded or deleted here.
    await p.cancel(row.providerSubscriptionId, { atPeriodEnd: true })
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'billing.cancel_requested', entityType: 'subscription', entityId: t.workspaceId, metadata: { reason: reason ?? null } }, meta(c))
    await syncSubscription(billingDeps(c), row.providerSubscriptionId)
    return c.json({ entitlements: await entitlementsFor(db, t.workspaceId) })
  })

  .post('/resume', async c => {
    need(c, 'billing.manage')
    const p = provider(c)
    const { db } = c.var.deps
    const t = c.var.tenant
    const row = await loadSubscription(db, t.workspaceId)
    if (!row.providerSubscriptionId || row.provider !== p.id || !row.cancelAtPeriodEnd) throw new ApiError(409, 'conflict', 'There’s no scheduled cancellation to undo.')
    await p.resume(row.providerSubscriptionId)
    await recordAudit(db, { workspaceId: t.workspaceId, actorId: t.userId, action: 'billing.resumed', entityType: 'subscription', entityId: t.workspaceId }, meta(c))
    await syncSubscription(billingDeps(c), row.providerSubscriptionId)
    return c.json({ entitlements: await entitlementsFor(db, t.workspaceId) })
  })

  /** Re-reads state from the provider. Used by the post-checkout page while it waits for the webhook. */
  .post('/refresh', async c => {
    need(c, 'billing.read')
    const { db } = c.var.deps
    const row = await loadSubscription(db, c.var.tenant.workspaceId)
    const p = c.var.deps.billing
    if (p && row.providerSubscriptionId && row.provider === p.id) await syncSubscription(billingDeps(c), row.providerSubscriptionId)
    return c.json({ entitlements: await entitlementsFor(db, c.var.tenant.workspaceId) })
  })

const billingDeps = (c: Ctx) => ({ db: c.var.deps.db, jobs: c.var.deps.jobs!, billing: c.var.deps.billing ?? null, notify: c.var.deps.billingNotify })

/** Public billing routes: webhooks (signature-verified), the plan catalog, and the development simulator's hosted pages. */
export const publicBillingRoutes = new Hono<AppEnv>()
  .post('/webhooks/:provider', async c => {
    const raw = await c.req.text()
    try {
      const r = await ingestWebhook(billingDeps(c), c.req.param('provider'), raw, c.req.raw.headers)
      return c.json({ received: true, duplicate: r.duplicate })
    } catch (e) {
      if (e instanceof WebhookRejected) {
        // Logged without the payload: it may contain customer details.
        log('warn', 'billing webhook rejected', { provider: c.req.param('provider'), reason: e.message.slice(0, 120) })
        return c.json({ error: { code: 'invalid_signature', message: 'Webhook rejected' } }, 400)
      }
      throw e
    }
  })

  .get('/plans', c => c.json({ plans: catalog(c), trialDays: POLICY.trialDays, trialSeats: POLICY.trialSeats, provider: c.var.deps.billing ? { label: c.var.deps.billing.label, testMode: c.var.deps.billing.testMode } : null }))

  .get('/simulator/checkout/:id', c => {
    const sim = c.var.deps.simulator
    if (!sim || c.var.deps.env.NODE_ENV === 'production') throw new ApiError(404, 'not_found', 'Not found')
    const co = sim.checkout(c.req.param('id'))
    if (!co || co.done) throw new ApiError(404, 'not_found', 'This checkout has expired.')
    return c.html(simulatorPage(co.id, PLANS[co.input.plan].name, co.input.interval, co.input.seats, co.input.workspaceName))
  })
  .post('/simulator/checkout/:id', async c => {
    const sim = c.var.deps.simulator
    if (!sim || c.var.deps.env.NODE_ENV === 'production') throw new ApiError(404, 'not_found', 'Not found')
    const form = await c.req.parseBody()
    const r = await sim.completeCheckout(c.req.param('id'), form.outcome === 'decline' ? 'decline' : 'succeed')
    return c.redirect(r.url, 303)
  })

function simulatorPage(id: string, plan: string, interval: string, seats: number, workspace: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Billing simulator</title>
<style>body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#F8F9FA;color:#151A20;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border:1px solid #E4E7EB;border-radius:14px;padding:32px;max-width:420px;width:calc(100% - 32px);box-sizing:border-box}
.tag{display:inline-block;background:#FFF4E5;color:#7A4A00;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:600;margin-bottom:12px}
h1{font-size:20px;margin:0 0 8px}p{color:#4D5562;margin:0 0 20px}dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0 0 24px}dt{color:#5E6774}dd{margin:0;font-weight:550}
.row{display:flex;gap:10px}button{flex:1;font:inherit;font-weight:600;border-radius:8px;padding:11px 14px;cursor:pointer;border:1px solid #CDD2D9;background:#fff;color:#151A20}
button.pay{background:#0E6B65;border-color:#0E6B65;color:#fff}button:focus-visible{outline:2px solid #17857D;outline-offset:2px}</style></head>
<body><main><span class="tag">Development simulator — no real payment</span><h1>Confirm subscription</h1>
<p>This page stands in for the provider’s hosted checkout so the full webhook flow can be tested without keys. Nothing is charged.</p>
<dl><dt>Workspace</dt><dd>${esc(workspace)}</dd><dt>Plan</dt><dd>${esc(plan)}</dd><dt>Billing</dt><dd>${interval === 'year' ? 'Annual' : 'Monthly'}</dd><dt>Seats</dt><dd>${seats}</dd></dl>
<form method="post" action="/api/billing/simulator/checkout/${esc(id)}" class="row"><button name="outcome" value="decline">Decline card</button><button class="pay" name="outcome" value="succeed">Pay (simulated)</button></form>
</main></body></html>`
}
