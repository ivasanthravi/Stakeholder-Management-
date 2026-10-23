// Reusable renderer for evidence-backed briefings (stakeholder, decision, workspace).
// Facts, metrics, AI interpretation and recommendations look different on purpose: interpretation is never shown as fact.
import { motion, useReducedMotion } from 'motion/react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Gauge, Info, Sparkles } from 'lucide-react'
import { sourceHref, type Briefing, type BriefingItem, type BriefingSection, type BriefingSource } from '../api/ai'
import { fmtDate } from '../lib/format'
import { t, stagger } from '../lib/motion'
import './briefing.css'

export const BRIEFING_MODE_LABEL: Record<Briefing['mode'], string> = { brief: 'Brief', detailed: 'Detailed', prep: 'Meeting prep' }
export const LOCAL_ENGINE_LABEL = 'Built-in rules engine — facts and rules only, no AI interpretation'

/** Section order shown to the reader. Prep reads like a meeting sheet: talking points, then next steps, then the rest. */
export function orderSections(b: Briefing): BriefingSection[] {
  const secs = b.sections.filter(s => s.items.length)
  if (b.mode !== 'prep') return secs
  const rank = (id: string) => (id === 'prep' ? 0 : id === 'next' ? 1 : id === 'summary' ? 2 : 3)
  return secs.map((s, i) => ({ s, i })).sort((a, z) => rank(a.s.id) - rank(z.s.id) || a.i - z.i).map(x => x.s)
}

/** Citation numbers in reading order; only cited sources are listed. */
export function citationIndex(b: Briefing, sections = orderSections(b)) {
  const byRef = new Map(b.sources.map(s => [s.ref, s]))
  const num = new Map<string, number>()
  const list: BriefingSource[] = []
  for (const sec of sections) for (const it of sec.items) for (const c of it.cites) {
    const src = byRef.get(c)
    if (src && !num.has(c)) { num.set(c, list.length + 1); list.push(src) }
  }
  return { num, list, byRef }
}

export type RecOrigin = 'rule' | 'ai'
export function recommendationOrigin(it: BriefingItem, b: Briefing): RecOrigin {
  // The server tags every recommendation. Untagged (older cached) items are labelled AI unless no model ran —
  // claiming an AI suggestion came from a rule would overstate how deterministic it is.
  if (it.origin) return it.origin
  return b.engine.kind === 'local' || b.aiError ? 'rule' : 'ai'
}

export const ACTION_LABEL: Record<string, string> = {
  follow_up_commitment: 'Open commitment', review_decision: 'Open decision', log_engagement: 'Log engagement', assign_owner: 'Open profile',
}

export function engineDescription(b: Briefing) {
  return b.engine.kind === 'local' ? LOCAL_ENGINE_LABEL : `${b.engine.label} — AI interpretation is labelled and every statement is cited`
}
export function aiErrorText(e: string) {
  return e === 'cancelled' ? 'The AI interpretation was cancelled; showing recorded facts and rule-based recommendations.' : e
}

