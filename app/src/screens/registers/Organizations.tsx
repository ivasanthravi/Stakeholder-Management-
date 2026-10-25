// Organizations register (/organizations) and organization record page (/organizations/:id).
// Also exports small register primitives reused by Initiatives.tsx (list keyboard nav, skeletons, activity, stance mix).
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Archive, ArrowDown, ArrowUpRight, Building2, CornerDownRight, Footprints, Globe, Mail, MessagesSquare, MoreHorizontal, NotebookPen,
  Pencil, Phone, Plus, Presentation, RotateCcw, Search, UserPlus, Users as UsersIcon, X,
} from 'lucide-react'
import { useActivity, useInvalidate, useList, useRecord } from '../../api/hooks'
import { ApiError, errorMessage, request, ws } from '../../api/http'
import type { Level, Stance } from '../../api/types'
import { Avatar, Button, Kbd, LevelMeter, Pill, Skeleton, StanceBadge } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Drawer'
import { NotFound } from '../../components/NotFound'
import { OrganizationDrawer } from '../../forms/RecordForms'
import { useHotkeys } from '../../lib/hotkeys'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { t } from '../../lib/motion'
import { fmtDate, fmtRelative, INITIATIVE_STATUS_LABEL, LEVEL_LABEL, ORG_TYPE_LABEL, STANCE_LABEL } from '../../lib/format'
import { ORG_TYPES } from '../../../shared/schemas'
import { FilterChip } from '../directory/Directory'
import { LoadError } from '../Home'
import '../directory/directory.css'
import '../profile/profile.css'
import './registers-a.css'
import { useVocabulary } from '../../lib/vocabulary'

/* ── Types ─────────────────────────────────────────────────────────── */
interface OrgRow {
  id: string; name: string; shortName: string | null; type: string; tags: string[]; website: string | null; version: number
  archivedAt: string | null; stakeholderCount: number; lastEngagedAt: string | null
}
interface OrgPerson {
  associationId: string; id: string; name: string; title: string | null; stance: Stance; influence: Level | null; role: string | null
  validFrom: string | null; validTo: string | null
}
interface OrgDetail {
  id: string; name: string; shortName: string | null; type: string; tags: string[]; website: string | null; description: string | null
  version: number; archivedAt: string | null; createdAt: string; updatedAt: string
  people: OrgPerson[]
  initiatives: { id: string; code: string; name: string; status: string }[]
  engagements: { id: string; key: string; kind: string; title: string; occurredAt: string }[]
}

/* ── Shared register primitives (also used by Initiatives.tsx) ─────── */

export function useDebounced<T>(value: T, ms = 180) {
  const [v, setV] = useState(value)
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h) }, [value, ms])
  return v
}

/** J/K/↑/↓ move a focus line through rows, Enter opens, F or / focuses the search field. */
export function useListNav(count: number, open: (i: number) => void, searchRef: RefObject<HTMLInputElement | null>) {
  const [focus, setFocus] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setFocus(f => Math.min(f, Math.max(0, count - 1))) }, [count])
  const move = (d: number) => {
    if (!count) return
    const n = Math.max(0, Math.min(count - 1, focus + d))
    setFocus(n)
    if (document.activeElement !== gridRef.current) gridRef.current?.focus({ preventScroll: true })
    gridRef.current?.querySelector(`[data-row="${n}"]`)?.scrollIntoView({ block: 'nearest' })
  }
  const onGrid = () => { const a = document.activeElement; return !a || a === document.body || a === gridRef.current }
  useHotkeys({
    j: () => move(1), ArrowDown: () => move(1),
    k: () => move(-1), ArrowUp: () => move(-1),
    Enter: () => { if (count && onGrid()) open(focus); else return false },
    f: () => searchRef.current?.focus(), '/': () => searchRef.current?.focus(),
  }, [count, focus])
  return { focus, setFocus, gridRef }
}

