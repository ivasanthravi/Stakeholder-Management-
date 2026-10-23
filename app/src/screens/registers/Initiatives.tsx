// Initiatives register (/initiatives) and initiative record page (/initiatives/:id).
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArrowUpRight, ChevronDown, CornerDownRight, Gavel, ListChecks, Loader2, MoreHorizontal, Network, Pencil, Plus, RotateCcw, Search, UserPlus, X } from 'lucide-react'
import { useInvalidate, useList, useRecord } from '../../api/hooks'
import { ApiError, errorMessage, newIdempotencyKey, request, ws } from '../../api/http'
import type { Level, Stance, StakeholderRow } from '../../api/types'
import { Avatar, Button, LevelMeter, Pill, Skeleton, StanceBadge } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Drawer'
import { NotFound } from '../../components/NotFound'
import { Picker, type PickerOption } from '../../components/Picker'
import { InitiativeDrawer } from '../../forms/RecordForms'
import { useHotkeys } from '../../lib/hotkeys'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { t } from '../../lib/motion'
import {
  COMMITMENT_STATUS_LABEL, daysFromToday, DECISION_STATUS_LABEL, dueLabel, fmtDate, fmtRelative, INITIATIVE_STATUS_LABEL, isOpenStatus, ORG_TYPE_LABEL,
} from '../../lib/format'
import { INITIATIVE_STATUSES } from '../../../shared/schemas'
import { FilterChip } from '../directory/Directory'
import { LoadError } from '../Home'
import {
  ActivityCard, ArchivedBanner, INITIATIVE_TONE, OrgMark, RecordSkeleton, SearchField, SkeletonRows, StanceMix, TabPanel, Tabs, useDebounced, useListNav, useTab,
} from './Organizations'
import '../directory/directory.css'
import '../profile/profile.css'
import './registers-a.css'

/* ── Types ─────────────────────────────────────────────────────────── */
type InitStatus = typeof INITIATIVE_STATUSES[number]
interface InitRow {
  id: string; code: string; name: string; description: string | null; status: InitStatus; ownerId: string | null; ownerName: string | null
  startDate: string | null; endDate: string | null; version: number; archivedAt: string | null
  stakeholderCount: number; openCommitments: number; overdueCommitments: number; pendingDecisions: number; lastActivityAt: string | null
}
interface InitPerson { id: string; name: string; title: string | null; stance: Stance; influence: Level | null; interest: Level | null; role: string | null }
interface InitDetail {
  id: string; code: string; name: string; description: string | null; status: InitStatus; ownerId: string | null
  startDate: string | null; endDate: string | null; version: number; archivedAt: string | null; createdAt: string; updatedAt: string
  owner: { id: string; name: string } | null
  stakeholders: InitPerson[]
  organizations: { id: string; name: string; shortName: string | null; type: string; stakeholderCount: number }[]
  decisions: { id: string; key: string; title: string; status: string; dueDate: string | null }[]
  commitments: { id: string; key: string; title: string; status: string; dueDate: string | null; stakeholderId: string | null; ownerName: string | null }[]
}

const STATUS_OPTS = INITIATIVE_STATUSES.map(s => ({ value: s, label: INITIATIVE_STATUS_LABEL[s], icon: <span className={`rg-sdot rg-sdot-${INITIATIVE_TONE[s]}`} aria-hidden /> }))
const DECISION_TONE: Record<string, 'positive' | 'critical' | 'attention' | 'neutral'> = { approved: 'positive', rejected: 'critical', under_review: 'attention', proposed: 'neutral', deferred: 'neutral' }
const longDate = (iso: string | null) => fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric' })
const isOverdue = (c: { status: string; dueDate: string | null }) => isOpenStatus(c.status) && !!c.dueDate && daysFromToday(c.dueDate) < 0
const DAY = 86_400_000