export function fmtGenerated(iso: string, now = Date.now()) {
  const ms = Date.parse(iso)
  const min = Math.round((now - ms) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const d = new Date(ms)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return new Date(now).toDateString() === d.toDateString() ? `today at ${time}` : `${fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })} at ${time}`
}

const sourceTip = (s: BriefingSource) => `${s.label}${s.at ? ` · ${fmtDate(s.at, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`

/** Markdown/plain-text rendering with sources, safe to paste into email or notes. */
export function briefingToMarkdown(b: Briefing): string {
  const sections = orderSections(b)
  const { num, list } = citationIndex(b, sections)
  const cites = (it: BriefingItem) => it.cites.map(c => num.get(c)).filter(Boolean).map(n => `[${n}]`).join('')
  const out: string[] = []
  const title = b.subject.type === 'stakeholder' ? (b.mode === 'prep' ? 'Meeting prep' : 'Briefing') : b.subject.type === 'decision' ? 'Decision briefing' : 'Briefing'
  out.push(`# ${title}: ${b.subject.name}`, '')
  out.push(`_${BRIEFING_MODE_LABEL[b.mode]} · ${b.engine.kind === 'local' ? LOCAL_ENGINE_LABEL : b.engine.label} · Generated ${new Date(b.generatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}_`, '')
  if (b.aiError) out.push(`> Note: ${aiErrorText(b.aiError)}`, '')
  if (b.unsupportedDropped > 0) out.push(`> ${b.unsupportedDropped} AI statement${b.unsupportedDropped === 1 ? ' was' : 's were'} removed because ${b.unsupportedDropped === 1 ? 'it' : 'they'} could not be tied to a source.`, '')
  for (const sec of sections) {
    const allInterp = sec.items.every(i => i.kind === 'interpretation')
    out.push(`## ${sec.title}${allInterp ? ' (AI interpretation — not recorded fact)' : ''}`, '')
    sec.items.forEach((it, i) => {
      const c = cites(it)
      const text = `${it.text}${c ? ` ${c}` : ''}`
      if (sec.id === 'prep') out.push(`${i + 1}. ${text}`)
      else if (it.kind === 'interpretation') out.push(`- ${allInterp ? '' : '*AI interpretation:* '}${text}`)
      else if (it.kind === 'recommendation') out.push(`- [${recommendationOrigin(it, b) === 'ai' ? 'AI suggestion' : 'Rule'}] ${text}`)
      else if (it.kind === 'metric') { out.push(`- ${text}`); if (it.method) out.push(`  - How it’s calculated: ${it.method}`) }
      else out.push(`- ${text}`)
    })
    out.push('')
  }
  if (list.length) {
    out.push('## Sources', '')
    list.forEach((s, i) => out.push(`${i + 1}. ${s.label} (${s.type}${s.at ? `, ${fmtDate(s.at, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''})`))
    out.push('')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

/* ── Components ─────────────────────────────────────────────────────── */

export interface BriefingViewProps {
  briefing: Briefing
  /** Dense rendering for side panels: sans text, condensed header, collapsible sources. */
  compact?: boolean
  /** Hide the header strip when the host renders its own. */
  hideHeader?: boolean
  /** Optional handler for recommendation actions; when absent, the action opens the first cited record. */
  onAction?: (item: BriefingItem, source: BriefingSource | undefined) => void
  /** Extra controls placed at the end of the header strip. */
  headerExtra?: ReactNode
}

export function BriefingView({ briefing: b, compact, hideHeader, onAction, headerExtra }: BriefingViewProps) {
  const reduce = useReducedMotion()
  const sections = useMemo(() => orderSections(b), [b])
  const { num, list, byRef } = useMemo(() => citationIndex(b, sections), [b, sections])
  const revealKey = `${b.subject.id}-${b.mode}-${b.generatedAt}`
  const hasInterp = sections.some(s => s.items.some(i => i.kind === 'interpretation'))

  return (
    <div className={`bv ${compact ? 'bv-compact' : ''}`} data-mode={b.mode}>
      {!hideHeader && <BriefingHeader b={b} compact={compact} extra={headerExtra} />}
      {b.aiError && (
        <div className="bv-banner" role="status">
          <AlertTriangle size={14} aria-hidden />
          <span>{aiErrorText(b.aiError)}</span>
        </div>
      )}
      <div className="bv-sections" key={revealKey}>
        {sections.map((sec, i) => (
          <motion.section key={sec.id} className={`bv-sec bv-sec-${sec.id}`} aria-labelledby={`bv-${revealKey}-${sec.id}`}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }} animate={{ opacity: 1, y: 0, transition: reduce ? { duration: 0.08 } : { ...t.base, ...stagger(i) } }}>
            <SectionHead id={`bv-${revealKey}-${sec.id}`} sec={sec} />
            {sec.id === 'prep'
              ? <ol className="bv-items bv-talking">{sec.items.map((it, j) => <li key={j} className="bv-item bv-point"><ItemText it={it} num={num} byRef={byRef} /></li>)}</ol>
              : <ul className="bv-items">{sec.items.map((it, j) => <Item key={j} it={it} b={b} num={num} byRef={byRef} mixed={!sec.items.every(x => x.kind === 'interpretation')} onAction={onAction} />)}</ul>}
          </motion.section>
        ))}
      </div>
      {list.length > 0 && (compact
        ? <details className="bv-sources bv-sources-fold"><summary className="t-caption">Sources <span className="num">{list.length}</span></summary><SourceList list={list} /></details>
        : <section className="bv-sources" aria-label="Sources"><h3 className="label-rule">Sources</h3><SourceList list={list} /></section>)}
      {!compact && (
        <p className="bv-foot t-small c3">
          {b.engine.kind === 'local'
            ? 'Assembled by rules from this workspace’s records. No language model was used.'
            : hasInterp ? 'Items marked “AI interpretation” are the model’s reading of the cited records, not recorded facts. Check the sources before acting on them.'
            : 'No AI interpretation is included in this briefing.'}
        </p>
      )}
    </div>
  )
}

export function BriefingHeader({ b, compact, extra }: { b: Briefing; compact?: boolean; extra?: ReactNode }) {
  return (
    <header className="bv-head">
      {!compact && <div className="bv-subject"><span className="t-caption c3">{b.subject.type === 'decision' ? 'Decision' : b.subject.type === 'stakeholder' ? 'Stakeholder' : 'Workspace'}</span><span className="t-strong">{b.subject.name}</span></div>}
      <div className="bv-meta t-small">
        {!compact && <span className="bv-mode">{BRIEFING_MODE_LABEL[b.mode]}</span>}
        <span className={`bv-engine ${b.engine.kind === 'local' ? '' : 'is-ai'}`} title={engineDescription(b)}>
          {b.engine.kind !== 'local' && <Sparkles size={12} aria-hidden />}
          {compact ? (b.engine.kind === 'local' ? 'Rules engine · no AI interpretation' : b.engine.label) : engineDescription(b)}
        </span>
        <span className="c3" title={new Date(b.generatedAt).toLocaleString('en-GB')}>Generated {fmtGenerated(b.generatedAt)}{b.cached ? ' · cached' : ''}</span>
        {b.unsupportedDropped > 0 && (
          <span className="bv-dropped" title="The model made statements it could not tie to a record in this workspace. They were removed rather than shown without evidence.">
            {b.unsupportedDropped} unsupported statement{b.unsupportedDropped === 1 ? '' : 's'} removed
          </span>
        )}
        {extra && <span className="bv-head-extra">{extra}</span>}
      </div>
    </header>
  )
}

function SectionHead({ id, sec }: { id: string; sec: BriefingSection }) {
  const allInterp = sec.items.every(i => i.kind === 'interpretation')
  return (
    <h3 id={id} className="bv-sec-h">
      <span>{sec.title}</span>
      {allInterp && <span className="bv-ai-tag"><Sparkles size={11} aria-hidden />AI interpretation</span>}
      {sec.id === 'next' && <span className="t-caption c3 bv-sec-note">Suggestions — you decide</span>}
    </h3>
  )
}

type Num = Map<string, number>
type ByRef = Map<string, BriefingSource>

function Item({ it, b, num, byRef, mixed, onAction }: { it: BriefingItem; b: Briefing; num: Num; byRef: ByRef; mixed: boolean; onAction?: BriefingViewProps['onAction'] }) {
  if (it.kind === 'metric') return <MetricItem it={it} num={num} byRef={byRef} />
  if (it.kind === 'interpretation') {
    return (
      <li className="bv-item bv-interp">
        {mixed && <span className="bv-ai-tag bv-ai-inline"><Sparkles size={11} aria-hidden />AI interpretation</span>}
        <ItemText it={it} num={num} byRef={byRef} />
      </li>
    )
  }
  if (it.kind === 'recommendation') return <RecItem it={it} b={b} num={num} byRef={byRef} onAction={onAction} />
  return <li className="bv-item bv-fact"><ItemText it={it} num={num} byRef={byRef} /></li>
}

function MetricItem({ it, num, byRef }: { it: BriefingItem; num: Num; byRef: ByRef }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <li className="bv-item bv-metric">
      <Gauge size={13} className="bv-metric-ico" aria-hidden />
      <div className="grow">
        <ItemText it={it} num={num} byRef={byRef} />
        {it.method && (
          <button className="bv-info" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)} title="How this is calculated">
            <Info size={12} aria-hidden /><span className="sr-only">How this is calculated</span>
          </button>
        )}
        {it.method && open && (
          <motion.p id={id} className="bv-method t-small" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: t.base }}>
            <span className="t-caption">How it’s calculated</span> {it.method}
          </motion.p>
        )}
      </div>
    </li>
  )
}

function RecItem({ it, b, num, byRef, onAction }: { it: BriefingItem; b: Briefing; num: Num; byRef: ByRef; onAction?: BriefingViewProps['onAction'] }) {
  const origin = recommendationOrigin(it, b)
  const first = it.cites.map(c => byRef.get(c)).find(Boolean)
  const href = first ? sourceHref(first) : '#'
  const label = (it.action && ACTION_LABEL[it.action]) || (first && href !== '#' ? 'Open record' : null)
  return (
    <li className={`bv-item bv-rec ${origin === 'ai' ? 'is-ai' : ''}`}>
      <ArrowRight size={13} className="bv-rec-ico" aria-hidden />
      <div className="grow"><ItemText it={it} num={num} byRef={byRef} /></div>
      <span className={`bv-origin ${origin === 'ai' ? 'is-ai' : ''}`} title={origin === 'ai' ? 'Suggested by the AI model from the cited records' : 'Produced by a fixed rule from recorded data'}>
        {origin === 'ai' ? 'AI' : 'Rule'}
      </span>
      {label && (onAction
        ? <button className="bv-act" onClick={() => onAction(it, first)}>{label}</button>
        : href !== '#' && <Link className="bv-act" to={href}>{label}</Link>)}
    </li>
  )
}

function ItemText({ it, num, byRef }: { it: BriefingItem; num: Num; byRef: ByRef }) {
  return (
    <span className="bv-text">
      {it.text}
      {it.cites.length > 0 && <span className="bv-cites">{it.cites.map(c => { const s = byRef.get(c); const n = num.get(c); return s && n ? <CiteChip key={c} n={n} s={s} /> : null })}</span>}
    </span>
  )
}

function CiteChip({ n, s }: { n: number; s: BriefingSource }) {
  const href = sourceHref(s)
  const tip = sourceTip(s)
  if (href === '#') return <span className="cite bv-cite" title={tip} aria-label={`Source ${n}: ${tip}`}>{n}</span>
  return <Link className="cite bv-cite" to={href} title={tip} aria-label={`Source ${n}: ${tip}`}>{n}</Link>
}

function SourceList({ list }: { list: BriefingSource[] }) {
  return (
    <ol className="bv-src-list">
      {list.map((s, i) => {
        const href = sourceHref(s)
        return (
          <li key={s.ref} className="bv-src">
            <span className="cite cite-static bv-cite" aria-hidden>{i + 1}</span>
            <span className="t-caption c3 bv-src-type">{s.type}</span>
            {href === '#' ? <span className="truncate grow">{s.label}</span> : <Link to={href} className="truncate grow bv-src-link">{s.label}</Link>}
            {s.at && <span className="c3 num bv-src-at">{fmtDate(s.at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** Skeleton that matches the section layout; used while a briefing is generated. */
export function BriefingSkeleton({ sections = 4, compact }: { sections?: number; compact?: boolean }) {
  return (
    <div className={`bv bv-skel ${compact ? 'bv-compact' : ''}`} aria-busy="true" aria-label="Preparing briefing">
      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="bv-sec">
          <span className="skeleton" style={{ width: 120 + (i % 3) * 30, height: 12, borderRadius: 4 }} />
          <div className="bv-skel-lines">
            {[92, 78, 64].slice(0, compact ? 2 : 3).map((w, j) => <span key={j} className="skeleton" style={{ width: `${w - i * 3}%`, height: compact ? 11 : 14, borderRadius: 4 }} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