export function SearchField({ inputRef, value, onChange, placeholder, label, gridRef }: {
  inputRef: RefObject<HTMLInputElement | null>; value: string; onChange: (v: string) => void; placeholder: string; label: string; gridRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <label className="search-field">
      <Search size={14} className="c3" />
      <input ref={inputRef} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={label}
        onKeyDown={e => {
          if (e.key === 'Escape' && value) { e.preventDefault(); onChange('') }
          else if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); (e.target as HTMLInputElement).blur(); gridRef.current?.focus() }
        }} />
      {value ? <button className="clear" aria-label="Clear search" onClick={() => onChange('')}><X size={12} /></button> : <Kbd>F</Kbd>}
    </label>
  )
}

export function SkeletonRows({ widths, n = 12 }: { widths: (number | null)[]; n?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="tr rg-skel">
          {widths.map((w, c) => <span key={c} className="td">{w == null ? null : <Skeleton w={c === 1 || (c === 0 && w > 100) ? w + ((i * 37) % 70) : w} h={10} />}</span>)}
        </div>
      ))}
    </div>
  )
}

/** Rounded-square tile for organizations — people are round avatars, organizations are square. */
export function OrgMark({ size = 22 }: { size?: number }) {
  return <span className="rg-mark" style={{ width: size, height: size, borderRadius: size > 30 ? 10 : 5 }} aria-hidden><Building2 size={Math.round(size * 0.46)} strokeWidth={size > 30 ? 1.6 : 2} /></span>
}

const STANCE_ORDER: Stance[] = ['champion', 'supporter', 'neutral', 'concerned', 'opposed', 'unknown']
/** Distribution of stances across a set of people: one segmented bar plus a compact legend. */
export function StanceMix({ people }: { people: { stance: Stance }[] }) {
  const counts = STANCE_ORDER.map(s => ({ s, n: people.filter(p => p.stance === s).length })).filter(x => x.n > 0)
  const total = people.length
  if (!total) return <p className="c3 t-small card-empty">No current people to summarise.</p>
  const support = people.filter(p => p.stance === 'champion' || p.stance === 'supporter').length
  const resist = people.filter(p => p.stance === 'opposed' || p.stance === 'concerned').length
  return (
    <div className="rg-mix">
      <div className="rg-mix-bar" role="img" aria-label={counts.map(c => `${c.n} ${STANCE_LABEL[c.s].toLowerCase()}`).join(', ')}>
        {counts.map((c, i) => (
          <motion.i key={c.s} style={{ flexGrow: c.n, background: `var(--stance-${c.s})` }} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { ...t.base, delay: i * 0.03 } }} />
        ))}
      </div>
      <p className="t-small c2 rg-mix-sum num"><strong>{support}</strong> supportive · <strong>{resist}</strong> concerned or opposed · {total} total</p>
      <ul className="rg-mix-legend">
        {counts.map(c => (
          <li key={c.s}><StanceBadge stance={c.s} /><span className="grow" /><span className="num c2">{c.n}</span></li>
        ))}
      </ul>
    </div>
  )
}

