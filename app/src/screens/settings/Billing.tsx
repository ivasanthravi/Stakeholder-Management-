// Subscription, billing history and usage. Payment details are entered only on the provider's hosted pages;
// local state changes only after the provider confirms (webhook or refresh), never because the browser came back.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowUpRight, Check, CircleCheck, CreditCard, ExternalLink, FileText, Info, Loader2, Lock, Minus, Plus, ReceiptText, Sparkle, Users } from 'lucide-react'
import {
  formatTokens, STATUS_LABEL, useBilling, useCancelSubscription, useChangePlan, useCheckout, useInvoices, usePortal, useResumeSubscription,
  type BillingOverview, type CatalogPlan, type Entitlements, type Invoice,
} from '../../api/commercial'
import { ApiError, errorMessage, request, ws } from '../../api/http'
import { wk } from '../../api/hooks'
import { Button, Pill, Skeleton } from '../../components/ui'
import { ConfirmDialog } from '../../components/Drawer'
import { useSession } from '../../session/session'
import { useApp } from '../../shell/context'
import { t } from '../../lib/motion'
import { LoadError } from '../Home'
import { PLANS, POLICY, type SubscriptionStatus } from '../../../shared/plans'
import { daysUntil, fmtInt, longDate, Meter, Notice, PageTitle, SectionHead, shortDate } from './common'

type Interval = 'month' | 'year'
const STATUS_TONE: Record<SubscriptionStatus, 'positive' | 'accent' | 'attention' | 'critical' | 'neutral'> = {
  trialing: 'accent', active: 'positive', past_due: 'attention', canceled: 'neutral', expired: 'neutral', suspended: 'critical', incomplete: 'neutral',
}

/** A provider subscription exists that can be changed in place (rather than bought through checkout). */
const hasProviderSub = (b: BillingOverview) =>
  !!b.provider && b.entitlements.provider === b.provider.id && ['active', 'past_due'].includes(b.entitlements.status)

function ProviderBadge({ b }: { b: BillingOverview }) {
  if (!b.provider) return null
  return (
    <span className="bill-provider t-small c2">
      {b.provider.testMode && <Pill tone="attention">Test mode</Pill>}
      <span className="truncate" title={b.provider.label}>{b.provider.label}</span>
    </span>
  )
}

// ── Subscription ──────────────────────────────────────────────────────────────
export function SubscriptionTab() {
  const q = useBilling()
  const { can } = useSession()
  if (!can('billing.read')) return <AdminsOnly title="Subscription" />
  return (
    <>
      <PageTitle title="Subscription" sub="Your plan, seats and billing period. Payments are handled on the billing provider’s secure pages." aside={q.data && <ProviderBadge b={q.data} />} />
      {q.isPending ? <BillingSkeleton /> : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : <Subscription b={q.data} />}
    </>
  )
}

export function AdminsOnly({ title }: { title: string }) {
  return (
    <>
      <PageTitle title={title} sub="Plan and billing details for this workspace." />
      <div className="set-card set-empty">
        <span className="set-empty-ico" aria-hidden><Lock size={16} /></span>
        <p className="t-strong">Only owners and administrators can see billing</p>
        <p className="t-small c2">Ask a workspace owner if you have a question about the plan or seats.</p>
      </div>
    </>
  )
}

function BillingSkeleton() {
  return (
    <div className="set-card set-skel" aria-busy="true" aria-label="Loading billing">
      {[0, 1, 2].map(i => <div key={i} className="set-skel-row"><Skeleton w={110} h={11} /><Skeleton w="100%" h={14} /></div>)}
    </div>
  )
}

function Subscription({ b }: { b: BillingOverview }) {
  return (
    <>
      <CheckoutReturn b={b} />
      <CurrentPlan b={b} />
      <Plans b={b} />
      {b.canManage && hasProviderSub(b) && !b.entitlements.cancelAtPeriodEnd && <CancelSection b={b} />}
    </>
  )
}

