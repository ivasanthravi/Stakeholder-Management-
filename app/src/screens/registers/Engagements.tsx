// Engagements: the chronological record of contact (/engagements) and the meeting record (/engagements/:id)
// where notes turn into follow-through — select text in the notes to create a commitment or record a decision.
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, CalendarDays, CheckCircle2, Gavel, MapPin, MessagesSquare, MoreHorizontal, Pencil, Plus, Search, Sparkles, X } from 'lucide-react'
import { useInvalidate, useLookups, useRecord } from '../../api/hooks'
import { ApiError, errorMessage, request, ws } from '../../api/http'
import type { CommitmentStatus, DecisionStatus, Stance } from '../../api/types'
import { Avatar, Button, Kbd, Skeleton, StanceBadge } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Drawer'
import { NotFound } from '../../components/NotFound'
import { EngagementDrawer } from '../../forms/RecordForms'
import { useHotkeys } from '../../lib/hotkeys'
import { popVariants, t } from '../../lib/motion'
import { daysFromToday, dueLabel, ENGAGEMENT_KIND_LABEL, fmtDate, fmtRelative } from '../../lib/format'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { FilterChip } from '../directory/Directory'
import { KIND_ICON } from '../Profile'
import { LoadError } from '../Home'
import { ActivityList, CCheck, Floating, usePaged, useCommitmentToggle } from './Commitments'
import { DecisionStatusDot } from './Decisions'
import '../engagement/engagement.css'
import './registers-b.css'

const KINDS = Object.keys(ENGAGEMENT_KIND_LABEL)
const kindIcon = (k: string) => KIND_ICON[k] ?? MessagesSquare

interface EngagementRow {
  id: string; key: string; kind: string; title: string; occurredAt: string; summary: string | null
  initiativeId: string | null; initiativeCode: string | null; ownerId: string | null; ownerName: string | null; participants: { id: string; name: string }[]
}

/* ── Register ────────────────────────────────────────────────────────────── */

