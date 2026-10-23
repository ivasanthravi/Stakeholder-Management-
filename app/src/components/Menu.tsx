import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { popVariants } from '../lib/motion'
import './menu.css'

export interface MenuOption<T extends string = string> {
  value: T
  label: ReactNode
  hint?: ReactNode
  icon?: ReactNode
}

interface Props<T extends string> {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  options: MenuOption<T>[]
  selected?: T[]
  multi?: boolean
  onSelect: (v: T) => void
  label: string
  align?: 'start' | 'end'
}

/** Anchored listbox menu. Arrow keys / type-ahead / Enter / Esc. Focus returns to the anchor. */
export function Menu<T extends string>({ anchor, open, onClose, options, selected = [], multi, onSelect, label, align = 'start' }: Props<T>) {
  return createPortal(
    <AnimatePresence>
      {open && anchor && <MenuInner key="m" {...{ anchor, onClose, options, selected, multi, onSelect, label, align }} />}
    </AnimatePresence>,
    document.body,
  )
}

function MenuInner<T extends string>({ anchor, onClose, options, selected, multi, onSelect, label, align }: Omit<Props<T>, 'open'> & { anchor: HTMLElement; selected: T[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(Math.max(0, options.findIndex(o => selected.includes(o.value))))
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const w = ref.current?.offsetWidth ?? 200
    const h = ref.current?.offsetHeight ?? 200
    const below = r.bottom + 6 + h < window.innerHeight
    setPos({
      top: below ? r.bottom + 6 : r.top - h - 6,
      left: Math.min(window.innerWidth - w - 8, align === 'end' ? r.right - w : r.left),
    })
    ref.current?.focus()
  }, [anchor, align])

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', down)
    return () => { window.removeEventListener('mousedown', down); anchor.focus() }
  }, [anchor, onClose])

  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + options.length) % options.length) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(options[active].value); if (!multi) onClose() }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onClose() }
    else if (e.key.length === 1) {
      const i = options.findIndex(o => typeof o.label === 'string' && o.label.toLowerCase().startsWith(e.key.toLowerCase()))
      if (i >= 0) setActive(i)
    }
  }

  return (
    <motion.div
      ref={ref}
      className="menu"
      role="listbox"
      aria-label={label}
      aria-multiselectable={multi || undefined}
      aria-activedescendant={`menu-opt-${active}`}
      tabIndex={-1}
      onKeyDown={onKey}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      variants={popVariants} initial="initial" animate="animate" exit="exit"
    >
      {options.map((o, i) => {
        const on = selected.includes(o.value)
        return (
          <div
            key={o.value} id={`menu-opt-${i}`} role="option" aria-selected={on}
            className="menu-item" data-active={i === active || undefined}
            onMouseMove={() => setActive(i)}
            onClick={() => { onSelect(o.value); if (!multi) onClose() }}
          >
            {multi ? <span className="menu-check" data-on={on || undefined}>{on && <Check size={11} strokeWidth={3} />}</span> : null}
            {o.icon}
            <span className="grow">{o.label}</span>
            {o.hint && <span className="menu-hint">{o.hint}</span>}
            {!multi && on && <Check size={14} className="menu-tick" />}
          </div>
        )
      })}
    </motion.div>
  )
}
