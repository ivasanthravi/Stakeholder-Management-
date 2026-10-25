// Commitments register: agreed obligations between the team and a stakeholder (not general tasks).
// Also exports small pieces shared by the other "B" registers (Decisions, Engagements): paging, the
// completion toggle, the right-hand panel shell and the activity list.
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, ArrowUpRight, CheckCircle2, Pencil, Plus, Search, X } from 'lucide-react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { useActivity, useInvalidate, useList, useLookups, useRecord, wk } from '../../api/hooks'
import { ApiError, errorMessage, qs, request, ws } from '../../api/http'
import type { CommitmentStatus, Page } from '../../api/types'
import { Avatar, Button, Kbd, Skeleton } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Drawer'
import { CommitmentDrawer } from '../../forms/RecordForms'
import { useHotkeys } from '../../lib/hotkeys'
import { t } from '../../lib/motion'
import { COMMITMENT_STATUS_LABEL, daysFromToday, dueLabel, fmtDate, fmtRelative, isOpenStatus } from '../../lib/format'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { FilterChip } from '../directory/Directory'
import { LoadError } from '../Home'
import '../directory/directory.css'
import '../directory/peek.css'
import '../profile/profile.css'
import './registers-b.css'

/* ── Shared helpers ──────────────────────────────────────────────────────── */

type Params = Record<string, string | number | boolean | undefined | string[]>

/** Offset-paged register query ("Load more"). */
export function usePaged<T>(resource: string, params: Params, limit = 50, enabled = true) {
  return useInfiniteQuery({
    queryKey: wk(resource, 'paged', params, limit),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => request<Page<T>>(ws(`/${resource}${qs({ ...params, limit, offset: pageParam })}`), { signal }),
    getNextPageParam: (last, all) => { const n = all.reduce((a, p) => a + p.items.length, 0); return n < last.total ? n : undefined },
    placeholderData: keepPreviousData,
    enabled,
  })
}

export interface Toggleable { id: string; key: string; status: string; version?: number; direction?: 'ours' | 'theirs' }

/**
 * Optimistic complete/reopen with server confirmation. The check animates immediately; a failure rolls back
 * and explains (a version conflict refetches the latest); success offers Undo via a compensating write.
 */
export function useCommitmentToggle(onFlip?: (c: Toggleable) => void, onSaved?: (id: string, next: { status: string; version: number }) => void) {
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const [over, setOver] = useState<Record<string, string>>({})
  const inflight = useRef(new Set<string>())
  const drop = (id: string) => setOver(o => { const n = { ...o }; delete n[id]; return n })
  const statusOf = useCallback((c: { id: string; status: string }) => over[c.id] ?? c.status, [over])

  const flip = async (c: Toggleable) => {
    if (inflight.current.has(c.id)) return
    const from = over[c.id] ?? c.status
    const to = from === 'completed' ? 'open' : 'completed'
    inflight.current.add(c.id)
    onFlip?.(c)
    setOver(o => ({ ...o, [c.id]: to }))
    try {
      // Some briefs (e.g. an engagement's follow-through) carry neither version nor direction; read them first.
      // Direction is always re-sent: the server's partial update schema otherwise re-applies its default ("ours").
      const cur = c.version != null && c.direction ? { version: c.version, direction: c.direction } : await request<{ version: number; direction: 'ours' | 'theirs' }>(ws(`/commitments/${c.id}`))
      const res = await request<{ version: number }>(ws(`/commitments/${c.id}`), { method: 'PATCH', body: { status: to, direction: cur.direction, version: cur.version } })
      onSaved?.(c.id, { status: to, version: res.version })
      await invalidate()
      drop(c.id)
      toast(`${c.key} ${to === 'completed' ? 'completed' : 'reopened'}`, async () => {
        setOver(o => ({ ...o, [c.id]: from }))
        try {
          const back = await request<{ version: number }>(ws(`/commitments/${c.id}`), { method: 'PATCH', body: { status: from, direction: cur.direction, version: res.version } })
          onSaved?.(c.id, { status: from, version: back.version })
        }
        catch (e) { toast(e instanceof ApiError && e.isConflict ? `${c.key} changed since — showing the latest` : errorMessage(e), undefined, 'error') }
        await invalidate()
        drop(c.id)
      })
    } catch (e) {
      drop(c.id)
      toast(e instanceof ApiError && e.isConflict ? `${c.key} was changed by someone else — showing the latest` : errorMessage(e), undefined, 'error')
      await invalidate()
    } finally {
      inflight.current.delete(c.id)
    }
  }
  return { statusOf, flip }
}

