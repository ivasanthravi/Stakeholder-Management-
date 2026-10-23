// Inbox: the bell's popover. Unread count badge, newest first, click opens the item and marks it read.
// Semantics: a non-modal dialog anchored to the bell; focus moves in on open and back to the bell on close.
// ↑/↓ move between items, Esc closes, clicking outside closes.
import { AnimatePresence, motion } from 'motion/react'
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CalendarClock, CheckCheck, CreditCard, Gavel, Handshake, UserPlus } from 'lucide-react'
import { useInbox, useMarkRead, type InboxItem } from '../api/commercial'
import { wk } from '../api/hooks'
import { t } from '../lib/motion'
import { fmtDate } from '../lib/format'
import './inbox.css'

const KIND_ICON: Record<string, typeof Bell> = {
  commitments_digest: Handshake, decision_assigned: Gavel, invitation_accepted: UserPlus, billing: CreditCard,
}

function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86_400)
  if (d < 7) return `${d}d ago`
  return fmtDate(iso, { day: 'numeric', month: 'short' })
}

/** Bell button + popover. `variant="bottom"` renders as a bottom-nav item on narrow screens. */
export function InboxButton({ variant = 'side' }: { variant?: 'side' | 'bottom' }) {
  const q = useInbox()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const unread = q.data?.unread ?? 0
  const label = `Inbox${unread ? `, ${unread} unread` : ''}`
  const close = useCallback((restore = true) => { setOpen(false); if (restore) btn.current?.focus() }, [])
  return (
    <>
      {variant === 'side' ? (
        <button ref={btn} className="side-bell" aria-label={label} title="Inbox" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Bell size={15} />
          {unread > 0 && <span className="inbox-badge num" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
        </button>
      ) : (
        <button ref={btn} className="bn-item" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <span className="bn-ico"><Bell size={18} />{unread > 0 && <span className="inbox-badge num" aria-hidden>{unread > 9 ? '9+' : unread}</span>}</span>
          <span>Inbox</span>
        </button>
      )}
      {createPortal(
        <AnimatePresence>{open && <InboxPanel key="p" anchor={btn.current} variant={variant} onClose={close} />}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}

function InboxPanel({ anchor, variant, onClose }: { anchor: HTMLElement | null; variant: 'side' | 'bottom'; onClose: (restore?: boolean) => void }) {
  const q = useInbox()
  const mark = useMarkRead()
  const qc = useQueryClient()
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const items = q.data?.notifications ?? []
  const unread = q.data?.unread ?? 0

  useLayoutEffect(() => {
    if (variant !== 'side' || !anchor) return
    const r = anchor.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, window.innerWidth - 368)) })
  }, [anchor, variant])

  // Focus the first unread item (or the first item) on open.
  useEffect(() => {
    const focusIn = () => {
      if (ref.current?.contains(document.activeElement)) return
      const el = ref.current?.querySelector<HTMLElement>('[data-unread]') ?? ref.current?.querySelector<HTMLElement>('.inbox-item, .inbox-head button, [data-focus]')
      ;(el ?? ref.current)?.focus()
    }
    // Twice: once the portal has mounted, and again after the opening click has finished settling focus.
    const a = requestAnimationFrame(focusIn)
    const b = window.setTimeout(focusIn, 60)
    return () => { cancelAnimationFrame(a); clearTimeout(b) }
  }, [q.isPending])

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return
      onClose(false)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [anchor, onClose])

  const setRead = (ids?: string[]) => {
    const now = new Date().toISOString()
    qc.setQueryData<{ notifications: InboxItem[]; unread: number }>(wk('inbox'), d => {
      if (!d) return d
      const notifications = d.notifications.map(n => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n))
      return { notifications, unread: notifications.filter(n => !n.readAt).length }
    })
    mark.mutate(ids ? { ids } : {})
  }

  const open = (n: InboxItem) => {
    if (!n.readAt) setRead([n.id])
    if (n.href) { onClose(false); nav(n.href) }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      const els = [...(ref.current?.querySelectorAll<HTMLElement>('.inbox-item') ?? [])]
      if (!els.length) return
      e.preventDefault()
      const i = els.indexOf(document.activeElement as HTMLElement)
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length
      els[n].focus()
    }
    if (e.key === 'Tab') {
      // Keep Tab inside the popover; it closes with Esc or a click outside.
      const els = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <motion.div ref={ref} className="inbox" data-variant={variant} role="dialog" aria-label="Inbox" tabIndex={-1}
      style={variant === 'side' && pos ? { top: pos.top, left: pos.left } : undefined}
      initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1, transition: t.fast }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
      onKeyDown={onKeyDown}>
      <div className="inbox-head">
        <h2 className="t-strong grow">Inbox{unread > 0 && <span className="c3 t-small num"> · {unread} unread</span>}</h2>
        {unread > 0 && <button type="button" className="inbox-all" onClick={() => setRead()}><CheckCheck size={13} aria-hidden />Mark all read</button>}
      </div>
      {q.isPending ? (
        <div className="inbox-empty t-small c3" aria-busy="true">Loading…</div>
      ) : q.isError ? (
        <div className="inbox-empty"><p className="t-small c2">Couldn’t load the inbox.</p><button type="button" className="inbox-all" data-focus onClick={() => void q.refetch()}>Retry</button></div>
      ) : !items.length ? (
        <div className="inbox-empty">
          <BellOff size={18} className="c3" aria-hidden />
          <p className="t-strong">You’re all caught up</p>
          <p className="t-small c2">Digests, assignments and account notices will appear here.</p>
        </div>
      ) : (
        <ul className="inbox-list" aria-label="Notifications">
          {items.map(n => <Item key={n.id} n={n} onOpen={() => open(n)} />)}
        </ul>
      )}
      <div className="inbox-foot t-small c3">
        <button type="button" className="inbox-link" onClick={() => { onClose(false); nav('/settings/notifications') }}>Notification settings</button>
      </div>
    </motion.div>
  )
}

const Item = forwardRef<HTMLButtonElement, { n: InboxItem; onOpen: () => void }>(function Item({ n, onOpen }, ref) {
  const Icon = KIND_ICON[n.kind] ?? (n.kind.includes('deletion') ? CalendarClock : Bell)
  const unread = !n.readAt
  return (
    <li>
      <button ref={ref} type="button" className="inbox-item" data-unread={unread || undefined} onClick={onOpen}
        aria-label={`${unread ? 'Unread: ' : ''}${n.title}, ${ago(n.createdAt)}`}>
        <span className="inbox-ico" aria-hidden><Icon size={13} /></span>
        <span className="grow inbox-text">
          <span className="inbox-title">{n.title}</span>
          <time className="t-small c3" dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString('en-GB')}>{ago(n.createdAt)}</time>
        </span>
        {unread && <span className="inbox-dot" aria-hidden />}
      </button>
    </li>
  )
})