export function Engagements() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { can } = useSession()
  const { openCreate } = useApp()
  const lookups = useLookups()
  const kinds = useMemo(() => params.get('kind')?.split(',').filter(k => KINDS.includes(k)) ?? [], [params])
  const initiative = params.get('initiative') ?? undefined
  const stakeholderId = params.get('stakeholderId') ?? undefined
  const person = useRecord<{ id: string; name: string }>('stakeholders', stakeholderId)
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim()) || undefined
  const [focus, setFocus] = useState(0)
  const [menu, setMenu] = useState<{ kind: 'kind' | 'init'; el: HTMLElement } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const setParam = useCallback((k: string, v: string | null) => {
    setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  }, [setParams])

  const query = usePaged<EngagementRow>('engagements', { q, kind: kinds, initiativeId: initiative, stakeholderId }, 50)
  const rows = useMemo(() => query.data?.pages.flatMap(p => p.items) ?? [], [query.data])
  const total = query.data?.pages[0]?.total ?? 0
  const loading = query.isPending
  useEffect(() => { setFocus(f => Math.min(f, Math.max(0, rows.length - 1))) }, [rows.length])
  useEffect(() => { setFocus(0) }, [q, kinds, initiative, stakeholderId])

  // Group by calendar month; each group gets a sticky header.
  const groups = useMemo(() => {
    const out: { label: string; items: { r: EngagementRow; i: number }[] }[] = []
    rows.forEach((r, i) => {
      const label = fmtDate(r.occurredAt, { month: 'long', year: 'numeric' })
      if (out[out.length - 1]?.label !== label) out.push({ label, items: [] })
      out[out.length - 1].items.push({ r, i })
    })
    return out
  }, [rows])

  const move = (d: number) => {
    if (!rows.length) return
    const n = Math.max(0, Math.min(rows.length - 1, focus + d))
    setFocus(n)
    listRef.current?.querySelector<HTMLElement>(`[data-i="${n}"]`)?.scrollIntoView({ block: 'nearest' })
    if (n >= rows.length - 3 && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
  }
  useHotkeys({
    j: () => move(1), ArrowDown: () => move(1), k: () => move(-1), ArrowUp: () => move(-1),
    Enter: () => { if (rows[focus]) nav(`/engagements/${rows[focus].id}`) },
    f: () => searchRef.current?.focus(), '/': () => searchRef.current?.focus(),
  }, [rows, focus, query.hasNextPage, query.isFetchingNextPage])

  const initName = lookups.data?.initiatives.find(i => i.id === initiative)
  const filtersActive = !!(q || kinds.length || initiative || stakeholderId)
  const clearAll = () => { setText(''); setParams(new URLSearchParams(), { replace: true }) }
  const log = () => openCreate('engagement', {
    ...(initiative ? { initiativeId: initiative } : {}),
    ...(person.data ? { participantIds: [person.data.id], participantOptions: [{ id: person.data.id, name: person.data.name }] } : {}),
  })
  const now = Date.now()

  return (
    <>
      <header className="page-head">
        <div className="crumbs"><span className="here">Engagements</span></div>
        <span className="t-small c3 rb-sub">Every meeting, call and conversation, newest first</span>
        <span className="grow" />
        {can('engagement.create') && <Button size="sm" variant="primary" icon={<Plus size={14} />} kbd="C E" onClick={log}>Log engagement</Button>}
      </header>
      <div className="toolbar rb-toolbar">
        <label className="search-field">
          <Search size={14} className="c3" />
          <input ref={searchRef} value={text} onChange={e => setText(e.target.value)} placeholder="Search title, summary or key" aria-label="Search engagements"
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') { (e.target as HTMLInputElement).blur(); listRef.current?.focus() } }} />
          {text ? <button className="clear" aria-label="Clear search" onClick={() => setText('')}><X size={12} /></button> : <Kbd>F</Kbd>}
        </label>
        <FilterChip label="Type" value={kinds.length ? kinds.map(k => ENGAGEMENT_KIND_LABEL[k]).join(', ') : undefined} onOpen={el => setMenu({ kind: 'kind', el })} onClear={() => setParam('kind', null)} />
        <FilterChip label="Initiative" value={initName?.code} onOpen={el => setMenu({ kind: 'init', el })} onClear={() => setParam('initiative', null)} />
        {stakeholderId && (
          <span className="chip chip-on"><span className="chip-main"><span className="chip-k">With</span><span className="chip-v truncate">{person.data?.name ?? '…'}</span></span>
            <button className="chip-x" aria-label="Clear stakeholder filter" onClick={() => setParam('stakeholderId', null)}><X size={12} /></button></span>
        )}
        {filtersActive && <button className="link-btn" onClick={clearAll}>Clear all</button>}
        <span className="grow" />
        <span className="t-small c3 num rb-count" aria-live="polite">{query.data ? `${total.toLocaleString()} ${total === 1 ? 'engagement' : 'engagements'}` : ''}{query.isFetching && !loading ? ' · updating' : ''}</span>
      </div>

      <div className="rb-list rb-eg" role="grid" aria-label="Engagements" tabIndex={0} ref={listRef} aria-busy={loading || undefined}
        aria-activedescendant={rows[focus] ? `eg-${rows[focus].id}` : undefined}>
        <div className="rb-body" role="presentation">
          {query.isError ? <div className="empty"><LoadError error={query.error} onRetry={() => query.refetch()} /></div>
            : loading ? <EngagementSkeleton />
            : rows.length === 0 ? (
              filtersActive ? (
                <div className="empty"><Search size={18} className="c3" /><p className="t-heading">No engagements match</p><p className="c2 t-small">Try a broader search or remove a filter.</p><Button size="sm" onClick={clearAll}>Clear filters</Button></div>
              ) : (
                <div className="empty">
                  <CalendarDays size={18} className="c3" />
                  <p className="t-heading">No engagements logged yet</p>
                  <p className="c2 t-small rb-empty-copy">Log meetings, calls and site visits as they happen. Each one becomes part of the stakeholder’s history, and its notes can be turned into commitments and decisions.</p>
                  {can('engagement.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={log}>Log engagement</Button>}
                </div>
              )
            ) : groups.map(g => (
              <section key={g.label} className="eg-group" role="rowgroup" aria-label={g.label}>
                <h3 className="eg-month" role="row"><span role="columnheader">{g.label}</span>{!(g === groups[groups.length - 1] && query.hasNextPage) && <span className="num c3" role="columnheader">{g.items.length}</span>}</h3>
                {g.items.map(({ r, i }) => {
                  const Icon = kindIcon(r.kind)
                  const shown = r.participants.slice(0, 3)
                  return (
                    <div key={r.id} id={`eg-${r.id}`} data-i={i} role="row" className="eg-row" data-focus={i === focus || undefined}
                      onMouseDown={() => setFocus(i)} onClick={e => { if (e.metaKey || e.ctrlKey) window.open(`/engagements/${r.id}`, '_blank'); else nav(`/engagements/${r.id}`) }}>
                      <span className="eg-ico" role="gridcell" title={ENGAGEMENT_KIND_LABEL[r.kind] ?? r.kind}><Icon size={13} /><span className="sr-only">{ENGAGEMENT_KIND_LABEL[r.kind]}</span></span>
                      <span className="eg-main" role="gridcell">
                        <Link to={`/engagements/${r.id}`} className="eg-title truncate" onClick={e => e.stopPropagation()} tabIndex={-1}>{r.title}</Link>
                        {r.summary && <span className="eg-sum truncate">{r.summary}</span>}
                      </span>
                      <span className="mono c3 eg-key" role="gridcell">{r.key}</span>
                      <span className="eg-people" role="gridcell" title={r.participants.map(p => p.name).join(', ')}>
                        {r.participants.length === 0 ? <span className="c3 t-small">No participants</span> : (
                          <>
                            <span className="eg-avs">{shown.map(p => <Avatar key={p.id} name={p.name} size={20} />)}</span>
                            <span className="truncate t-small c2">{r.participants.length === 1 ? r.participants[0].name : `${r.participants[0].name.split(' ')[0]}, ${r.participants[1].name.split(' ')[0]}${r.participants.length > 2 ? ` +${r.participants.length - 2}` : ''}`}</span>
                          </>
                        )}
                      </span>
                      <span className="eg-init" role="gridcell">{r.initiativeCode ? <span className="rb-code mono" title={lookups.data?.initiatives.find(x => x.id === r.initiativeId)?.name}>{r.initiativeCode}</span> : null}</span>
                      <span className="eg-owner row gap-2" role="gridcell">{r.ownerName && <><Avatar name={r.ownerName} size={18} internal /><span className="truncate t-small c2">{r.ownerName.split(' ')[0]}</span></>}</span>
                      <time className="eg-when t-small c3 num" role="gridcell" dateTime={r.occurredAt} title={new Date(r.occurredAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}>{fmtRelative(r.occurredAt, now)}</time>
                    </div>
                  )
                })}
              </section>
            ))}
          {query.hasNextPage && (
            <div className="rb-more" role="row"><span role="gridcell" style={{ display: "contents" }}><Button size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load 50 more</Button><span className="t-small c3 num">Showing {rows.length} of {total.toLocaleString()}</span></span></div>
          )}
          {!query.hasNextPage && rows.length > 20 && <p className="rb-end t-small c3">That’s everything — {total.toLocaleString()} engagements.</p>}
        </div>
      </div>

      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'kind'} onClose={() => setMenu(null)} label="Engagement type" multi
        options={KINDS.map(k => { const I = kindIcon(k); return { value: k, label: ENGAGEMENT_KIND_LABEL[k], icon: <I size={13} className="c3" /> } })} selected={kinds}
        onSelect={k => setParam('kind', (kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k]).join(',') || null)} />
      <Menu anchor={menu?.el ?? null} open={menu?.kind === 'init'} onClose={() => setMenu(null)} label="Initiative"
        options={(lookups.data?.initiatives ?? []).map(i => ({ value: i.id, label: i.name, hint: i.code }))} selected={initiative ? [initiative] : []}
        onSelect={v => setParam('initiative', v)} />
    </>
  )
}

function EngagementSkeleton() {
  return (
    <div aria-hidden>
      <div className="eg-month"><Skeleton w={110} h={10} /></div>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="eg-row rb-skel">
          <Skeleton w={26} h={26} r={13} />
          <span className="eg-main"><Skeleton w={160 + ((i * 41) % 200)} h={11} /></span>
          <span className="eg-key"><Skeleton w={40} h={10} /></span>
          <span className="eg-people"><Skeleton w={110} h={12} /></span>
          <span className="eg-init"><Skeleton w={30} h={12} /></span>
          <span className="eg-owner"><Skeleton w={60} h={10} /></span>
          <span className="eg-when"><Skeleton w={40} h={10} /></span>
        </div>
      ))}
    </div>
  )
}

