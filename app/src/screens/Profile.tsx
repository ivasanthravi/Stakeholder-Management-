import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, Archive, ArrowUpRight, Building2, Clock, Footprints, Gavel, Lock, Mail, MapPin, MessagesSquare, MoreHorizontal, Network,
  NotebookPen, Pencil, Phone, Plus, Presentation, RotateCcw, Sparkles, Users as UsersIcon, X,
} from 'lucide-react'
import { useActivity, useInvalidate, useOverview } from '../api/hooks'
import { ApiError, errorMessage, request, ws } from '../api/http'
import type { CommitmentBrief, Overview, RelationshipView, StakeholderDetail } from '../api/types'
import { Avatar, Button, Cite, Kbd, LevelMeter, Pill, Skeleton, StanceBadge } from '../components/ui'
import { Menu } from '../components/Menu'
import { ConfirmDialog, Drawer, DrawerActions } from '../components/Drawer'
import { Field, FormError, SelectField, useForm } from '../components/form'
import { NotFound } from '../components/NotFound'
import { EgoGraph } from './profile/EgoGraph'
import { StakeholderDrawer } from '../forms/RecordForms'
import { OrganizationPicker, StakeholderPicker } from '../forms/pickers'
import { useHotkeys } from '../lib/hotkeys'
import { useApp } from '../shell/context'
import { useSession } from '../session/session'
import { t } from '../lib/motion'
import {
  COMMITMENT_STATUS_LABEL, daysFromToday, DECISION_STATUS_LABEL, dueLabel, ENGAGEMENT_KIND_LABEL, fmtDate, fmtRelative, isOpenStatus, isoToday,
  LEVEL_LABEL, RELATIONSHIP_LABEL,
} from '../lib/format'
import { RELATIONSHIP_TYPES } from '../../shared/schemas'
import { LoadError } from './Home'
import { z } from 'zod'
import './profile/profile.css'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Engagements' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'commitments', label: 'Commitments & decisions' },
  { id: 'history', label: 'History' },
] as const
type TabId = typeof TABS[number]['id']
const DAY = 86_400_000

export const KIND_ICON: Record<string, typeof MessagesSquare> = {
  meeting: UsersIcon, call: Phone, email: Mail, site_visit: Footprints, workshop: Presentation, consultation: UsersIcon, note: NotebookPen, other: MessagesSquare,
}

