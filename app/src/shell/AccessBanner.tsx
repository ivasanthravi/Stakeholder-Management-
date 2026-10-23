// A slim banner at the top of the content area when the workspace's access needs attention:
// trial ending soon (info, dismissible for the session), payment overdue during grace (warning),
// read-only (trial ended / canceled / payment overdue) and locked. It explains, it doesn't nag.
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Clock, Lock, X } from 'lucide-react'
import { useBilling, type BillingOverview } from '../api/commercial'
import { useSession } from '../session/session'
import { fmtDate } from '../lib/format'
import { t } from '../lib/motion'
import './access-banner.css'

type Tone = 'info' | 'warning' | 'critical'
interface Banner { key: string; tone: Tone; text: string; action?: string; dismissible?: boolean }

const DAY = 86_400_000
const date = (iso: string | null) => (iso ? fmtDate(iso, { day: 'numeric', month: 'long' }) : '')
const KEY = 'meridian.banner.dismissed'
const readDismissed = () => { try { return sessionStorage.getItem(KEY) } catch { return null } }
const writeDismissed = (v: string) => { try { sessionStorage.setItem(KEY, v) } catch { /* storage unavailable */ } }

export function bannerFor(b: BillingOverview, canBilling: boolean, now = Date.now()): Banner | null {
  const e = b.entitlements
  const a = e.access
  const ask = 'Ask a workspace owner to'
  if (a.level === 'locked') {
    return a.reason === 'suspended'
      ? { key: 'locked-suspended', tone: 'critical', text: `This workspace is suspended. Your data is kept. ${canBilling ? 'Contact support to restore access.' : 'A workspace owner can contact support to restore access.'}` }
      : { key: 'locked', tone: 'critical', text: `This workspace is locked. Your data is kept. ${canBilling ? 'Choose a plan to restore access.' : `${ask} choose a plan to restore access.`}`, action: canBilling ? 'Choose a plan' : undefined }
  }
  if (a.level === 'read_only') {
    const until = a.until ? ` Read-only access continues until ${date(a.until)}.` : ''
    const why = a.reason === 'trial_ended' ? 'The trial has ended' : a.reason === 'past_due' ? 'Payment is overdue' : 'The subscription has ended'
    const fix = a.reason === 'past_due' ? (canBilling ? 'Update the payment method to resume editing.' : `${ask} update the payment method.`) : (canBilling ? 'Choose a plan to resume editing.' : `${ask} choose a plan.`)
    return { key: `ro-${a.reason}`, tone: 'warning', text: `${why}, so changes are paused. Everything is still here and you can view and export it. ${fix}${until}`, action: canBilling ? 'Go to billing' : undefined }
  }
  if (a.reason === 'past_due_grace') {
    return { key: 'grace', tone: 'warning', text: `The last payment didn’t go through. Everything keeps working until ${date(a.until)} while it’s retried. ${canBilling ? 'Update the payment method to avoid interruption.' : `${ask} update the payment method.`}`, action: canBilling ? 'Go to billing' : undefined }
  }
  if (e.status === 'trialing' && e.trialEndsAt) {
    const left = Math.ceil((Date.parse(e.trialEndsAt) - now) / DAY)
    if (left <= 5) {
      const when = left <= 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`
      return { key: `trial-${e.trialEndsAt.slice(0, 10)}`, tone: 'info', dismissible: true, text: `Your trial ends ${when}. Afterwards the workspace becomes read-only — nothing is deleted. ${canBilling ? 'Choose a plan to keep editing.' : `${ask} choose a plan.`}`, action: canBilling ? 'See plans' : undefined }
    }
  }
  return null
}

export function AccessBanner() {
  const q = useBilling()
  const { can } = useSession()
  const loc = useLocation()
  const [dismissed, setDismissed] = useState(readDismissed)
  const banner = q.data ? bannerFor(q.data, can('billing.read')) : null
  const onBilling = loc.pathname.startsWith('/settings/billing')
  const show = banner && !(banner.dismissible && dismissed === banner.key) && !(onBilling && banner.tone === 'info')
  const Icon = banner?.tone === 'info' ? Clock : banner?.tone === 'critical' ? Lock : AlertTriangle
  return (
    <AnimatePresence initial={false}>
      {show && banner && (
        <motion.div key={banner.key} className="access-banner" data-tone={banner.tone} role={banner.tone === 'info' ? 'status' : 'alert'}
          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1, transition: t.base }} exit={{ height: 0, opacity: 0, transition: t.exit }}>
          <div className="ab-inner">
            <Icon size={14} className="ab-ico" aria-hidden />
            <p className="ab-text">{banner.text}</p>
            {banner.action && !onBilling && <Link to="/settings/billing" className="ab-action">{banner.action}</Link>}
            {banner.dismissible && (
              <button type="button" className="ab-close" aria-label="Dismiss for this session" title="Dismiss" onClick={() => { writeDismissed(banner.key); setDismissed(banner.key) }}><X size={13} /></button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
