// Calm, non-blocking explanations for 402 responses (a plan feature, an inactive subscription, a seat limit).
// - <UpgradePrompt feature="audit.log" />: inline variant for a page that knows it hit a plan boundary.
// - <UpgradePromptHost />: mounted once in the shell; listens to onPaymentRequired and shows one dismissible card.
//   Duplicates within a few seconds are ignored, and anything an inline prompt or form already explains is skipped.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Lock, Users, X, Sparkles } from 'lucide-react'
import { onPaymentRequired, type PaymentRequired } from '../api/http'
import { useBilling } from '../api/commercial'
import { useSession } from '../session/session'
import { FEATURES, hasFeature, PLANS, PLAN_IDS, type Feature, type PlanId } from '../../shared/plans'
import { t } from '../lib/motion'
import { Button } from './ui'
import './upgrade-prompt.css'

// ── Suppression registry: inline surfaces register what they already explain ─────────────────────────
const handled = new Map<string, number>()
/** While mounted, the global prompt stays quiet for this key (`plan_required:<feature>`, `seat_limit`, `subscription_inactive`). */
export function useHandlesPaymentRequired(key: string | null) {
  useEffect(() => {
    if (!key) return
    handled.set(key, (handled.get(key) ?? 0) + 1)
    return () => { const n = (handled.get(key) ?? 1) - 1; if (n <= 0) handled.delete(key); else handled.set(key, n) }
  }, [key])
}
const keyOf = (p: PaymentRequired) => (p.code === 'plan_required' ? `plan_required:${p.feature ?? ''}` : p.code)
const isHandled = (p: PaymentRequired) => handled.has(keyOf(p)) || (p.code === 'plan_required' && handled.has('plan_required:'))

/** The first plan (in catalog order) that includes a feature. */
export function planFor(feature: Feature): PlanId {
  return PLAN_IDS.find(p => hasFeature(p, feature)) ?? 'enterprise'
}
const isFeature = (f: unknown): f is Feature => typeof f === 'string' && f in FEATURES
const featureLabel = (f: Feature) => FEATURES[f]

function useBillingAccess() {
  const { can } = useSession()
  return { canSee: can('billing.read'), canManage: can('billing.manage') }
}

// ── Inline variant ────────────────────────────────────────────────────────────
export function UpgradePrompt({ feature, plan, description }: { feature: Feature; plan?: PlanId; description?: string }) {
  useHandlesPaymentRequired(`plan_required:${feature}`)
  const { canSee } = useBillingAccess()
  const billing = useBilling()
  const target = plan ?? planFor(feature)
  const current = billing.data?.entitlements.planName
  const label = featureLabel(feature)
  // What the target plan adds over the current one, so the prompt explains value rather than just saying no.
  const currentId = billing.data?.entitlements.plan
  const adds = currentId ? PLANS[target].features.filter(f => !hasFeature(currentId, f) && hasFeature(target, f) && f !== feature).map(featureLabel) : []
  return (
    <section className="up-inline" aria-labelledby="up-inline-title">
      <span className="up-ico" aria-hidden><Lock size={15} /></span>
      <div className="grow">
        <h2 className="t-heading" id="up-inline-title">{label} is part of {PLANS[target].name}</h2>
        <p className="t-small c2 up-text">
          {description ?? (current ? `This workspace is on ${current}. Everything else keeps working as it is.` : 'Everything else keeps working as it is.')}
          {adds.length > 0 && <> {PLANS[target].name} also includes {joinList(adds.map(a => a.toLowerCase()))}.</>}
        </p>
        <div className="up-actions">
          {canSee
            ? <Link to="/settings/billing" className="btn btn-secondary btn-sm">See plans</Link>
            : <span className="t-small c3">Ask a workspace owner if your team needs it.</span>}
        </div>
      </div>
    </section>
  )
}

const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

// ── Global host ───────────────────────────────────────────────────────────────
const DEDUPE_MS = 4000

export function UpgradePromptHost() {
  const [p, setP] = useState<PaymentRequired | null>(null)
  const last = useRef<{ key: string; at: number } | null>(null)
  const loc = useLocation()

  useEffect(() => onPaymentRequired(next => {
    if (isHandled(next)) return
    const key = keyOf(next)
    const now = Date.now()
    if (last.current && last.current.key === key && now - last.current.at < DEDUPE_MS) return
    last.current = { key, at: now }
    setP(next)
  }), [])

  // Reaching billing answers the prompt.
  useEffect(() => { if (loc.pathname.startsWith('/settings/billing')) setP(null) }, [loc.pathname])

  return (
    <div className="up-host" aria-live="polite">
      <AnimatePresence>
        {p && <PromptCard key={keyOf(p) + (last.current?.at ?? 0)} p={p} onClose={() => setP(null)} />}
      </AnimatePresence>
    </div>
  )
}

function PromptCard({ p, onClose }: { p: PaymentRequired; onClose: () => void }) {
  const { canSee, canManage } = useBillingAccess()
  let icon = <Sparkles size={15} />, title: string, body: string, action: string | null = canSee ? 'See plans' : null
  if (p.code === 'plan_required' && isFeature(p.feature)) {
    const plan = (p.plan && p.plan in PLANS ? p.plan : planFor(p.feature)) as PlanId
    title = `${featureLabel(p.feature)} is part of ${PLANS[plan].name}`
    body = canSee ? 'Everything else keeps working. You can compare plans in Billing.' : 'Everything else keeps working. Ask a workspace owner if your team needs it.'
  } else if (p.code === 'seat_limit') {
    icon = <Users size={15} />
    title = 'No seats available'
    body = p.message || 'All seats are in use or invited.'
    action = canManage ? 'Add seats' : canSee ? 'See billing' : null
    if (!canSee) body += ' Ask a workspace owner to add seats.'
  } else if (p.code === 'subscription_inactive') {
    icon = <Lock size={15} />
    title = 'Changes are paused'
    body = `${p.message || 'This workspace is read-only.'} Your data is safe and you can still view and export it.`
    action = canSee ? 'Go to billing' : null
    if (!canSee) body += ' Ask a workspace owner to restore access.'
  } else {
    title = 'This needs a different plan'
    body = p.message || 'This action isn’t included in the current plan.'
  }
  return (
    <motion.div className="up-card" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: t.base }} exit={{ opacity: 0, y: 4, transition: t.exit }}>
      <span className="up-ico" aria-hidden>{icon}</span>
      <div className="grow">
        <p className="t-strong">{title}</p>
        <p className="t-small c2 up-text">{body}</p>
        {action && (
          <div className="up-actions">
            <Link to="/settings/billing" className="btn btn-secondary btn-sm" onClick={onClose}>{action}</Link>
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" icon={<X size={13} />} aria-label="Dismiss" onClick={onClose} className="up-close" />
    </motion.div>
  )
}
