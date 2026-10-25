import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CornerDownLeft, Gavel, Handshake, Home, Map as MapIcon, MessagesSquare, MessageCircleQuestionMark, Plus, Search, Users, Clock, Target, Settings, Loader2 } from 'lucide-react'
import { useApp, type CreateKind } from './context'
import { useLookups, useSearch } from '../api/hooks'
import { RECENT_KEY, useSession } from '../session/session'
import { fuzzy } from '../lib/fuzzy'
import { Avatar, Kbd, StanceBadge } from '../components/ui'
import type { Stance } from '../api/types'
import { t } from '../lib/motion'
import { MOD } from '../lib/hotkeys'
import { fmtRelative } from '../lib/format'
import { openCopilot } from '../lib/copilotBus'
import './palette.css'

interface Item { id: string; group: string; label: string; sub?: string; icon: ReactNode; hint?: string; path?: string; run?: () => void; keywords?: string; stance?: Stance }
interface Recent { id: string; group: string; label: string; sub?: string; path: string }

const readRecent = (): Recent[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && x.path) : [] } catch { return [] } }
const pushRecent = (r: Recent) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent().filter(x => x.id !== r.id)].slice(0, 6))) } catch { /* storage unavailable */ } }

const SHORTCUTS: [string, string][] = [
  [`${MOD} K`, 'Command palette'], [`${MOD} J`, 'Ask copilot'], ['G H', 'Go to Home'], ['G S', 'Go to Stakeholders'], ['G M', 'Relationship map'],
  ['G O / G I', 'Organizations / Initiatives'], ['G E / G D / G C', 'Engagements / Decisions / Commitments'],
  ['C then P', 'New stakeholder'], ['C then E', 'Log engagement'], ['C then M', 'New commitment'],
  ['J / K', 'Move through rows'], ['Space', 'Peek record'], ['↵', 'Open record'], ['X', 'Select row'],
  ['V T / V M', 'Table / Map view'], ['F', 'Focus filter'], ['Esc', 'Close panel'], [`${MOD} Z`, 'Undo last change'], ['[ / ]', 'Previous / next tab'],
]

export function CommandPalette() {
  const { paletteOpen, closePalette, paletteSeed, paletteNonce } = useApp()
  return <AnimatePresence>{paletteOpen && <Palette key={paletteNonce} seed={paletteSeed} onClose={closePalette} />}</AnimatePresence>
}