/* ── List ──────────────────────────────────────────────────────────── */
export function Initiatives() {
  const nav = useNavigate()
  const { openCreate, announce } = useApp()
  const { can } = useSession()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState('')
  const q = useDebounced(text.trim())
  const archived = params.get('archived') === '1'
  const statuses = useMemo(() => (params.get('status')?.split(',').filter(s => (INITIATIVE_STATUSES as readonly string[]).includes(s)) ?? []) as InitStatus[], [params])
  const setParam = (k: string, v: string | null) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true }) }
  const toggleStatus = (s: InitStatus) => { const next = statuses.includes(s) ? statuses.filter(x => x !== s) : [...statuses, s]; setParam('status', next.length ? next.join(',') : null) }
  const [menuEl, setMenuEl] = useState<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const list = useList<InitRow>('initiatives', { q: q || undefined, archived: archived ? 'true' : undefined, limit: 200 })
  // The server orders by status then code; status filtering is applied here (the endpoint has no status parameter).
  const rows = useMemo(() => (list.data?.items ?? []).filter(r => !statuses.length || statuses.includes(r.status)), [list.data, statuses])
  const open = (i: number) => { if (rows[i]) nav(`/initiatives/${rows[i].id}`) }
  const { focus, setFocus, gridRef } = useListNav(rows.length, open, searchRef)
  useEffect(() => { if (list.data) announce(`${rows.length} initiative${rows.length === 1 ? '' : 's'}`) }, [rows.length, list.data, announce])

  const filtered = !!(q || statuses.length || archived)
  const clearAll = () => { setText(''); setParams(new URLSearchParams(), { replace: true }) }
  const now = Date.now()

  return (
    <>
      <header className="page-head">
        <div className="crumbs"><span className="here">Initiatives</span></div>
        <span className="grow" />
        {can('initiative.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} kbd="C I" onClick={() => openCreate('initiative', undefined, r => nav(`/initiatives/${r.id}`))}>New</Button>}
      </header>
      <div className="rg">
        <div className="toolbar">
          <SearchField inputRef={searchRef} value={text} onChange={setText} placeholder="Filter by name or code" label="Filter initiatives" gridRef={gridRef} />
          <FilterChip label="Status" value={statuses.length ? statuses.map(s => INITIATIVE_STATUS_LABEL[s]).join(', ') : undefined} onOpen={setMenuEl} onClear={() => setParam('status', null)} />
          {archived && <span className="chip chip-on"><Archive size={12} /><span className="chip-v">Archived</span><button className="chip-x" aria-label="Show active initiatives" onClick={() => setParam('archived', null)}><X size={12} /></button></span>}
          {filtered ? <button className="link-btn" onClick={clearAll}>Clear all</button> : null}
          <span className="grow" />
          <span className="t-small c3 num" aria-live="polite">{list.data ? `${rows.length} ${archived ? 'archived' : ''}` : ''}{list.isFetching && !list.isPending ? ' · updating' : ''}</span>
          {!archived && <button className="link-btn" onClick={() => setParam('archived', '1')} title="Show archived initiatives">Archived</button>}
        </div>

        <div className="rg-grid rg-inits" role="grid" ref={gridRef} tabIndex={0} aria-label="Initiatives" aria-rowcount={rows.length + 1} aria-busy={list.isPending || undefined}
          aria-activedescendant={rows[focus] ? `init-row-${rows[focus].id}` : undefined}>
          <div className="tr thead" role="row">
            <span className="th" role="columnheader">Code</span>
            <span className="th" role="columnheader">Name</span>
            <span className="th" role="columnheader">Status</span>
            <span className="th" role="columnheader">Owner</span>
            <span className="th th-right" role="columnheader">People</span>
            <span className="th th-right" role="columnheader" title="Open commitments (overdue)">Commitments</span>
            <span className="th th-right" role="columnheader" title="Decisions proposed or under review">Decisions</span>
            <span className="th th-right" role="columnheader" title="Most recent engagement">Last activity</span>
            <span className="th" role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          <div className="rg-body" role="rowgroup" tabIndex={0} aria-label="Rows">
            {list.isError ? <div className="empty"><LoadError error={list.error} onRetry={() => list.refetch()} /></div>
              : list.isPending ? <SkeletonRows widths={[36, 160, 64, 80, 20, 30, 20, 50, null]} n={8} />
              : rows.length === 0 ? (
                filtered ? (
                  <div className="empty">
                    <Search size={18} className="c3" />
                    <p className="t-heading">{archived && !q && !statuses.length ? 'No archived initiatives' : 'No initiatives match'}</p>
                    <p className="c2 t-small">{q ? <>Nothing matches “{q}”.</> : 'Try removing a filter.'}</p>
                    <Button size="sm" onClick={clearAll}>Clear filters</Button>
                  </div>
                ) : (
                  <div className="empty">
                    <span className="rg-code mono rg-code-lg">NEW</span>
                    <p className="t-heading">No initiatives yet</p>
                    <p className="c2 t-small">An initiative is a project, programme or policy that stakeholders are connected to.</p>
                    {can('initiative.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openCreate('initiative')}>New initiative</Button>}
                  </div>
                )
              ) : rows.map((r, i) => {
                const url = `/initiatives/${r.id}`
                const last = r.lastActivityAt ? Date.parse(r.lastActivityAt) : null
                return (
                  <div key={r.id} id={`init-row-${r.id}`} className="tr" role="row" aria-rowindex={i + 2} data-row={i} data-focus={i === focus || undefined}
                    onMouseDown={() => setFocus(i)} onClick={e => { if (e.metaKey || e.ctrlKey) window.open(url, '_blank'); else nav(url) }}>
                    <span className="td" role="gridcell"><span className="rg-code mono">{r.code}</span></span>
                    <span className="td td-name" role="gridcell">
                      <Link to={url} tabIndex={-1} className="truncate name" onClick={e => e.preventDefault()}>{r.name}</Link>
                      {r.description && <span className="truncate title">{r.description}</span>}
                    </span>
                    <span className="td" role="gridcell"><Pill tone={INITIATIVE_TONE[r.status] ?? 'neutral'}>{INITIATIVE_STATUS_LABEL[r.status] ?? r.status}</Pill></span>
                    <span className="td row gap-2" role="gridcell">{r.ownerName ? <><Avatar name={r.ownerName} size={18} internal /><span className="truncate c2 t-small">{r.ownerName}</span></> : <span className="c3 t-small">Unassigned</span>}</span>
                    <span className="td td-right num" role="gridcell">{r.stakeholderCount || <span className="c3">—</span>}</span>
                    <span className="td td-right num" role="gridcell" aria-label={`${r.openCommitments} open, ${r.overdueCommitments} overdue`}>
                      {r.openCommitments ? <span className="rg-cm"><span>{r.openCommitments}</span>{r.overdueCommitments > 0 && <span className="rg-late" title={`${r.overdueCommitments} overdue`}>{r.overdueCommitments} late</span>}</span> : <span className="c3">—</span>}
                    </span>
                    <span className="td td-right num" role="gridcell">{r.pendingDecisions ? <span className="open-count">{r.pendingDecisions}</span> : <span className="c3">—</span>}</span>
                    <span className={`td td-right num ${last && now - last > 60 * DAY && r.status === 'active' ? 'stale' : 'c2'}`} role="gridcell">{fmtRelative(last, now)}</span>
                    <span className="td" role="gridcell"><span className="row-actions"><button className="icon-btn" tabIndex={-1} aria-label={`Open ${r.code}`} title="Open (↵)" onClick={e => { e.stopPropagation(); nav(url) }}><CornerDownRight size={14} /></button></span></span>
                  </div>
                )
              })}
          </div>
        </div>
      </div>
      <Menu anchor={menuEl} open={!!menuEl} onClose={() => setMenuEl(null)} label="Filter by status" multi options={STATUS_OPTS} selected={statuses} onSelect={toggleStatus} />
    </>
  )
}

/* ── Record page ───────────────────────────────────────────────────── */
const INIT_TABS = ['stakeholders', 'decisions', 'commitments', 'activity'] as const

export function InitiativePage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { toast } = useApp()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const rec = useRecord<InitDetail>('initiatives', id)
  const i = rec.data?.id === id ? rec.data : undefined
  const { tab, setTab, step } = useTab(INIT_TABS)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<InitStatus | null>(null)
  const [adding, setAdding] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLButtonElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [id])

  const live = !!i && !i.archivedAt
  const canEdit = live && can('initiative.update')
  const canMembers = live && can('initiative.members')
  const openMap = () => nav(`/stakeholders?view=map&initiative=${id}`)
  const startAdd = () => { if (!canMembers) return; setTab('stakeholders'); setAdding(true) }

  useHotkeys({
    '[': () => { step(-1) }, ']': () => { step(1) },
    e: () => { if (canEdit) setEditing(true) },
    s: () => { if (canEdit) setStatusOpen(true) },
    m: () => { openMap() },
    a: () => { startAdd() },
    Escape: () => { nav('/initiatives') },
  }, [tab, id, i, canEdit, canMembers])

  if (rec.error instanceof ApiError && rec.error.status === 404) return <NotFound what="Initiative" back="/initiatives" backLabel="All initiatives" />

  const changeStatus = async (next: InitStatus) => {
    if (!i || next === i.status || pendingStatus) return
    const from = i.status
    // initiativeUpdateSchema turns an omitted `description` into null, so always send the current one back.
    const keep = { description: i.description }
    setPendingStatus(next)
    try {
      const r = await request<InitDetail>(ws(`/initiatives/${id}`), { method: 'PATCH', body: { status: next, ...keep, version: i.version } })
      await invalidate()
      toast(`${i.code} → ${INITIATIVE_STATUS_LABEL[next]}`, async () => {
        try { await request(ws(`/initiatives/${id}`), { method: 'PATCH', body: { status: from, description: r.description, version: r.version } }); await invalidate() }
        catch (e) { toast(e instanceof ApiError && e.isConflict ? `${i.code} changed again since — showing the latest` : errorMessage(e), undefined, 'error'); await invalidate() }
      })
    } catch (e) {
      toast(e instanceof ApiError && e.isConflict ? `${i.code} was changed by someone else. The latest version is now shown — try again.` : errorMessage(e), undefined, 'error')
      void rec.refetch()
    } finally { setPendingStatus(null) }
  }

  const setArchived = async (archive: boolean) => {
    if (!i) return
    setBusy(true)
    try {
      await request(ws(`/initiatives/${id}/${archive ? 'archive' : 'restore'}`), { method: 'POST', body: {} })
      await invalidate()
      toast(archive ? `${i.code} archived` : `${i.code} restored`, archive ? async () => {
        try { await request(ws(`/initiatives/${id}/restore`), { method: 'POST', body: {} }); await invalidate() } catch (e) { toast(errorMessage(e), undefined, 'error') }
      } : undefined)
      setConfirm(false)
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false) }
  }

  const status = pendingStatus ?? i?.status
  const openCm = i?.commitments.filter(c => isOpenStatus(c.status)) ?? []
  const overdue = openCm.filter(isOverdue)
  const pendingDec = i?.decisions.filter(d => d.status === 'proposed' || d.status === 'under_review') ?? []

  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          <Link to="/initiatives">Initiatives</Link><span className="sep">/</span>
          {i ? <span className="here truncate"><span className="mono rg-crumb-code">{i.code}</span> {i.name}</span> : <Skeleton w={160} h={11} />}
        </div>
        <span className="grow" />
        {i && <Button size="sm" icon={<Network size={14} />} kbd="M" onClick={openMap}>Open in map</Button>}
        {canEdit && <Button size="sm" icon={<Pencil size={13} />} kbd="E" onClick={() => setEditing(true)}>Edit</Button>}
        {i && can('initiative.archive') && <Button ref={moreRef} size="sm" variant="ghost" icon={<MoreHorizontal size={15} />} aria-label="More actions" aria-haspopup="listbox" onClick={() => setMore(true)} />}
      </header>

      <div className="prof-scroll" ref={scrollRef}>
        <div className="prof rg-page">
          {rec.isError && !i ? <LoadError error={rec.error} onRetry={() => rec.refetch()} /> : !i || !status ? <RecordSkeleton /> : (
            <>
              {i.archivedAt && <ArchivedBanner what="initiative" at={i.archivedAt} canRestore={can('initiative.archive')} busy={busy} onRestore={() => void setArchived(false)} />}
              <section className="hero">
                <div className="hero-id">
                  <span className="rg-codemark mono" aria-hidden>{i.code}</span>
                  <div className="grow">
                    <h1 className="t-display">{i.name}</h1>
                    <div className="hero-sub">
                      {canEdit ? (
                        <button ref={statusRef} className="rg-status-btn" aria-haspopup="listbox" aria-label={`Status: ${INITIATIVE_STATUS_LABEL[status]}. Change (S)`} aria-busy={!!pendingStatus || undefined}
                          disabled={!!pendingStatus} onClick={() => setStatusOpen(true)}>
                          <Pill tone={INITIATIVE_TONE[status] ?? 'neutral'}>{INITIATIVE_STATUS_LABEL[status]}</Pill>
                          {pendingStatus ? <Loader2 size={12} className="spin c3" aria-hidden /> : <ChevronDown size={12} className="c3" aria-hidden />}
                        </button>
                      ) : <Pill tone={INITIATIVE_TONE[status] ?? 'neutral'}>{INITIATIVE_STATUS_LABEL[status]}</Pill>}
                      <span className="dot-sep" />
                      {i.owner ? <span className="row gap-2"><Avatar name={i.owner.name} size={18} internal />{i.owner.name}</span> : <span className="attention-text">No owner</span>}
                      {(i.startDate || i.endDate) && <><span className="dot-sep" /><span className="num">{i.startDate ? longDate(i.startDate) : 'Open start'} – {i.endDate ? longDate(i.endDate) : 'ongoing'}</span></>}
                    </div>
                    {i.description && <p className="rg-desc">{i.description}</p>}
                    <dl className="rg-props">
                      <div><dt>Stakeholders</dt><dd className="num">{i.stakeholders.length}<span className="c3"> · {i.organizations.length} org{i.organizations.length === 1 ? '' : 's'}</span></dd></div>
                      <div><dt>Open commitments</dt><dd className="num">{openCm.length}{overdue.length > 0 && <span className="rg-late">{overdue.length} late</span>}</dd></div>
                      <div><dt>Pending decisions</dt><dd className="num">{pendingDec.length || <span className="c3">None</span>}</dd></div>
                      <Schedule start={i.startDate} end={i.endDate} />
                    </dl>
                  </div>

                </div>
              </section>

              <Tabs id="init-tabs" label="Initiative sections" tab={tab} onTab={setTab}
                tabs={[
                  { id: 'stakeholders', label: 'Stakeholders', count: i.stakeholders.length },
                  { id: 'decisions', label: 'Decisions', count: pendingDec.length || null },
                  { id: 'commitments', label: 'Commitments', count: openCm.length || null },
                  { id: 'activity', label: 'Activity' },
                ]} />
              <TabPanel id="init-tabs" tab={tab}>
                {tab === 'stakeholders' && <StakeholdersTab i={i} adding={adding} setAdding={setAdding} canMembers={canMembers} onMap={openMap} />}
                {tab === 'decisions' && <DecisionsTab i={i} />}
                {tab === 'commitments' && <CommitmentsTab i={i} />}
                {tab === 'activity' && <ActivityCard entityType="initiative" id={i.id} />}
              </TabPanel>
            </>
          )}
        </div>
      </div>

      {i && <InitiativeDrawer open={editing} onClose={() => setEditing(false)}
        record={{ id: i.id, version: i.version, code: i.code, name: i.name, description: i.description, status: i.status, ownerId: i.ownerId, startDate: i.startDate, endDate: i.endDate }} />}
      <Menu anchor={statusRef.current} open={statusOpen && canEdit} onClose={() => setStatusOpen(false)} label="Set status" options={STATUS_OPTS} selected={status ? [status] : []} onSelect={v => void changeStatus(v)} />
      <Menu anchor={moreRef.current} open={more} onClose={() => setMore(false)} label="More actions" align="end"
        options={[i?.archivedAt ? { value: 'restore', label: 'Restore', icon: <RotateCcw size={13} /> } : { value: 'archive', label: 'Archive…', icon: <Archive size={13} /> }]}
        onSelect={v => { if (v === 'archive') setConfirm(true); else void setArchived(false) }} />
      <ConfirmDialog open={confirm} danger busy={busy} title={`Archive ${i?.code ?? 'initiative'}?`} confirmLabel="Archive"
        body="It will be hidden from the register, pickers and the map filter. Stakeholder links, decisions and commitments are kept, and you can restore it at any time."
        onCancel={() => setConfirm(false)} onConfirm={() => void setArchived(true)} />
    </>
  )
}

