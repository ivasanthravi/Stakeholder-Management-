import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, Archive, ChevronDown, CornerDownRight, PanelRight, Plus, Search, X, Building2 } from 'lucide-react'
import { useLookups, usePatchStakeholder, useStakeholderPages, type StakeholderFilters } from '../../api/hooks'
import { ApiError, errorMessage } from '../../api/http'
import type { Stance, StakeholderRow } from '../../api/types'
import { Avatar, Button, Kbd, LevelMeter, Skeleton, Sparkline, StanceBadge } from '../../components/ui'
import { Menu, type MenuOption } from '../../components/Menu'
import { useHotkeys } from '../../lib/hotkeys'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { PeekPanel } from './PeekPanel'
import { t } from '../../lib/motion'
import { fmtRelative, LEVEL_LABEL, STANCE_LABEL } from '../../lib/format'
import { LoadError } from '../Home'
import './directory.css'

type SortKey = 'name' | 'stance' | 'influence' | 'last' | 'open'
const STANCE_ORDER: Stance[] = ['opposed', 'concerned', 'neutral', 'supporter', 'champion', 'unknown']
const STANCE_OPTS: MenuOption<Stance>[] = STANCE_ORDER.map(s => ({ value: s, label: STANCE_LABEL[s], icon: <StanceBadge stance={s} compact /> }))
const DAY = 86_400_000

