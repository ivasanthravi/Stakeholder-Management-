// Searchable record picker (combobox). Used for owners, organizations, initiatives and stakeholders.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { fuzzy } from '../lib/fuzzy'
import { popVariants } from '../lib/motion'
import './picker.css'

export interface PickerOption { value: string; label: string; sub?: string; icon?: ReactNode }

interface Props {
  label?: string
  options: PickerOption[]
  value: string | string[] | null
  onChange: (v: string | string[] | null) => void
  multi?: boolean
  placeholder?: string
  /** Async search for large sets (e.g. stakeholders). When provided, `options` are the current results. */
  onQuery?: (q: string) => void
  loading?: boolean
  emptyText?: string
  id?: string
  invalid?: boolean
  describedBy?: string
  /** Options already selected but possibly not in the current result set. */
  selectedOptions?: PickerOption[]
}

export function Picker({ options, value, onChange, multi, placeholder = 'Select…', onQuery, loading, emptyText = 'No matches', id, invalid, describedBy, selectedOptions = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const auto = useId()
  const listId = `${id ?? auto}-list`
  const wrap = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const values = Array.isArray(value) ? value : value ? [value] : []
  const known = useMemo(() => new Map([...selectedOptions, ...options].map(o => [o.value, o])), [options, selectedOptions])

  const filtered = useMemo(() => {
    if (onQuery || !q) return options.slice(0, 80)
    return options.map(o => ({ o, m: fuzzy(q, o.label) ?? (o.sub ? fuzzy(q, o.sub) : null) })).filter(x => x.m).sort((a, b) => b.m!.score - a.m!.score).map(x => x.o).slice(0, 80)
  }, [options, q, onQuery])

  useEffect(() => { if (onQuery) { const h = setTimeout(() => onQuery(q), 160); return () => clearTimeout(h) } }, [q, onQuery])
  useEffect(() => { setActive(0) }, [q])
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [open])

  const choose = (o: PickerOption) => {
    if (multi) onChange(values.includes(o.value) ? values.filter(v => v !== o.value) : [...values, o.value])
    else { onChange(o.value); setOpen(false); setQ('') }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(filtered.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); e.stopPropagation(); choose(filtered[active]) }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
    else if (e.key === 'Backspace' && !q && multi && values.length) onChange(values.slice(0, -1))
  }

  const single = !multi && values[0] ? known.get(values[0]) : null

  return (
    <div className="picker" ref={wrap} data-invalid={invalid || undefined}>
      <div className="input picker-control" onClick={() => { setOpen(true); input.current?.focus() }}>
        {multi && values.map(v => (
          <span key={v} className="tag-chip">{known.get(v)?.label ?? '…'}<button type="button" aria-label={`Remove ${known.get(v)?.label ?? ''}`} onClick={e => { e.stopPropagation(); onChange(values.filter(x => x !== v)) }}>×</button></span>
        ))}
        <input
          ref={input} id={id} value={open ? q : single ? '' : q} placeholder={single ? '' : values.length && multi ? '' : placeholder}
          onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-invalid={invalid || undefined} aria-describedby={describedBy}
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        />
        {single && !q && <span className="picker-value">{single.icon}{single.label}{single.sub && <span className="c3"> · {single.sub}</span>}</span>}
        {!multi && values[0] ? <button type="button" className="picker-clear" aria-label="Clear" onClick={e => { e.stopPropagation(); onChange(null) }}><X size={12} /></button> : <ChevronDown size={13} className="c3 picker-caret" />}
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul id={listId} role="listbox" className="picker-list" aria-multiselectable={multi || undefined} variants={popVariants} initial="initial" animate="animate" exit="exit">
            {loading && !filtered.length && <li className="picker-empty">Searching…</li>}
            {!loading && !filtered.length && <li className="picker-empty">{emptyText}</li>}
            {filtered.map((o, i) => (
              <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={values.includes(o.value)} data-active={i === active || undefined}
                className="picker-opt" onMouseMove={() => setActive(i)} onMouseDown={e => { e.preventDefault(); choose(o) }}>
                {o.icon}
                <span className="truncate grow">{o.label}{o.sub && <span className="c3"> · {o.sub}</span>}</span>
                {values.includes(o.value) && <Check size={13} className="picker-tick" />}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