/** The circular completion control (same markup and animation as the profile's commitment list). */
export function CCheck({ done, label, disabled, onToggle }: { done: boolean; label: string; disabled?: boolean; onToggle: () => void }) {
  return (
    <button className="ccheck" role="checkbox" aria-checked={done} aria-label={label} disabled={disabled} title={disabled ? 'You don’t have permission to update commitments' : undefined}
      onClick={e => { e.stopPropagation(); onToggle() }} onMouseDown={e => e.stopPropagation()}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.75" /><path d="M5 8.2 7.1 10.2 11 6" /></svg>
    </button>
  )
}

/** Right-hand overlay panel; same structure and motion as the directory's peek panel. */
export function SidePanel({ label, kind, onClose, children, foot, busy }: { label: string; kind: string; onClose: () => void; children: ReactNode; foot?: ReactNode; busy?: boolean }) {
  return (
    <motion.aside className="peek rb-panel" aria-label={label} aria-busy={busy || undefined}
      initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, transition: t.panel }} exit={{ opacity: 0, x: 16, transition: t.exit }}>
      <div className="peek-bar">
        <span className="t-caption c3">{kind}</span>
        <span className="grow" />
        <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onClose} aria-label="Close panel (Esc)" title="Close (Esc)" />
      </div>
      {children}
      {foot && <div className="peek-foot">{foot}</div>}
    </motion.aside>
  )
}

const VERB_TONE: Record<string, string> = { completed: 'positive', created: 'accent', archived: 'neutral', status_changed: 'accent', reopened: 'attention' }
const fmtVal = (v: unknown) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') || '—' : String(v).length > 48 ? String(v).slice(0, 48) + '…' : String(v))