const VERB_TONE: Record<string, string> = { created: 'accent', archived: 'muted', restored: 'accent', status_changed: 'attention', stakeholder_removed: 'muted' }
/** Audit trail for one record, newest first, with Load more. */
export function ActivityCard({ entityType, id }: { entityType: string; id: string }) {
  const act = useActivity(entityType, id)
  const events = act.data?.pages.flatMap(p => p.events) ?? []
  return (
    <section className="card">
      <header className="card-head"><h2 className="t-heading">Activity</h2><span className="c3 t-small">Every change, by whom and when</span></header>
      {act.isError ? <LoadError error={act.error} onRetry={() => act.refetch()} />
        : act.isPending ? <div className="rg-skel-stack">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={12} w={`${54 + ((i * 13) % 36)}%`} />)}</div>
        : events.length === 0 ? <p className="c3 t-small card-empty">No activity recorded yet.</p>
        : (
          <ol className="hist rg-hist">
            {events.map(e => (
              <li key={e.id}>
                <span className="rg-dot" data-tone={VERB_TONE[e.verb] ?? undefined} aria-hidden />
                <span className="grow">
                  <span>{e.summary}</span>
                  <span className="t-small c3 rg-hist-meta">{e.actor ?? 'System'} · <time dateTime={e.createdAt} title={new Date(e.createdAt).toLocaleString('en-GB')}>{fmtRelative(e.createdAt)}</time>
                    {e.changes && Object.keys(e.changes).length > 0 && <> · {Object.entries(e.changes).slice(0, 3).map(([k, v]) => `${k}: ${fmtVal(v.from)} → ${fmtVal(v.to)}`).join('; ')}</>}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      {act.hasNextPage && (
        <div className="rg-more-row">
          <Button size="sm" variant="ghost" icon={<ArrowDown size={13} />} loading={act.isFetchingNextPage} onClick={() => void act.fetchNextPage()}>
            {act.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
    </section>
  )
}
const fmtVal = (v: unknown) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') || '—' : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v).replace(/_/g, ' '))

export function ArchivedBanner({ what, at, canRestore, busy, onRestore }: { what: string; at: string; canRestore: boolean; busy: boolean; onRestore: () => void }) {
  return (
    <div className="rg-banner" role="status">
      <Archive size={14} /><span className="grow">This {what} was archived {fmtRelative(at).toLowerCase()}. It’s hidden from lists and pickers; its history is kept.</span>
      {canRestore && <Button size="sm" icon={<RotateCcw size={13} />} loading={busy} onClick={onRestore}>Restore</Button>}
    </div>
  )
}

/** Animated tab strip with a shared underline, [ / ] to cycle. */
export function Tabs<T extends string>({ id, tabs, tab, onTab, label }: { id: string; tabs: { id: T; label: string; count?: number | null }[]; tab: T; onTab: (t: T) => void; label: string }) {
  return (
    <LayoutGroup id={id}>
      <div className="tabs" role="tablist" aria-label={label}>
        {tabs.map(tb => (
          <button key={tb.id} role="tab" aria-selected={tab === tb.id} aria-controls={`${id}-panel`} id={`${id}-${tb.id}`} tabIndex={tab === tb.id ? 0 : -1} className="tab" onClick={() => onTab(tb.id)}
            onKeyDown={e => {
              const i = tabs.findIndex(x => x.id === tab)
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault()
                const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id
                onTab(n); document.getElementById(`${id}-${n}`)?.focus()
              }
            }}>
            {tb.label}
            {tb.count != null && <span className="tab-count num">{tb.count}</span>}
            {tab === tb.id && <motion.span layoutId="tab-ind" className="tab-ind" transition={t.indicator} />}
          </button>
        ))}
        <span className="grow" />
        <span className="tabs-hint t-small c3"><Kbd>[</Kbd> <Kbd>]</Kbd></span>
      </div>
    </LayoutGroup>
  )
}

export function TabPanel({ id, tab, children }: { id: string; tab: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** URL-backed tab state (?tab=), first tab omitted from the URL. */
export function useTab<T extends string>(ids: readonly T[]) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as T | null
  const tab = raw && ids.includes(raw) ? raw : ids[0]
  const setTab = (tb: T) => { const n = new URLSearchParams(params); if (tb === ids[0]) n.delete('tab'); else n.set('tab', tb); setParams(n, { replace: true }) }
  const step = (d: number) => setTab(ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(tab) + d))])
  return { tab, setTab, step }
}

export const INITIATIVE_TONE: Record<string, 'accent' | 'neutral' | 'attention' | 'positive'> = { active: 'accent', planned: 'neutral', on_hold: 'attention', completed: 'positive' }

const KIND_ICON: Record<string, typeof MessagesSquare> = {
  meeting: UsersIcon, call: Phone, email: Mail, site_visit: Footprints, workshop: Presentation, consultation: UsersIcon, note: NotebookPen, other: MessagesSquare,
}
const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, '') } catch { return url } }
const DAY = 86_400_000