/** After the provider redirects back: wait for the provider's confirmation, never trust the redirect itself. */
function CheckoutReturn({ b }: { b: BillingOverview }) {
  const [params, setParams] = useSearchParams()
  const qc = useQueryClient()
  const outcome = params.get('checkout')
  const [phase, setPhase] = useState<'idle' | 'waiting' | 'confirmed' | 'timeout' | 'canceled'>(() => (outcome === 'success' ? 'waiting' : outcome === 'canceled' ? 'canceled' : 'idle'))
  const [nonce, setNonce] = useState(0)
  const plan = useRef<string | null>(null)

  useEffect(() => {
    if (outcome) setParams(p => { p.delete('checkout'); return p }, { replace: true })
  }, [outcome, setParams])

  useEffect(() => {
    if (phase !== 'waiting') return
    let stop = false
    const started = Date.now()
    const tick = async () => {
      try {
        // Same endpoint as useRefreshBilling, but only the billing query is updated so polling doesn't refetch the whole workspace.
        const r = await request<{ entitlements: Entitlements }>(ws('/billing/refresh'), { method: 'POST', body: {} })
        if (stop) return
        if (r.entitlements.status === 'active' && r.entitlements.provider !== 'none') {
          plan.current = r.entitlements.planName
          setPhase('confirmed')
          void qc.invalidateQueries({ queryKey: wk() })
          return
        }
      } catch { /* keep polling; a transient error isn't a verdict */ }
      if (stop) return
      if (Date.now() - started > 30_000) { setPhase('timeout'); return }
      timer = window.setTimeout(tick, 2000)
    }
    let timer = window.setTimeout(tick, 300)
    return () => { stop = true; clearTimeout(timer) }
  }, [phase, nonce, qc])

  const provider = b.provider?.label ?? 'the billing provider'
  return (
    <AnimatePresence initial={false}>
      {phase !== 'idle' && (
        <motion.div key={phase} className="bill-return" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
          {phase === 'waiting' && (
            <Notice tone="info" role="status" icon={<Loader2 size={15} className="spin" />} title="Confirming your payment…">
              Waiting for {provider} to confirm the subscription. This usually takes a few seconds — you can stay on this page.
            </Notice>
          )}
          {phase === 'confirmed' && (
            <Notice tone="positive" role="status" icon={<CircleCheck size={15} />} title={`Payment confirmed — you’re on ${plan.current ?? b.entitlements.planName}`}
              actions={<Button size="sm" variant="ghost" onClick={() => setPhase('idle')}>Dismiss</Button>}>
              Your subscription is active. A receipt is available in Billing history.
            </Notice>
          )}
          {phase === 'timeout' && (
            <Notice tone="attention" role="status" icon={<AlertTriangle size={15} />} title="Still waiting for confirmation"
              actions={<Button size="sm" onClick={() => { setPhase('waiting'); setNonce(n => n + 1) }}>Check again</Button>}>
              {provider} hasn’t confirmed the payment yet. If you completed checkout, it may still be processing — nothing is charged twice if you check again.
            </Notice>
          )}
          {phase === 'canceled' && (
            <Notice tone="neutral" role="status" icon={<Info size={15} />} title="Checkout canceled"
              actions={<Button size="sm" variant="ghost" onClick={() => setPhase('idle')}>Dismiss</Button>}>
              Nothing was charged and your plan hasn’t changed.
            </Notice>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function CurrentPlan({ b }: { b: BillingOverview }) {
  const e = b.entitlements
  const { toast } = useApp()
  const portal = usePortal()
  const resume = useResumeSubscription()
  const qc = useQueryClient()
  const [portalNote, setPortalNote] = useState<string | null>(null)
  const trialLeft = daysUntil(e.trialEndsAt)
  const periodEnd = b.billing?.currentPeriodEnd ?? e.currentPeriodEnd
  const interval = e.interval ?? (b.billing?.interval as Interval | null)
  const effectiveAi = Math.min(b.ai.allowance, b.ai.adminBudget)

  const openPortal = () => {
    setPortalNote(null)
    portal.mutate({}, {
      onSuccess: r => { window.location.assign(r.url) },
      onError: err => {
        if (err instanceof ApiError && err.status === 503) setPortalNote(`${b.provider?.label ?? 'This billing provider'} doesn’t offer a hosted billing portal, so payment methods can’t be changed from here. ${b.provider?.testMode ? 'In the simulator there is no real card to update.' : 'Contact support to update payment details.'}`)
        else setPortalNote(errorMessage(err))
      },
    })
  }
  const doResume = () => resume.mutate({}, {
    onSuccess: r => { qc.setQueryData<BillingOverview>(wk('billing'), d => d && ({ ...d, entitlements: r.entitlements })); toast('Subscription resumed — it will renew as usual') },
    onError: err => toast(errorMessage(err), undefined, 'error'),
  })

  return (
    <section className="set-section" aria-labelledby="bill-current">
      <SectionHead title="Current plan" id="bill-current" />
      <div className="set-card">
        <div className="bill-plan-head">
          <div className="grow">
            <p className="bill-plan-name"><span className="t-title">{e.planName}</span><Pill tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Pill></p>
            <p className="t-small c2 bill-plan-sub">
              {e.status === 'trialing' && e.access.level === 'full'
                ? <>Free trial · {trialLeft === 0 ? 'ends today' : `${trialLeft} day${trialLeft === 1 ? '' : 's'} left`} · ends {longDate(e.trialEndsAt)}. No card needed until you choose a plan.</>
                : e.status === 'trialing' ? <>The trial ended on {longDate(e.trialEndsAt)}.</>
                  : hasProviderSub(b) ? <>{interval === 'year' ? 'Billed annually' : interval === 'month' ? 'Billed monthly' : 'Billing period'} · {e.cancelAtPeriodEnd ? 'ends' : 'renews'} {longDate(periodEnd)}</>
                    : e.status === 'canceled' || e.status === 'expired' ? <>No active subscription.</> : null}
            </p>
          </div>
          {b.canManage && b.billing?.hasCustomer && hasProviderSub(b) && (
            <Button size="sm" icon={<CreditCard size={13} />} onClick={openPortal} loading={portal.isPending}>Update payment method</Button>
          )}
        </div>

        {e.cancelAtPeriodEnd && hasProviderSub(b) && (
          <div className="bill-inline-notice">
            <Notice tone="attention" icon={<Info size={15} />} title={`Your subscription ends on ${longDate(periodEnd)}`}
              actions={b.canManage ? <Button size="sm" variant="primary" onClick={doResume} loading={resume.isPending}>Resume subscription</Button> : undefined}>
              Everything keeps working until then. Afterwards the workspace becomes read-only for {POLICY.readOnlyRetentionDays} days — nothing is deleted.
              {!b.canManage && ' Only an owner can resume it.'}
            </Notice>
          </div>
        )}
        {e.status === 'past_due' && (
          <div className="bill-inline-notice">
            <Notice tone="attention" icon={<AlertTriangle size={15} />} title="The last payment didn’t go through"
              actions={b.canManage ? <Button size="sm" variant="primary" icon={<CreditCard size={13} />} onClick={openPortal} loading={portal.isPending}>Update payment method</Button> : undefined}>
              {e.access.level === 'full'
                ? <>Everything keeps working until {longDate(e.access.until)} while the payment is retried.</>
                : <>The workspace is read-only until the payment is resolved. Your data is safe.</>}
              {!b.canManage && ' Only an owner can update the payment method.'}
            </Notice>
          </div>
        )}
        {portalNote && <div className="bill-inline-notice"><Notice tone="neutral" role="status" icon={<Info size={15} />}>{portalNote}</Notice></div>}

        <dl className="bill-facts">
          <div>
            <dt className="t-small c3">Seats</dt>
            <dd>
              <span className="bill-fact-val"><span className="t-strong num">{b.seats.used}</span><span className="c2 num"> of {e.seatLimit ?? 'unlimited'}</span></span>
              {e.seatLimit != null && <Meter value={b.seats.used} max={e.seatLimit} label="Seats used" />}
              <span className="t-small c3">{b.seats.members} member{b.seats.members === 1 ? '' : 's'}{b.seats.pending ? ` · ${b.seats.pending} invited` : ''}</span>
            </dd>
          </div>
          <div>
            <dt className="t-small c3">AI this month</dt>
            <dd>
              <span className="bill-fact-val"><span className="t-strong num">{formatTokens(b.ai.used)}</span><span className="c2 num"> of {formatTokens(effectiveAi)} tokens</span></span>
              <Meter value={b.ai.used} extra={b.ai.reserved} max={effectiveAi} label="AI tokens used this month" />
              <Link to="/settings/usage" className="t-small set-link">Usage details</Link>
            </dd>
          </div>
          <div>
            <dt className="t-small c3">Payment method</dt>
            <dd>
              {b.billing?.paymentMethodSummary
                ? <span className="bill-fact-val row gap-2"><CreditCard size={14} className="c3" aria-hidden />{b.billing.paymentMethodSummary}</span>
                : <span className="bill-fact-val c2">{e.status === 'trialing' ? 'Not needed during the trial' : 'None on file'}</span>}
              <span className="t-small c3">Card details stay with the billing provider.</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function Plans({ b }: { b: BillingOverview }) {
  const e = b.entitlements
  const [interval, setIv] = useState<Interval>((e.interval as Interval | null) ?? 'month')
  const sub = hasProviderSub(b)
  const anyPrice = b.plans.some(p => p.price)
  return (
    <section className="set-section" aria-labelledby="bill-plans">
      <SectionHead title="Plans" id="bill-plans"
        sub={b.canManage ? (sub ? 'Changes apply right away; the provider prorates the difference on your next invoice.' : 'Choosing a plan opens the provider’s secure checkout. We never see your card details.') : <span className="row gap-1"><Lock size={12} aria-hidden />Only owners can change the plan.</span>}
        aside={<IntervalToggle value={interval} onChange={setIv} />} />
      <div className="bill-plans">
        {b.plans.map(p => <PlanCard key={p.id} p={p} b={b} interval={interval} />)}
      </div>
      {!anyPrice && <p className="t-small c3">Prices are confirmed at checkout by the billing provider. Pricing isn’t published here yet.</p>}
    </section>
  )
}

function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  const opts: [Interval, string][] = [['month', 'Monthly'], ['year', 'Annual']]
  return (
    <div className="seg" role="radiogroup" aria-label="Billing period">
      {opts.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1} className="seg-opt"
          onClick={() => onChange(v)}
          onKeyDown={ev => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) { ev.preventDefault(); const n = v === 'month' ? 'year' : 'month'; onChange(n); (ev.currentTarget.parentElement?.querySelector(`[data-v="${n}"]`) as HTMLElement | null)?.focus() } }}
          data-v={v}>
          {value === v && <motion.span layoutId="bill-seg" className="seg-ind" transition={t.indicator} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

function priceText(p: CatalogPlan, interval: Interval) {
  if (!p.price) return null
  const amount = interval === 'year' ? p.price.annualMonthly : p.price.monthly
  if (amount == null) return null
  return `${new Intl.NumberFormat(undefined, { style: 'currency', currency: p.price.currency, maximumFractionDigits: 0 }).format(amount)} per seat / month${interval === 'year' ? ', billed annually' : ''}`
}

function PlanCard({ p, b, interval }: { p: CatalogPlan; b: BillingOverview; interval: Interval }) {
  const e = b.entitlements
  const { toast } = useApp()
  const qc = useQueryClient()
  const checkout = useCheckout()
  const change = useChangePlan()
  const used = b.seats.used
  const sub = hasProviderSub(b)
  const isCurrent = sub && e.plan === p.id
  const cap = p.seatLimit
  const initial = Math.max(used, isCurrent ? e.seats : used, 1)
  const [seats, setSeats] = useState(() => (cap != null ? Math.min(initial, cap) : initial))
  const [err, setErr] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const tooSmall = cap != null && used > cap
  const unchanged = isCurrent && e.interval === interval && e.seats === seats
  const price = priceText(p, interval)
  const busy = checkout.isPending || change.isPending

  const choose = () => {
    setErr(null)
    checkout.mutate({ plan: p.id, interval, seats }, {
      onSuccess: r => { window.location.assign(r.url) },
      onError: x => setErr(errorMessage(x)),
    })
  }
  const doChange = () => {
    setErr(null)
    change.mutate({ plan: p.id, interval, seats }, {
      onSuccess: r => {
        setConfirm(false)
        qc.setQueryData<BillingOverview>(wk('billing'), d => d && ({ ...d, entitlements: r.entitlements }))
        toast(`Plan updated — ${r.entitlements.planName}, ${r.entitlements.seats} seats, billed ${r.entitlements.interval === 'year' ? 'annually' : 'monthly'}`)
      },
      onError: x => { setConfirm(false); setErr(x instanceof ApiError && x.fields.seats ? `${x.message}` : errorMessage(x)) },
    })
  }

  let cta: React.ReactNode = null
  if (!p.selfServe) cta = <Link to="/contact" className="btn btn-secondary btn-md bill-cta">Talk to sales<ArrowUpRight size={13} aria-hidden /></Link>
  else if (!b.canManage) cta = isCurrent ? <span className="t-small c3">Your current plan</span> : null
  else if (unchanged) cta = <Button className="bill-cta" disabled icon={<Check size={14} />}>Current plan</Button>
  else if (!p.purchasable[interval]) cta = <Button className="bill-cta" disabled>Not available yet</Button>
  else if (tooSmall) cta = <Button className="bill-cta" disabled>Too few seats</Button>
  // One primary action: the plan you're on (or trying). Other plans are secondary, so the page doesn't push an upsell.
  else if (sub) cta = <Button className="bill-cta" variant={isCurrent ? 'primary' : 'secondary'} onClick={() => { setErr(null); setConfirm(true) }} loading={change.isPending}>{isCurrent ? 'Update plan' : `Switch to ${p.name}`}</Button>
  else cta = <Button className="bill-cta" variant={e.plan === p.id ? 'primary' : 'secondary'} onClick={choose} loading={checkout.isPending}>{checkout.isPending ? 'Opening checkout…' : `Choose ${p.name}`}</Button>

  const direction = isCurrent ? (seats < e.seats ? 'fewer' : 'more') : PLANS[p.id].seatLimit !== null && PLANS[e.plan].seatLimit !== null && (PLANS[p.id].seatLimit! < PLANS[e.plan].seatLimit!) ? 'down' : 'up'

  return (
    <article className="bill-card" data-current={isCurrent || (e.status === 'trialing' && e.plan === p.id) || undefined} aria-labelledby={`plan-${p.id}`}>
      <header className="bill-card-head">
        <h3 className="t-heading" id={`plan-${p.id}`}>{p.name}</h3>
        {isCurrent && <Pill tone="positive">Current</Pill>}
        {!sub && e.status === 'trialing' && e.plan === p.id && <Pill tone="accent">Trial</Pill>}
      </header>
      <p className="t-small c2 bill-tagline">{p.tagline}</p>
      <p className="bill-price">{price ?? <span className="c2">{p.selfServe ? 'Pricing on request' : 'Custom contract'}</span>}</p>
      <ul className="bill-feats">
        <li><Users size={13} aria-hidden />{cap == null ? 'Seats set by contract' : `Up to ${cap} seats`}</li>
        <li><Sparkle size={13} aria-hidden />{formatTokens(p.aiTokensPerSeat)} AI tokens per seat / month</li>
        {p.features.map(f => (
          <li key={f.id} data-planned={f.planned || undefined}>
            {f.planned ? <span className="bill-dot" aria-hidden /> : <Check size={13} aria-hidden />}
            <span className="grow">{f.label}</span>
            {f.planned && <span className="bill-planned">Planned</span>}
          </li>
        ))}
      </ul>
      <div className="bill-card-foot">
        {p.selfServe && cap != null && b.canManage && (
          tooSmall
            ? <p className="t-small c2">{p.name} allows up to {cap} seats; {used} are in use or invited.</p>
            : <SeatStepper value={seats} min={Math.max(1, used)} max={cap} onChange={setSeats} label={`Seats for ${p.name}`} />
        )}
        {cta}
        {err && <p className="field-error" role="alert">{err}</p>}
      </div>
      <ConfirmDialog open={confirm} busy={change.isPending}
        title={isCurrent ? `Update ${p.name}?` : `Switch to ${p.name}?`} confirmLabel={isCurrent ? 'Update plan' : `Switch to ${p.name}`}
        body={(
          <>
            <p>{p.name} · {seats} seat{seats === 1 ? '' : 's'} · billed {interval === 'year' ? 'annually' : 'monthly'}.</p>
            <p className="set-mt">The change applies now. {b.provider?.label ?? 'The billing provider'} prorates it: {direction === 'down' || direction === 'fewer' ? 'unused time becomes a credit on your next invoice' : 'the difference for the rest of this period is added to your next invoice'}.</p>
            {(direction === 'down') && <p className="set-mt">Features not in {p.name} stop working; the records they created are kept.</p>}
          </>
        )}
        onCancel={() => !busy && setConfirm(false)} onConfirm={doChange} />
    </article>
  )
}

function SeatStepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <div className="stepper">
      <span className="t-small c2" id={`${label}-l`}>Seats</span>
      <div className="stepper-ctl" role="group" aria-labelledby={`${label}-l`}>
        <Button type="button" size="sm" variant="ghost" icon={<Minus size={13} />} aria-label="Fewer seats" disabled={value <= min} onClick={() => onChange(clamp(value - 1))} />
        <input className="input stepper-input num" inputMode="numeric" aria-label={label} value={draft}
          aria-describedby={`${label}-h`}
          onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={() => { const n = clamp(Number(draft) || min); onChange(n); setDraft(String(n)) }}
          onKeyDown={e => { if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + 1)) } if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - 1)) } if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
        <Button type="button" size="sm" variant="ghost" icon={<Plus size={13} />} aria-label="More seats" disabled={value >= max} onClick={() => onChange(clamp(value + 1))} />
      </div>
      <span className="t-small c3" id={`${label}-h`}>{min === max ? 'max' : `${min}–${max}`}</span>
    </div>
  )
}

function CancelSection({ b }: { b: BillingOverview }) {
  const cancel = useCancelSubscription()
  const qc = useQueryClient()
  const { toast } = useApp()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const end = longDate(b.billing?.currentPeriodEnd ?? b.entitlements.currentPeriodEnd)
  const go = () => cancel.mutate(reason.trim() ? { reason: reason.trim() } : {}, {
    onSuccess: r => { setOpen(false); qc.setQueryData<BillingOverview>(wk('billing'), d => d && ({ ...d, entitlements: r.entitlements })); toast(`Subscription will end on ${end}`) },
    onError: x => { setOpen(false); toast(errorMessage(x), undefined, 'error') },
  })
  return (
    <section className="set-section" aria-labelledby="bill-cancel">
      <SectionHead title="Cancel subscription" id="bill-cancel" />
      <div className="set-card set-danger">
        <div className="set-danger-row">
          <div className="grow">
            <p className="t-strong">Cancel at the end of the billing period</p>
            <p className="t-small c2">Access continues until {end}. You can resume any time before then.</p>
          </div>
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Cancel subscription…</Button>
        </div>
      </div>
      <ConfirmDialog open={open} danger busy={cancel.isPending} title="Cancel your subscription?" confirmLabel="Cancel subscription"
        body={(
          <>
            <ul className="bill-cancel-list">
              <li>Everything keeps working until <span className="t-strong">{end}</span>.</li>
              <li>After that the workspace is read-only for {POLICY.readOnlyRetentionDays} days: people can view and export, but not edit.</li>
              <li>Nothing is deleted. You can resume before {end} or choose a plan again later.</li>
            </ul>
            <label className="field-label set-mt" htmlFor="bill-reason">What’s the main reason? <span className="c3">(optional)</span></label>
            <textarea id="bill-reason" className="input textarea" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
          </>
        )}
        onCancel={() => !cancel.isPending && setOpen(false)} onConfirm={go} />
    </section>
  )
}

// ── Billing history ───────────────────────────────────────────────────────────
const INVOICE_TONE: Record<string, 'positive' | 'attention' | 'critical' | 'neutral'> = { paid: 'positive', open: 'attention', uncollectible: 'critical', void: 'neutral', draft: 'neutral' }
const INVOICE_LABEL: Record<string, string> = { paid: 'Paid', open: 'Due', uncollectible: 'Unpaid', void: 'Void', draft: 'Draft' }

export function formatMinor(amount: number, currency: string) {
  const cur = currency.toUpperCase()
  try {
    const f = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur })
    const digits = f.resolvedOptions().maximumFractionDigits ?? 2
    return f.format(amount / 10 ** digits)
  } catch { return `${(amount / 100).toFixed(2)} ${cur}` }
}