export function Directory() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { peekId, setPeek, toast, announce, openCreate } = useApp()
  const { can } = useSession()
  const lookups = useLookups()
  const patch = usePatchStakeholder()

  const [text, setText] = useState('')
  const [minInf, setMinInf] = useState<number>(0)
  const [engaged, setEngaged] = useState<'any' | 'cold'>('any')
  const [archived, setArchived] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const [focus, setFocus] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ kind: 'stance' | 'f-stance' | 'f-inf' | 'f-init' | 'f-eng' | 'bulk-stance'; el: HTMLElement; ids?: string[] } | null>(null)
  const initiative = params.get('initiative')
  const orgFilter = params.get('org')
  const stances = useMemo(() => (params.get('stance')?.split(',').filter(Boolean) ?? []) as Stance[], [params])
  const setStances = (fn: (v: Stance[]) => Stance[]) => { const n = new URLSearchParams(params); const next = fn(stances); if (next.length) n.set('stance', next.join(',')); else n.delete('stance'); setParams(n, { replace: true }) }
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const q = useDeferredValue(text.trim())
  const filters: StakeholderFilters = {
    q: q || undefined, stance: stances, minInfluence: minInf || undefined, initiativeId: initiative ?? undefined, organizationId: orgFilter ?? undefined,
    cold: engaged === 'cold', archived, sort: sort?.key, dir: sort?.dir,
  }
  const query = useStakeholderPages(filters)
  const rows = useMemo(() => query.data?.pages.flatMap(p => p.items) ?? [], [query.data])
  const total = query.data?.pages[0]?.total ?? 0
  const loading = query.isPending
  const now = Date.now()

  useEffect(() => { setFocus(f => Math.min(f, Math.max(0, rows.length - 1))) }, [rows.length])
  useEffect(() => { if (query.data) announce(`${total} stakeholders`) }, [total, query.data, announce])
  useEffect(() => { setSelected(new Set()) }, [q, minInf, engaged, archived, initiative, orgFilter, params])

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 36, overscan: 14 })
  // Fetch the next page when the user nears the end of what's loaded.
  const items = virt.getVirtualItems()
  const lastIndex = items[items.length - 1]?.index ?? 0
  useEffect(() => { if (query.hasNextPage && !query.isFetchingNextPage && lastIndex >= rows.length - 30) void query.fetchNextPage() }, [lastIndex, rows.length, query])

  const moveFocus = useCallback((d: number) => {
    const n = Math.max(0, Math.min(rows.length - 1, focus + d))
    setFocus(n)
    virt.scrollToIndex(n, { align: 'auto' })
    if (peekId && rows[n]) setPeek(rows[n].id)
  }, [rows, virt, peekId, setPeek, focus])

  const toggleSelect = (i: number, range = false) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (range && anchorIdx != null) { const [a, b] = [Math.min(anchorIdx, i), Math.max(anchorIdx, i)]; for (let k = a; k <= b; k++) next.add(rows[k].id) }
      else { const id = rows[i].id; if (next.has(id)) next.delete(id); else next.add(id) }
      return next
    })
    setAnchorIdx(i)
  }

  /** Optimistic stance change with server confirmation; failures roll back and explain. Undo issues compensating writes. */
  const applyStance = async (ids: string[], s: Stance) => {
    const targets = rows.filter(r => ids.includes(r.id) && r.stance !== s)
    if (!targets.length) return
    const done: { id: string; from: Stance; version: number }[] = []
    let failure: unknown = null
    for (const r of targets) {
      try { const res = await patch.mutateAsync({ id: r.id, version: r.version, patch: { stance: s } }); done.push({ id: r.id, from: r.stance, version: res.version }) }
      catch (e) { failure = e; break }
    }
    if (failure) {
      toast(failure instanceof ApiError && failure.isConflict ? 'Someone else changed this stakeholder. The latest version is now shown — try again.' : errorMessage(failure), undefined, 'error')
      if (!done.length) return
    }
    const undo = async () => { for (const d of done) await patch.mutateAsync({ id: d.id, version: d.version, patch: { stance: d.from } }).catch(() => undefined) }
    toast(done.length === 1 ? `${targets[0].name} → ${STANCE_LABEL[s]}` : `${done.length} stakeholders → ${STANCE_LABEL[s]}`, () => { void undo() })
  }

  const latest = useRef({ setFocus, toggleSelect, setPeek, nav, setMenu, selected, canEdit: can('stakeholder.update') })
  latest.current = { setFocus, toggleSelect, setPeek, nav, setMenu, selected, canEdit: can('stakeholder.update') }
  const act = useMemo<RowActions>(() => ({
    focus: i => { latest.current.setFocus(i); gridRef.current?.focus({ preventScroll: true }) },
    toggle: (i, range) => latest.current.toggleSelect(i, range),
    peek: id => latest.current.setPeek(id),
    open: id => latest.current.nav(`/stakeholders/${id}`),
    stanceMenu: (el, id, isSel) => { if (latest.current.canEdit) latest.current.setMenu({ kind: 'stance', el, ids: isSel ? [...latest.current.selected] : [id] }) },
  }), [])

  const cellEl = (i: number, col: string) => scrollRef.current?.querySelector<HTMLElement>(`[data-row="${i}"] [data-col="${col}"]`) ?? null

  useHotkeys({
    j: () => moveFocus(1), ArrowDown: () => moveFocus(1),
    k: () => moveFocus(-1), ArrowUp: () => moveFocus(-1),
    x: () => rows[focus] && toggleSelect(focus),
    'shift+x': () => rows[focus] && toggleSelect(focus, true),
    ' ': () => { if (rows[focus]) setPeek(peekId === rows[focus].id ? null : rows[focus].id) },
    Enter: () => { if (rows[focus]) nav(`/stakeholders/${rows[focus].id}`) },
    'mod+Enter': () => { if (peekId) nav(`/stakeholders/${peekId}`) },
    Escape: () => { if (peekId) setPeek(null); else if (selected.size) setSelected(new Set()); else return false },
    f: () => searchRef.current?.focus(),
    s: () => { const el = cellEl(focus, 'stance'); if (el && can('stakeholder.update')) setMenu({ kind: 'stance', el, ids: selected.size ? [...selected] : [rows[focus].id] }) },
    'mod+a': () => setSelected(new Set(rows.map(r => r.id))),
  }, [rows, focus, peekId, selected, anchorIdx])

  const headerSort = (key: SortKey, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort?.key === key || (!sort && key === 'influence')
    const dir = sort?.key === key ? sort.dir : 'desc'
    return (
      <button className={`th th-btn ${align === 'right' ? 'th-right' : ''}`} role="columnheader" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        onClick={() => setSort(s => s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'stance' ? 'asc' : 'desc' })}>
        {label}
        <span className="th-arrow" data-on={active || undefined}>{dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />}</span>
      </button>
    )
  }

  const filtersActive = stances.length || minInf || engaged !== 'any' || initiative || orgFilter || text || archived
  const clearAll = () => { setText(''); setMinInf(0); setEngaged('any'); setArchived(false); setParams(new URLSearchParams(), { replace: true }) }
  const clearParam = (k: string) => { const n = new URLSearchParams(params); n.delete(k); setParams(n, { replace: true }) }
  const initName = lookups.data?.initiatives.find(i => i.id === initiative)
  const orgName = lookups.data?.organizations.find(o => o.id === orgFilter)?.name
  const selectedRow = menu?.ids?.length === 1 ? rows.find(r => r.id === menu.ids![0]) : undefined

  return (
    <div className="dir">
      <div className="toolbar">
        <label className="search-field">
          <Search size={14} className="c3" />
          <input ref={searchRef} value={text} onChange={e => setText(e.target.value)} placeholder="Filter by name, organization, title" aria-label="Filter stakeholders"
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') { (e.target as HTMLInputElement).blur(); gridRef.current?.focus() } }} />
          {text ? <button className="clear" aria-label="Clear text filter" onClick={() => setText('')}><X size={12} /></button> : <Kbd>F</Kbd>}
        </label>
        <FilterChip label="Stance" value={stances.length ? stances.map(s => STANCE_LABEL[s]).join(', ') : undefined} onOpen={el => setMenu({ kind: 'f-stance', el })} onClear={() => setStances(() => [])} />
        <FilterChip label="Influence" value={minInf ? `${LEVEL_LABEL[minInf]}+` : undefined} onOpen={el => setMenu({ kind: 'f-inf', el })} onClear={() => setMinInf(0)} />
        <FilterChip label="Initiative" value={initName ? initName.code : undefined} onOpen={el => setMenu({ kind: 'f-init', el })} onClear={() => clearParam('initiative')} />
        <FilterChip label="Engagement" value={engaged === 'cold' ? 'None in 60 days' : undefined} onOpen={el => setMenu({ kind: 'f-eng', el })} onClear={() => setEngaged('any')} />
        {orgFilter && (
          <span className="chip chip-on"><Building2 size={12} /><span className="chip-v">{orgName ?? 'Organization'}</span>
            <button className="chip-x" aria-label="Clear organization filter" onClick={() => clearParam('org')}><X size={12} /></button></span>
        )}
        {archived && <span className="chip chip-on"><Archive size={12} /><span className="chip-v">Archived</span><button className="chip-x" aria-label="Show active stakeholders" onClick={() => setArchived(false)}><X size={12} /></button></span>}
        {filtersActive ? <button className="link-btn" onClick={clearAll}>Clear all</button> : null}
        <span className="grow" />
        <span className="t-small c3 num" aria-live="polite">{query.data ? `${total.toLocaleString()} ${archived ? 'archived' : ''}` : ''}{query.isFetching && !loading ? ' · updating' : ''}</span>
        {!archived && <button className="link-btn" onClick={() => setArchived(true)} title="Show archived stakeholders">Archived</button>}
        {can('stakeholder.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openCreate('stakeholder', initiative ? { initiativeIds: [initiative] } : undefined)} kbd="C P">New</Button>}
      </div>

      <div className="grid-wrap" data-peek={peekId ? true : undefined}>
        <div className="grid" role="grid" ref={gridRef} tabIndex={0} aria-rowcount={total + 1} aria-label="Stakeholders" aria-multiselectable="true" aria-busy={loading || undefined}
          aria-activedescendant={rows[focus] ? `row-${rows[focus].id}` : undefined}>
          <div className="tr thead" role="row">
            <span className="th th-check" role="columnheader">
              <Check on={selected.size > 0 && selected.size === rows.length} mixed={selected.size > 0 && selected.size < rows.length}
                onClick={() => setSelected(selected.size ? new Set() : new Set(rows.map(r => r.id)))} label="Select all loaded" />
            </span>
            {headerSort('name', 'Name')}
            <span className="th" role="columnheader">Organization</span>
            {headerSort('stance', 'Stance')}
            {headerSort('influence', 'Influence / interest')}
            <span className="th" role="columnheader" title="Engagements per week, last 26 weeks">Activity · 26 wk</span>
            {headerSort('last', 'Last engaged', 'right')}
            {headerSort('open', 'Open', 'right')}
            <span className="th" role="columnheader">Owner</span>
          </div>

          <div className="tbody" ref={scrollRef} role="rowgroup">
            {query.isError ? <div className="empty"><LoadError error={query.error} onRetry={() => query.refetch()} /></div>
              : loading ? <SkeletonRows />
              : rows.length === 0 ? (
                filtersActive ? (
                  <div className="empty">
                    <Search size={18} className="c3" />
                    <p className="t-heading">No stakeholders match these filters</p>
                    <p className="c2 t-small">Try removing a filter, or search by organization.</p>
                    <Button size="sm" onClick={clearAll}>Clear filters</Button>
                  </div>
                ) : (
                  <div className="empty">
                    <Avatar name="? ?" size={28} />
                    <p className="t-heading">No stakeholders yet</p>
                    <p className="c2 t-small">Add the people whose support, approval or input your work depends on.</p>
                    {can('stakeholder.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openCreate('stakeholder')}>Add stakeholder</Button>}
                  </div>
                )
              ) : (
                <div role="presentation" style={{ height: virt.getTotalSize() + (query.hasNextPage ? 36 : 0), position: 'relative' }}>
                  {items.map(v => {
                    const r = rows[v.index]
                    return <DirRow key={r.id} r={r} i={v.index} start={v.start} now={now} isSel={selected.has(r.id)} isFocus={v.index === focus} isPeek={peekId === r.id} act={act} />
                  })}
                  {query.isFetchingNextPage && <div className="tr loading-more" style={{ transform: `translateY(${virt.getTotalSize()}px)` }}><span /><span className="td c3 t-small">Loading more…</span></div>}
                </div>
              )}
          </div>
        </div>

        <AnimatePresence>{peekId && <PeekPanel key="peek" id={peekId} onClose={() => setPeek(null)} />}</AnimatePresence>

        <AnimatePresence>
          {selected.size > 0 && (
            <motion.div className="bulk" initial={{ y: 16, opacity: 0, x: '-50%' }} animate={{ y: 0, opacity: 1, x: '-50%', transition: t.base }} exit={{ y: 12, opacity: 0, x: '-50%', transition: t.exit }} role="toolbar" aria-label="Bulk actions">
              <span className="bulk-count num"><motion.span key={selected.size} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: t.fast }}>{selected.size}</motion.span> selected</span>
              <span className="bulk-sep" />
              {can('stakeholder.update') && <Button size="sm" variant="ghost" onClick={e => setMenu({ kind: 'bulk-stance', el: e.currentTarget, ids: [...selected] })} kbd="S">Set stance</Button>}
              <span className="bulk-sep" />
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} kbd="Esc">Clear</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'stance' || menu?.kind === 'bulk-stance'} onClose={() => setMenu(null)} label="Set stance"
        options={STANCE_OPTS} selected={selectedRow ? [selectedRow.stance] : []} onSelect={s => { if (menu?.ids) void applyStance(menu.ids, s) }} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'f-stance'} onClose={() => setMenu(null)} label="Filter by stance" multi
        options={STANCE_OPTS} selected={stances} onSelect={s => setStances(v => (v.includes(s) ? v.filter(x => x !== s) : [...v, s]))} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'f-inf'} onClose={() => setMenu(null)} label="Minimum influence"
        options={[1, 2, 3, 4].map(n => ({ value: String(n), label: `${LEVEL_LABEL[n]}${n < 4 ? ' or higher' : ''}` }))} selected={[String(minInf)]} onSelect={v => setMinInf(Number(v))} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'f-init'} onClose={() => setMenu(null)} label="Initiative"
        options={(lookups.data?.initiatives ?? []).map(i => ({ value: i.id, label: i.name, hint: i.code }))} selected={initiative ? [initiative] : []}
        onSelect={v => { const n = new URLSearchParams(params); n.set('initiative', v); setParams(n, { replace: true }) }} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'f-eng'} onClose={() => setMenu(null)} label="Engagement"
        options={[{ value: 'any', label: 'Any' }, { value: 'cold', label: 'None in the last 60 days' }]} selected={[engaged]} onSelect={v => setEngaged(v as 'any' | 'cold')} />
    </div>
  )
}