/** Audit trail for one record: every change, by whom and when. */
export function ActivityList({ type, id, empty = 'No history yet.' }: { type: string; id: string; empty?: string }) {
  const act = useActivity(type, id)
  const events = act.data?.pages.flatMap(p => p.events) ?? []
  if (act.isError) return <LoadError error={act.error} onRetry={() => act.refetch()} />
  if (act.isPending) return <div className="rb-hist-skel" aria-hidden>{[0, 1, 2].map(i => <Skeleton key={i} h={10} w={`${55 + i * 12}%`} />)}</div>
  return (
    <>
      <ol className="rb-hist">
        {events.map(e => (
          <li key={e.id}>
            <span className="rb-hist-dot" data-tone={VERB_TONE[e.verb] ?? 'neutral'} aria-hidden />
            <span className="grow">
              <span className="rb-hist-sum">{e.summary}</span>
              <span className="t-small c3 rb-hist-meta">
                {e.actor ?? 'System'} · <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString('en-GB')}>{fmtRelative(e.createdAt)}</time>
                {e.changes && e.verb === 'updated' && Object.keys(e.changes).length > 0 && <> · {Object.entries(e.changes).slice(0, 2).map(([k, v]) => `${k}: ${fmtVal(v.from)} → ${fmtVal(v.to)}`).join('; ')}</>}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {!events.length && <p className="t-small c3">{empty}</p>}
      {act.hasNextPage && <button className="more" onClick={() => act.fetchNextPage()} disabled={act.isFetchingNextPage}>{act.isFetchingNextPage ? 'Loading…' : 'Load older'}</button>}
    </>
  )
}

/** Shared register tab strip (Home's .ftabs idiom with a sliding layoutId indicator). */
export function ViewTabs<T extends string>({ id, tabs, value, onChange, counts, label }: { id: string; tabs: readonly { id: T; label: string }[]; value: T; onChange: (v: T) => void; counts: Partial<Record<T, number | undefined>>; label: string }) {
  return (
    <LayoutGroup id={id}>
      <div className="ftabs rb-tabs" role="tablist" aria-label={label}>
        {tabs.map(tb => (
          <button key={tb.id} role="tab" aria-selected={value === tb.id} className="ftab" onClick={() => onChange(tb.id)}>
            {value === tb.id && <motion.span layoutId={`${id}-on`} className="ftab-on" transition={t.indicator} />}
            <span>{tb.label}</span>
            <span className="ftab-count num">{counts[tb.id] ?? '·'}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  )
}

export function SkeletonList({ cols, n = 12 }: { cols: number; n?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tr rb-row rb-skel">
          {Array.from({ length: cols }, (_, c) => <span key={c} className="td"><Skeleton w={c === 2 ? 140 + ((i * 37) % 120) : c === 0 ? 16 : 40 + ((i + c) * 13) % 50} h={c === 0 ? 16 : 10} r={c === 0 ? 8 : 4} /></span>)}
        </div>
      ))}
    </div>
  )
}

/* ── Commitments register ────────────────────────────────────────────────── */

export interface CommitmentRow {
  id: string; key: string; title: string; status: CommitmentStatus; direction: 'ours' | 'theirs'; dueDate: string | null; completedAt: string | null
  ownerId: string | null; ownerName: string | null; stakeholderId: string | null; stakeholderName: string | null
  initiativeId: string | null; initiativeCode: string | null; sourceEngagementId: string | null; sourceKey: string | null; version: number; updatedAt: string
}
interface CommitmentDetail extends Omit<CommitmentRow, 'ownerName' | 'stakeholderName' | 'initiativeCode' | 'sourceKey'> {
  description: string | null; archivedAt: string | null; createdAt: string
  owner: { id: string; name: string } | null; stakeholder: { id: string; name: string } | null
  initiative: { id: string; code: string; name: string } | null; sourceEngagement: { id: string; key: string; title: string } | null
}

const VIEWS = [
  { id: 'open', label: 'Open' }, { id: 'overdue', label: 'Overdue' }, { id: 'week', label: 'Due this week' }, { id: 'mine', label: 'Mine' }, { id: 'completed', label: 'Completed' },
] as const
type View = typeof VIEWS[number]['id']
const OPEN = 'open,in_progress'
/** Narrow-screen variant of dueLabel. */
const shortDue = (iso: string | null) => { if (!iso) return 'No date'; const d = daysFromToday(iso); return d < 0 ? `${-d}d late` : d === 0 ? 'Today' : d <= 7 ? `In ${d}d` : fmtDate(iso) }

export function Commitments() {
  const [params, setParams] = useSearchParams()
  const { can, me } = useSession()
  const { openCreate } = useApp()
  const lookups = useLookups()
  const myId = me?.user.id
  const view = (VIEWS.some(v => v.id === params.get('view')) ? params.get('view') : 'open') as View
  const openId = params.get('open')
  const initiative = params.get('initiative') ?? undefined
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim()) || undefined
  const [focus, setFocus] = useState(0)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [editing, setEditing] = useState<CommitmentDetail | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const setParam = useCallback((k: string, v: string | null) => {
    setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  }, [setParams])
  const setView = (v: View) => { setParams(p => { const n = new URLSearchParams(p); if (v === 'open') n.delete('view'); else n.set('view', v); return n }, { replace: true }); setFocus(0) }
  const setOpen = useCallback((id: string | null) => setParam('open', id), [setParam])

  const base = { q, initiativeId: initiative }
  const viewParams: Record<View, Params> = {
    open: { ...base, status: OPEN }, overdue: { ...base, overdue: 'true' }, week: { ...base, status: OPEN, dueWithinDays: 7 },
    mine: { ...base, status: OPEN, ownerId: myId }, completed: { ...base, status: 'completed' },
  }
  const paged = usePaged<CommitmentRow>('commitments', viewParams[view], 100)
  const cOpen = useList<CommitmentRow>('commitments', { ...viewParams.open, limit: 1 })
  const cOver = useList<CommitmentRow>('commitments', { ...viewParams.overdue, limit: 1 })
  const cMine = useList<CommitmentRow>('commitments', { ...viewParams.mine, limit: 1 }, { enabled: !!myId })
  const cDone = useList<CommitmentRow>('commitments', { ...viewParams.completed, limit: 1 })
  const cWeek = useList<CommitmentRow>('commitments', { ...viewParams.week, limit: 1 })
  const counts = { open: cOpen.data?.total, overdue: cOver.data?.total, week: cWeek.data?.total, mine: cMine.data?.total, completed: cDone.data?.total }

  const server = useMemo(() => paged.data?.pages.flatMap(p => p.items) ?? [], [paged.data])
  // Rows toggled in this view stay in place (struck through) until the view changes, so completing one doesn't make it vanish mid-gesture.
  const [kept, setKept] = useState<Map<string, { row: CommitmentRow; index: number }>>(new Map())
  useEffect(() => { setKept(new Map()) }, [view, q, initiative])
  const rows = useMemo(() => {
    const out = [...server]
    for (const { row, index } of [...kept.values()].sort((a, b) => a.index - b.index)) if (!out.some(r => r.id === row.id)) out.splice(Math.min(index, out.length), 0, row)
    return out
  }, [server, kept])
  const toggle = useCommitmentToggle(c => {
    const i = rows.findIndex(r => r.id === c.id)
    if (i >= 0) setKept(k => new Map(k).set(c.id, { row: rows[i], index: i }))
  }, (id, next) => setKept(k => {
    const e = k.get(id)
    if (!e) return k
    const status = next.status as CommitmentStatus
    return new Map(k).set(id, { ...e, row: { ...e.row, status, version: next.version, completedAt: status === 'completed' ? new Date().toISOString() : null } })
  }))

  const query = paged
  const loading = query.isPending
  const total = paged.data?.pages[0]?.total ?? 0
  const canUpdate = can('commitment.update')

  useEffect(() => { setFocus(f => Math.min(f, Math.max(0, rows.length - 1))) }, [rows.length])
  useEffect(() => {
    if (!openId) return
    const i = rows.findIndex(r => r.id === openId)
    if (i >= 0) setFocus(i)
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

  const move = (d: number) => {
    if (!rows.length) return
    const n = Math.max(0, Math.min(rows.length - 1, focus + d))
    setFocus(n)
    listRef.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.scrollIntoView({ block: 'nearest' })
    if (openId && rows[n]) setOpen(rows[n].id)
  }
  useHotkeys({
    j: () => move(1), ArrowDown: () => move(1), k: () => move(-1), ArrowUp: () => move(-1),
    Enter: () => { if (rows[focus]) setOpen(rows[focus].id) },
    d: () => { const r = rows[focus]; if (r && canUpdate) void toggle.flip(r) },
    // Re-declared so the "C D" chord still reaches decisions while D is bound here.
    'c d': () => { if (can('decision.create')) openCreate('decision') },
    f: () => searchRef.current?.focus(), '/': () => searchRef.current?.focus(),
    Escape: () => { if (openId) setOpen(null); else return false },
  }, [rows, focus, openId, canUpdate])

  const initName = lookups.data?.initiatives.find(i => i.id === initiative)
  const filtersActive = !!(q || initiative)
  const clearAll = () => { setText(''); setParam('initiative', null) }
  const now = Date.now()

  return (
    <>
      <header className="page-head">
        <div className="crumbs"><span className="here">Commitments</span></div>
        <span className="t-small c3 rb-sub">Agreed obligations between your team and a stakeholder</span>
        <span className="grow" />
        {can('commitment.create') && <Button size="sm" variant="primary" icon={<Plus size={14} />} kbd="C M" onClick={() => openCreate('commitment', initiative ? { initiativeId: initiative } : undefined)}>New commitment</Button>}
      </header>
      <div className="toolbar rb-toolbar">
        <ViewTabs id="cm-views" label="Commitment views" tabs={VIEWS} value={view} onChange={setView} counts={counts} />
        <span className="rb-vsep" />
        <label className="search-field">
          <Search size={14} className="c3" />
          <input ref={searchRef} value={text} onChange={e => setText(e.target.value)} placeholder="Filter by title or key" aria-label="Filter commitments"
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') { (e.target as HTMLInputElement).blur(); listRef.current?.focus() } }} />
          {text ? <button className="clear" aria-label="Clear text filter" onClick={() => setText('')}><X size={12} /></button> : <Kbd>F</Kbd>}
        </label>
        <FilterChip label="Initiative" value={initName?.code} onOpen={setMenu} onClear={() => setParam('initiative', null)} />
        {filtersActive && <button className="link-btn" onClick={clearAll}>Clear</button>}
        <span className="grow" />
        <span className="t-small c3 num rb-count" aria-live="polite">{query.data ? `${total} ${total === 1 ? 'commitment' : 'commitments'}` : ''}{query.isFetching && !loading ? ' · updating' : ''}</span>
      </div>

      <div className="grid-wrap rb-wrap" data-peek={openId ? true : undefined}>
        <div className="rb-list rb-cm" role="grid" aria-label="Commitments" tabIndex={0} ref={listRef} aria-busy={loading || undefined}
          aria-activedescendant={rows[focus] ? `cm-${rows[focus].id}` : undefined}>
          <div className="tr thead rb-head" role="row">
            <span className="th" role="columnheader"><span className="sr-only">Complete</span></span>
            <span className="th" role="columnheader">Key</span>
            <span className="th" role="columnheader">Commitment</span>
            <span className="th" role="columnheader">Stakeholder</span>
            <span className="th" role="columnheader">Who owes</span>
            <span className="th" role="columnheader">Owner</span>
            <span className="th" role="columnheader">{view === 'completed' ? 'Completed' : 'Due'}</span>
            <span className="th" role="columnheader">Initiative</span>
            <span className="th" role="columnheader">Source</span>
          </div>
          <div className="rb-body" role="rowgroup">
            {query.isError ? <div className="empty"><LoadError error={query.error} onRetry={() => query.refetch()} /></div>
              : loading ? <SkeletonList cols={9} />
              : rows.length === 0 ? <CommitmentsEmpty view={view} filtered={filtersActive} onClear={clearAll} />
              : rows.map((r, i) => {
                const status = toggle.statusOf(r)
                const done = status === 'completed'
                const overdue = isOpenStatus(status) && !!r.dueDate && daysFromToday(r.dueDate) < 0
                return (
                  <div key={r.id} id={`cm-${r.id}`} data-i={i} role="row" aria-selected={openId === r.id} className="tr rb-row"
                    data-focus={i === focus || undefined} data-open={openId === r.id || undefined} data-done={done || undefined}
                    onMouseDown={() => setFocus(i)} onClick={() => setOpen(openId === r.id ? null : r.id)}>
                    <span className="td rb-check" role="gridcell">
                      <CCheck done={done} disabled={!canUpdate} label={`Mark ${r.key} ${done ? 'open' : 'complete'}`} onToggle={() => void toggle.flip(r)} />
                    </span>
                    <span className="td mono c3" role="gridcell">{r.key}</span>
                    <span className="td truncate rb-title" role="gridcell"><span className="cstmt">{r.title}</span></span>
                    <span className="td truncate" role="gridcell">
                      {r.stakeholderId ? <Link className="rb-link" to={`/stakeholders/${r.stakeholderId}`} onClick={e => e.stopPropagation()}>{r.stakeholderName}</Link> : <span className="c3">—</span>}
                    </span>
                    <span className="td" role="gridcell"><span className="rb-dir" data-dir={r.direction}>{r.direction === 'theirs' ? 'They owe' : 'We owe'}</span></span>
                    <span className="td row gap-2" role="gridcell">
                      {r.ownerName ? <><Avatar name={r.ownerName} size={18} internal /><span className="truncate c2 t-small">{r.ownerName}</span></> : <span className="c3 t-small">Unassigned</span>}
                    </span>
                    <span className={`td t-small num truncate ${overdue ? 'is-overdue' : 'c2'}`} role="gridcell" title={r.dueDate ? fmtDate(r.dueDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : undefined}>
                      {done ? (r.completedAt ? `Done ${fmtRelative(r.completedAt, now).toLowerCase()}` : 'Completed') : status === 'cancelled' ? 'Cancelled'
                        : <><span className="rb-due-long">{dueLabel(r.dueDate)}</span><span className="rb-due-short">{shortDue(r.dueDate)}</span></>}
                    </span>
                    <span className="td" role="gridcell">{r.initiativeCode ? <span className="rb-code mono" title={lookups.data?.initiatives.find(x => x.id === r.initiativeId)?.name}>{r.initiativeCode}</span> : <span className="c3">—</span>}</span>
                    <span className="td" role="gridcell">
                      {r.sourceEngagementId ? <Link className="rb-src mono" to={`/engagements/${r.sourceEngagementId}`} onClick={e => e.stopPropagation()} title="Engagement this was agreed in">{r.sourceKey}</Link> : <span className="c3">—</span>}
                    </span>
                  </div>
                )
              })}
            {paged.hasNextPage && (
              <div className="rb-more"><Button size="sm" loading={paged.isFetchingNextPage} onClick={() => void paged.fetchNextPage()}>Load more</Button><span className="t-small c3 num">Showing {rows.length} of {total}</span></div>
            )}
          </div>
          {rows.length > 0 && (
            <div className="rb-foot t-small c3" aria-hidden>
              <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span><span><Kbd>↵</Kbd> open</span>{canUpdate && <span><Kbd>D</Kbd> complete</span>}<span><Kbd>Esc</Kbd> close</span>
            </div>
          )}
        </div>

        <AnimatePresence>
          {openId && <CommitmentPanel key="panel" id={openId} toggle={toggle} onClose={() => { setOpen(null); listRef.current?.focus({ preventScroll: true }) }} onEdit={setEditing} />}
        </AnimatePresence>
      </div>

      <Menu anchor={menu} open={!!menu} onClose={() => setMenu(null)} label="Initiative"
        options={(lookups.data?.initiatives ?? []).map(i => ({ value: i.id, label: i.name, hint: i.code }))} selected={initiative ? [initiative] : []}
        onSelect={v => setParam('initiative', v)} />
      <CommitmentDrawer open={!!editing} onClose={() => setEditing(null)} record={editing as never} />
    </>
  )
}

function CommitmentsEmpty({ view, filtered, onClear }: { view: View; filtered: boolean; onClear: () => void }) {
  const { can } = useSession()
  const { openCreate } = useApp()
  if (filtered) return (
    <div className="empty"><Search size={18} className="c3" /><p className="t-heading">No commitments match</p><p className="c2 t-small">Try a different search or clear the initiative filter.</p><Button size="sm" onClick={onClear}>Clear filters</Button></div>
  )
  const copy: Record<View, [string, string]> = {
    open: ['No open commitments', 'Commitments are agreed obligations between your team and a stakeholder — what you promised them, or what they promised you.'],
    overdue: ['Nothing overdue', 'Every open commitment is within its due date.'],
    week: ['Nothing due this week', 'No open commitment falls due in the next 7 days.'],
    mine: ['Nothing open assigned to you', 'Commitments you are accountable for will appear here.'],
    completed: ['No completed commitments yet', 'Completed commitments are kept here as a record of what was delivered.'],
  }
  return (
    <div className="empty">
      <CheckCircle2 size={18} className="c3" />
      <p className="t-heading">{copy[view][0]}</p>
      <p className="c2 t-small rb-empty-copy">{copy[view][1]}</p>
      {view === 'open' && can('commitment.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openCreate('commitment')}>New commitment</Button>}
    </div>
  )
}

function CommitmentPanel({ id, onClose, toggle, onEdit }: { id: string; onClose: () => void; toggle: ReturnType<typeof useCommitmentToggle>; onEdit: (d: CommitmentDetail) => void }) {
  const { can } = useSession()
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const rec = useRecord<CommitmentDetail>('commitments', id)
  const d = rec.data?.id === id ? rec.data : undefined
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const status = d ? toggle.statusOf(d) : null
  const done = status === 'completed'
  const overdue = !!d && isOpenStatus(status ?? '') && !!d.dueDate && daysFromToday(d.dueDate) < 0

  const archive = async () => {
    if (!d) return
    setBusy(true)
    try {
      await request(ws(`/commitments/${d.id}/archive`), { method: 'POST', body: {} })
      setConfirm(false); onClose(); await invalidate(); toast(`${d.key} archived`)
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false) }
  }

  const notFound = rec.error instanceof ApiError && rec.error.status === 404
  return (
    <SidePanel label={d ? `${d.key} ${d.title}` : 'Commitment'} kind="Commitment" onClose={onClose} busy={!d}
      foot={d && (
        <>
          {can('commitment.update') && !d.archivedAt && <Button size="sm" icon={<Pencil size={13} />} onClick={() => onEdit(d)}>Edit</Button>}
          {can('commitment.archive') && !d.archivedAt && <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => setConfirm(true)}>Archive</Button>}
          <span className="grow" />
          <span className="t-small c3 rb-hint"><Kbd>J</Kbd> <Kbd>K</Kbd> next / previous</span>
        </>
      )}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={d ? id : 'loading'} className="peek-body" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
          {notFound ? <p className="c2">This commitment doesn’t exist or isn’t visible to you.</p>
            : rec.isError ? <LoadError error={rec.error} onRetry={() => rec.refetch()} />
            : !d ? <PanelSkeleton />
            : (
              <>
                {d.archivedAt && <p className="rb-archived t-small"><Archive size={13} />Archived {fmtRelative(d.archivedAt)} — kept for the record.</p>}
                <div className="rb-p-title" data-done={done || undefined}>
                  <CCheck done={done} disabled={!can('commitment.update') || !!d.archivedAt} label={`Mark ${d.key} ${done ? 'open' : 'complete'}`} onToggle={() => void toggle.flip(d)} />
                  <div className="grow">
                    <span className="mono c3">{d.key}</span>
                    <h2 className="t-title"><span className="cstmt">{d.title}</span></h2>
                  </div>
                </div>
                <dl className="peek-facts">
                  <div><dt>Status</dt><dd>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span key={status} className="rb-st" data-tone={done ? 'positive' : overdue ? 'critical' : status === 'cancelled' ? 'neutral' : 'open'} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
                        <i />{overdue ? 'Overdue' : COMMITMENT_STATUS_LABEL[status ?? 'open']}
                      </motion.span>
                    </AnimatePresence>
                  </dd></div>
                  <div><dt>Due</dt><dd className={`num ${overdue ? 'is-overdue' : ''}`}>{d.dueDate ? `${fmtDate(d.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}` : <span className="c3">No due date</span>}</dd></div>
                  <div><dt>Stakeholder</dt><dd className="row gap-2">{d.stakeholder ? <><Avatar name={d.stakeholder.name} size={18} /><Link className="inline-link truncate" to={`/stakeholders/${d.stakeholder.id}`}>{d.stakeholder.name}</Link></> : <span className="c3">None</span>}</dd></div>
                  <div><dt>Who owes</dt><dd>{d.direction === 'theirs' ? 'They owe us' : 'We owe them'}</dd></div>
                  <div><dt>Accountable owner</dt><dd className="row gap-2">{d.owner ? <><Avatar name={d.owner.name} size={18} internal /><span className="truncate">{d.owner.name}</span></> : <span className="c3">Unassigned</span>}</dd></div>
                  <div><dt>Initiative</dt><dd className="row gap-2 truncate">{d.initiative ? <><span className="rb-code mono">{d.initiative.code}</span><span className="truncate c2">{d.initiative.name}</span></> : <span className="c3">None</span>}</dd></div>
                </dl>
                {d.sourceEngagement && (
                  <Link className="rb-source" to={`/engagements/${d.sourceEngagement.id}`}>
                    <span className="t-caption c3">Agreed in</span>
                    <span className="mono c3">{d.sourceEngagement.key}</span>
                    <span className="truncate grow">{d.sourceEngagement.title}</span>
                    <ArrowUpRight size={13} className="c3" />
                  </Link>
                )}
                {d.description && <section className="peek-sec"><h3 className="label-rule">Details</h3><p className="rb-prose">{d.description}</p></section>}
                <section className="peek-sec"><h3 className="label-rule">History</h3><ActivityList type="commitment" id={d.id} /></section>
              </>
            )}
        </motion.div>
      </AnimatePresence>
      <ConfirmDialog open={confirm} title={`Archive ${d?.key}?`} danger busy={busy} confirmLabel="Archive" onCancel={() => setConfirm(false)} onConfirm={() => void archive()}
        body="It will be removed from registers and Home signals. Its history is kept." />
    </SidePanel>
  )
}

export function PanelSkeleton() {
  return (
    <div className="peek-skel" aria-hidden>
      <Skeleton w="30%" h={10} /><Skeleton w="85%" h={18} />
      <div className="peek-facts">{Array.from({ length: 6 }, (_, i) => <div key={i} style={{ display: 'grid', gap: 6 }}><Skeleton w={60} h={9} /><Skeleton w={90} h={12} /></div>)}</div>
      <Skeleton w="40%" h={10} /><Skeleton h={10} /><Skeleton w="70%" h={10} />
    </div>
  )
}

/** Portal helper for floating UI that must escape scroll containers. */
export function Floating({ children }: { children: ReactNode }) { return createPortal(children, document.body) }