/** Elapsed share of the planned window, shown only when both dates exist. */
function Schedule({ start, end }: { start: string | null; end: string | null }) {
  if (!start || !end) return null
  const s = Date.parse(start + 'T00:00:00'), e = Date.parse(end + 'T23:59:59')
  if (!(e > s)) return null
  const pct = Math.max(0, Math.min(1, (Date.now() - s) / (e - s)))
  const left = daysFromToday(end)
  return (
    <div className="rg-sched-prop">
      <dt>Schedule</dt>
      <dd className="rg-sched" role="img" aria-label={`${Math.round(pct * 100)}% of the planned window elapsed`}>
        <span className="rg-sched-bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: pct, transition: t.slow }} /></span>
        <span className="num">{left < 0 ? `Ended ${-left}d ago` : pct === 0 ? `Starts ${fmtDate(start)}` : `${left}d left`}</span>
      </dd>
    </div>
  )
}

/* ── Stakeholders ──────────────────────────────────────────────────── */
function StakeholdersTab({ i, adding, setAdding, canMembers, onMap }: { i: InitDetail; adding: boolean; setAdding: (v: boolean) => void; canMembers: boolean; onMap: () => void }) {
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const [removing, setRemoving] = useState<string | null>(null)
  const remove = async (p: InitPerson) => {
    setRemoving(p.id)
    try {
      await request(ws(`/initiatives/${i.id}/stakeholders/${p.id}`), { method: 'DELETE' })
      await invalidate()
      toast(`Removed ${p.name} from ${i.code}`, async () => {
        try {
          await request(ws(`/initiatives/${i.id}/stakeholders`), { method: 'POST', body: { stakeholderId: p.id, role: p.role }, idempotencyKey: newIdempotencyKey() })
          await invalidate()
          toast(`${p.name} re-added to ${i.code}`)
        } catch (e) { toast(errorMessage(e), undefined, 'error') }
      })
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setRemoving(null) }
  }
  return (
    <div className="ov">
      <div className="ov-main">
        <section className="card">
          <header className="card-head">
            <h2 className="t-heading">Stakeholders</h2><span className="c3 t-small num">{i.stakeholders.length}</span><span className="grow" />
            <Button size="sm" variant="ghost" className="rg-hide-sm" icon={<Network size={13} />} onClick={onMap}>Open in map</Button>
            {canMembers && !adding && <Button size="sm" icon={<UserPlus size={13} />} kbd="A" onClick={() => setAdding(true)}>Add</Button>}
          </header>
          <AnimatePresence initial={false}>
            {adding && canMembers && (
              <motion.div className="rg-addwrap" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1, transition: t.base }} exit={{ height: 0, opacity: 0, transition: t.exit }}>
                <AddStakeholder i={i} onClose={() => setAdding(false)} />
              </motion.div>
            )}
          </AnimatePresence>
          {i.stakeholders.length === 0 ? (
            <div className="rg-card-empty">
              <p className="c3 t-small">No stakeholders linked to {i.code} yet. Add the people whose support or approval it depends on.</p>
              {canMembers && !adding && <Button size="sm" icon={<UserPlus size={13} />} onClick={() => setAdding(true)}>Add stakeholder</Button>}
            </div>
          ) : (
            <div className="rg-table rg-t-members" role="table" aria-label={`Stakeholders on ${i.code}`}>
              <div className="rg-trow rg-thead" role="row">
                <span role="columnheader">Person</span><span role="columnheader">Stance</span><span role="columnheader">Influence</span><span role="columnheader">Interest</span><span role="columnheader">Role</span><span role="columnheader"><span className="sr-only">Remove</span></span>
              </div>
              {i.stakeholders.map(p => (
                <div key={p.id} className="rg-trow" role="row" data-pending={removing === p.id || undefined}>
                  <Link role="cell" to={`/stakeholders/${p.id}`} className="row gap-2 rg-cell-name">
                    <Avatar name={p.name} size={22} />
                    <span className="grow rg-person-id"><span className="t-strong truncate">{p.name}</span>{p.title && p.title !== p.role && <span className="t-small c3 truncate">{p.title}</span>}</span>
                  </Link>
                  <span role="cell"><StanceBadge stance={p.stance} /></span>
                  <span role="cell">{p.influence ? <LevelMeter value={p.influence} label="Influence" /> : <span className="meter-empty" title="Influence not assessed">—</span>}</span>
                  <span role="cell">{p.interest ? <LevelMeter value={p.interest} label="Interest" /> : <span className="meter-empty" title="Interest not assessed">—</span>}</span>
                  <span role="cell" className="truncate c2">{p.role ?? <span className="c3">—</span>}</span>
                  <span role="cell" className="rg-right">
                    {canMembers && <button className="icon-btn rg-rm" aria-label={`Remove ${p.name} from ${i.code}`} title="Remove from initiative" disabled={removing === p.id} onClick={() => void remove(p)}>{removing === p.id ? <Loader2 size={12} className="spin" /> : <X size={12} />}</button>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <aside className="ov-rail">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Stance</h2><span className="c3 t-small">On this initiative</span></header>
          <StanceMix people={i.stakeholders} />
          {i.stakeholders.some(p => (p.influence ?? 0) >= 3 && (p.stance === 'opposed' || p.stance === 'concerned')) && (
            <p className="t-small rg-note"><span className="rg-overdue">{i.stakeholders.filter(p => (p.influence ?? 0) >= 3 && (p.stance === 'opposed' || p.stance === 'concerned')).length} high-influence</span> <span className="c2">people are concerned or opposed.</span></p>
          )}
        </section>
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Organizations involved</h2><span className="c3 t-small num">{i.organizations.length}</span></header>
          {i.organizations.length === 0 ? <p className="c3 t-small card-empty">None of its stakeholders have a current organization.</p> : (
            <ul className="rg-links">
              {i.organizations.map(o => (
                <li key={o.id}>
                  <Link to={`/organizations/${o.id}`}>
                    <OrgMark size={20} />
                    <span className="grow rg-person-id"><span className="truncate">{o.name}</span><span className="t-small c3 truncate">{ORG_TYPE_LABEL[o.type] ?? o.type}</span></span>
                    <span className="c3 t-small num" title={`${o.stakeholderCount} stakeholder${o.stakeholderCount === 1 ? '' : 's'} on ${i.code}`}>{o.stakeholderCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  )
}

/** Inline add row: server-searched stakeholder picker + optional role. Input survives failures. */
function AddStakeholder({ i, onClose }: { i: InitDetail; onClose: () => void }) {
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const [q, setQ] = useState('')
  const list = useList<StakeholderRow>('stakeholders', { q, limit: 20 })
  const [sid, setSid] = useState<string | null>(null)
  const [known, setKnown] = useState<PickerOption[]>([])
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const members = useMemo(() => new Set(i.stakeholders.map(s => s.id)), [i.stakeholders])
  const options = useMemo<PickerOption[]>(() => (list.data?.items ?? []).filter(s => !members.has(s.id))
    .map(s => ({ value: s.id, label: s.name, sub: s.primaryOrg?.shortName ?? s.primaryOrg?.name ?? s.title ?? undefined, icon: <Avatar name={s.name} size={18} /> })), [list.data, members])
  const chosen = known.find(o => o.value === sid) ?? options.find(o => o.value === sid)
  const add = async () => {
    if (!sid || busy) return
    setBusy(true)
    try {
      await request(ws(`/initiatives/${i.id}/stakeholders`), { method: 'POST', body: { stakeholderId: sid, role: role.trim() || null }, idempotencyKey: newIdempotencyKey() })
      await invalidate()
      toast(`Added ${chosen?.label ?? 'stakeholder'} to ${i.code}`)
      setSid(null); setRole('')
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="rg-add" onKeyDown={e => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onClose() } }}>
      <div className="rg-add-picker">
        <Picker id="add-member" options={options} loading={list.isFetching} onQuery={setQ} selectedOptions={known} value={sid}
          onChange={v => { const id = (v as string | null) ?? null; const o = options.find(x => x.value === id); if (o) setKnown(k => [...k.filter(x => x.value !== o.value), o]); setSid(id) }}
          placeholder="Search stakeholders" emptyText={q ? 'No matching stakeholder (or already added)' : 'Type to search'} />
      </div>
      <input className="input rg-add-role" value={role} onChange={e => setRole(e.target.value)} placeholder="Role (optional)" aria-label="Role on this initiative" maxLength={80}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
      <Button size="sm" variant="primary" loading={busy} disabled={!sid} onClick={() => void add()}>Add</Button>
      <Button size="sm" variant="ghost" onClick={onClose}>Done</Button>
    </div>
  )
}

/* ── Decisions & commitments ──────────────────────────────────────── */
function DecisionsTab({ i }: { i: InitDetail }) {
  const { openCreate } = useApp()
  const { can } = useSession()
  const order = (s: string) => (s === 'under_review' ? 0 : s === 'proposed' ? 1 : 2)
  const items = i.decisions.slice().sort((a, b) => order(a.status) - order(b.status) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  const pending = items.filter(d => order(d.status) < 2).length
  return (
    <section className="card">
      <header className="card-head">
        <h2 className="t-heading">Decisions</h2><span className="c3 t-small num">{pending} pending · {items.length} total</span><span className="grow" />
        <Link className="rg-textlink t-small" to={`/decisions?initiative=${i.id}`}>Open register <ArrowUpRight size={12} /></Link>
        {can('decision.create') && !i.archivedAt && <Button size="sm" icon={<Plus size={13} />} onClick={() => openCreate('decision', { initiativeId: i.id })}>New decision</Button>}
      </header>
      {items.length === 0 ? <div className="rg-card-empty"><Gavel size={16} className="c3" /><p className="c3 t-small">No decisions recorded for {i.code}.</p></div> : (
        <ul className="rg-rows">
          {items.map(d => {
            const open = order(d.status) < 2
            const late = open && d.dueDate && daysFromToday(d.dueDate) < 0
            return (
              <li key={d.id}>
                <Link to={`/decisions?open=${d.id}`} className="rg-rowlink" data-closed={!open || undefined}>
                  <span className="mono c3 rg-key">{d.key}</span>
                  <span className="grow truncate t-strong">{d.title}</span>
                  <Pill tone={DECISION_TONE[d.status] ?? 'neutral'}>{DECISION_STATUS_LABEL[d.status] ?? d.status}</Pill>
                  <span className={`t-small num rg-due ${late ? 'rg-overdue' : 'c3'}`}>{d.dueDate ? (open ? dueLabel(d.dueDate) : fmtDate(d.dueDate)) : '—'}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function CommitmentsTab({ i }: { i: InitDetail }) {
  const { openCreate } = useApp()
  const { can } = useSession()
  const names = useMemo(() => new Map(i.stakeholders.map(s => [s.id, s.name])), [i.stakeholders])
  const items = i.commitments.slice().sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  const open = items.filter(c => isOpenStatus(c.status)).length
  const late = items.filter(isOverdue).length
  const [showClosed, setShowClosed] = useState(false)
  const shown = showClosed ? items : items.filter(c => isOpenStatus(c.status))
  return (
    <section className="card">
      <header className="card-head">
        <h2 className="t-heading">Commitments</h2>
        <span className="c3 t-small num">{open} open{late ? <> · <span className="rg-overdue">{late} overdue</span></> : null} · {items.length} total</span><span className="grow" />
        <Link className="rg-textlink t-small" to={`/commitments?initiative=${i.id}`}>Open register <ArrowUpRight size={12} /></Link>
        {can('commitment.create') && !i.archivedAt && <Button size="sm" icon={<Plus size={13} />} onClick={() => openCreate('commitment', { initiativeId: i.id })}>New commitment</Button>}
      </header>
      {items.length === 0 ? <div className="rg-card-empty"><ListChecks size={16} className="c3" /><p className="c3 t-small">No commitments recorded for {i.code}.</p></div> : (
        <ul className="rg-rows">
          {shown.map(c => {
            const isOpen = isOpenStatus(c.status)
            const od = isOverdue(c)
            const who = c.stakeholderId ? names.get(c.stakeholderId) : null
            return (
              <li key={c.id}>
                <Link to={`/commitments?open=${c.id}`} className="rg-rowlink" data-closed={!isOpen || undefined}>
                  <span className="mono c3 rg-key">{c.key}</span>
                  <span className="grow rg-person-id">
                    <span className="truncate t-strong">{c.title}</span>
                    <span className="t-small c3 truncate">{[who ? `With ${who}` : null, c.ownerName ? `Owner ${c.ownerName}` : 'No owner'].filter(Boolean).join(' · ')}</span>
                  </span>
                  {!isOpen || c.status === 'in_progress' ? <Pill tone={c.status === 'completed' ? 'positive' : c.status === 'in_progress' ? 'accent' : 'neutral'}>{COMMITMENT_STATUS_LABEL[c.status] ?? c.status}</Pill> : null}
                  <span className={`t-small num rg-due ${od ? 'rg-overdue' : 'c3'}`}>{isOpen ? dueLabel(c.dueDate) : fmtDate(c.dueDate)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > open && (
        <div className="rg-more-row">
          <Button size="sm" variant="ghost" aria-expanded={showClosed} onClick={() => setShowClosed(v => !v)}>
            {showClosed ? 'Hide completed and cancelled' : `Show ${items.length - open} completed or cancelled`}
          </Button>
        </div>
      )}
    </section>
  )
}