/* ── Engagement record ───────────────────────────────────────────────────── */

interface EngagementDetail {
  id: string; key: string; kind: string; title: string; occurredAt: string; summary: string | null; notes: string | null
  initiativeId: string | null; ownerId: string | null; version: number; archivedAt: string | null; createdAt: string; updatedAt: string
  details: { location?: string; agenda?: string } | null
  participants: { id: string; name: string; title: string | null; stance: Stance; attendance: string | null }[]
  owner: { id: string; name: string } | null; initiative: { id: string; code: string; name: string } | null
  commitments: { id: string; key: string; title: string; status: CommitmentStatus; dueDate: string | null }[]
  decisions: { id: string; key: string; title: string; status: DecisionStatus }[]
}

const MAX_TITLE = 300
const toTitle = (s: string) => { const one = s.replace(/\s+/g, ' ').trim(); return one.length > MAX_TITLE ? one.slice(0, MAX_TITLE - 1).trimEnd() + '…' : one }

export function EngagementPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { can } = useSession()
  const { openCreate, toast, setPeek } = useApp()
  const invalidate = useInvalidate()
  const rec = useRecord<EngagementDetail>('engagements', id)
  const d = rec.data?.id === id ? rec.data : undefined
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)

  useEffect(() => { setPeek(null) }, [setPeek])

  const first = d?.participants[0]
  const create = useCallback((kind: 'commitment' | 'decision', title?: string) => {
    if (!d) return
    const onCreated = (r: { id: string }) => setFresh(r.id)
    if (kind === 'commitment') openCreate('commitment', {
      sourceEngagementId: d.id, initiativeId: d.initiativeId, ...(title ? { title } : {}),
      ...(first ? { stakeholderId: first.id, stakeholderOption: { id: first.id, name: first.name } } : {}),
    }, onCreated)
    else openCreate('decision', { sourceEngagementId: d.id, initiativeId: d.initiativeId, ...(title ? { title } : {}) }, onCreated)
  }, [d, first, openCreate])

  const editable = !!d && !d.archivedAt && can('engagement.update')
  useHotkeys({
    e: () => { if (editable) setEditing(true) },
    // Re-declared so the "C E" chord still logs an engagement while E is bound here.
    'c e': () => { if (can('engagement.create')) openCreate('engagement') },
    Escape: () => { if (window.getSelection()?.isCollapsed === false) { window.getSelection()?.removeAllRanges(); return } nav('/engagements') },
  }, [editable])

  if (rec.error instanceof ApiError && rec.error.status === 404) return <NotFound what="Engagement" back="/engagements" backLabel="All engagements" />

  const archive = async () => {
    if (!d) return
    setBusy(true)
    try {
      await request(ws(`/engagements/${d.id}/archive`), { method: 'POST', body: {} })
      setConfirm(false)
      await invalidate()
      toast(`${d.key} archived`)
      nav('/engagements')
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false) }
  }

  const Icon = kindIcon(d?.kind ?? '')
  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          <Link to="/engagements">Engagements</Link><span className="sep">/</span>
          <span className="here mono">{d?.key ?? <Skeleton w={50} h={11} />}</span>
        </div>
        <span className="grow" />
        {editable && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)} kbd="E">Edit</Button>}
        {d && !d.archivedAt && can('engagement.archive') && <Button ref={moreBtn} size="sm" variant="ghost" icon={<MoreHorizontal size={15} />} aria-label="More actions" onClick={() => setMoreOpen(true)} />}
      </header>

      <div className="eg-page">
        <div className="eg-doc">
          <div className="mt-doc-inner">
            {rec.isError && !d ? <LoadError error={rec.error} onRetry={() => rec.refetch()} /> : !d ? <DocSkeleton /> : (
              <>
                {d.archivedAt && <p className="rb-archived t-small"><Archive size={13} />Archived {fmtRelative(d.archivedAt)}. Hidden from timelines; kept for the record.</p>}
                <div className="mt-meta">
                  <span className="mt-kind"><Icon size={12} />{ENGAGEMENT_KIND_LABEL[d.kind] ?? d.kind}</span>
                  <time className="t-small c2" dateTime={d.occurredAt}>{new Date(d.occurredAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                  {d.details?.location && <span className="t-small c3 row gap-1"><MapPin size={12} />{d.details.location}</span>}
                  {d.initiative && <Link to={`/initiatives/${d.initiative.id}`} className="row gap-1 t-small c2 eg-initlink"><span className="mt-init mono">{d.initiative.code}</span>{d.initiative.name}</Link>}
                  {d.owner && <span className="t-small c3 row gap-1 eg-loggedby"><Avatar name={d.owner.name} size={16} internal />Owner {d.owner.name}</span>}
                </div>
                <h1 className="t-display mt-title">{d.title}</h1>
                <div className="mt-people" aria-label="Participants">
                  {d.participants.map(p => (
                    <Link key={p.id} to={`/stakeholders/${p.id}`} className="mt-person" title={[p.title, p.attendance && p.attendance !== 'attended' ? p.attendance : null].filter(Boolean).join(' · ') || undefined}>
                      <Avatar name={p.name} size={22} />{p.name}<StanceBadge stance={p.stance} compact />
                    </Link>
                  ))}
                  {d.participants.length === 0 && <span className="t-small c3">No stakeholders recorded as participants.</span>}
                </div>
                {d.summary && <p className="eg-lede">{d.summary}</p>}
                <Notes d={d} canCommit={can('commitment.create') && !d.archivedAt} canDecide={can('decision.create') && !d.archivedAt} onCreate={create} hover={hover} setHover={setHover} onEdit={editable ? () => setEditing(true) : undefined} />
                <section className="eg-activity">
                  <h3 className="label-rule">Activity</h3>
                  <ActivityList type="engagement" id={d.id} />
                </section>
              </>
            )}
          </div>
        </div>

        <aside className="eg-rail" aria-label="Follow-through">
          <div className="eg-rail-head">
            <h2 className="t-heading">Follow-through</h2>
            {d && <span className="t-small c3 num">{d.commitments.length + d.decisions.length}</span>}
          </div>
          <div className="eg-rail-body">
            {!d ? <div className="rb-hist-skel"><Skeleton w="60%" h={10} /><Skeleton h={10} /><Skeleton w="80%" h={10} /></div> : (
              <FollowThrough d={d} hover={hover} setHover={setHover} fresh={fresh} onCreate={create} />
            )}
            <div className="eg-ai" role="note" aria-label="AI extraction preview — not available">
              <Sparkles size={13} aria-hidden />
              <div>
                <p className="eg-ai-h">AI extraction · Preview</p>
                <p className="t-small">Not available in this version. Nothing on this page is generated — commitments and decisions here were recorded by people.</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {d && <EngagementDrawer open={editing} onClose={() => setEditing(false)} record={d as never} />}
      <Menu anchor={moreBtn.current} open={moreOpen} onClose={() => setMoreOpen(false)} label="More actions"
        options={[{ value: 'archive', label: 'Archive engagement…', icon: <Archive size={13} /> }]} onSelect={() => setConfirm(true)} />
      <ConfirmDialog open={confirm} title={`Archive ${d?.key}?`} danger busy={busy} confirmLabel="Archive" onCancel={() => setConfirm(false)} onConfirm={() => void archive()}
        body="It will be hidden from timelines and stakeholder histories. Commitments and decisions that came from it are kept." />
    </>
  )
}

function DocSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading engagement" style={{ display: 'grid', gap: 14 }}>
      <Skeleton w={220} h={12} /><Skeleton w="70%" h={26} />
      <div className="row gap-2"><Skeleton w={120} h={28} r={14} /><Skeleton w={140} h={28} r={14} /></div>
      <Skeleton h={14} /><Skeleton w="94%" h={14} /><Skeleton w="88%" h={14} /><Skeleton w="60%" h={14} />
    </div>
  )
}

/** Escape a string for use inside a RegExp, allowing any run of whitespace where the source has whitespace. */
const looseRe = (s: string) => new RegExp(s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))

function Notes({ d, canCommit, canDecide, onCreate, hover, setHover, onEdit }: {
  d: EngagementDetail; canCommit: boolean; canDecide: boolean; onCreate: (k: 'commitment' | 'decision', title: string) => void
  hover: string | null; setHover: (id: string | null) => void; onEdit?: () => void
}) {
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null)
  const notes = d.notes ?? ''

  // Provenance: where a sourced commitment/decision's title appears verbatim in the notes, mark it and link to the record.
  const segments = useMemo(() => {
    const links = [
      ...d.commitments.map(c => ({ id: c.id, key: c.key, title: c.title, href: `/commitments?open=${c.id}`, kind: 'commitment' })),
      ...d.decisions.map(x => ({ id: x.id, key: x.key, title: x.title, href: `/decisions?open=${x.id}`, kind: 'decision' })),
    ].filter(l => l.title.replace(/…$/, '').trim().length >= 12)
    const hits: { start: number; end: number; l: typeof links[number] }[] = []
    for (const l of links) {
      const m = looseRe(l.title.replace(/…$/, '')).exec(notes)
      if (m && !hits.some(h => m.index < h.end && m.index + m[0].length > h.start)) hits.push({ start: m.index, end: m.index + m[0].length, l })
    }
    hits.sort((a, b) => a.start - b.start)
    const out: ReactNode[] = []
    let at = 0
    for (const h of hits) {
      if (h.start > at) out.push(notes.slice(at, h.start))
      out.push(
        <mark key={h.l.id} className="eg-mark" data-kind={h.l.kind} data-active={hover === h.l.id || undefined} title={`${h.l.key} — open ${h.l.kind}`}
          onMouseEnter={() => setHover(h.l.id)} onMouseLeave={() => setHover(null)}
          onClick={() => { if (window.getSelection()?.isCollapsed !== false) nav(h.l.href) }}>{notes.slice(h.start, h.end)}</mark>,
      )
      at = h.end
    }
    if (at < notes.length) out.push(notes.slice(at))
    return out
  }, [notes, d.commitments, d.decisions, hover, setHover, nav])

  const read = useCallback(() => {
    const s = window.getSelection()
    if (!s || s.isCollapsed || !s.rangeCount || !ref.current) { setSel(null); return }
    const r = s.getRangeAt(0)
    if (!ref.current.contains(r.commonAncestorContainer)) { setSel(null); return }
    const text = s.toString().replace(/\s+/g, ' ').trim()
    if (text.length < 3) { setSel(null); return }
    const rects = r.getClientRects()
    const top = rects[0] ?? r.getBoundingClientRect()
    const box = r.getBoundingClientRect()
    const below = top.top < 110
    const x = Math.min(window.innerWidth - 150, Math.max(150, below ? box.left + box.width / 2 : top.left + top.width / 2))
    setSel({ text, x, y: below ? box.bottom + 8 : top.top - 8, below })
  }, [])

  useEffect(() => {
    const onChange = () => { const s = window.getSelection(); if (!s || s.isCollapsed) setSel(null) }
    const onScroll = () => { if (window.getSelection()?.isCollapsed === false) read() }
    document.addEventListener('selectionchange', onChange)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => { document.removeEventListener('selectionchange', onChange); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll) }
  }, [read])

  const act = (k: 'commitment' | 'decision') => {
    if (!sel) return
    const title = toTitle(sel.text)
    window.getSelection()?.removeAllRanges()
    setSel(null)
    onCreate(k, title)
  }

  if (!notes.trim()) return (
    <div className="eg-nonotes">
      <p className="c2">No notes recorded for this {(ENGAGEMENT_KIND_LABEL[d.kind] ?? 'engagement').toLowerCase()}.</p>
      {onEdit && <Button size="sm" icon={<Pencil size={13} />} onClick={onEdit}>Add notes</Button>}
    </div>
  )

  return (
    <>
      <div className="eg-notes-head">
        <h3 className="label-rule">Notes</h3>
        {(canCommit || canDecide) && <span className="t-small c3 eg-hint">Select text to turn it into a commitment or decision</span>}
      </div>
      <div ref={ref} className="mt-notes eg-notes" onMouseUp={() => requestAnimationFrame(read)} onKeyUp={e => { if (e.shiftKey) read() }}>{segments}</div>
      <Floating>
        <AnimatePresence>
          {sel && (canCommit || canDecide) && (
            <div className="eg-selbar-pos" style={{ left: sel.x, top: sel.y, transform: `translate(-50%, ${sel.below ? '0' : '-100%'})` }}>
              <motion.div className="eg-selbar" role="toolbar" aria-label="Create from selected text" variants={popVariants} initial="initial" animate="animate" exit="exit"
                onMouseDown={e => e.preventDefault()}>
                {canCommit && <button className="eg-selbtn" onClick={() => act('commitment')}><CheckCircle2 size={13} />Create commitment</button>}
                {canCommit && canDecide && <span className="eg-selsep" />}
                {canDecide && <button className="eg-selbtn" onClick={() => act('decision')}><Gavel size={13} />Record decision</button>}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Floating>
    </>
  )
}

function FollowThrough({ d, hover, setHover, fresh, onCreate }: {
  d: EngagementDetail; hover: string | null; setHover: (id: string | null) => void; fresh: string | null; onCreate: (k: 'commitment' | 'decision') => void
}) {
  const { can } = useSession()
  const toggle = useCommitmentToggle()
  const canUpdate = can('commitment.update')
  const active = !d.archivedAt
  return (
    <>
      <section className="eg-sec">
        <header className="eg-sec-head">
          <span className="t-caption">Commitments</span><span className="t-caption c3 num">{d.commitments.length}</span><span className="grow" />
          {active && can('commitment.create') && <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => onCreate('commitment')}>New commitment</Button>}
        </header>
        {d.commitments.length === 0 ? <p className="t-small c3 eg-empty">Nothing agreed yet. Promises made in this {(ENGAGEMENT_KIND_LABEL[d.kind] ?? 'engagement').toLowerCase()} — by your team or theirs — belong here.</p> : (
          <ul className="clist">
            <AnimatePresence initial={false}>
              {d.commitments.map(c => {
                const status = toggle.statusOf(c)
                const done = status === 'completed'
                const overdue = !done && status !== 'cancelled' && !!c.dueDate && daysFromToday(c.dueDate) < 0
                return (
                  <motion.li key={c.id} layout="position" className="citem" data-done={done || undefined} data-hl={hover === c.id || fresh === c.id || undefined}
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: t.base }} exit={{ opacity: 0, transition: t.exit }}
                    onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
                    <CCheck done={done} disabled={!canUpdate} label={`Mark ${c.key} ${done ? 'open' : 'complete'}`} onToggle={() => void toggle.flip(c)} />
                    <span className="grow">
                      <Link to={`/commitments?open=${c.id}`} className="cstmt">{c.title}</Link>
                      <span className="cmeta t-small">
                        <span className="mono">{c.key}</span>
                        <span className={overdue ? 'is-overdue' : 'c3'}>{done ? 'Completed' : status === 'cancelled' ? 'Cancelled' : dueLabel(c.dueDate)}</span>
                      </span>
                    </span>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>
      <section className="eg-sec">
        <header className="eg-sec-head">
          <span className="t-caption">Decisions</span><span className="t-caption c3 num">{d.decisions.length}</span><span className="grow" />
          {active && can('decision.create') && <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => onCreate('decision')}>Record decision</Button>}
        </header>
        {d.decisions.length === 0 ? <p className="t-small c3 eg-empty">No decisions raised or made here.</p> : (
          <ul className="eg-dlist">
            <AnimatePresence initial={false}>
              {d.decisions.map(x => (
                <motion.li key={x.id} layout="position" data-hl={hover === x.id || fresh === x.id || undefined}
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: t.base }} exit={{ opacity: 0, transition: t.exit }}
                  onMouseEnter={() => setHover(x.id)} onMouseLeave={() => setHover(null)}>
                  <Link to={`/decisions?open=${x.id}`} className="eg-ditem">
                    <span className="row gap-2"><span className="mono c3">{x.key}</span><span className="grow" /><DecisionStatusDot status={x.status} /></span>
                    <span className="eg-dtitle">{x.title}</span>
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>
    </>
  )
}