export function Profile() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const { setPeek, openCreate, toast } = useApp()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const ov = useOverview(id)
  const data = ov.data?.stakeholder.id === id ? ov.data : undefined
  const tab = (params.get('tab') as TabId) || 'overview'
  const setTab = (tb: TabId) => { const n = new URLSearchParams(params); if (tb === 'overview') n.delete('tab'); else n.set('tab', tb); setParams(n, { replace: true }) }
  const scrollRef = useRef<HTMLDivElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<'archive' | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setPeek(null) }, [setPeek])
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }) }, [id])

  const s = data?.stakeholder
  const logEngagement = () => s && openCreate('engagement', { participantIds: [s.id], participantOptions: [{ id: s.id, name: s.name }], initiativeId: s.initiatives[0]?.id ?? null })

  useHotkeys({
    '[': () => setTab(TABS[Math.max(0, TABS.findIndex(x => x.id === tab) - 1)].id),
    ']': () => setTab(TABS[Math.min(TABS.length - 1, TABS.findIndex(x => x.id === tab) + 1)].id),
    Escape: () => { nav('/stakeholders') },
    m: () => { nav(`/stakeholders?view=map&focus=${id}`) },
    e: () => { if (s && can('stakeholder.update') && !s.archivedAt) setEditing(true) },
    l: () => { if (can('engagement.create')) logEngagement() },
  }, [tab, id, s])

  if (ov.error instanceof ApiError && ov.error.status === 404) return <NotFound what="Stakeholder" back="/stakeholders" backLabel="All stakeholders" />

  const archiveToggle = async (archive: boolean) => {
    setBusy(true)
    try {
      await request(ws(`/stakeholders/${id}/${archive ? 'archive' : 'restore'}`), { method: 'POST', body: {} })
      await invalidate()
      toast(archive ? `${s?.name} archived` : `${s?.name} restored`, archive ? async () => { await request(ws(`/stakeholders/${id}/restore`), { method: 'POST', body: {} }); await invalidate() } : undefined)
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false); setConfirm(null) }
  }
  const toggleRestricted = async () => {
    if (!s) return
    try { await request(ws(`/stakeholders/${id}`), { method: 'PATCH', body: { restricted: !s.restricted, version: s.version } }); await invalidate(); toast(s.restricted ? 'Visible to everyone in the workspace' : 'Restricted to owners, admins and the access list') }
    catch (e) { toast(errorMessage(e), undefined, 'error') }
  }

  const org = s?.organizations.find(o => !o.validTo && o.isPrimary) ?? s?.organizations.find(o => !o.validTo)

  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          <Link to="/stakeholders">Stakeholders</Link><span className="sep">/</span>
          {org && <><Link to={`/organizations/${org.organizationId}`} className="truncate">{org.name}</Link><span className="sep">/</span></>}
          <span className="here truncate">{s?.name ?? <Skeleton w={120} h={11} />}</span>
        </div>
        <span className="grow" />
        <Button size="sm" icon={<Network size={14} />} onClick={() => nav(`/stakeholders?view=map&focus=${id}`)} kbd="M">Show in map</Button>
        {s && can('stakeholder.update') && !s.archivedAt && <Button size="sm" icon={<Pencil size={13} />} onClick={() => setEditing(true)} kbd="E">Edit</Button>}
        {s && can('engagement.create') && !s.archivedAt && <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={logEngagement} kbd="L">Log engagement</Button>}
        {s && (can('stakeholder.archive') || can('stakeholder.restrict')) && <Button ref={moreBtn} size="sm" variant="ghost" icon={<MoreHorizontal size={15} />} aria-label="More actions" onClick={() => setMenu(true)} />}
      </header>

      <div className="prof-scroll" ref={scrollRef}>
        <div className="prof">
          {ov.isError && !data ? <LoadError error={ov.error} onRetry={() => ov.refetch()} /> : !data || !s ? <ProfileSkeleton /> : (
            <>
              {s.archivedAt && (
                <div className="archived-banner" role="status">
                  <Archive size={14} /><span className="grow">Archived {fmtRelative(s.archivedAt)}. Hidden from lists, the map and signals.</span>
                  {can('stakeholder.archive') && <Button size="sm" icon={<RotateCcw size={13} />} loading={busy} onClick={() => void archiveToggle(false)}>Restore</Button>}
                </div>
              )}
              <Hero s={s} d={data} />
              <LayoutGroup id="prof-tabs">
                <div className="tabs" role="tablist" aria-label="Profile sections">
                  {TABS.map(tb => (
                    <button key={tb.id} role="tab" aria-selected={tab === tb.id} aria-controls={tab === tb.id ? `panel-${tb.id}` : undefined} id={`tab-${tb.id}`} className="tab" onClick={() => setTab(tb.id)}>
                      {tb.label}
                      <TabCount d={data} tab={tb.id} />
                      {tab === tb.id && <motion.span layoutId="tab-ind" className="tab-ind" transition={t.indicator} />}
                    </button>
                  ))}
                  <span className="grow" />
                  <span className="tabs-hint t-small c3"><Kbd>[</Kbd> <Kbd>]</Kbd></span>
                </div>
              </LayoutGroup>
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={tab + id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } }} exit={{ opacity: 0, transition: { duration: 0.07 } }}>
                    {tab === 'overview' && <OverviewTab d={data} onTab={setTab} />}
                    {tab === 'activity' && <Timeline d={data} />}
                    {tab === 'relationships' && <RelationshipsTab d={data} />}
                    {tab === 'commitments' && <CommitmentsTab d={data} />}
                    {tab === 'history' && <HistoryTab d={data} />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </>
          )}
        </div>
      </div>

      {s && <StakeholderDrawer open={editing} onClose={() => setEditing(false)} record={s as never} />}
      <Menu anchor={moreBtn.current} open={menu} onClose={() => setMenu(false)} label="More actions"
        options={[
          ...(can('stakeholder.restrict') ? [{ value: 'restrict', label: s?.restricted ? 'Remove restriction' : 'Restrict visibility…', icon: <Lock size={13} /> }] : []),
          ...(can('stakeholder.archive') ? [s?.archivedAt ? { value: 'restore', label: 'Restore', icon: <RotateCcw size={13} /> } : { value: 'archive', label: 'Archive', icon: <Archive size={13} /> }] : []),
        ]}
        onSelect={v => { if (v === 'archive') setConfirm('archive'); else if (v === 'restore') void archiveToggle(false); else if (v === 'restrict') void toggleRestricted() }} />
      <ConfirmDialog open={confirm === 'archive'} title={`Archive ${s?.name}?`} danger busy={busy} confirmLabel="Archive"
        body="They’ll be hidden from lists, the map and Home signals. History, commitments and decisions are kept, and you can restore them at any time."
        onCancel={() => setConfirm(null)} onConfirm={() => void archiveToggle(true)} />
    </>
  )
}

function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading profile">
      <div className="hero"><div className="hero-id"><Skeleton w={52} h={52} r={26} /><div style={{ flex: 1, display: 'grid', gap: 10 }}><Skeleton w={260} h={22} /><Skeleton w={320} h={12} /><Skeleton w={420} h={20} /></div></div></div>
      <div className="tabs"><Skeleton w={380} h={12} /></div>
      <div className="ov"><div className="ov-main"><div className="card" style={{ display: 'grid', gap: 10 }}><Skeleton w="40%" h={12} /><Skeleton h={14} /><Skeleton w="92%" h={14} /><Skeleton w="76%" h={14} /></div></div><aside className="ov-rail"><div className="card" style={{ height: 260 }}><Skeleton w="50%" h={12} /></div></aside></div>
    </div>
  )
}

function TabCount({ d, tab }: { d: Overview; tab: TabId }) {
  const n = tab === 'activity' ? d.engagementTotal : tab === 'relationships' ? d.relationships.length : tab === 'commitments' ? d.commitments.filter(c => isOpenStatus(c.status)).length : null
  return n == null ? null : <span className="tab-count num">{n}</span>
}