function Palette({ seed, onClose }: { seed: string; onClose: () => void }) {
  const nav = useNavigate()
  const { openCreate } = useApp()
  const { can } = useSession()
  const [q, setQ] = useState(seed)
  const [debounced, setDebounced] = useState(seed)
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(document.activeElement as HTMLElement)
  const lookups = useLookups()

  useEffect(() => () => { if (!document.querySelector('.pal[data-open]')) restoreFocus.current?.focus?.() }, [])
  useEffect(() => { const h = setTimeout(() => setDebounced(q), 120); return () => clearTimeout(h) }, [q])

  const mode = q.startsWith('?') ? 'help' : q.startsWith('>') ? 'commands' : q.startsWith('@') ? 'people' : q.startsWith('#') ? 'initiatives' : 'all'
  const term = mode === 'all' ? q.trim() : q.slice(1).trim()
  const searchTerm = mode === 'all' ? debounced.trim() : mode === 'people' ? debounced.slice(1).trim() : ''
  const search = useSearch(searchTerm)

  const go = (path: string, recent?: Omit<Recent, 'path'>) => () => { if (recent) pushRecent({ ...recent, path }); onClose(); nav(path) }

  const commands = useMemo<Item[]>(() => {
    const create = (kind: CreateKind) => () => { onClose(); openCreate(kind) }
    return [
      { id: 'n-home', group: 'Navigate', label: 'Go to Home', icon: <Home size={15} />, hint: 'G H', path: '/' },
      { id: 'n-sh', group: 'Navigate', label: 'Go to Stakeholders', icon: <Users size={15} />, hint: 'G S', path: '/stakeholders' },
      { id: 'n-map', group: 'Navigate', label: 'Open relationship map', icon: <MapIcon size={15} />, hint: 'G M', path: '/stakeholders?view=map' },
      { id: 'n-org', group: 'Navigate', label: 'Go to Organizations', icon: <Building2 size={15} />, hint: 'G O', path: '/organizations' },
      { id: 'n-ini', group: 'Navigate', label: 'Go to Initiatives', icon: <Target size={15} />, hint: 'G I', path: '/initiatives' },
      { id: 'n-eng', group: 'Navigate', label: 'Go to Engagements', icon: <MessagesSquare size={15} />, hint: 'G E', path: '/engagements' },
      { id: 'n-dec', group: 'Navigate', label: 'Go to Decisions', icon: <Gavel size={15} />, hint: 'G D', path: '/decisions' },
      { id: 'n-com', group: 'Navigate', label: 'Go to Commitments', icon: <Handshake size={15} />, hint: 'G C', path: '/commitments' },
      { id: 'n-overdue', group: 'Navigate', label: 'Overdue commitments', icon: <Handshake size={15} />, path: '/commitments?view=overdue', keywords: 'late' },
      { id: 'n-set', group: 'Navigate', label: 'Workspace settings', icon: <Settings size={15} />, hint: 'G ,', path: '/settings', keywords: 'members invite roles' },
      ...(can('stakeholder.create') ? [{ id: 'c-p', group: 'Create', label: 'New stakeholder', icon: <Plus size={15} />, hint: 'C P', run: create('stakeholder') }] : []),
      ...(can('organization.create') ? [{ id: 'c-o', group: 'Create', label: 'New organization', icon: <Plus size={15} />, hint: 'C O', run: create('organization') }] : []),
      ...(can('engagement.create') ? [{ id: 'c-e', group: 'Create', label: 'Log engagement', icon: <Plus size={15} />, hint: 'C E', run: create('engagement') }] : []),
      ...(can('commitment.create') ? [{ id: 'c-m', group: 'Create', label: 'New commitment', icon: <Plus size={15} />, hint: 'C M', run: create('commitment') }] : []),
      ...(can('decision.create') ? [{ id: 'c-d', group: 'Create', label: 'Record decision', icon: <Plus size={15} />, hint: 'C D', run: create('decision') }] : []),
      ...(can('initiative.create') ? [{ id: 'c-i', group: 'Create', label: 'New initiative', icon: <Plus size={15} />, hint: 'C I', run: create('initiative') }] : []),
    ]
  }, [can, onClose, openCreate])

  const initiatives = useMemo<Item[]>(() => (lookups.data?.initiatives ?? []).map(i => ({
    id: `i-${i.id}`, group: 'Initiatives', label: i.name, sub: i.code, keywords: i.code, icon: <span className="pal-code mono">{i.code}</span>, path: `/initiatives/${i.id}`,
  })), [lookups.data])

  const remote = useMemo<Item[]>(() => {
    const r = search.data
    if (!r || !searchTerm) return []
    return [
      ...r.stakeholders.map(s => ({ id: s.id, group: 'Stakeholders', label: s.name, sub: [s.title, s.org].filter(Boolean).join(' · '), icon: <Avatar name={s.name} size={20} />, stance: s.stance, path: `/stakeholders/${s.id}` })),
      ...(mode === 'people' ? [] : [
        ...r.organizations.map(o => ({ id: o.id, group: 'Organizations', label: o.name, sub: o.shortName ?? undefined, icon: <Building2 size={15} />, path: `/organizations/${o.id}` })),
        ...r.commitments.map(c => ({ id: c.id, group: 'Commitments', label: c.title, sub: c.key, keywords: c.key, icon: <Handshake size={15} />, path: `/commitments?open=${c.id}` })),
        ...r.decisions.map(d => ({ id: d.id, group: 'Decisions', label: d.title, sub: d.key, keywords: d.key, icon: <Gavel size={15} />, path: `/decisions?open=${d.id}` })),
        ...r.engagements.map(e => ({ id: e.id, group: 'Engagements', label: e.title, sub: `${e.key} · ${fmtRelative(e.occurredAt)}`, keywords: e.key, icon: <MessagesSquare size={15} />, path: `/engagements/${e.id}` })),
      ]),
    ]
  }, [search.data, searchTerm, mode])

  const results = useMemo(() => {
    if (mode === 'help') return []
    const local = mode === 'commands' ? commands : mode === 'initiatives' ? initiatives : mode === 'people' ? [] : [...commands, ...initiatives]
    if (!term) {
      if (mode !== 'all') return local.slice(0, 40).map(item => ({ item, hits: [] as number[] }))
      const recent: Item[] = readRecent().map(r => ({ ...r, group: 'Recent', icon: <Clock size={14} /> }))
      return [...recent, ...commands.filter(c => c.group === 'Navigate').slice(0, 5), ...commands.filter(c => c.group === 'Create').slice(0, 3)].map(item => ({ item, hits: [] as number[] }))
    }
    const toks = term.toLowerCase().split(/\s+/).filter(Boolean)
    const scoreLocal = (item: Item) => {
      let score = 0; const hits: number[] = []
      for (const tok of toks) {
        const m = fuzzy(tok, item.label); const k = item.keywords ? fuzzy(tok, item.keywords) : null
        if (!m && !k) return null
        if (m) { score += m.score; hits.push(...m.hits) } else score += (k?.score ?? 0) - 60
      }
      return { item, hits, score: score + (item.group === 'Navigate' ? 30 : 0) }
    }
    const locals = local.map(scoreLocal).filter(Boolean).sort((a, b) => b!.score - a!.score).slice(0, 6) as { item: Item; hits: number[] }[]
    const remotes = remote.map(item => ({ item, hits: fuzzy(toks[0], item.label)?.hits ?? [] }))
    const all = [...remotes.filter(r => r.item.group === 'Stakeholders'), ...locals, ...remotes.filter(r => r.item.group !== 'Stakeholders')]
    const order: string[] = []
    all.forEach(s => { if (!order.includes(s.item.group)) order.push(s.item.group) })
    const ranked = order.flatMap(g => all.filter(s => s.item.group === g).slice(0, 6))
    if (mode !== 'all') return ranked
    // Free text can always be asked as a question; it sits after record matches so Enter still opens an exact hit.
    const ask: Item = {
      id: 'ask', group: 'Ask', label: `Ask copilot: “${term}”`, icon: <MessageCircleQuestionMark size={15} />,
      run: () => { restoreFocus.current = null; onClose(); openCopilot({ message: term, send: true }) },
    }
    return [...ranked, { item: ask, hits: [] as number[] }]
  }, [mode, term, commands, initiatives, remote, onClose])

  useEffect(() => setSel(0), [q])
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const runItem = (item: Item) => {
    if (item.run) return item.run()
    if (item.path) go(item.path, ['Stakeholders', 'Organizations', 'Engagements', 'Initiatives'].includes(item.group) ? { id: item.id, group: item.group, label: item.label, sub: item.sub } : undefined)()
  }

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[sel]; if (r) runItem(r.item) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() }
    else if (e.key === 'Tab') e.preventDefault()
  }

  let lastGroup = ''
  const searching = !!searchTerm && (search.isFetching || debounced !== q)
  const activeId = results[sel] ? `pal-opt-${sel}` : undefined

  return (
    <motion.div className="pal-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, pointerEvents: 'none', transition: t.exit }} onMouseDown={onClose}>
      <motion.div
        className="pal" data-open role="dialog" aria-modal="true" aria-label="Command palette"
        initial={{ opacity: 0, scale: 0.97, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0, transition: t.fast }}
        exit={{ opacity: 0, scale: 0.985, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] } }}
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKey}
      >
        <div className="pal-input">
          {mode === 'all' ? (searching ? <Loader2 size={16} className="c3 spin" /> : <Search size={16} className="c3" />) : <span className="pal-mode">{{ help: 'Shortcuts', commands: 'Commands', people: 'People', initiatives: 'Initiatives' }[mode]}</span>}
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search people, organizations, commitments, commands…"
            role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={activeId} aria-autocomplete="list" spellCheck={false} />
          <Kbd>Esc</Kbd>
        </div>

        <div className="pal-list" id="pal-list" role="listbox" ref={listRef} aria-label="Results" aria-busy={searching || undefined}>
          {mode === 'help' ? (
            <div className="pal-help">{SHORTCUTS.map(([k, l]) => <div key={k} className="pal-help-row"><span>{l}</span><span className="row gap-1">{k.split(' ').map((x, i) => <Kbd key={i}>{x}</Kbd>)}</span></div>)}</div>
          ) : results.length === 0 || (results.length === 1 && results[0].item.id === 'ask' && !searching) ? (
            <>
              <div className="pal-empty">
                {searching ? <span className="c3">Searching…</span> : search.isError ? <span>Search is unavailable right now</span> : <><span>No matches for “{term}”</span><span className="c3 t-small">Try a name, an organization, or a record key like C-142</span></>}
              </div>
              {results.map(({ item }, i) => (
                <div key={item.id} id={`pal-opt-${i}`} data-idx={i} role="option" aria-selected={i === sel} className="pal-item" onClick={() => runItem(item)}>
                  {i === sel && <span className="pal-sel" />}<span className="pal-icon">{item.icon}</span><span className="truncate pal-label">{item.label}</span>
                </div>
              ))}
            </>
          ) : results.map(({ item, hits }, i) => {
            const header = item.group !== lastGroup ? (lastGroup = item.group) : null
            return (
              <div key={item.group + item.id}>
                {header && <div className="pal-group" role="presentation">{header === 'Recent' ? <><Clock size={11} /> Recent</> : header}</div>}
                <div id={`pal-opt-${i}`} data-idx={i} role="option" aria-selected={i === sel} className="pal-item" onMouseMove={() => sel !== i && setSel(i)} onClick={() => runItem(item)}>
                  {i === sel && <motion.span layoutId="pal-sel" className="pal-sel" transition={{ type: 'spring', stiffness: 700, damping: 48 }} />}
                  <span className="pal-icon">{item.icon}</span>
                  <span className="pal-text">
                    <span className="truncate pal-label"><Highlight text={item.label} hits={hits} /></span>
                    {item.sub && <span className="truncate pal-sub">{item.sub}</span>}
                  </span>
                  {item.stance && <StanceBadge stance={item.stance} compact />}
                  {item.hint && <span className="pal-hint">{item.hint.split(' ').map((k, j) => <Kbd key={j}>{k}</Kbd>)}</span>}
                  {i === sel && <CornerDownLeft size={13} className="pal-enter" />}
                </div>
              </div>
            )
          })}
        </div>

        <div className="pal-foot">
          <span className="row gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="row gap-1"><Kbd>↵</Kbd> open</span>
          <span className="grow" />
          <span className="row gap-1 c3"><Kbd>@</Kbd> people <Kbd>&gt;</Kbd> commands <Kbd>?</Kbd> shortcuts</span>
          <span className="row gap-1 c3"><MessageCircleQuestionMark size={12} /> Ask copilot <Kbd>{MOD}</Kbd><Kbd>J</Kbd></span>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Highlight({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>
  const set = new Set(hits)
  const out: ReactNode[] = []
  let buf = '', on = false
  const flush = (k: number) => { if (buf) out.push(on ? <mark key={k}>{buf}</mark> : <span key={k}>{buf}</span>); buf = '' }
  for (let i = 0; i < text.length; i++) { const h = set.has(i); if (h !== on) { flush(i); on = h } buf += text[i] }
  flush(text.length)
  return <>{out}</>
}