/* ── List ──────────────────────────────────────────────────────────── */
export function Organizations() {
  const nav = useNavigate()
  const { openCreate, announce } = useApp()
  const { can } = useSession()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState('')
  const q = useDebounced(text.trim())
  const type = params.get('type')
  const archived = params.get('archived') === '1'
  const voc = useVocabulary()
  const sort = params.get('sort') === 'stakeholders' ? 'stakeholders' : 'name'
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const list = useList<OrgRow>('organizations', { q: q || undefined, type: type ?? undefined, archived: archived ? 'true' : undefined, sort: sort === 'stakeholders' ? 'stakeholders' : undefined, limit: 200 })
  const rows = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const open = (i: number) => { if (rows[i]) nav(`/organizations/${rows[i].id}`) }
  const { focus, setFocus, gridRef } = useListNav(rows.length, open, searchRef)
  useEffect(() => { if (list.data) announce(`${total} organization${total === 1 ? '' : 's'}`) }, [total, list.data, announce])

  const filtered = !!(q || type || archived)
  const clearAll = () => { setText(''); setParams(new URLSearchParams(), { replace: true }) }
  const now = Date.now()

  return (
    <>
      <header className="page-head">
        <div className="crumbs"><span className="here">Organizations</span></div>
        <span className="grow" />
        {can('organization.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} kbd="C O" onClick={() => openCreate('organization', undefined, r => nav(`/organizations/${r.id}`))}>New</Button>}
      </header>
      <div className="rg">
        <div className="toolbar">
          <SearchField inputRef={searchRef} value={text} onChange={setText} placeholder="Filter by name or short name" label="Filter organizations" gridRef={gridRef} />
          <FilterChip label="Type" value={type ? ORG_TYPE_LABEL[type] ?? type : undefined} onOpen={setMenuEl} onClear={() => setParam('type', null)} />
          {archived && <span className="chip chip-on"><Archive size={12} /><span className="chip-v">Archived</span><button className="chip-x" aria-label="Show active organizations" onClick={() => setParam('archived', null)}><X size={12} /></button></span>}
          {filtered ? <button className="link-btn" onClick={clearAll}>Clear all</button> : null}
          <span className="grow" />
          <span className="t-small c3 num" aria-live="polite">{list.data ? `${total.toLocaleString()} ${archived ? 'archived' : voc.lower('organization', total !== 1)}` : ''}{list.isFetching && !list.isPending ? ' · updating' : ''}</span>
          {!archived && <button className="link-btn" onClick={() => setParam('archived', '1')} title="Show archived organizations">Show archived</button>}
        </div>

        <div className="rg-grid rg-orgs" role="grid" ref={gridRef} tabIndex={0} aria-label="Organizations" aria-rowcount={rows.length + 1} aria-busy={list.isPending || undefined}
          aria-activedescendant={rows[focus] ? `org-row-${rows[focus].id}` : undefined}>
          <div className="tr thead" role="row">
            <span className="th-cell" role="columnheader" aria-sort={sort === 'name' ? 'ascending' : 'none'}>
              <button className="th th-btn" onClick={() => setParam('sort', null)}>
                Name<span className="th-arrow" data-on={sort === 'name' || undefined}><ArrowDown size={11} style={{ transform: 'rotate(180deg)' }} /></span>
              </button>
            </span>
            <span className="th" role="columnheader">Type</span>
            <span className="th-cell" role="columnheader" aria-sort={sort === 'stakeholders' ? 'descending' : 'none'}>
              <button className="th th-btn th-right" onClick={() => setParam('sort', 'stakeholders')}>
                People<span className="th-arrow" data-on={sort === 'stakeholders' || undefined}><ArrowDown size={11} /></span>
              </button>
            </span>
            <span className="th th-right" role="columnheader">Last engaged</span>
            <span className="th" role="columnheader">Classifications</span>
            <span className="th" role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          <div className="rg-body" role="rowgroup" tabIndex={0} aria-label="Rows">
            {list.isError ? <div className="empty"><LoadError error={list.error} onRetry={() => list.refetch()} /></div>
              : list.isPending ? <SkeletonRows widths={[120, 90, 24, 50, 110, null]} />
              : rows.length === 0 ? (
                filtered ? (
                  <div className="empty">
                    <Search size={18} className="c3" />
                    <p className="t-heading">{archived && !q && !type ? 'No archived organizations' : 'No organizations match'}</p>
                    <p className="c2 t-small">{q ? <>Nothing matches “{q}”{type ? ` in ${ORG_TYPE_LABEL[type] ?? type}` : ''}.</> : 'Try removing a filter.'}</p>
                    <Button size="sm" onClick={clearAll}>Clear filters</Button>
                  </div>
                ) : (
                  <div className="empty">
                    <OrgMark size={30} />
                    <p className="t-heading">No organizations yet</p>
                    <p className="c2 t-small">Councils, agencies, companies, community groups — anything your stakeholders belong to.</p>
                    {can('organization.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openCreate('organization')}>Add organization</Button>}
                  </div>
                )
              ) : rows.map((r, i) => {
                const last = r.lastEngagedAt ? Date.parse(r.lastEngagedAt) : null
                const url = `/organizations/${r.id}`
                return (
                  <div key={r.id} id={`org-row-${r.id}`} className="tr" role="row" aria-rowindex={i + 2} data-row={i} data-focus={i === focus || undefined} data-archived={r.archivedAt ? true : undefined}
                    onMouseDown={() => setFocus(i)}
                    onClick={e => { if (e.metaKey || e.ctrlKey) window.open(url, '_blank'); else nav(url) }}>
                    <span className="td td-name" role="gridcell">
                      <span className="rg-rowicon" aria-hidden><Building2 size={13} /></span>
                      <Link to={url} tabIndex={-1} className="truncate name" onClick={e => e.preventDefault()}>{r.name}</Link>
                      {r.shortName && <span className="rg-code mono">{r.shortName}</span>}
                    </span>
                    <span className="td truncate c2" role="gridcell">{ORG_TYPE_LABEL[r.type] ?? r.type}</span>
                    <span className="td td-right num" role="gridcell">{r.stakeholderCount ? r.stakeholderCount : <span className="c3">—</span>}</span>
                    <span className={`td td-right num ${last && now - last > 60 * DAY ? 'stale' : 'c2'}`} role="gridcell" title={r.lastEngagedAt ? new Date(r.lastEngagedAt).toLocaleString('en-GB') : 'No engagement with current people'}>{fmtRelative(last, now)}</span>
                    <span className="td rg-tags" role="gridcell">
                      {r.tags.slice(0, 2).map(tg => <span key={tg} className="rg-tag truncate">{tg}</span>)}
                      {r.tags.length > 2 && <span className="rg-tag rg-tag-more num" title={r.tags.slice(2).join(', ')}>+{r.tags.length - 2}</span>}
                      {r.tags.length === 0 && <span className="c3">—</span>}
                    </span>
                    <span className="td" role="gridcell">
                      <span className="row-actions"><button className="icon-btn" tabIndex={-1} aria-label={`Open ${r.name}`} title="Open (↵)" onClick={e => { e.stopPropagation(); nav(url) }}><CornerDownRight size={14} /></button></span>
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
      <Menu anchor={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} label="Filter by type"
        options={ORG_TYPES.map(v => ({ value: v, label: ORG_TYPE_LABEL[v] ?? v }))} selected={type ? [type] : []} onSelect={v => setParam('type', v)} />
    </>
  )
}

/* ── Record page ───────────────────────────────────────────────────── */
const ORG_TABS = ['overview', 'people', 'activity'] as const
type OrgTab = typeof ORG_TABS[number]

export function OrganizationPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast, openCreate } = useApp()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const rec = useRecord<OrgDetail>('organizations', id)
  const o = rec.data?.id === id ? rec.data : undefined
  const { tab, setTab, step } = useTab(ORG_TABS)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [id])

  const canEdit = !!o && can('organization.update') && !o.archivedAt
  const canAdd = !!o && can('stakeholder.create') && !o.archivedAt
  const addPerson = () => { if (canAdd) openCreate('stakeholder', { orgId: id }) }

  useHotkeys({
    '[': () => step(-1), ']': () => step(1),
    e: () => { if (canEdit) setEditing(true) },
    a: () => addPerson(),
    Escape: () => { nav('/organizations') },
  }, [tab, id, o, canEdit, canAdd])

  if (rec.error instanceof ApiError && rec.error.status === 404) return <NotFound what="Organization" back="/organizations" backLabel="All organizations" />

  const setArchived = async (archive: boolean) => {
    if (!o) return
    setBusy(true)
    try {
      await request(ws(`/organizations/${id}/${archive ? 'archive' : 'restore'}`), { method: 'POST', body: {} })
      await invalidate()
      toast(archive ? `${o.name} archived` : `${o.name} restored`, archive ? async () => {
        try { await request(ws(`/organizations/${id}/restore`), { method: 'POST', body: {} }); await invalidate() } catch (e) { toast(errorMessage(e), undefined, 'error') }
      } : undefined)
      setConfirm(false)
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false) }
  }

  const current = o?.people.filter(p => !p.validTo) ?? []
  const former = o?.people.filter(p => p.validTo) ?? []

  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          <Link to="/organizations">Organizations</Link><span className="sep">/</span>
          <span className="here truncate">{o?.name ?? <Skeleton w={140} h={11} />}</span>
        </div>
        <span className="grow" />
        {canEdit && <Button size="sm" icon={<Pencil size={13} />} kbd="E" onClick={() => setEditing(true)}>Edit</Button>}
        {canAdd && <Button size="sm" variant="primary" icon={<UserPlus size={13} />} kbd="A" onClick={addPerson}>Add stakeholder</Button>}
        {o && can('organization.archive') && <Button ref={moreRef} size="sm" variant="ghost" icon={<MoreHorizontal size={15} />} aria-label="More actions" aria-haspopup="listbox" onClick={() => setMore(true)} />}
      </header>

      <div className="prof-scroll" ref={scrollRef}>
        <div className="prof rg-page">
          {rec.isError && !o ? <LoadError error={rec.error} onRetry={() => rec.refetch()} /> : !o ? <RecordSkeleton /> : (
            <>
              {o.archivedAt && <ArchivedBanner what="organization" at={o.archivedAt} canRestore={can('organization.archive')} busy={busy} onRestore={() => void setArchived(false)} />}
              <section className="hero">
                <div className="hero-id">
                  <OrgMark size={52} />
                  <div className="grow">
                    <h1 className="t-display">{o.name}</h1>
                    <p className="hero-sub">
                      <span>{ORG_TYPE_LABEL[o.type] ?? o.type}</span>
                      {o.shortName && <><span className="dot-sep" /><span className="rg-code mono">{o.shortName}</span></>}
                      {o.website && <><span className="dot-sep" /><a className="rg-ext" href={o.website} target="_blank" rel="noreferrer noopener"><Globe size={12} />{hostOf(o.website)}<ArrowUpRight size={12} /></a></>}
                    </p>
                    {o.description && <p className="rg-desc">{o.description}</p>}
                    {o.tags.length > 0 && <div className="hero-tags">{o.tags.map(tg => <span key={tg} className="tag">{tg}</span>)}</div>}
                    <dl className="rg-props">
                      <div><dt>People</dt><dd className="num">{current.length} current{former.length ? <span className="c3"> · {former.length} former</span> : null}</dd></div>
                      <div><dt>Last engaged</dt><dd className="num">{o.engagements[0] ? fmtRelative(o.engagements[0].occurredAt) : <span className="c3">Never</span>}</dd></div>
                      <div><dt>Initiatives</dt><dd className="num">{o.initiatives.length ? o.initiatives.map(i => i.code).join(', ') : <span className="c3">None</span>}</dd></div>
                    </dl>
                  </div>

                </div>
              </section>

              <Tabs id="org-tabs" label="Organization sections" tab={tab} onTab={setTab}
                tabs={[{ id: 'overview', label: 'Overview' }, { id: 'people', label: 'People', count: current.length }, { id: 'activity', label: 'Activity' }]} />
              <TabPanel id="org-tabs" tab={tab}>
                {tab === 'overview' && <OrgOverview o={o} current={current} onTab={setTab} onAdd={canAdd ? addPerson : undefined} />}
                {tab === 'people' && <OrgPeople current={current} former={former} onAdd={canAdd ? addPerson : undefined} />}
                {tab === 'activity' && <div className="ov"><div className="ov-main"><ActivityCard entityType="organization" id={o.id} /></div><aside className="ov-rail"><RecordCard o={o} /></aside></div>}
              </TabPanel>
            </>
          )}
        </div>
      </div>

      {o && <OrganizationDrawer open={editing} onClose={() => setEditing(false)}
        record={{ id: o.id, version: o.version, name: o.name, shortName: o.shortName, type: o.type, website: o.website, description: o.description, tags: o.tags }} />}
      <Menu anchor={moreRef.current} open={more} onClose={() => setMore(false)} label="More actions" align="end"
        options={[o?.archivedAt ? { value: 'restore', label: 'Restore', icon: <RotateCcw size={13} /> } : { value: 'archive', label: 'Archive…', icon: <Archive size={13} /> }]}
        onSelect={v => { if (v === 'archive') setConfirm(true); else void setArchived(false) }} />
      <ConfirmDialog open={confirm} danger busy={busy} title={`Archive ${o?.name ?? 'organization'}?`} confirmLabel="Archive"
        body="It will be hidden from the register and from organization pickers. People keep their association history, and you can restore it at any time."
        onCancel={() => setConfirm(false)} onConfirm={() => void setArchived(true)} />
    </>
  )
}

export function RecordSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="hero"><div className="hero-id"><Skeleton w={52} h={52} r={10} /><div style={{ flex: 1, display: 'grid', gap: 10 }}><Skeleton w={280} h={22} /><Skeleton w={240} h={12} /><Skeleton w={360} h={12} /></div></div></div>
      <div className="tabs"><Skeleton w={260} h={12} /></div>
      <div className="ov">
        <div className="ov-main"><div className="card rg-skel-stack"><Skeleton w="30%" h={12} />{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={14} w={`${70 + ((i * 11) % 30)}%`} />)}</div></div>
        <aside className="ov-rail"><div className="card rg-skel-stack"><Skeleton w="40%" h={12} /><Skeleton h={8} /><Skeleton w="70%" h={12} /></div></aside>
      </div>
    </div>
  )
}

