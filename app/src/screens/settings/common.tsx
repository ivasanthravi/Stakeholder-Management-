// Shared building blocks for the settings tabs: headings, time helpers, the members query, a switch,
// a meter, and a confirmation dialog that requires typing a phrase.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { wk } from '../../api/hooks'
import { request, ws } from '../../api/http'
import { Button } from '../../components/ui'
import { t } from '../../lib/motion'
import { fmtDate } from '../../lib/format'
import type { Role } from '../../../shared/permissions'
import '../../components/drawer.css'

export interface Member { id: string; userId: string; name: string; email: string; role: Role; joinedAt: string }
export interface Invitation { id: string; email: string; role: Role; expiresAt: string; createdAt: string }
export interface MembersData { members: Member[]; invitations: Invitation[] }

export const useMembers = () => useQuery({ queryKey: wk('members'), queryFn: () => request<MembersData>(ws('/members')), staleTime: 15_000 })

export const absTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const longDate = (iso: string | null | undefined) => (iso ? fmtDate(iso, { day: 'numeric', month: 'long', year: 'numeric' }) : '—')
export const shortDate = (iso: string | null | undefined) => (iso ? fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const fmtInt = (n: number) => n.toLocaleString('en-GB')
export const daysUntil = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000)) : 0)

/** Finer-grained than fmtRelative: minutes/hours for today. */
export function relTime(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  const d = Math.floor(s / 86_400)
  if (d < 7) return `${d}d ago`
  if (d < 60) return `${Math.floor(d / 7)}w ago`
  return fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SectionHead({ title, sub, aside, id }: { title: string; sub?: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="set-sec-head">
      <div className="grow">
        <h2 className="t-heading" id={id}>{title}</h2>
        {sub && <p className="t-small c2 set-sec-sub">{sub}</p>}
      </div>
      {aside}
    </div>
  )
}

export function PageTitle({ title, sub, aside }: { title: string; sub: ReactNode; aside?: ReactNode }) {
  return (
    <div className="set-title">
      <div className="set-title-row">
        <h1 className="t-title">{title}</h1>
        {aside}
      </div>
      <p className="c2">{sub}</p>
    </div>
  )
}

/** Label/description column + control column inside a card. */
export function FieldRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="set-field-row">
      <div className="set-field-meta"><span className="t-strong">{label}</span>{hint && <span className="t-small c3">{hint}</span>}</div>
      <div className="set-field-ctl">{children}</div>
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled, describedBy, hideLabel }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; describedBy?: string; hideLabel?: boolean }) {
  return (
    <label className="ai-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={describedBy} onChange={e => onChange(e.target.checked)} aria-label={hideLabel ? label : undefined} />
      <span className="ai-switch-track" aria-hidden><i /></span>
      {!hideLabel && <span>{label}</span>}
    </label>
  )
}

/** Horizontal usage bar. `value` and `max` in the same unit; `extra` is shown as a lighter segment (e.g. reserved). */
export function Meter({ value, max, extra = 0, label, tone }: { value: number; max: number; extra?: number; label: string; tone?: 'auto' | 'neutral' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0
  const ext = max > 0 ? Math.min(100 - pct, (extra / max) * 100) : 0
  const high = tone !== 'neutral' && pct + ext >= 90
  return (
    <div className="set-meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-label={label}>
      <i style={{ width: `${pct}%` }} data-high={high || undefined} />
      {ext > 0 && <b style={{ left: `${pct}%`, width: `${ext}%` }} />}
    </div>
  )
}

/** Small inline notice inside a tab: info / attention / critical / positive. */
export function Notice({ tone = 'info', icon, title, children, actions, role }: { tone?: 'info' | 'attention' | 'critical' | 'positive' | 'neutral'; icon?: ReactNode; title?: ReactNode; children?: ReactNode; actions?: ReactNode; role?: 'status' | 'alert' }) {
  return (
    <div className="set-notice" data-tone={tone} role={role}>
      {icon && <span className="set-notice-ico" aria-hidden>{icon}</span>}
      <div className="grow">
        {title && <p className="t-strong">{title}</p>}
        {children && <div className="t-small c2 set-notice-body">{children}</div>}
      </div>
      {actions && <div className="set-notice-actions">{actions}</div>}
    </div>
  )
}

/**
 * Confirmation for irreversible actions that must be typed out (workspace name, email address).
 * Focus is trapped while open and returns to the opener on close; Esc cancels.
 */
export function TypedConfirmDialog({ open, title, body, phrase, phraseLabel, confirmLabel, busy, error, onConfirm, onCancel, caseInsensitive }: {
  open: boolean; title: string; body: ReactNode; phrase: string; phraseLabel: ReactNode; confirmLabel: string; busy?: boolean; error?: ReactNode
  onConfirm: () => void; onCancel: () => void; caseInsensitive?: boolean
}) {
  return createPortal(
    <AnimatePresence>
      {open && <TypedInner key="t" {...{ title, body, phrase, phraseLabel, confirmLabel, busy, error, onConfirm, onCancel, caseInsensitive }} />}
    </AnimatePresence>,
    document.body,
  )
}

function TypedInner({ title, body, phrase, phraseLabel, confirmLabel, busy, error, onConfirm, onCancel, caseInsensitive }: {
  title: string; body: ReactNode; phrase: string; phraseLabel: ReactNode; confirmLabel: string; busy?: boolean; error?: ReactNode
  onConfirm: () => void; onCancel: () => void; caseInsensitive?: boolean
}) {
  const [v, setV] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const restore = useRef<HTMLElement | null>(document.activeElement as HTMLElement)
  const id = useId()
  const norm = (s: string) => (caseInsensitive ? s.trim().toLowerCase() : s.trim())
  const ok = norm(v) === norm(phrase)
  useEffect(() => {
    const id = requestAnimationFrame(() => input.current?.focus())
    const prev = restore.current
    return () => { cancelAnimationFrame(id); prev?.focus?.() }
  }, [])
  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape' && !busy) { e.preventDefault(); onCancel() }
    if (e.key === 'Tab') {
      const els = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]') ?? [])]
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }
  return (
    <motion.div className="drawer-scrim dialog-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }} onMouseDown={() => !busy && onCancel()}>
      <motion.div ref={ref} className="dialog set-typed" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-b`}
        initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: t.fast }} exit={{ scale: 0.98, opacity: 0, transition: t.exit }}
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <h2 className="t-heading" id={`${id}-t`}>{title}</h2>
        <div className="c2 dialog-body" id={`${id}-b`}>{body}</div>
        <form onSubmit={e => { e.preventDefault(); if (ok && !busy) onConfirm() }} noValidate>
          <label htmlFor={`${id}-i`} className="set-typed-label t-small">{phraseLabel}</label>
          <input ref={input} id={`${id}-i`} className="input" value={v} onChange={e => setV(e.target.value)} autoComplete="off" spellCheck={false}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} />
          {error && <p className="field-error" id={`${id}-e`} role="alert"><AlertCircle size={12} />{error}</p>}
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button type="submit" variant="danger" className="set-danger-fill" disabled={!ok} loading={busy}>{confirmLabel}</Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