export function BillingHistoryTab() {
  const { can } = useSession()
  const billing = useBilling()
  const q = useInvoices(can('billing.read'))
  if (!can('billing.read')) return <AdminsOnly title="Billing history" />
  const invoices = q.data?.invoices ?? []
  return (
    <>
      <PageTitle title="Billing history" sub="Invoices issued by the billing provider for this workspace." aside={billing.data && <ProviderBadge b={billing.data} />} />
      {q.isPending ? <BillingSkeleton /> : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : !invoices.length ? (
        <div className="set-card set-empty">
          <span className="set-empty-ico" aria-hidden><ReceiptText size={16} /></span>
          <p className="t-strong">No invoices yet</p>
          <p className="t-small c2">{billing.data?.entitlements.status === 'trialing' ? 'Trials are free. Invoices appear here once you choose a plan.' : 'Invoices appear here after the first payment.'}</p>
          {billing.data?.canManage && billing.data.entitlements.status === 'trialing' && <Link to="/settings/billing" className="btn btn-secondary btn-sm set-mt">See plans</Link>}
        </div>
      ) : (
        <section className="set-section" aria-label="Invoices">
          <div className="set-card ai-usage-wrap" tabIndex={0} role="region" aria-label="Invoices table">
            <table className="ai-usage inv-table">
              <thead><tr><th scope="col">Invoice</th><th scope="col">Date</th><th scope="col">Period</th><th scope="col" className="r">Amount</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Link</span></th></tr></thead>
              <tbody>
                {invoices.map((i: Invoice) => (
                  <tr key={i.id}>
                    <td><span className="row gap-2"><FileText size={13} className="c3" aria-hidden /><span className="mono">{i.number ?? i.id}</span></span></td>
                    <td className="num">{shortDate(i.createdAt)}</td>
                    <td className="num c2">{i.periodStart && i.periodEnd ? `${shortDate(i.periodStart)} – ${shortDate(i.periodEnd)}` : '—'}</td>
                    <td className="r num">{formatMinor(i.total, i.currency)}</td>
                    <td><Pill tone={INVOICE_TONE[i.status] ?? 'neutral'}>{INVOICE_LABEL[i.status] ?? i.status}</Pill></td>
                    <td className="r">{i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="set-link row gap-1">View<ExternalLink size={12} aria-hidden /><span className="sr-only"> invoice {i.number} (opens the provider’s page)</span></a> : <span className="c3 t-small" title="The provider didn’t supply a hosted invoice page">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {billing.data?.provider?.testMode && <p className="t-small c3">Test-mode invoices use placeholder amounts. No money was charged.</p>}
        </section>
      )}
    </>
  )
}

// ── Usage ─────────────────────────────────────────────────────────────────────
export function UsageTab() {
  const { can } = useSession()
  const q = useBilling()
  if (!can('billing.read')) return <AdminsOnly title="Usage" />
  return (
    <>
      <PageTitle title="Usage" sub="Seats and AI for this workspace in the current period." />
      {q.isPending ? <BillingSkeleton /> : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} /> : <Usage b={q.data} />}
    </>
  )
}

function periodLabel(p: string) {
  const [y, m] = p.split('-').map(Number)
  if (!y || !m) return p
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function Usage({ b }: { b: BillingOverview }) {
  const e = b.entitlements
  const { allowance, adminBudget, used, reserved, period } = b.ai
  const effective = Math.min(allowance, adminBudget)
  const capByAdmin = adminBudget < allowance
  const pct = effective > 0 ? Math.round(((used + reserved) / effective) * 100) : 0
  const seatPct = e.seatLimit ? Math.round((b.seats.used / e.seatLimit) * 100) : 0
  const perSeat = PLANS[e.plan].aiTokensPerSeat
  const memo = useMemo(() => periodLabel(period), [period])
  return (
    <>
      <section className="set-section" aria-labelledby="use-seats">
        <SectionHead title="Seats" id="use-seats" sub={e.status === 'trialing' ? `Trials include ${e.seatLimit ?? POLICY.trialSeats} seats.` : 'Paid seats on your plan. Pending invitations hold a seat until they’re accepted, revoked or expire.'} />
        <div className="set-card use-card">
          <div className="use-big"><span className="t-title num">{b.seats.used}</span><span className="c2 num"> of {e.seatLimit ?? 'unlimited'} seats</span></div>
          {e.seatLimit != null && <Meter value={b.seats.used} max={e.seatLimit} label="Seats used" />}
          <p className="t-small c2">{b.seats.members} member{b.seats.members === 1 ? '' : 's'} · {b.seats.pending} pending invitation{b.seats.pending === 1 ? '' : 's'}{e.seatLimit != null && seatPct >= 100 ? ' · all seats are in use' : ''}</p>
          <p className="t-small"><Link to="/settings/members" className="set-link">Manage members</Link>{b.canManage && e.seatLimit != null && seatPct >= 80 && <> · <Link to="/settings/billing" className="set-link">Change seats</Link></>}</p>
        </div>
      </section>

      <section className="set-section" aria-labelledby="use-ai">
        <SectionHead title="AI" id="use-ai" sub={<>Model tokens for {memo}. The built-in rules engine is never metered. Resets on the 1st of each month (UTC).</>} />
        <div className="set-card use-card">
          <div className="use-big"><span className="t-title num">{formatTokens(used)}</span><span className="c2 num"> of {formatTokens(effective)} tokens used ({pct}%)</span></div>
          <Meter value={used} extra={reserved} max={effective} label="AI tokens used this month" />
          {reserved > 0 && <p className="t-small c3 num">{fmtInt(reserved)} tokens are reserved for requests in progress.</p>}
          <dl className="use-limits">
            <div data-active={!capByAdmin || undefined}>
              <dt className="t-small c2">Plan allowance</dt>
              <dd className="num">{formatTokens(allowance)}</dd>
              <dd className="t-small c3">{e.status === 'trialing' ? 'Fixed for trial workspaces' : `${formatTokens(perSeat)} per seat × ${e.seatLimit ?? e.seats} seats`}</dd>
            </div>
            <div data-active={capByAdmin || undefined}>
              <dt className="t-small c2">Admin budget</dt>
              <dd className="num">{formatTokens(adminBudget)}</dd>
              <dd className="t-small c3">Set in <Link to="/settings/ai" className="set-link">Settings › AI</Link></dd>
            </div>
            <div data-active>
              <dt className="t-small c2">Effective limit</dt>
              <dd className="num t-strong">{formatTokens(effective)}</dd>
              <dd className="t-small c3">The lower of the two — {capByAdmin ? 'your admin budget applies' : 'the plan allowance applies'}</dd>
            </div>
          </dl>
          <p className="t-small c2">When the limit is reached, AI features pause until next month. Recorded facts, signals and rule-based briefings keep working.</p>
          {b.canManage && pct >= 80 && !capByAdmin && <p className="t-small c2">If your team regularly needs more, plans with more seats include a larger allowance. <Link to="/settings/billing" className="set-link">Compare plans</Link></p>}
        </div>
      </section>
    </>
  )
}