function SkeletonRows() {
  return (
    <div aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="tr skel-row">
          <span /><span className="td td-name"><Skeleton w={22} h={22} r={11} /><Skeleton w={110 + (i * 37) % 80} h={10} /></span>
          <span className="td"><Skeleton w={90 + (i * 23) % 60} h={10} /></span><span className="td"><Skeleton w={72} h={18} /></span>
          <span className="td"><Skeleton w={60} h={10} /></span><span className="td"><Skeleton w={100} h={12} /></span>
          <span className="td td-right"><Skeleton w={40} h={10} /></span><span className="td" /><span className="td"><Skeleton w={60} h={10} /></span>
        </div>
      ))}
    </div>
  )
}

interface RowActions {
  focus: (i: number) => void
  toggle: (i: number, range?: boolean) => void
  peek: (id: string) => void
  open: (id: string) => void
  stanceMenu: (el: HTMLElement, id: string, isSel: boolean) => void
}

const DirRow = memo(function DirRow({ r, i, start, now, isSel, isFocus, isPeek, act }: {
  r: StakeholderRow; i: number; start: number; now: number; isSel: boolean; isFocus: boolean; isPeek: boolean; act: RowActions
}) {
  const last = r.lastEngagedAt ? Date.parse(r.lastEngagedAt) : null
  return (
    <div id={`row-${r.id}`} data-row={i} role="row" aria-rowindex={i + 2} aria-selected={isSel}
      className="tr" data-focus={isFocus || undefined} data-sel={isSel || undefined} data-peek={isPeek || undefined}
      style={{ transform: `translateY(${start}px)` }}
      onMouseDown={() => act.focus(i)}
      onClick={e => { if (e.shiftKey) act.toggle(i, true); else if (e.metaKey || e.ctrlKey) act.toggle(i); else act.peek(r.id) }}
      onDoubleClick={() => act.open(r.id)}>
      <span className="td td-check" role="gridcell" onClick={e => { e.stopPropagation(); act.toggle(i, e.shiftKey) }}><Check on={isSel} label={`Select ${r.name}`} /></span>
      <span className="td td-name" role="gridcell">
        <Avatar name={r.name} size={22} />
        <span className="truncate name">{r.name}</span>
        {r.title && <span className="truncate c3 title">{r.title}</span>}
      </span>
      <span className="td truncate c2" role="gridcell" title={r.primaryOrg?.name}>{r.primaryOrg?.name ?? <span className="c3">—</span>}</span>
      <span className="td" role="gridcell">
        <button className="cell-btn" data-col="stance" aria-label={`Stance: ${STANCE_LABEL[r.stance]}. Change`} onClick={e => { e.stopPropagation(); act.stanceMenu(e.currentTarget, r.id, isSel) }}>
          <StanceBadge stance={r.stance} />
          <ChevronDown size={12} className="cell-caret" />
        </button>
      </span>
      <span className="td row gap-3" role="gridcell">
        {r.influence ? <LevelMeter value={r.influence} label="Influence" /> : <span className="meter-empty" title="Influence not assessed">—</span>}
        {r.interest ? <LevelMeter value={r.interest} label="Interest" /> : <span className="meter-empty" title="Interest not assessed">—</span>}
      </span>
      <span className="td" role="gridcell"><Sparkline data={r.series} width={104} height={18} /></span>
      <span className={`td td-right num ${last && now - last > 60 * DAY ? 'stale' : 'c2'}`} role="gridcell">{fmtRelative(last, now)}</span>
      <span className="td td-right num" role="gridcell">{r.openCommitments ? <span className="open-count">{r.openCommitments}</span> : <span className="c3">—</span>}</span>
      <span className="td row gap-2" role="gridcell">
        {r.ownerName ? <><Avatar name={r.ownerName} size={18} internal /><span className="truncate c2 t-small">{r.ownerName.split(' ')[0]}</span></> : <span className="c3 t-small">Unassigned</span>}
        <span className="row-actions">
          <button className="icon-btn" aria-label={`Peek ${r.name}`} title="Peek (Space)" onClick={e => { e.stopPropagation(); act.peek(r.id) }}><PanelRight size={14} /></button>
          <button className="icon-btn" aria-label={`Open ${r.name}`} title="Open (↵)" onClick={e => { e.stopPropagation(); act.open(r.id) }}><CornerDownRight size={14} /></button>
        </span>
      </span>
    </div>
  )
})

export function FilterChip({ label, value, onOpen, onClear }: { label: string; value?: string; onOpen: (el: HTMLElement) => void; onClear: () => void }) {
  return (
    <span className={`chip ${value ? 'chip-on' : ''}`}>
      <button className="chip-main" onClick={e => onOpen(e.currentTarget.parentElement as HTMLElement)} aria-haspopup="listbox">
        <span className="chip-k">{label}</span>
        {value ? <span className="chip-v truncate">{value}</span> : <ChevronDown size={12} className="c3" />}
      </button>
      {value && <button className="chip-x" aria-label={`Clear ${label} filter`} onClick={onClear}><X size={12} /></button>}
    </span>
  )
}

function Check({ on, mixed, onClick, label }: { on: boolean; mixed?: boolean; onClick?: () => void; label: string }) {
  return (
    <button className="check" role="checkbox" aria-checked={mixed ? 'mixed' : on} aria-label={label} data-on={on || mixed || undefined} onClick={onClick} tabIndex={-1}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>{mixed ? <path d="M2.5 5h5" /> : <path d="M2 5.2 4.1 7.2 8 3" className="check-path" />}</svg>
    </button>
  )
}