function OrgOverview({ o, current, onTab, onAdd }: { o: OrgDetail; current: OrgPerson[]; onTab: (t: OrgTab) => void; onAdd?: () => void }) {
  const nav = useNavigate()
  const top = current.slice().sort((a, b) => (b.influence ?? 0) - (a.influence ?? 0) || a.name.localeCompare(b.name)).slice(0, 8)
  return (
    <div className="ov">
      <div className="ov-main">
        <section className="card">
          <header className="card-head">
            <h2 className="t-heading">Key people</h2><span className="c3 t-small">By influence</span><span className="grow" />
            {current.length > top.length && <Button size="sm" variant="ghost" onClick={() => onTab('people')}>All {current.length} <ArrowUpRight size={13} /></Button>}
          </header>
          {top.length === 0 ? (
            <div className="rg-card-empty">
              <p className="c3 t-small">No current people recorded at {o.name}.</p>
              {onAdd && <Button size="sm" icon={<UserPlus size={13} />} onClick={onAdd}>Add stakeholder</Button>}
            </div>
          ) : (
            <ul className="rg-people">
              {top.map(p => (
                <li key={p.associationId}>
                  <Link to={`/stakeholders/${p.id}`} className="rg-person">
                    <Avatar name={p.name} size={26} />
                    <span className="grow rg-person-id">
                      <span className="t-strong truncate">{p.name}</span>
                      <span className="t-small c3 truncate">{[p.role, p.title && p.title !== p.role ? p.title : null].filter(Boolean).join(' · ') || 'No role recorded'}</span>
                    </span>
                    <StanceBadge stance={p.stance} />
                    <span className="rg-inf">{p.influence ? <LevelMeter value={p.influence} label="Influence" /> : <span className="meter-empty" title="Influence not assessed">—</span>}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Recent engagements</h2><span className="c3 t-small">With current people</span></header>
          {o.engagements.length === 0 ? <p className="c3 t-small card-empty">No engagements recorded with people at {o.name}.</p> : (
            <div className="tl tl-compact">
              <ol>
                {o.engagements.slice(0, 8).map(e => {
                  const Icon = KIND_ICON[e.kind] ?? MessagesSquare
                  return (
                    <li key={e.id}>
                      <button className="tl-item" onClick={() => nav(`/engagements/${e.id}`)}>
                        <span className="tl-ico"><Icon size={13} /></span>
                        <span className="grow tl-content">
                          <span className="row gap-2"><span className="t-strong truncate">{e.title}</span><span className="mono c3 tl-key">{e.key}</span><span className="grow" />
                            <time className="c3 t-small num" dateTime={e.occurredAt} title={new Date(e.occurredAt).toLocaleString('en-GB')}>{fmtRelative(e.occurredAt)}</time></span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </section>
      </div>
      <aside className="ov-rail">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Stance</h2><span className="c3 t-small">Current people</span></header>
          <StanceMix people={current} />
        </section>
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Initiatives</h2><span className="c3 t-small num">{o.initiatives.length}</span></header>
          {o.initiatives.length === 0 ? <p className="c3 t-small card-empty">None of its people are on an initiative.</p> : (
            <ul className="rg-links">
              {o.initiatives.map(i => (
                <li key={i.id}><Link to={`/initiatives/${i.id}`}><span className="rg-code mono">{i.code}</span><span className="grow truncate">{i.name}</span><Pill tone={INITIATIVE_TONE[i.status] ?? 'neutral'}>{INITIATIVE_STATUS_LABEL[i.status] ?? i.status}</Pill></Link></li>
              ))}
            </ul>
          )}
        </section>
        <RecordCard o={o} />
      </aside>
    </div>
  )
}

function RecordCard({ o }: { o: OrgDetail }) {
  return (
    <section className="card">
      <header className="card-head"><h2 className="t-heading">Record</h2></header>
      <dl className="rg-kv">
        <div><dt>Created</dt><dd>{fmtDate(o.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
        <div><dt>Last updated</dt><dd>{fmtRelative(o.updatedAt)}</dd></div>
        <div><dt>Status</dt><dd>{o.archivedAt ? 'Archived' : 'Active'}</dd></div>
      </dl>
    </section>
  )
}

function OrgPeople({ current, former, onAdd }: { current: OrgPerson[]; former: OrgPerson[]; onAdd?: () => void }) {
  const since = (p: OrgPerson) => p.validFrom ? `Since ${fmtDate(p.validFrom, { month: 'short', year: 'numeric' })}` : 'Current'
  const span = (p: OrgPerson) => `${p.validFrom ? fmtDate(p.validFrom, { month: 'short', year: 'numeric' }) : '…'} – ${fmtDate(p.validTo, { month: 'short', year: 'numeric' })}`
  const row = (p: OrgPerson, past: boolean) => (
    // A table row can't also be a link; the name cell's link stretches over the row so the whole row stays clickable.
    <div key={p.associationId} className="rg-trow rg-trow-link" role="row" data-past={past || undefined}>
      <span role="cell" className="row gap-2 rg-cell-name"><Link to={`/stakeholders/${p.id}`} className="rg-stretch" aria-label={p.name} /><Avatar name={p.name} size={22} /><span className="grow rg-person-id"><span className="t-strong truncate">{p.name}</span>{p.title && p.title !== p.role && <span className="t-small c3 truncate">{p.title}</span>}</span></span>
      <span role="cell" className="truncate c2">{p.role ?? <span className="c3">—</span>}</span>
      <span role="cell"><StanceBadge stance={p.stance} /></span>
      <span role="cell" title={p.influence ? `Influence: ${LEVEL_LABEL[p.influence]}` : 'Influence not assessed'}>{p.influence ? <LevelMeter value={p.influence} label="Influence" /> : <span className="meter-empty">—</span>}</span>
      <span role="cell" className="t-small c3 num rg-right">{past ? span(p) : since(p)}</span>
    </div>
  )
  return (
    <section className="card">
      <header className="card-head">
        <h2 className="t-heading">People</h2><span className="c3 t-small num">{current.length} current{former.length ? ` · ${former.length} former` : ''}</span><span className="grow" />
        {onAdd && <Button size="sm" icon={<UserPlus size={13} />} onClick={onAdd}>Add stakeholder</Button>}
      </header>
      {current.length + former.length === 0 ? <p className="c3 t-small card-empty">Nobody is associated with this organization yet.</p> : (
        <div className="rg-table rg-t-people" role="table" aria-label="People">
          <div className="rg-trow rg-thead" role="row"><span role="columnheader">Person</span><span role="columnheader">Role</span><span role="columnheader">Stance</span><span role="columnheader">Influence</span><span role="columnheader" className="rg-right">Association</span></div>
          {current.map(p => row(p, false))}
          {former.length > 0 && <div className="rg-tsection" role="row"><span role="cell" className="label-rule">Former · {former.length}</span></div>}
          {former.map(p => row(p, true))}
        </div>
      )}
    </section>
  )
}
