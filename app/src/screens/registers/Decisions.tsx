// Decisions register + right-hand detail panel (?open=<id>).
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Archive, ArrowUpRight, ChevronDown, Gavel, Pencil, Plus, Search, X } from 'lucide-react'
import { useInvalidate, useList, useLookups, useRecord } from '../../api/hooks'
import { ApiError, errorMessage, request, ws } from '../../api/http'
import type { DecisionStatus, Stance } from '../../api/types'
import { Avatar, Button, Kbd, StanceBadge } from '../../components/ui'
import { Menu } from '../../components/Menu'
import { ConfirmDialog } from '../../components/Drawer'
import { DecisionDrawer } from '../../forms/RecordForms'
import { useHotkeys } from '../../lib/hotkeys'
import { t } from '../../lib/motion'
import { DECISION_STATUS_LABEL, daysFromToday, fmtDate, fmtRelative } from '../../lib/format'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { FilterChip } from '../directory/Directory'
import { LoadError } from '../Home'
import { ActivityList, PanelSkeleton, SidePanel, SkeletonList, ViewTabs, usePaged } from './Commitments'
import './registers-b.css'

const STATUSES: DecisionStatus[] = ['proposed', 'under_review', 'approved', 'rejected', 'deferred']
const FINAL = new Set<string>(['approved', 'rejected'])
export const isPendingDecision = (s: string) => s === 'proposed' || s === 'under_review'
export const DECISION_TONE: Record<string, 'attention' | 'positive' | 'critical' | 'neutral'> = { under_review: 'attention', approved: 'positive', rejected: 'critical', proposed: 'neutral', deferred: 'neutral' }

/** Restrained status: a coloured dot and a plain label. */
export function DecisionStatusDot({ status }: { status: string }) {
  return <span className="rb-st" data-tone={DECISION_TONE[status] ?? 'neutral'}><i />{DECISION_STATUS_LABEL[status] ?? status}</span>
}

interface DecisionRow {
  id: string; key: string; title: string; status: DecisionStatus; dueDate: string | null; decidedAt: string | null; outcome: string | null
  initiativeId: string | null; initiativeCode: string | null; ownerId: string | null; ownerName: string | null; version: number; updatedAt: string; stakeholderCount: number
}
interface DecisionDetail {
  id: string; key: string; title: string; status: DecisionStatus; description: string | null; context: string | null; outcome: string | null
  dueDate: string | null; decidedAt: string | null; initiativeId: string | null; ownerId: string | null; version: number; archivedAt: string | null; createdAt: string
  stakeholders: { id: string; name: string; title: string | null; stance: Stance; role: string }[]
  owner: { id: string; name: string } | null; initiative: { id: string; code: string; name: string } | null; sourceEngagement: { id: string; key: string; title: string } | null
}

const TABS = [{ id: 'open', label: 'Open' }, { id: 'decided', label: 'Decided' }, { id: 'all', label: 'All' }] as const
type Tab = typeof TABS[number]['id']
const TAB_STATUS: Record<Tab, string | undefined> = { open: 'proposed,under_review', decided: 'approved,rejected', all: undefined }

