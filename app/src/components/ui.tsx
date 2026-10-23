import { forwardRef, memo, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { Level, Stance } from '../api/types'
import { LEVEL_LABEL, STANCE_LABEL } from '../lib/format'
import './ui.css'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'ai' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
  kbd?: string
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'secondary', size = 'md', icon, kbd, loading, children, className = '', ...rest }, ref,
) {
  return (
    <button ref={ref} className={`btn btn-${variant} btn-${size} ${children ? '' : 'btn-icon'} ${className}`} data-loading={loading || undefined} {...rest}>
      {loading ? <Loader2 size={14} className="spin" aria-hidden /> : icon}
      {children && <span className="btn-label">{children}</span>}
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  )
})

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

const HUES = [186, 28, 250, 45, 200, 330, 95, 220, 12, 160]
export function Avatar({ name, size = 24, seed, internal }: { name: string; size?: number; seed?: string; internal?: boolean }) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('')
  const h = HUES[[...(seed ?? name)].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]
  return (
    <span
      className={`avatar ${internal ? 'avatar-internal' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.4, ['--h' as string]: h }}
      aria-hidden
    >{initials}</span>
  )
}

const STANCE_GLYPH: Record<Stance, string> = {
  opposed: 'M2 5h6', concerned: 'M2 6.5 5 3.5 8 6.5', neutral: 'M5 5m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0',
  supporter: 'M2 3.5 5 6.5 8 3.5', champion: 'M5 2v6M2 5h6', unknown: 'M5 5m-0.5 0a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0-1 0',
}
export function StanceBadge({ stance, compact }: { stance: Stance; compact?: boolean }) {
  return (
    <span className={`stance stance-${stance} ${compact ? 'stance-compact' : ''}`}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d={STANCE_GLYPH[stance]} /></svg>
      {!compact && STANCE_LABEL[stance]}
      {compact && <span className="sr-only">{STANCE_LABEL[stance]}</span>}
    </span>
  )
}

export function LevelMeter({ value, label }: { value: Level; label: string }) {
  return (
    <span className="meter" role="img" aria-label={`${label}: ${LEVEL_LABEL[value]}`} title={`${label}: ${LEVEL_LABEL[value]}`}>
      {[1, 2, 3, 4].map(i => <i key={i} data-on={i <= value || undefined} />)}
    </span>
  )
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'attention' | 'critical' | 'positive' | 'ai'; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}><i />{children}</span>
}

export function Skeleton({ w = '100%', h = 12, r = 4 }: { w?: number | string; h?: number; r?: number }) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} aria-hidden />
}

/** Citation chip: superscript-like reference to a source record. */
export function Cite({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  return (
    <button className="cite" onClick={onClick} aria-label={`Source ${n}: ${label}`} title={label}>{n}</button>
  )
}

/** Weekly bars drawn as two paths (history + recent tail) — 2 DOM nodes per row instead of one per week. */
export const Sparkline = memo(function Sparkline({ data, width = 96, height = 22, highlightTail = 8 }: { data: number[]; width?: number; height?: number; highlightTail?: number }) {
  const max = Math.max(1, ...data)
  const bw = width / data.length
  let head = '', tail = ''
  data.forEach((v, i) => {
    const h = v === 0 ? 1 : Math.max(2, (v / max) * (height - 2))
    const x = (i * bw + 0.5).toFixed(1), w = Math.max(1, bw - 1.5).toFixed(1)
    const d = `M${x} ${(height - h).toFixed(1)}h${w}v${h.toFixed(1)}h-${w}z`
    if (i >= data.length - highlightTail) tail += d; else head += d
  })
  return (
    <svg width={width} height={height} className="spark" aria-hidden>
      <path d={head} />
      <path d={tail} data-tail />
    </svg>
  )
})
