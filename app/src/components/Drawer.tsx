import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, Kbd } from './ui'
import { t } from '../lib/motion'
import { MOD } from '../lib/hotkeys'
import './drawer.css'

interface DrawerProps {
  open: boolean
  title: string
  subtitle?: ReactNode
  onClose: () => void
  /** When true, closing asks to discard unsaved changes first. */
  dirty?: boolean
  children: ReactNode
  footer?: ReactNode
  onSubmit?: () => void
  width?: number
}

/** Right-anchored editing surface. Focus is trapped while open and restored on close; Esc closes; ⌘↵ submits. */
export function Drawer(props: DrawerProps) {
  return createPortal(<AnimatePresence>{props.open && <DrawerInner key="d" {...props} />}</AnimatePresence>, document.body)
}

function DrawerInner({ title, subtitle, onClose, dirty, children, footer, onSubmit, width = 520 }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(document.activeElement as HTMLElement)
  const [confirming, setConfirming] = useState(false)

  const requestClose = () => { if (dirty && !confirming) setConfirming(true); else onClose() }

  useEffect(() => {
    // Respect a field that already took focus (autoFocus); otherwise focus the first control.
    if (!ref.current?.contains(document.activeElement)) {
      const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select, button:not([data-close])')
      first?.focus()
    }
    const prev = restore.current
    return () => { prev?.focus?.() }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); requestClose() }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) { e.preventDefault(); onSubmit() }
    if (e.key === 'Tab') {
      const els = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  return (
    <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }} onMouseDown={requestClose}>
      <motion.div
        ref={ref}
        className="drawer" role="dialog" aria-modal="true" aria-label={title}
        style={{ width: `min(${width}px, 100vw)` }}
        initial={{ x: 32, opacity: 0 }} animate={{ x: 0, opacity: 1, transition: t.panel }} exit={{ x: 24, opacity: 0, transition: t.exit }}
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}
      >
        <header className="drawer-head">
          <div className="grow">
            <h2 className="t-title">{title}</h2>
            {subtitle && <p className="t-small c2">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="sm" icon={<X size={15} />} aria-label="Close (Esc)" data-close onClick={requestClose} />
        </header>
        <form className="drawer-body" onSubmit={e => { e.preventDefault(); onSubmit?.() }} noValidate>
          {children}
          {/* Hidden submit so Enter in single-line inputs submits. */}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
        <AnimatePresence>
          {confirming && (
            <motion.div className="drawer-confirm" role="alertdialog" aria-label="Discard changes?" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
              <span className="grow">Discard unsaved changes?</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} data-autofocus>Keep editing</Button>
              <Button size="sm" variant="danger" onClick={onClose}>Discard</Button>
            </motion.div>
          )}
        </AnimatePresence>
        {footer !== undefined ? <footer className="drawer-foot">{footer}</footer> : null}
      </motion.div>
    </motion.div>
  )
}

export function DrawerActions({ submitting, label = 'Save', onCancel, onSubmit, disabled, extra }: { submitting?: boolean; label?: string; onCancel: () => void; onSubmit: () => void; disabled?: boolean; extra?: ReactNode }) {
  return (
    <>
      {extra}
      <span className="grow" />
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button variant="primary" onClick={onSubmit} loading={submitting} disabled={disabled} kbd={`${MOD}↵`}>{submitting ? 'Saving…' : label}</Button>
    </>
  )
}

/** Small centered confirmation for irreversible or significant actions. */
export function ConfirmDialog({ open, title, body, confirmLabel, danger, busy, onConfirm, onCancel }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="drawer-scrim dialog-scrim" key="c" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }} onMouseDown={onCancel}>
          <motion.div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}
            initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1, transition: t.fast }} exit={{ scale: 0.98, opacity: 0, transition: t.exit }}
            onMouseDown={e => e.stopPropagation()} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onCancel() }}>
            <h2 className="t-heading">{title}</h2>
            <div className="c2 dialog-body">{body}</div>
            <div className="dialog-actions">
              <Button variant="ghost" onClick={onCancel} autoFocus>Cancel</Button>
              <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

export { Kbd }