export function Decisions() {
  const [params, setParams] = useSearchParams()
  const { can } = useSession()
  const { openCreate } = useApp()
  const lookups = useLookups()
  const tab = (TABS.some(x => x.id === params.get('tab')) ? params.get('tab') : 'open') as Tab
  const openId = params.get('open')
  const initiative = params.get('initiative') ?? undefined
  const [text, setText] = useState('')
  const q = useDeferredValue(text.trim()) || undefined
  const [focus, setFocus] = useState(0)
  const [menu, setMenu] = useState<HTMLElement | null>(null)
  const [editing, setEditing] = useState<DecisionDetail | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const setParam = useCallback((k: string, v: string | null) => {
    setParams(p => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n }, { replace: true })
  }, [setParams])
  const setOpen = useCallback((id: string | null) => setParam('open', id), [setParam])
  const setTab = (v: Tab) => { setParam('tab', v === 'open' ? null : v); setFocus(0) }

  const base = { q, initiativeId: initiative }
  const query = usePaged<DecisionRow>('decisions', { ...base, status: TAB_STATUS[tab] }, 100)
  const cOpen = useList<DecisionRow>('decisions', { ...base, status: TAB_STATUS.open, limit: 1 })
  const cDecided = useList<DecisionRow>('decisions', { ...base, status: TAB_STATUS.decided, limit: 1 })
  const cAll = useList<DecisionRow>('decisions', { ...base, limit: 1 })
  const rows = useMemo(() => query.data?.pages.flatMap(p => p.items) ?? [], [query.data])
  const total = query.data?.pages[0]?.total ?? 0
  const loading = query.isPending

  useEffect(() => { setFocus(f => Math.min(f, Math.max(0, rows.length - 1))) }, [rows.length])
  useEffect(() => { if (openId) { const i = rows.findIndex(r => r.id === openId); if (i >= 0) setFocus(i) } }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    f: () => searchRef.current?.focus(), '/': () => searchRef.current?.focus(),
    Escape: () => { if (openId) setOpen(null); else return false },
  }, [rows, focus, openId])

  const initName = lookups.data?.initiatives.find(i => i.id === initiative)
  const filtersActive = !!(q || initiative)
  const clearAll = () => { setText(''); setParam('initiative', null) }

  return (
    <>
      <header className="page-head">
        <div className="crumbs"><span className="here">Decisions</span></div>
        <span className="t-small c3 rb-sub">What was decided, by whom, and what it rested on</span>
        <span className="grow" />
        {can('decision.create') && <Button size="sm" variant="primary" icon={<Plus size={14} />} kbd="C D" onClick={() => openCreate('decision', initiative ? { initiativeId: initiative } : undefined)}>Record decision</Button>}
      </header>
      <div className="toolbar rb-toolbar">
        <ViewTabs id="dc-tabs" label="Decision views" tabs={TABS} value={tab} onChange={setTab} counts={{ open: cOpen.data?.total, decided: cDecided.data?.total, all: cAll.data?.total }} />
        <span className="rb-vsep" />
        <label className="search-field">
          <Search size={14} className="c3" />
          <input ref={searchRef} value={text} onChange={e => setText(e.target.value)} placeholder="Filter by title or key" aria-label="Filter decisions"
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') { (e.target as HTMLInputElement).blur(); listRef.current?.focus() } }} />
          {text ? <button className="clear" aria-label="Clear text filter" onClick={() => setText('')}><X size={12} /></button> : <Kbd>F</Kbd>}
        </label>
        <FilterChip label="Initiative" value={initName?.code} onOpen={setMenu} onClear={() => setParam('initiative', null)} />
        {filtersActive && <button className="link-btn" onClick={clearAll}>Clear</button>}
        <span className="grow" />
        <span className="t-small c3 num rb-count" aria-live="polite">{query.data ? `${total} ${total === 1 ? 'decision' : 'decisions'}` : ''}{query.isFetching && !loading ? ' · updating' : ''}</span>
      </div>

      <div className="grid-wrap rb-wrap" data-peek={openId ? true : undefined}>
        <div className="rb-list rb-dc" role="grid" aria-label="Decisions" tabIndex={0} ref={listRef} aria-busy={loading || undefined}
          aria-activedescendant={rows[focus] ? `dc-${rows[focus].id}` : undefined}>
          <div className="tr thead rb-head" role="row">
            <span className="th" role="columnheader">Key</span>
            <span className="th" role="columnheader">Decision</span>
            <span className="th" role="columnheader">Status</span>
            <span className="th" role="columnheader">Initiative</span>
            <span className="th" role="columnheader">Owner</span>
            <span className="th" role="columnheader">{tab === 'decided' ? 'Decided' : 'Needed by'}</span>
            <span className="th th-right" role="columnheader" title="Stakeholders involved (approvers, consulted, informed, affected)">People</span>
          </div>
          <div className="rb-body" role="rowgroup">
            {query.isError ? <div className="empty"><LoadError error={query.error} onRetry={() => query.refetch()} /></div>
              : loading ? <SkeletonList cols={7} />
              : rows.length === 0 ? (
                filtersActive ? (
                  <div className="empty"><Search size={18} className="c3" /><p className="t-heading">No decisions match</p><p className="c2 t-small">Try a different search or clear the initiative filter.</p><Button size="sm" onClick={clearAll}>Clear filters</Button></div>
                ) : (
                  <div className="empty">
                    <Gavel size={18} className="c3" />
                    <p className="t-heading">{tab === 'open' ? 'No decisions waiting' : tab === 'decided' ? 'Nothing decided yet' : 'No decisions recorded'}</p>
                    <p className="c2 t-small rb-empty-copy">Record decisions as they’re proposed so approvers, context and the eventual outcome stay in one place.</p>
                    {can('decision.create') && <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openCreate('decision')}>Record decision</Button>}
                  </div>
                )
              ) : rows.map((r, i) => {
                const late = isPendingDecision(r.status) && !!r.dueDate && daysFromToday(r.dueDate) < 0
                return (
                  <div key={r.id} id={`dc-${r.id}`} data-i={i} role="row" aria-selected={openId === r.id} className="tr rb-row"
                    data-focus={i === focus || undefined} data-open={openId === r.id || undefined}
                    onMouseDown={() => setFocus(i)} onClick={() => setOpen(openId === r.id ? null : r.id)}>
                    <span className="td mono c3" role="gridcell">{r.key}</span>
                    <span className="td truncate rb-title" role="gridcell" title={r.title}>{r.title}</span>
                    <span className="td" role="gridcell">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span key={r.status} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.base }} exit={{ opacity: 0, transition: t.exit }} style={{ display: 'inline-flex' }}>
                          <DecisionStatusDot status={r.status} />
                        </motion.span>
                      </AnimatePresence>
                    </span>
                    <span className="td" role="gridcell">{r.initiativeCode ? <span className="rb-code mono">{r.initiativeCode}</span> : <span className="c3">—</span>}</span>
                    <span className="td row gap-2" role="gridcell">{r.ownerName ? <><Avatar name={r.ownerName} size={18} internal /><span className="truncate c2 t-small">{r.ownerName}</span></> : <span className="c3 t-small">Unassigned</span>}</span>
                    <span className={`td t-small num ${late ? 'is-overdue' : 'c2'}`} role="gridcell" title={late ? `${-daysFromToday(r.dueDate!)} days past the date it was needed by` : undefined}>
                      {FINAL.has(r.status) && r.decidedAt ? <span className="c3">{tab === 'decided' ? '' : 'Decided '}{fmtDate(r.decidedAt)}</span> : r.dueDate ? fmtDate(r.dueDate, { day: 'numeric', month: 'short', year: daysFromToday(r.dueDate) > 300 ? 'numeric' : undefined }) : <span className="c3">—</span>}
                    </span>
                    <span className="td td-right num c2" role="gridcell">{r.stakeholderCount || <span className="c3">—</span>}</span>
                  </div>
                )
              })}
            {query.hasNextPage && <div className="rb-more"><Button size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more</Button><span className="t-small c3 num">Showing {rows.length} of {total}</span></div>}
          </div>
          {rows.length > 0 && <div className="rb-foot t-small c3" aria-hidden><span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span><span><Kbd>↵</Kbd> open</span><span><Kbd>Esc</Kbd> close</span></div>}
        </div>

        <AnimatePresence>
          {openId && <DecisionPanel key="panel" id={openId} onClose={() => { setOpen(null); listRef.current?.focus({ preventScroll: true }) }} onEdit={setEditing} />}
        </AnimatePresence>
      </div>

      <Menu anchor={menu} open={!!menu} onClose={() => setMenu(null)} label="Initiative"
        options={(lookups.data?.initiatives ?? []).map(i => ({ value: i.id, label: i.name, hint: i.code }))} selected={initiative ? [initiative] : []}
        onSelect={v => setParam('initiative', v)} />
      <DecisionDrawer open={!!editing} onClose={() => setEditing(null)} record={editing as never} />
    </>
  )
}