/* ── Hero ──────────────────────────────────────────────────────────── */
function Hero({ s, d }: { s: StakeholderDetail; d: Overview }) {
  const org = s.organizations.find(o => !o.validTo && o.isPrimary) ?? s.organizations.find(o => !o.validTo)
  const actions = nextActions(d)
  const last = d.engagements[0]
  return (
    <section className="hero">
      <div className="hero-id">
        <motion.div layoutId={`avatar-${s.id}`} transition={t.panel}><Avatar name={s.name} size={52} /></motion.div>
        <div className="grow">
          <h1 className="t-display">{s.name}{s.restricted && <span className="restricted-tag" title="Restricted: visible only to owners, admins and the access list"><Lock size={13} />Restricted</span>}</h1>
          <p className="hero-sub">
            {s.title && <span>{s.title}</span>}
            {s.title && org && <span className="dot-sep" />}
            {org && <Link to={`/organizations/${org.organizationId}`} className="inline-link">{org.name}</Link>}
            {s.location && <><span className="dot-sep" /><span className="row gap-1 c3"><MapPin size={12} />{s.location}</span></>}
            {!s.title && !org && !s.location && <span className="c3">No role or organization recorded</span>}
          </p>
          <div className="hero-tags">
            <StanceBadge stance={s.stance} />
            {s.influence && <span className="tag"><LevelMeter value={s.influence} label="Influence" /> {LEVEL_LABEL[s.influence]} influence</span>}
            {s.interest && <span className="tag"><LevelMeter value={s.interest} label="Interest" /> {LEVEL_LABEL[s.interest]} interest</span>}
            {s.initiatives.map(i => <Link key={i.id} className="tag tag-link" to={`/initiatives/${i.id}`} title={i.name}><span className="mono">{i.code}</span>{i.role ?? i.name}</Link>)}
            {s.engagementStatus === 'do_not_contact' && <Pill tone="critical">Do not contact</Pill>}
            {s.tags.map(tg => <span key={tg} className="tag">{tg}</span>)}
          </div>
        </div>
        <dl className="hero-meta">
          <div><dt>Relationship owner</dt><dd>{s.owner ? <><Avatar name={s.owner.name} size={18} internal />{s.owner.name}</> : <span className="attention-text">Unassigned</span>}</dd></div>
          <div><dt>Last engaged</dt><dd className="num">{last ? fmtRelative(last.occurredAt) : <span className="c3">Never</span>}</dd></div>
          <div><dt>Contact</dt><dd className="truncate">{s.email ? <a className="inline-link truncate" href={`mailto:${s.email}`}>{s.email}</a> : s.phone ?? <span className="c3">—</span>}</dd></div>
        </dl>
      </div>
      {actions.length > 0 && (
        <div className="next" aria-label="Needs attention">
          <span className="next-label">Needs attention</span>
          {actions.map((a, i) => (
            <motion.div key={a.id} className={`next-item next-${a.tone}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0, transition: { ...t.base, delay: 0.05 + i * 0.03 } }}>
              <a.icon size={14} /><span className="grow"><strong>{a.title}</strong> <span className="c2">{a.detail}</span></span>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  )
}

function nextActions(d: Overview) {
  const s = d.stakeholder
  const out: { id: string; tone: 'critical' | 'attention' | 'neutral'; icon: typeof Clock; title: string; detail: string }[] = []
  const overdue = d.commitments.filter(c => isOpenStatus(c.status) && c.dueDate && daysFromToday(c.dueDate) < 0)
  if (overdue.length) out.push({ id: 'od', tone: 'critical', icon: AlertCircle, title: `${overdue.length} overdue commitment${overdue.length > 1 ? 's' : ''}`, detail: `oldest due ${fmtDate(overdue.map(c => c.dueDate!).sort()[0])}` })
  for (const dc of d.decisions.filter(x => x.role === 'approver' && (x.status === 'proposed' || x.status === 'under_review')).slice(0, 2)) out.push({ id: dc.id, tone: 'attention', icon: Gavel, title: `Approver on ${dc.key}`, detail: `${DECISION_STATUS_LABEL[dc.status].toLowerCase()} · ${dc.title}` })
  const now = Date.now()
  const recent = d.engagements.filter(e => now - Date.parse(e.occurredAt) <= 60 * DAY).length
  const prior = d.engagements.filter(e => { const x = now - Date.parse(e.occurredAt); return x > 60 * DAY && x <= 120 * DAY }).length
  const last = d.engagements[0]
  if ((s.influence ?? 0) >= 3 && prior >= 3 && recent <= prior * 0.4) out.push({ id: 'cool', tone: 'attention', icon: Clock, title: 'Contact has slowed', detail: `${recent} in 60 days vs ${prior} before` })
  else if ((s.influence ?? 0) >= 3 && (!last || now - Date.parse(last.occurredAt) > 60 * DAY)) out.push({ id: 'stale', tone: 'neutral', icon: Clock, title: 'No recent contact', detail: last ? `last ${fmtRelative(last.occurredAt)}` : 'never engaged' })
  if (!s.owner && (s.influence ?? 0) >= 3) out.push({ id: 'own', tone: 'neutral', icon: UsersIcon, title: 'No relationship owner', detail: 'assign someone accountable' })
  return out.slice(0, 4)
}

/* ── Overview ──────────────────────────────────────────────────────── */
function OverviewTab({ d, onTab }: { d: Overview; onTab: (t: TabId) => void }) {
  const { openCreate } = useApp()
  const { can } = useSession()
  const s = d.stakeholder
  const [kept, setKept] = useState<Set<string>>(new Set())
  const open = d.commitments.filter(c => isOpenStatus(c.status) || kept.has(c.id)).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  return (
    <div className="ov">
      <div className="ov-main">
        <BriefingCard d={d} onTab={onTab} />
        <section className="card">
          <header className="card-head">
            <h2 className="t-heading">Engagement</h2><span className="c3 t-small">52 weeks</span><span className="grow" />
            <Button size="sm" variant="ghost" onClick={() => onTab('activity')}>All engagements <ArrowUpRight size={13} /></Button>
          </header>
          <ActivityStrip series={d.series} />
          <Timeline d={d} limit={5} compact />
        </section>
      </div>
      <aside className="ov-rail">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Network</h2><span className="c3 t-small num">{d.relationships.length} relationship{d.relationships.length === 1 ? '' : 's'}</span></header>
          <EgoGraph s={s} relationships={d.relationships} />
        </section>
        <section className="card">
          <header className="card-head">
            <h2 className="t-heading">Open commitments</h2><span className="c3 t-small num">{open.filter(c => isOpenStatus(c.status)).length}</span><span className="grow" />
            {can('commitment.create') && <Button size="sm" variant="ghost" icon={<Plus size={13} />} aria-label="New commitment" onClick={() => openCreate('commitment', { stakeholderId: s.id, stakeholderOption: { id: s.id, name: s.name }, initiativeId: s.initiatives[0]?.id ?? null })} />}
          </header>
          {open.length === 0 ? <p className="c3 t-small card-empty">Nothing open with {s.name.split(' ')[0]}.</p> : <CommitmentList items={open.slice(0, 6)} onToggle={id => setKept(k => new Set(k).add(id))} />}
          {open.length > 6 && <button className="more" onClick={() => onTab('commitments')}>Show {open.length - 6} more</button>}
        </section>
        {d.decisions.length > 0 && (
          <section className="card">
            <header className="card-head"><h2 className="t-heading">Decisions</h2></header>
            <DecisionList d={d} />
          </section>
        )}
        <Affiliations s={s} />
      </aside>
    </div>
  )
}

function BriefingCard({ d, onTab }: { d: Overview; onTab: (t: TabId) => void }) {
  const brief = d.briefing
  const [active, setActive] = useState<number | null>(null)
  const nav = useNavigate()
  const src = active != null ? brief.sources[active - 1] : null
  const openSource = () => {
    if (!src) return
    if (src.kind === 'engagement') nav(`/engagements/${src.id}`)
    else if (src.kind === 'decision') nav(`/decisions?open=${src.id}`)
    else if (src.kind === 'commitment') onTab('commitments')
    else if (src.kind === 'relationship') onTab('relationships')
    else onTab('history')
  }
  return (
    <section className="brief" aria-labelledby="brief-h">
      <header className="brief-head">
        <Sparkles size={14} className="ai-ico" />
        <h2 id="brief-h" className="t-heading">Briefing</h2>
        <span className="c3 t-small">Assembled from {brief.basis}</span>
        <span className="grow" />
        <span className="legend"><i className="lg-fact" />Recorded fact</span>
        <span className="legend"><i className="lg-inf" />Inference</span>
      </header>
      <div className="brief-text">
        {brief.sentences.map((x, i) => (
          <span key={i} className={`bs bs-${x.kind}`} data-hl={x.cites.includes(active ?? -1) || undefined}>
            {x.kind === 'inference' && <span className="inf-tag">Inferred</span>}
            {x.text}
            {x.cites.map(c => <Cite key={c} n={c} label={brief.sources[c - 1]?.label ?? ''} onClick={() => setActive(active === c ? null : c)} />)}{' '}
          </span>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {src && (
          <motion.div className="src" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto', transition: t.base }} exit={{ opacity: 0, height: 0, transition: t.exit }}>
            <div className="src-inner">
              <span className="cite cite-static">{active}</span>
              <span className="t-caption c3 src-kind">{src.kind}</span>
              <span className="grow truncate">{src.label}</span>
              {src.at && <span className="c3 t-small num">{fmtDate(src.at)}</span>}
              <Button size="sm" variant="ghost" onClick={openSource}>Open</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="brief-foot t-small c3">Assembled by rules from this workspace’s records — no language model is used. Every claim cites the record it came from.</footer>
    </section>
  )
}

function ActivityStrip({ series }: { series: number[] }) {
  const max = Math.max(1, ...series)
  const months: string[] = []
  for (let i = 11; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); months.push(d.toLocaleDateString('en-GB', { month: 'short' })) }
  const total = series.reduce((a, b) => a + b, 0)
  return (
    <div className="strip" role="img" aria-label={`${total} engagements in the last 52 weeks; ${series.slice(-8).reduce((a, b) => a + b, 0)} in the last 8 weeks`}>
      <div className="strip-bars">
        {series.map((v, i) => (
          <motion.i key={i} style={{ height: `${v === 0 ? 2 : 6 + (v / max) * 34}px` }} data-zero={v === 0 || undefined} data-recent={i >= series.length - 8 || undefined}
            initial={{ scaleY: 0 }} animate={{ scaleY: 1, transition: { duration: 0.28, ease: [0.2, 0, 0, 1], delay: i * 0.004 } }} title={`${v} engagement${v === 1 ? '' : 's'}`} />
        ))}
      </div>
      <div className="strip-axis">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
    </div>
  )
}

export function Timeline({ d, limit, compact }: { d: Overview; limit?: number; compact?: boolean }) {
  const nav = useNavigate()
  const [kind, setKind] = useState<string>('all')
  const kinds = useMemo(() => [...new Set(d.engagements.map(e => e.kind))], [d.engagements])
  const items = (kind === 'all' ? d.engagements : d.engagements.filter(e => e.kind === kind)).slice(0, limit ?? 200)
  let lastMonth = ''
  return (
    <div className={`tl ${compact ? 'tl-compact' : 'card'}`}>
      {!compact && kinds.length > 1 && (
        <div className="tl-filter">
          <button className="fchip" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>All {d.engagements.length}</button>
          {kinds.map(k => <button key={k} className="fchip" aria-pressed={kind === k} onClick={() => setKind(k)}>{ENGAGEMENT_KIND_LABEL[k] ?? k}</button>)}
        </div>
      )}
      {items.length === 0 && <p className="c3 t-small card-empty">No engagement recorded yet.</p>}
      <ol>
        {items.map(e => {
          const Icon = KIND_ICON[e.kind] ?? MessagesSquare
          const m = fmtDate(e.occurredAt, { month: 'long', year: 'numeric' })
          const header = !compact && m !== lastMonth ? (lastMonth = m) : null
          return (
            <li key={e.id}>
              {header && <div className="tl-month">{header}</div>}
              <button className="tl-item" onClick={() => nav(`/engagements/${e.id}`)}>
                <span className="tl-ico"><Icon size={13} /></span>
                <span className="grow tl-content">
                  <span className="row gap-2"><span className="t-strong truncate">{e.title}</span><span className="mono c3 tl-key">{e.key}</span><span className="grow" /><span className="c3 t-small num" title={new Date(e.occurredAt).toLocaleString('en-GB')}>{fmtRelative(e.occurredAt)}</span></span>
                  {e.summary && <span className="c2 t-small tl-sum">{e.summary}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {!compact && d.engagementTotal >= 200 && <p className="t-small c3 card-empty">Showing the latest 200. <Link className="inline-link" to={`/engagements?stakeholderId=${d.stakeholder.id}`}>See all in Engagements</Link></p>}
    </div>
  )
}

/** Commitments with the completion interaction. Writes go to the server with optimistic concurrency. */
export function CommitmentList({ items, onToggle }: { items: CommitmentBrief[]; onToggle?: (id: string) => void }) {
  const { toast } = useApp()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const [optimistic, setOptimistic] = useState<Record<string, string>>({})
  const flip = async (c: CommitmentBrief) => {
    const done = (optimistic[c.id] ?? c.status) === 'completed'
    const next = done ? 'open' : 'completed'
    onToggle?.(c.id)
    setOptimistic(o => ({ ...o, [c.id]: next }))
    try {
      const r = await request<{ version: number }>(ws(`/commitments/${c.id}`), { method: 'PATCH', body: { status: next, version: c.version } })
      await invalidate()
      toast(`${c.key} ${next === 'completed' ? 'completed' : 'reopened'}`, async () => {
        setOptimistic(o => ({ ...o, [c.id]: c.status }))
        try { await request(ws(`/commitments/${c.id}`), { method: 'PATCH', body: { status: c.status, version: r.version } }); await invalidate() } catch (e) { toast(errorMessage(e), undefined, 'error') }
      })
    } catch (e) {
      setOptimistic(o => { const n = { ...o }; delete n[c.id]; return n })
      toast(e instanceof ApiError && e.isConflict ? `${c.key} was changed by someone else — showing the latest` : errorMessage(e), undefined, 'error')
      await invalidate()
    }
  }
  return (
    <ul className="clist">
      <AnimatePresence initial={false}>
        {items.map(c => {
          const status = optimistic[c.id] ?? c.status
          const done = status === 'completed'
          const overdue = !done && c.dueDate && daysFromToday(c.dueDate) < 0
          return (
            <motion.li key={c.id} layout="position" className="citem" data-done={done || undefined} transition={t.base}>
              <button className="ccheck" role="checkbox" aria-checked={done} aria-label={`Mark ${c.key} ${done ? 'open' : 'complete'}`} disabled={!can('commitment.update')} onClick={() => void flip(c)}>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="6.75" /><path d="M5 8.2 7.1 10.2 11 6" /></svg>
              </button>
              <span className="grow">
                <Link to={`/commitments?open=${c.id}`} className="cstmt">{c.title}</Link>
                <span className="cmeta t-small">
                  <span className="mono">{c.key}</span>
                  <span className={overdue ? 'is-overdue' : 'c3'}>{done ? 'Completed' : dueLabel(c.dueDate)}</span>
                  <span className="c3">{c.direction === 'theirs' ? 'They owe' : `We owe${c.ownerName ? ` · ${c.ownerName.split(' ')[0]}` : ''}`}</span>
                </span>
              </span>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

function DecisionList({ d }: { d: Overview }) {
  return (
    <ul className="dlist">
      {d.decisions.map(x => (
        <li key={x.id} className="ditem">
          <Link to={`/decisions?open=${x.id}`} className="row gap-2"><span className="mono c3">{x.key}</span><span className="grow truncate t-strong">{x.title}</span></Link>
          <div className="row gap-2 t-small">
            <Pill tone={x.status === 'approved' ? 'positive' : x.status === 'rejected' ? 'critical' : x.status === 'under_review' ? 'attention' : 'neutral'}>{DECISION_STATUS_LABEL[x.status]}</Pill>
            <span className="c3">{x.role ? x.role[0].toUpperCase() + x.role.slice(1) : ''}</span>
            <span className="grow" />
            {x.dueDate && <span className="c3 num">{fmtDate(x.dueDate)}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Affiliations({ s }: { s: StakeholderDetail }) {
  const { can } = useSession()
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const [adding, setAdding] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [busy, setBusy] = useState(false)
  const current = s.organizations.filter(o => !o.validTo), past = s.organizations.filter(o => o.validTo)
  const add = async () => {
    if (!orgId) return
    setBusy(true)
    try { await request(ws(`/stakeholders/${s.id}/organizations`), { method: 'POST', body: { organizationId: orgId, role: role || null, isPrimary: current.length === 0 } }); await invalidate(); setAdding(false); setOrgId(null); setRole(''); toast('Organization added') }
    catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false) }
  }
  const end = async (assocId: string, name: string) => {
    try { await request(ws(`/stakeholders/${s.id}/organizations/${assocId}/end`), { method: 'POST', body: { validTo: isoToday() } }); await invalidate(); toast(`Ended association with ${name} (kept in history)`) }
    catch (e) { toast(errorMessage(e), undefined, 'error') }
  }
  return (
    <section className="card">
      <header className="card-head"><h2 className="t-heading">Organizations</h2><span className="grow" />
        {can('stakeholder.update') && !s.archivedAt && <Button size="sm" variant="ghost" icon={<Plus size={13} />} aria-label="Add organization" onClick={() => setAdding(a => !a)} />}
      </header>
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div className="aff-add" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1, transition: t.base }} exit={{ height: 0, opacity: 0, transition: t.exit }}>
            <div className="aff-add-inner">
              <OrganizationPicker value={orgId} onChange={setOrgId} />
              <Field label="Role">{p => <input {...p} className="input" value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Chief Planner" />}</Field>
              <div className="row gap-2"><span className="grow" /><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button size="sm" variant="primary" loading={busy} disabled={!orgId} onClick={() => void add()}>Add</Button></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {current.length === 0 && !adding && <p className="c3 t-small card-empty">No current organization.</p>}
      <ul className="aff-list">
        {current.map(a => (
          <li key={a.id} className="aff">
            <Building2 size={14} className="c3" />
            <span className="grow"><Link to={`/organizations/${a.organizationId}`} className="t-strong">{a.name}</Link>{a.role && <span className="c2 t-small"> · {a.role}</span>}
              <span className="t-small c3" style={{ display: 'block' }}>{a.validFrom ? `Since ${fmtDate(a.validFrom, { month: 'short', year: 'numeric' })}` : 'Current'}{a.isPrimary ? ' · primary' : ''}</span></span>
            {can('stakeholder.update') && <button className="icon-btn" title="End association (kept as history)" aria-label={`End association with ${a.name}`} onClick={() => void end(a.id, a.name)}><X size={12} /></button>}
          </li>
        ))}
        {past.map(a => (
          <li key={a.id} className="aff aff-past">
            <Building2 size={14} className="c3" />
            <span className="grow"><Link to={`/organizations/${a.organizationId}`}>{a.name}</Link>{a.role && <span className="t-small"> · {a.role}</span>}
              <span className="t-small c3" style={{ display: 'block' }}>{a.validFrom ? fmtDate(a.validFrom, { month: 'short', year: 'numeric' }) : '…'} – {fmtDate(a.validTo, { month: 'short', year: 'numeric' })}</span></span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── Relationships ─────────────────────────────────────────────────── */
const relFormSchema = z.object({ type: z.enum(RELATIONSHIP_TYPES), otherKind: z.enum(['stakeholder', 'organization']), otherId: z.string().min(1, 'Choose who this relationship is with'), direction: z.enum(['out', 'in']), strength: z.string().optional(), status: z.enum(['confirmed', 'inferred']) })
function RelationshipsTab({ d }: { d: Overview }) {
  const nav = useNavigate()
  const { can } = useSession()
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<RelationshipView | null>(null)
  const [busy, setBusy] = useState(false)
  const rels = d.relationships.slice().sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try { await request(ws(`/relationships/${removing.id}/archive`), { method: 'POST', body: {} }); await invalidate(); toast('Relationship removed') }
    catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(false); setRemoving(null) }
  }
  return (
    <div className="card">
      <header className="card-head"><h2 className="t-heading">Relationships</h2><span className="c3 t-small">{rels.length} recorded</span><span className="grow" />
        {can('relationship.create') && <Button size="sm" icon={<Plus size={13} />} onClick={() => setAdding(true)}>Add relationship</Button>}
      </header>
      {rels.length === 0 ? <p className="c3 t-small card-empty">No relationships recorded. Relationships power the map and help you see who influences whom.</p> : (
        <div className="rtable" role="table" aria-label="Relationships">
          <div className="rrow rhead" role="row"><span role="columnheader">Relationship</span><span role="columnheader">With</span><span role="columnheader">Stance</span><span role="columnheader">Strength</span><span role="columnheader">Basis</span><span role="columnheader" /></div>
          {rels.map(r => (
            <div key={r.id} className="rrow" role="row">
              <span role="cell" className="c2">{(RELATIONSHIP_LABEL[r.type] ?? ['Related to', 'Related to'])[r.direction === 'out' ? 0 : 1]}</span>
              <button role="cell" className="row gap-2 rlink" onClick={() => nav(r.otherKind === 'stakeholder' ? `/stakeholders/${r.other.id}?tab=relationships` : `/organizations/${r.other.id}`)}>
                {r.otherKind === 'stakeholder' ? <Avatar name={r.other.name} size={20} /> : <Building2 size={15} className="c3" />}<span className="truncate t-strong">{r.other.name}</span>
              </button>
              <span role="cell">{r.other.stance ? <StanceBadge stance={r.other.stance} /> : <span className="c3 t-small">Organization</span>}</span>
              <span role="cell" className="rel-strength" title={r.strength ? `Strength ${r.strength} of 3` : 'Strength not recorded'}>{[1, 2, 3].map(i => <i key={i} data-on={(r.strength ?? 0) >= i || undefined} />)}</span>
              <span role="cell">{r.status === 'inferred' ? <Pill tone="ai">Inferred</Pill> : <span className="c3 t-small">Confirmed</span>}</span>
              <span role="cell">{can('relationship.archive') && <button className="icon-btn" aria-label={`Remove relationship with ${r.other.name}`} title="Remove" onClick={() => setRemoving(r)}><X size={12} /></button>}</span>
            </div>
          ))}
        </div>
      )}
      <RelationshipDrawer open={adding} onClose={() => setAdding(false)} s={d.stakeholder} />
      <ConfirmDialog open={!!removing} danger busy={busy} title="Remove this relationship?" confirmLabel="Remove" onCancel={() => setRemoving(null)} onConfirm={() => void remove()}
        body={removing ? `${d.stakeholder.name} ${(RELATIONSHIP_LABEL[removing.type] ?? ['related to'])[removing.direction === 'out' ? 0 : 1].toLowerCase()} ${removing.other.name}. It will be archived and kept in history.` : ''} />
    </div>
  )
}

function RelationshipDrawer({ open, onClose, s }: { open: boolean; onClose: () => void; s: StakeholderDetail }) {
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const form = useForm(relFormSchema, { type: 'influences', otherKind: 'stakeholder', otherId: '', direction: 'out', strength: '2', status: 'confirmed' })
  useEffect(() => { if (open) form.reset({ type: 'influences', otherKind: 'stakeholder', otherId: '', direction: 'out', strength: '2', status: 'confirmed' }) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => form.submit(async v => {
    const me = { kind: 'stakeholder' as const, id: s.id }, other = { kind: v.otherKind, id: v.otherId }
    await request(ws('/relationships'), { method: 'POST', body: { source: v.direction === 'out' ? me : other, target: v.direction === 'out' ? other : me, type: v.type, strength: v.strength ? Number(v.strength) : null, status: v.status } })
    await invalidate(); toast('Relationship added'); onClose()
  })
  return (
    <Drawer open={open} onClose={onClose} title="Add relationship" subtitle={`Record how ${s.name} relates to another person or organization.`} dirty={form.dirty} onSubmit={submit}
      footer={<DrawerActions submitting={form.submitting} onCancel={onClose} onSubmit={submit} label="Add relationship" />}>
      <div className="form-grid">
        <SelectField form={form} name="otherKind" label="With a" options={[{ value: 'stakeholder', label: 'Person' }, { value: 'organization', label: 'Organization' }]} />
        <SelectField form={form} name="type" label="Relationship" options={RELATIONSHIP_TYPES.map(r => ({ value: r, label: RELATIONSHIP_LABEL[r][0] }))} />
        <div className="span-2">
          {form.values.otherKind === 'stakeholder'
            ? <StakeholderPicker form={form} name="otherId" label="Person" />
            : <OrganizationPicker value={(form.values.otherId as string) || null} onChange={v => form.set('otherId', v ?? '')} error={form.error('otherId')} />}
        </div>
        <SelectField form={form} name="direction" label="Direction" options={[{ value: 'out', label: `${s.name.split(' ')[0]} → them` }, { value: 'in', label: `Them → ${s.name.split(' ')[0]}` }]} hint="Ignored for symmetric types (colleague, allied, opposes, partner)" />
        <SelectField form={form} name="strength" label="Strength" options={[{ value: '1', label: 'Weak' }, { value: '2', label: 'Moderate' }, { value: '3', label: 'Strong' }]} />
        <div className="span-2"><SelectField form={form} name="status" label="Basis" options={[{ value: 'confirmed', label: 'Confirmed — observed or stated' }, { value: 'inferred', label: 'Inferred — a working assumption' }]} hint="Inferred relationships are always labelled as such." /></div>
      </div>
      <FormError form={form} />
    </Drawer>
  )
}

/* ── Commitments & decisions ───────────────────────────────────────── */
function CommitmentsTab({ d }: { d: Overview }) {
  const { openCreate } = useApp()
  const { can } = useSession()
  const s = d.stakeholder
  const all = d.commitments.slice().sort((a, b) => Number(isOpenStatus(b.status)) - Number(isOpenStatus(a.status)) || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  return (
    <div className="ov">
      <div className="ov-main">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Commitments</h2><span className="c3 t-small num">{all.filter(c => isOpenStatus(c.status)).length} open · {all.length} total</span><span className="grow" />
            {can('commitment.create') && <Button size="sm" icon={<Plus size={13} />} onClick={() => openCreate('commitment', { stakeholderId: s.id, stakeholderOption: { id: s.id, name: s.name }, initiativeId: s.initiatives[0]?.id ?? null })}>New commitment</Button>}
          </header>
          {all.length ? <CommitmentList items={all} /> : <p className="c3 t-small card-empty">No commitments recorded with {s.name.split(' ')[0]}.</p>}
        </section>
      </div>
      <aside className="ov-rail">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Decisions</h2><span className="grow" />
            {can('decision.create') && <Button size="sm" variant="ghost" icon={<Plus size={13} />} aria-label="Record decision" onClick={() => openCreate('decision', { consultedIds: [s.id], initiativeId: s.initiatives[0]?.id ?? null })} />}
          </header>
          {d.decisions.length ? <DecisionList d={d} /> : <p className="c3 t-small card-empty">Not involved in any recorded decision.</p>}
        </section>
      </aside>
    </div>
  )
}

/* ── History ───────────────────────────────────────────────────────── */
function HistoryTab({ d }: { d: Overview }) {
  const act = useActivity('stakeholder', d.stakeholder.id)
  const events = act.data?.pages.flatMap(p => p.events) ?? []
  return (
    <div className="ov">
      <div className="ov-main">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Activity history</h2><span className="c3 t-small">Every change, by whom and when</span></header>
          {act.isError ? <LoadError error={act.error} onRetry={() => act.refetch()} /> : act.isPending ? <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={12} w={`${60 + i * 9}%`} />)}</div> : (
            <ol className="hist">
              {events.map(e => (
                <li key={e.id}>
                  <span className={`hist-dot hist-${e.verb}`} />
                  <span className="grow"><span>{e.summary}</span>
                    <span className="t-small c3" style={{ display: 'block' }}>{e.actor ?? 'System'} · <span title={new Date(e.createdAt).toLocaleString('en-GB')}>{fmtRelative(e.createdAt)}</span>
                      {e.changes && Object.keys(e.changes).filter(k => k !== 'stance').length > 0 && <> · {Object.entries(e.changes).filter(([k]) => k !== 'stance').slice(0, 3).map(([k, v]) => `${k}: ${fmt(v.from)} → ${fmt(v.to)}`).join('; ')}</>}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {!act.isPending && !act.isError && !events.length && <p className="c3 t-small card-empty">No history yet.</p>}
          {act.hasNextPage && <button className="more" onClick={() => act.fetchNextPage()} disabled={act.isFetchingNextPage}>{act.isFetchingNextPage ? 'Loading…' : 'Load older'}</button>}
        </section>
      </div>
      <aside className="ov-rail">
        <section className="card">
          <header className="card-head"><h2 className="t-heading">Record</h2></header>
          <dl className="kv">
            <div><dt>Created</dt><dd>{fmtDate(d.stakeholder.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
            <div><dt>Last updated</dt><dd>{fmtRelative(d.stakeholder.updatedAt)}</dd></div>
            <div><dt>Status</dt><dd>{d.stakeholder.archivedAt ? 'Archived' : 'Active'}{d.stakeholder.restricted ? ' · Restricted' : ''}</dd></div>
            {d.stakeholder.restricted && <div><dt>Access list</dt><dd>{d.stakeholder.access.map(a => a.name).filter(Boolean).join(', ') || 'Owners and admins only'}</dd></div>}
          </dl>
        </section>
      </aside>
    </div>
  )
}
const fmt = (v: unknown) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') || '—' : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v))

export const _labels = { COMMITMENT_STATUS_LABEL }