const ROLE_ORDER = ['approver', 'consulted', 'informed', 'affected']
const ROLE_LABEL: Record<string, string> = { approver: 'Approvers', consulted: 'Consulted', informed: 'Informed', affected: 'Affected' }
/** Outcome drafts survive closing the panel or switching records. */
const outcomeDrafts = new Map<string, string>()

function DecisionPanel({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (d: DecisionDetail) => void }) {
  const { can } = useSession()
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const rec = useRecord<DecisionDetail>('decisions', id)
  const d = rec.data?.id === id ? rec.data : undefined
  const statusBtn = useRef<HTMLButtonElement>(null)
  const outcomeRef = useRef<HTMLTextAreaElement>(null)
  const [menu, setMenu] = useState(false)
  const [target, setTarget] = useState<'approved' | 'rejected' | null>(null)
  const [outcome, setOutcomeState] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const canDecide = can('decision.update') && !!d && !d.archivedAt
  const setOutcome = (v: string) => { setOutcomeState(v); outcomeDrafts.set(id, v) }

  useEffect(() => { setTarget(null) }, [id])

  const beginFinal = (to: 'approved' | 'rejected') => {
    setTarget(to)
    setOutcomeState(outcomeDrafts.get(id) ?? d?.outcome ?? '')
  }

  const change = async (to: DecisionStatus, withOutcome?: string) => {
    if (!d || saving || to === d.status && withOutcome === undefined) return
    const from = d.status
    // Re-send the current stakeholders: the server's partial update schema otherwise defaults them to [] and unlinks everyone.
    const stakeholders = d.stakeholders.map(x => ({ stakeholderId: x.id, role: x.role }))
    setSaving(true)
    try {
      const res = await request<{ version: number }>(ws(`/decisions/${d.id}`), { method: 'PATCH', body: { status: to, stakeholders, version: d.version, ...(withOutcome !== undefined ? { outcome: withOutcome.trim() || null } : {}) } })
      await invalidate()
      outcomeDrafts.delete(id)
      setTarget(null)
      toast(`${d.key} ${DECISION_STATUS_LABEL[to].toLowerCase()}`, async () => {
        try { await request(ws(`/decisions/${d.id}`), { method: 'PATCH', body: { status: from, stakeholders, version: res.version } }) }
        catch (e) { toast(e instanceof ApiError && e.isConflict ? `${d.key} changed since — showing the latest` : errorMessage(e), undefined, 'error') }
        await invalidate()
      })
    } catch (e) {
      // The typed outcome stays in place (and in the draft map) so nothing is lost.
      toast(e instanceof ApiError && e.isConflict ? `${d.key} was changed by someone else — showing the latest. Check it, then try again.` : errorMessage(e), undefined, 'error')
      await rec.refetch()
      await invalidate()
    } finally { setSaving(false) }
  }

  const archive = async () => {
    if (!d) return
    setArchiving(true)
    try { await request(ws(`/decisions/${d.id}/archive`), { method: 'POST', body: {} }); setConfirm(false); onClose(); await invalidate(); toast(`${d.key} archived`) }
    catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setArchiving(false) }
  }

  const groups = useMemo(() => ROLE_ORDER.map(role => ({ role, people: d?.stakeholders.filter(s => s.role === role) ?? [] })).filter(g => g.people.length), [d])
  const late = !!d && isPendingDecision(d.status) && !!d.dueDate && daysFromToday(d.dueDate) < 0
  const notFound = rec.error instanceof ApiError && rec.error.status === 404

  return (
    <SidePanel label={d ? `${d.key} ${d.title}` : 'Decision'} kind="Decision" onClose={onClose} busy={!d}
      foot={d && (
        <>
          {canDecide && <Button size="sm" icon={<Pencil size={13} />} onClick={() => onEdit(d)}>Edit</Button>}
          {can('decision.archive') && !d.archivedAt && <Button size="sm" variant="ghost" icon={<Archive size={13} />} onClick={() => setConfirm(true)}>Archive</Button>}
          <span className="grow" />
          <span className="t-small c3 rb-hint"><Kbd>J</Kbd> <Kbd>K</Kbd> next / previous</span>
        </>
      )}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={d ? id : 'loading'} className="peek-body" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
          {notFound ? <p className="c2">This decision doesn’t exist or isn’t visible to you.</p>
            : rec.isError ? <LoadError error={rec.error} onRetry={() => rec.refetch()} />
            : !d ? <PanelSkeleton />
            : (
              <>
                {d.archivedAt && <p className="rb-archived t-small"><Archive size={13} />Archived {fmtRelative(d.archivedAt)} — kept for the record.</p>}
                <div>
                  <span className="mono c3">{d.key}</span>
                  <h2 className="t-title rb-p-h">{d.title}</h2>
                </div>

                <div className="rb-status-row">
                  {canDecide ? (
                    <button ref={statusBtn} className="rb-status-btn" aria-haspopup="listbox" aria-label={`Status: ${DECISION_STATUS_LABEL[d.status]}. Change`} onClick={() => setMenu(true)} disabled={saving}>
                      <StatusSwap status={d.status} />
                      <ChevronDown size={13} className="c3" />
                    </button>
                  ) : <span className="rb-status-static"><StatusSwap status={d.status} /></span>}
                  <span className="t-small c3">
                    {FINAL.has(d.status) && d.decidedAt ? `Decided ${fmtDate(d.decidedAt, { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : d.dueDate ? <span className={late ? 'is-overdue' : ''}>Needed by {fmtDate(d.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}{late ? ` · ${-daysFromToday(d.dueDate)} days late` : ''}</span>
                      : 'No decision date set'}
                  </span>
                  {!can('decision.update') && <span className="t-small c3 rb-perm">Managers change status</span>}
                </div>

                <AnimatePresence initial={false}>
                  {target && (
                    <motion.div className="rb-outcome" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1, transition: t.base }} exit={{ height: 0, opacity: 0, transition: t.exit }}
                      onAnimationComplete={() => outcomeRef.current?.focus({ preventScroll: true })}>
                      <form className="rb-outcome-inner" onSubmit={e => { e.preventDefault(); if (outcome.trim()) void change(target, outcome) }}>
                        <label htmlFor="dc-outcome" className="t-caption">Outcome <span className="c3">— what was decided, and any conditions</span></label>
                        <textarea ref={outcomeRef} id="dc-outcome" className="input rb-textarea" rows={3} value={outcome} onChange={e => setOutcome(e.target.value)} maxLength={8000}
                          placeholder={target === 'approved' ? 'e.g. Approved subject to a revised noise survey before construction' : 'e.g. Rejected — cost exceeds the agreed envelope; revisit in Q3'}
                          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') setTarget(null); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && outcome.trim()) void change(target, outcome) }} />
                        <div className="row gap-2">
                          <span className="t-small c3 grow">Recorded on the decision and in its history.</span>
                          <Button size="sm" variant="ghost" type="button" onClick={() => setTarget(null)}>Cancel</Button>
                          <Button size="sm" variant={target === 'rejected' ? 'danger' : 'primary'} type="submit" loading={saving} disabled={!outcome.trim()}>
                            {target === 'approved' ? 'Mark approved' : 'Mark rejected'}
                          </Button>
                        </div>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>

                {d.outcome && !target && <section className="peek-sec"><h3 className="label-rule">Outcome</h3><p className="rb-prose rb-outcome-text">{d.outcome}</p></section>}

                <dl className="peek-facts">
                  <div><dt>Decision owner</dt><dd className="row gap-2">{d.owner ? <><Avatar name={d.owner.name} size={18} internal /><span className="truncate">{d.owner.name}</span></> : <span className="c3">Unassigned</span>}</dd></div>
                  <div><dt>Initiative</dt><dd className="row gap-2 truncate">{d.initiative ? <><span className="rb-code mono">{d.initiative.code}</span><span className="truncate c2">{d.initiative.name}</span></> : <span className="c3">None</span>}</dd></div>
                </dl>

                {d.sourceEngagement && (
                  <Link className="rb-source" to={`/engagements/${d.sourceEngagement.id}`}>
                    <span className="t-caption c3">Raised in</span>
                    <span className="mono c3">{d.sourceEngagement.key}</span>
                    <span className="truncate grow">{d.sourceEngagement.title}</span>
                    <ArrowUpRight size={13} className="c3" />
                  </Link>
                )}

                <section className="peek-sec">
                  <h3 className="label-rule">Stakeholders <span className="num">{d.stakeholders.length}</span></h3>
                  {groups.length === 0 && <p className="t-small c3">No stakeholders linked. Edit the decision to add approvers and the people it affects.</p>}
                  {groups.map(g => (
                    <div key={g.role} className="rb-group">
                      <span className="t-caption c3 rb-group-h">{ROLE_LABEL[g.role] ?? g.role}</span>
                      {g.people.map(p => (
                        <Link key={p.id} to={`/stakeholders/${p.id}`} className="peek-rel">
                          <Avatar name={p.name} size={18} />
                          <span className="truncate grow">{p.name}{p.title && <span className="c3 t-small"> · {p.title}</span>}</span>
                          <StanceBadge stance={p.stance} compact />
                        </Link>
                      ))}
                    </div>
                  ))}
                </section>

                {(d.description || d.context) && (
                  <section className="peek-sec">
                    <h3 className="label-rule">Context</h3>
                    {d.description && <p className="rb-prose">{d.description}</p>}
                    {d.context && <p className="rb-prose c2">{d.context}</p>}
                  </section>
                )}

                <section className="peek-sec"><h3 className="label-rule">History</h3><ActivityList type="decision" id={d.id} /></section>
              </>
            )}
        </motion.div>
      </AnimatePresence>

      <Menu anchor={statusBtn.current} open={menu} onClose={() => setMenu(false)} label="Set status"
        options={STATUSES.map(s => ({ value: s, label: DECISION_STATUS_LABEL[s], icon: <span className="rb-st rb-st-dot" data-tone={DECISION_TONE[s]}><i /></span>, hint: FINAL.has(s) ? 'asks for outcome' : undefined }))}
        selected={d ? [d.status] : []}
        onSelect={s => { if (!d || s === d.status) return; if (s === 'approved' || s === 'rejected') beginFinal(s); else { setTarget(null); void change(s) } }} />
      <ConfirmDialog open={confirm} title={`Archive ${d?.key}?`} danger busy={archiving} confirmLabel="Archive" onCancel={() => setConfirm(false)} onConfirm={() => void archive()}
        body="It will be removed from the register and Home signals. Its stakeholders, outcome and history are kept." />
    </SidePanel>
  )
}

/** Crossfades the status when it changes so the update is visible. */
function StatusSwap({ status }: { status: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span key={status} style={{ display: 'inline-flex' }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: t.base }} exit={{ opacity: 0, y: -4, transition: t.exit }}>
        <DecisionStatusDot status={status} />
      </motion.span>
    </AnimatePresence>
  )
}
