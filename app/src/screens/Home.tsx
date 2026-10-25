import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, ArrowUpRight, Building2, CalendarClock, Check, CheckCircle2, ChevronDown, Clock, EyeOff, Gavel, MessagesSquare, Plus, RotateCw, Sparkle, Target, TrendingDown, UserPlus, UserX, Users } from 'lucide-react'
import { useDashboard, useInvalidate } from '../api/hooks'
import { sourceHref, useAIStatus, useWorkspaceBriefing, type Briefing, type BriefingItem, type ItemKind } from '../api/ai'
import { openCopilot } from '../lib/copilotBus'
import { errorMessage, request, ws } from '../api/http'
import type { Dashboard, Signal } from '../api/types'
import { useSession } from '../session/session'
import { Avatar, Button, Cite, Kbd, Pill, Skeleton, StanceBadge } from '../components/ui'
import { useApp } from '../shell/context'
import { useHotkeys } from '../lib/hotkeys'
import { t } from '../lib/motion'
import { daysFromToday, DECISION_STATUS_LABEL, ENGAGEMENT_KIND_LABEL, fmtDate, fmtRelative, STANCE_LABEL } from '../lib/format'
import { PeekPanel } from './directory/PeekPanel'
import './home/home.css'

const KIND_META: Record<Signal['kind'], { label: string; icon: typeof Clock }> = {
  overdue: { label: 'Overdue', icon: AlertCircle },
  'due-soon': { label: 'Due soon', icon: Clock },
  'decision-waiting': { label: 'Decision waiting', icon: Gavel },
  cooling: { label: 'Cooling', icon: TrendingDown },
  unowned: { label: 'No owner', icon: UserX },
  'stance-shift': { label: 'Stance shift', icon: TrendingDown },
  unassigned: { label: 'Unassigned', icon: UserX },
  'repeated-delay': { label: 'Repeated delay', icon: CalendarClock },
}
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'commitments', label: 'Commitments', kinds: ['overdue', 'due-soon', 'unassigned', 'repeated-delay'] },
  { id: 'decisions', label: 'Decisions', kinds: ['decision-waiting'] },
  { id: 'relationships', label: 'Relationships', kinds: ['cooling', 'unowned', 'stance-shift'] },
] as const

export function Home() {
  const dash = useDashboard()
  const { me, workspace } = useSession()
  const first = me?.user.name.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const [scope, setScope] = useState<'team' | 'mine'>('team')
  // A stakeholder behind a signal opens in the peek panel, so the attention list stays in view.
  const [peekId, setPeekId] = useState<string | null>(null)
  useHotkeys({ Escape: () => { if (peekId) setPeekId(null); else return false } })

  return (
    <>
      <header className="page-head">
        <div className="crumbs"><span className="here">Home</span></div>
        <span className="t-small c3">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span className="grow" />
        <LayoutGroup id="scope">
          <div className="seg" role="radiogroup" aria-label="Scope">
            {(['team', 'mine'] as const).map(v => (
              <button key={v} role="radio" aria-checked={scope === v} className="seg-btn" onClick={() => setScope(v)}>
                {scope === v && <motion.span layoutId="scope-on" className="seg-on" transition={t.indicator} />}
                <span>{v === 'team' ? 'Team' : 'Assigned to me'}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      </header>
      <div className="home-body">
      <div className="home-scroll">
        <div className="home">
          <div className="home-intro">
            <h1 className="t-title">{greeting}, {first}</h1>
            <p className="c2">{dash.data ? <Summary d={dash.data} scope={scope} /> : dash.isError ? 'We couldn’t load your workspace summary.' : <Skeleton w={360} h={12} />}</p>
          </div>
          {dash.isError ? <LoadError error={dash.error} onRetry={() => dash.refetch()} />
            : dash.data && dash.data.stakeholders.total === 0 ? <EmptyWorkspace name={workspace?.name ?? ''} />
            : <><WorkspaceBriefing /><HomeGrid d={dash.data} scope={scope} onPeek={setPeekId} /></>}
        </div>
      </div>
      <AnimatePresence>{peekId && <PeekPanel key="peek" id={peekId} onClose={() => setPeekId(null)} />}</AnimatePresence>
      </div>
    </>
  )
}

/** Signal totals by kind: the server's full counts when present (the signal list itself is capped at scale). */
function kindCounts(d: Dashboard, scope: 'team' | 'mine') {
  if (d.signalCounts) return d.signalCounts[scope]
  const o: Partial<Record<Signal['kind'], number>> = {}
  for (const x of d.signals) if (scope === 'team' || x.ownerId === d.me) o[x.kind] = (o[x.kind] ?? 0) + 1
  return o
}

function Summary({ d, scope }: { d: Dashboard; scope: 'team' | 'mine' }) {
  const k = kindCounts(d, scope)
  const od = k.overdue ?? 0, dw = k['decision-waiting'] ?? 0, cool = k.cooling ?? 0
  const parts = [od && `${od} overdue commitment${od > 1 ? 's' : ''}`, dw && `${dw} decision${dw > 1 ? 's' : ''} waiting`, cool && `${cool} key relationship${cool > 1 ? 's' : ''} cooling`].filter(Boolean) as string[]
  const n = d.initiatives.length
  if (!parts.length) return n ? <>Nothing is slipping across {n} initiative{n === 1 ? '' : 's'}.</> : <>Nothing is slipping yet.</>
  const last = parts.pop()
  return <>{parts.length ? `${parts.join(', ')} and ${last}` : last} across {n} initiative{n === 1 ? '' : 's'}.</>
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="load-error" role="alert">
      <AlertCircle size={18} />
      <div className="grow"><p className="t-strong">Couldn’t load this</p><p className="c2 t-small">{errorMessage(error)}</p></div>
      <Button size="sm" icon={<RotateCw size={13} />} onClick={onRetry}>Retry</Button>
    </div>
  )
}

function EmptyWorkspace({ name }: { name: string }) {
  const { openCreate } = useApp()
  const { can } = useSession()
  const steps = [
    { label: 'Add an organization', sub: 'Councils, companies, agencies, community groups.', icon: Building2, kind: 'organization' as const, allowed: can('organization.create') },
    { label: 'Add your first stakeholders', sub: 'The people whose support or approval you need.', icon: Users, kind: 'stakeholder' as const, allowed: can('stakeholder.create') },
    { label: 'Create an initiative', sub: 'The project or programme they’re connected to.', icon: Target, kind: 'initiative' as const, allowed: can('initiative.create') },
    { label: 'Log an engagement', sub: 'Meetings and calls become your evidence trail.', icon: MessagesSquare, kind: 'engagement' as const, allowed: can('engagement.create') },
  ]
  return (
    <motion.section className="empty-ws" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: t.slow }}>
      <h2 className="t-heading">{name} is ready</h2>
      <p className="c2">Home fills with commitments that are slipping, decisions waiting and relationships going quiet — all from what you record. Start here:</p>
      <ol className="empty-steps">
        {steps.map((s, i) => (
          <li key={s.kind}>
            <span className="empty-num num">{i + 1}</span>
            <s.icon size={16} className="c3" />
            <span className="grow"><span className="t-strong">{s.label}</span><span className="c2 t-small" style={{ display: 'block' }}>{s.sub}</span></span>
            {s.allowed ? <Button size="sm" icon={<Plus size={13} />} onClick={() => openCreate(s.kind)}>{s.label.split(' ')[0]}</Button> : <span className="t-small c3">Ask an admin</span>}
          </li>
        ))}
      </ol>
    </motion.section>
  )
}

function HomeGrid({ d, scope, onPeek }: { d?: Dashboard; scope: 'team' | 'mine'; onPeek: (stakeholderId: string) => void }) {
  const [filter, setFilter] = useState<typeof FILTERS[number]['id']>('all')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  // The focused row shows its quick actions only once the list is being driven from the keyboard.
  const [kbd, setKbd] = useState(false)
  const { toast } = useApp()
  const { can } = useSession()
  const invalidate = useInvalidate()
  const nav = useNavigate()

  const scoped = useMemo(() => (d?.signals ?? []).filter(x => !hidden.has(x.id) && (scope === 'team' || x.ownerId === d?.me)), [d, hidden, scope])
  const f = FILTERS.find(x => x.id === filter)!
  const matching = scoped.filter(x => !('kinds' in f) || (f.kinds as readonly string[]).includes(x.kind))
  const visible = matching.slice(0, 60)
  // Tab counts are true totals (minus anything hidden here); the list below shows the first 60 of them.
  const totals = d ? kindCounts(d, scope) : {}
  const hiddenOf = (kinds?: readonly string[]) => (d?.signals ?? []).filter(x => hidden.has(x.id) && (!kinds || kinds.includes(x.kind))).length
  const counts = Object.fromEntries(FILTERS.map(fl => {
    const kinds = 'kinds' in fl ? (fl.kinds as readonly string[]) : undefined
    const total = Object.entries(totals).reduce((s, [kind, n]) => s + (!kinds || kinds.includes(kind) ? n ?? 0 : 0), 0)
    return [fl.id, Math.max(0, total - hiddenOf(kinds))]
  })) as Record<typeof FILTERS[number]['id'], number>

  const hide = (sig: Signal) => {
    setHidden(h => new Set(h).add(sig.id))
    toast('Hidden until you reload', () => setHidden(h => { const n = new Set(h); n.delete(sig.id); return n }))
  }
  const complete = async (sig: Signal) => {
    if (!sig.commitmentId || !can('commitment.update') || busy) return
    setBusy(sig.id)
    try {
      const r = await request<{ version: number; key: string }>(ws(`/commitments/${sig.commitmentId}`), { method: 'PATCH', body: { status: 'completed', version: sig.commitmentVersion } })
      await invalidate()
      toast(`${r.key} completed`, async () => {
        try { await request(ws(`/commitments/${sig.commitmentId}`), { method: 'PATCH', body: { status: 'open', version: r.version } }); await invalidate() }
        catch (e) { toast(errorMessage(e), undefined, 'error') }
      })
    } catch (e) { toast(errorMessage(e), undefined, 'error') } finally { setBusy(null) }
  }

  useHotkeys({
    j: () => { setKbd(true); setFocus(i => Math.min(visible.length - 1, i + 1)) },
    k: () => { setKbd(true); setFocus(i => Math.max(0, i - 1)) },
    Enter: () => { const v = visible[focus]; if (v) setOpen(o => (o === v.id ? null : v.id)) },
    e: () => { const v = visible[focus]; if (v) hide(v) },
    d: () => { const v = visible[focus]; if (v?.commitmentId) void complete(v) },
    o: () => { const v = visible[focus]; if (v?.stakeholder) nav(`/stakeholders/${v.stakeholder.id}`); else if (v?.decisionId) nav(`/decisions?open=${v.decisionId}`) },
  }, [visible, focus])

  return (
    <div className="home-grid">
      <section className="ledger" data-kbd={kbd || undefined} aria-labelledby="ledger-h">
        <header className="ledger-head">
          <h2 id="ledger-h" className="t-heading">Needs attention</h2>
          <LayoutGroup id="ledger-filter">
            <div className="ftabs" role="tablist">
              {FILTERS.map(fl => (
                <button key={fl.id} role="tab" aria-selected={filter === fl.id} className="ftab" onClick={() => { setFilter(fl.id); setFocus(0) }}>
                  {filter === fl.id && <motion.span layoutId="ftab-on" className="ftab-on" transition={t.indicator} />}
                  <span>{fl.label}</span>
                  <span className="ftab-count num">{d ? counts[fl.id] : '·'}</span>
                </button>
              ))}
            </div>
          </LayoutGroup>
        </header>
        <ul className="ledger-list" role="list" aria-busy={!d || undefined}>
          {!d ? Array.from({ length: 7 }, (_, i) => <li key={i} className="lrow"><div className="lrow-main"><Skeleton w={3} h={22} /><Skeleton w={96} h={10} /><span className="grow"><Skeleton w={`${50 + (i * 13) % 35}%`} h={11} /></span><Skeleton w={52} h={10} /></div></li>) : (
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((sig, i) => (
                <LedgerRow key={sig.id} sig={sig} onPeek={onPeek} open={open === sig.id} focused={i === focus} busy={busy === sig.id} canComplete={can('commitment.update')}
                  onToggle={() => { setFocus(i); setOpen(o => (o === sig.id ? null : sig.id)) }} onHide={() => hide(sig)} onComplete={() => void complete(sig)} />
              ))}
            </AnimatePresence>
          )}
          {d && visible.length === 0 && (
            <motion.li className="ledger-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Check size={18} />
              <p className="t-heading">Nothing needs attention here</p>
              <p className="c2 t-small">Items appear when commitments slip, decisions wait too long, or key relationships go quiet.</p>
            </motion.li>
          )}
          {d && counts[filter] > visible.length && <li className="ledger-more t-small c2">Showing {visible.length} of {counts[filter].toLocaleString()}. <Link className="inline-link" to={filter === 'decisions' ? '/decisions' : filter === 'relationships' ? '/stakeholders' : '/commitments?view=overdue'}>{filter === 'decisions' ? 'See all decisions' : filter === 'relationships' ? 'See all stakeholders' : 'See all overdue commitments'}</Link></li>}
        </ul>
        <footer className="ledger-foot t-small c3">
          <span className="row gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
          <span className="row gap-1"><Kbd>↵</Kbd> why</span>
          <span className="row gap-1"><Kbd>D</Kbd> done</span>
          <span className="row gap-1"><Kbd>E</Kbd> hide</span>
          <span className="row gap-1"><Kbd>O</Kbd> open</span>
          <span className="grow" />
          <span>Rules over your records — not predictions</span>
        </footer>
      </section>

      <aside className="home-rail">
        <Horizon d={d} scope={scope} />
        <WhatChanged d={d} />
        <PendingDecisions d={d} />
        <InitiativeActivity d={d} />
        <StakeholderOverview d={d} />
        <RecentEngagements d={d} />
      </aside>
    </div>
  )
}

function LedgerRow({ sig, onPeek, open, focused, busy, canComplete, onToggle, onHide, onComplete }: { sig: Signal; onPeek: (stakeholderId: string) => void; open: boolean; focused: boolean; busy: boolean; canComplete: boolean; onToggle: () => void; onHide: () => void; onComplete: () => void }) {
  const nav = useNavigate()
  const meta = KIND_META[sig.kind]
  const person = sig.stakeholder
  const personKind = sig.kind === 'cooling' || sig.kind === 'unowned' || sig.kind === 'stance-shift'
  return (
    <motion.li layout="position" className="lrow" data-sev={sig.severity} data-open={open || undefined} data-focus={focused || undefined}
      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.fast }} exit={{ opacity: 0, x: 24, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }} transition={t.base}>
      <div className="lrow-main" onClick={onToggle}>
        <span className="sev" role="img" aria-label={`Severity ${sig.severity} of 3`} />
        <span className={`lkind lkind-${sig.kind}`}><meta.icon size={13} /><span className="lkind-label">{meta.label}</span></span>
        <span className="lbody">
          <span className="ltitle truncate">{personKind ? person?.name : sig.title}</span>
          <span className="lreason truncate">{sig.reason}</span>
        </span>
        {person && !personKind && <span className="lperson" title={`Stakeholder: ${person.name}`}><Avatar name={person.name} size={18} /></span>}
        {sig.initiativeCode && <span className="mono lcode">{sig.initiativeCode}</span>}
        {sig.ownerName ? <span title={`Owner: ${sig.ownerName}`}><Avatar name={sig.ownerName} size={20} internal /></span> : <span className="lnone" title="No owner" />}
        <span className="lactions" onClick={e => e.stopPropagation()}>
          {sig.commitmentId && canComplete && <button className="icon-btn" onClick={onComplete} disabled={busy} title="Mark complete (D)" aria-label="Mark complete"><Check size={14} /></button>}
          <button className="icon-btn" onClick={onHide} title="Hide until reload (E)" aria-label="Hide"><EyeOff size={13} /></button>
          {person && <button className="icon-btn" onClick={() => nav(`/stakeholders/${person.id}`)} title="Open stakeholder (O)" aria-label="Open stakeholder"><ArrowUpRight size={14} /></button>}
        </span>
        <button className="lchev-btn" onClick={e => { e.stopPropagation(); onToggle() }} aria-expanded={open} aria-label={`Why this is here: ${sig.title}`}><ArrowRight size={13} className="lchev" /></button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="lwhy" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1, transition: t.base }} exit={{ height: 0, opacity: 0, transition: t.exit }}>
            <div className="lwhy-inner">
              <div className="why-rule">
                <span className="row gap-2"><span className="t-caption c3">Why it matters</span><span className="why-basis" title="Raised by a fixed rule over your records — not an AI prediction">Rule-based</span></span>
                <span>{sig.rule}</span>
              </div>
              {person && (
                <button type="button" className="why-person" onClick={() => onPeek(person.id)} title={`Preview ${person.name} without leaving Home`}>
                  <Avatar name={person.name} size={22} /><span className="t-strong">{person.name}</span>
                  {person.title && <span className="c2 t-small truncate">{person.title}</span>}<StanceBadge stance={person.stance} />
                  <span className="why-peek t-small">Preview</span>
                </button>
              )}
              {sig.evidence.length > 0 && (
                <div className="why-ev">
                  <span className="t-caption c3">Evidence</span>
                  {sig.evidence.map(e => (
                    <Link key={e.id} to={`/engagements/${e.id}`} className="ev"><span className="mono c3">{e.key}</span><span className="truncate grow">{e.title}</span><span className="c3 t-small num">{fmtRelative(e.occurredAt)}</span></Link>
                  ))}
                </div>
              )}
              {sig.next && <NextStep sig={sig} next={sig.next} />}
              <div className="why-actions">
                {sig.commitmentId && canComplete && <Button size="sm" onClick={onComplete} loading={busy} icon={<Check size={13} />}>Mark complete</Button>}
                {sig.decisionId && sig.next?.action !== 'review_decision' && <Button size="sm" onClick={() => nav(`/decisions?open=${sig.decisionId}`)}>Open decision</Button>}
                {person && <Button size="sm" variant="ghost" onClick={() => nav(`/stakeholders/${person.id}`)}>Open profile <ArrowRight size={13} /></Button>}
                <Button size="sm" variant="ai" icon={<Sparkle size={13} />} title="Opens the assistant with this item as context"
                  onClick={() => openCopilot({ message: `Tell me about: ${sig.title}`, context: { stakeholderId: sig.stakeholder?.id ?? null, label: sig.stakeholder?.name ?? sig.title }, send: true })}>Ask AI about this</Button>
                <span className="grow" />
                <Button size="sm" variant="ghost" onClick={onHide} icon={<EyeOff size={13} />}>Hide</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/** The deterministic next step for a signal. Buttons only navigate or open a form — nothing changes until the user saves. */
function NextStep({ sig, next }: { sig: Signal; next: NonNullable<Signal['next']> }) {
  const nav = useNavigate()
  const { openCreate } = useApp()
  const { can } = useSession()
  const person = sig.stakeholder
  const recordHref = sig.commitmentId ? `/commitments?open=${sig.commitmentId}` : sig.decisionId ? `/decisions?open=${sig.decisionId}` : person ? `/stakeholders/${person.id}` : null
  let action: { label: string; run: () => void } | null = null
  switch (next.action) {
    case 'follow_up_commitment':
      if (sig.commitmentId) action = { label: 'Open commitment', run: () => nav(`/commitments?open=${sig.commitmentId}`) }
      break
    case 'log_engagement':
      if (can('engagement.create')) action = { label: 'Log engagement', run: () => openCreate('engagement', person ? { participantIds: [person.id], participantOptions: [{ id: person.id, name: person.name }] } : undefined) }
      else if (person) action = { label: 'Open profile', run: () => nav(`/stakeholders/${person.id}`) }
      break
    case 'review_decision':
      if (sig.decisionId) action = { label: 'Review decision', run: () => nav(`/decisions?open=${sig.decisionId}`) }
      break
    case 'assign_owner':
      if (recordHref) action = { label: 'Assign owner', run: () => nav(recordHref) }
      break
    case 'open_record':
      if (recordHref) action = { label: sig.commitmentId ? 'Open commitment' : sig.decisionId ? 'Open decision' : 'Open profile', run: () => nav(recordHref) }
      break
  }
  return (
    <div className="why-next">
      <div className="grow">
        <span className="t-caption c3">Suggested next step</span>
        <p>{next.text}</p>
      </div>
      {action && <Button size="sm" onClick={action.run}>{action.label} <ArrowRight size={13} /></Button>}
    </div>
  )
}

// ── AI workspace briefing ──────────────────────────────────────────────────────
const ITEM_KIND_LABEL: Record<ItemKind, string> = { fact: 'Fact', metric: 'Metric', interpretation: 'AI interpretation', recommendation: 'Recommendation' }
const ITEM_KIND_PLURAL: Record<ItemKind, string> = { fact: 'facts', metric: 'metrics', interpretation: 'AI interpretation', recommendation: 'recommendations' }
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/**
 * Briefing over today's signals. With the built-in rules engine it is free, so it loads on its own;
 * with a model it spends tokens, so it waits for an explicit "Generate briefing".
 */
const BRIEF_OPEN_KEY = 'home.briefing.open'
const readOpen = () => { try { const v = localStorage.getItem(BRIEF_OPEN_KEY); return v === null ? null : v === '1' } catch { return null } }

function WorkspaceBriefing() {
  const status = useAIStatus()
  const [requested, setRequested] = useState(false)
  // A briefing of counts only restates the sentence above it, so it starts folded; one with interpretation or
  // recommendations starts open. The viewer's own choice wins and is remembered on this device.
  const [chosen, setChosen] = useState<boolean | null>(readOpen)
  const engine = status.data?.engine
  const on = !!status.data && status.data.settings.enabled
  const local = engine?.kind === 'local'
  const q = useWorkspaceBriefing(on && (local || requested))
  if (status.isError || (status.data && !on)) return null
  const b = q.data
  const shownEngine = b?.engine ?? engine
  const items = b ? b.sections.flatMap(sec => sec.items) : []
  const countsOnly = !!b && !b.aiError && items.every(it => it.kind === 'metric')
  const open = !b || q.isError || (chosen ?? !countsOnly)
  const toggle = () => { const v = !open; setChosen(v); try { localStorage.setItem(BRIEF_OPEN_KEY, v ? '1' : '0') } catch { /* private mode */ } }
  return (
    <section className="brief" data-folded={!open || undefined} aria-labelledby="brief-h" aria-busy={q.isFetching || undefined}>
      <header className="brief-head">
        <Sparkle size={14} className="brief-ico" aria-hidden />
        <h2 id="brief-h" className="t-heading">Workspace briefing</h2>
        {shownEngine && (
          <span className="brief-engine t-small c3" title={shownEngine.kind === 'local' ? 'Facts and rule-based items from your records. No model key is configured, so there is no AI interpretation.' : undefined}>
            {shownEngine.kind === 'local' ? 'Built-in rules engine · no AI interpretation' : shownEngine.label}{shownEngine.kind !== 'local' && shownEngine.model ? ` · ${shownEngine.model}` : ''}
          </span>
        )}
        <span className="grow" />
        {b && <span className="t-small c3 num brief-time" title={new Date(b.generatedAt).toLocaleString('en-GB')}>Generated {clock(b.generatedAt)}{b.cached ? ' · cached' : ''}</span>}
        {b && open && <Button size="sm" variant="ghost" icon={<RotateCw size={13} />} onClick={() => void q.refetch()} loading={q.isFetching} aria-label="Regenerate briefing" title="Regenerate" />}
        {b && !q.isError && (
          <Button size="sm" variant="ghost" onClick={toggle} aria-expanded={open} aria-controls="brief-body"
            icon={<ChevronDown size={13} className="brief-chev" />}>{open ? 'Hide' : `Show ${items.length} item${items.length === 1 ? '' : 's'}`}</Button>
        )}
      </header>
      {!status.data ? <div className="rcard-skel"><Skeleton h={10} w="60%" /></div>
        : q.isError ? (
          <div className="brief-err" role="alert">
            <AlertCircle size={14} /><span className="grow">Couldn’t generate the briefing. {errorMessage(q.error)}</span>
            <Button size="sm" icon={<RotateCw size={13} />} onClick={() => void q.refetch()}>Retry</Button>
          </div>
        ) : !b && !q.isFetching ? (
          <div className="brief-idle">
            <p className="c2 t-small grow">A short read of today’s signals, citing the records behind each point. Generating it uses {engine?.label ?? 'the AI model'} and counts toward this workspace’s monthly AI budget.</p>
            <Button size="sm" variant="ai" icon={<Sparkle size={13} />} onClick={() => setRequested(true)}>Generate briefing</Button>
          </div>
        ) : !b ? (
          <div className="rcard-skel" aria-label="Generating briefing"><Skeleton h={10} w="72%" /><Skeleton h={10} w="88%" /><Skeleton h={10} w="50%" /></div>
        ) : open ? <BriefingBody b={b} /> : null}
    </section>
  )
}

function BriefingBody({ b }: { b: Briefing }) {
  const nav = useNavigate()
  const local = b.engine.kind === 'local'
  const num = new Map(b.sources.map((s, i) => [s.ref, { n: i + 1, s }]))
  const empty = b.sections.every(s => !s.items.length)
  return (
    <div className="brief-body" id="brief-body">
      {b.aiError && (
        <p className="brief-warn t-small" role="status"><AlertCircle size={13} aria-hidden />The AI model couldn’t complete this briefing ({b.aiError}). Showing facts and rule-based items only.</p>
      )}
      {empty ? <p className="t-small c2">Nothing to report from today’s records.</p> : (
        <div className="brief-sections">
          {b.sections.filter(s => s.items.length).map(sec => {
            // A section whose items are all one kind says so once, instead of repeating the label on every line.
            // AI interpretation is always labelled on the item itself.
            const kind = sec.items[0].kind
            const uniform = kind !== 'interpretation' && sec.items.every(it => it.kind === kind)
            return (
              <section key={sec.id} className="brief-sec" aria-label={sec.title}>
                <h3 className="t-caption c3">{sec.title}{uniform && <span className="brief-sec-kind"> · {ITEM_KIND_PLURAL[kind]}</span>}</h3>
                <ul>
                  {sec.items.map((it, i) => <BriefItem key={i} it={it} showKind={!uniform} aiEngine={!local} cite={ref => num.get(ref)} onOpen={href => nav(href)} />)}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {b.unsupportedDropped > 0 && <p className="t-small c3">{b.unsupportedDropped} AI statement{b.unsupportedDropped === 1 ? ' was' : 's were'} left out because {b.unsupportedDropped === 1 ? 'it wasn’t' : 'they weren’t'} supported by your records.</p>}
    </div>
  )
}

function BriefItem({ it, showKind, aiEngine, cite, onOpen }: { it: BriefingItem; showKind: boolean; aiEngine: boolean; cite: (ref: string) => { n: number; s: Briefing['sources'][number] } | undefined; onOpen: (href: string) => void }) {
  const cites = it.cites.map(cite).filter(Boolean) as { n: number; s: Briefing['sources'][number] }[]
  const tentative = it.kind === 'interpretation'
  return (
    <li className={`bitem bitem-${it.kind}`} data-ai={(tentative || (aiEngine && it.kind === 'recommendation')) || undefined}>
      {showKind && <span className="bitem-kind t-micro">{ITEM_KIND_LABEL[it.kind]}{tentative ? ' · tentative' : ''}</span>}
      <span className="bitem-text">
        {it.text}
        {cites.map(c => <Cite key={c.s.ref} n={c.n} label={c.s.label} onClick={() => { const h = sourceHref(c.s); if (h !== '#') onOpen(h) }} />)}
        {it.kind === 'metric' && it.method && (
          <details className="bitem-method"><summary className="t-small c3" aria-label="How this is counted">How?</summary><span className="t-small c2">{it.method}</span></details>
        )}
      </span>
    </li>
  )
}

function Card({ title, meta, children, loading }: { title: string; meta?: ReactNode; children: ReactNode; loading?: boolean }) {
  return (
    <section className="rcard" aria-busy={loading || undefined}>
      <header className="rcard-head"><h2 className="t-heading">{title}</h2>{meta !== undefined && <span className="c3 t-small num">{meta}</span>}</header>
      {loading ? <div className="rcard-skel"><Skeleton h={10} w="70%" /><Skeleton h={10} w="90%" /><Skeleton h={10} w="55%" /></div> : children}
    </section>
  )
}

const STANCE_ORDER = ['opposed', 'concerned', 'neutral', 'supporter', 'champion', 'unknown'] as const
function StakeholderOverview({ d }: { d?: Dashboard }) {
  const total = d?.stakeholders.total ?? 0
  return (
    <Card title="Stakeholders" meta={d ? `${total} active` : undefined} loading={!d}>
      <Link to="/stakeholders" className="stance-bar" aria-label="Stance distribution — open stakeholders">
        {STANCE_ORDER.map(s => { const n = d?.stakeholders.byStance[s] ?? 0; return n ? <i key={s} className={`sb-${s}`} style={{ flexGrow: n }} title={`${STANCE_LABEL[s]}: ${n}`} /> : null })}
      </Link>
      <div className="stance-legend">
        {STANCE_ORDER.map(s => { const n = d?.stakeholders.byStance[s] ?? 0; return n ? <Link key={s} to={`/stakeholders?stance=${s}`} className="sl-item"><i className={`sb-${s}`} />{STANCE_LABEL[s]}<span className="num c3">{n}</span></Link> : null })}
      </div>
    </Card>
  )
}

function Horizon({ d, scope }: { d?: Dashboard; scope: 'team' | 'mine' }) {
  const nav = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const W = 316, H = 112, PAST = 30, FUT = 30
  // Every overdue commitment counts and is plotted; anything older than the window is pinned to its left edge.
  const items = (d?.horizon ?? []).filter(c => scope === 'team' || c.ownerId === d?.me).map(c => ({ c, d: daysFromToday(c.dueDate) })).filter(x => x.d <= FUT)
  // Older overdue commitments arrive as a count (the server lists only the ±30-day window).
  const olderCount = (d?.horizonOlder?.[scope] ?? 0) + items.filter(i => i.d < -PAST).length
  const older = olderCount > 0
  const x = (v: number) => ((Math.max(v, -PAST) + PAST) / (PAST + FUT)) * (W - 16) + 8
  const stacks = new Map<number, number>()
  const dots = items.sort((a, b) => a.d - b.d).map(it => { const b = Math.round(Math.max(it.d, -PAST) / 2); const k = stacks.get(b) ?? 0; stacks.set(b, k + 1); return { ...it, cx: x(it.d), cy: Math.max(8, H - 22 - k * 9) } })
  const od = items.filter(i => i.d < 0 && i.d >= -PAST).length + olderCount, wk = items.filter(i => i.d >= 0 && i.d <= 7).length, later = items.filter(i => i.d > 7).length
  const h = dots.find(dd => dd.c.id === hover)
  return (
    <Card title="Commitment horizon" meta="±30 days" loading={!d}>
      <div className="hz-stats">
        <Link to="/commitments?view=overdue"><span className="hz-n num is-overdue">{od}</span><span className="t-caption c3">overdue</span></Link>
        <Link to="/commitments?view=week"><span className="hz-n num hz-wk">{wk}</span><span className="t-caption c3">due this week</span></Link>
        <Link to="/commitments"><span className="hz-n num">{later}</span><span className="t-caption c3">later</span></Link>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="hz" role="img" aria-label={`${od} overdue${older ? ` (${olderCount} for more than 30 days)` : ''}, ${wk} due within 7 days, ${later} due later in the next 30 days`}>
        <rect x={8} y={H - 14} width={x(0) - 8} height={1} className="hz-axis-past" />
        <rect x={x(0)} y={H - 14} width={W - 8 - x(0)} height={1} className="hz-axis" />
        {[-30, -14, 14, 30].map(v => v === -30 && older
          ? <text key={v} x={x(v)} y={H - 2} textAnchor="start" className="hz-tick hz-older" role="link" tabIndex={0} onClick={() => nav('/commitments?view=overdue')} onKeyDown={e => { if (e.key === 'Enter') nav('/commitments?view=overdue') }}><title>{`${olderCount} commitments overdue by more than 30 days`}</title>{`+${olderCount} older`}</text>
          : <text key={v} x={x(v)} y={H - 2} textAnchor="middle" className="hz-tick">{v > 0 ? `+${v}d` : `${v}d`}</text>)}
        <line x1={x(0)} x2={x(0)} y1={6} y2={H - 10} className="hz-today" />
        <text x={x(0)} y={H - 2} textAnchor="middle" className="hz-tick hz-tick-today">Today</text>
        {dots.map((dd, i) => (
          <motion.circle key={dd.c.id} cx={dd.cx} cy={dd.cy} r={hover === dd.c.id ? 4.6 : 3.4} className={dd.d < 0 ? 'hz-dot od' : dd.d <= 7 ? 'hz-dot wk' : 'hz-dot'}
            initial={{ opacity: 0, cy: H - 22 }} animate={{ opacity: 1, cy: dd.cy, transition: { duration: 0.3, delay: Math.min(i, 30) * 0.008, ease: [0.2, 0, 0, 1] } }}
            onMouseEnter={() => setHover(dd.c.id)} onMouseLeave={() => setHover(null)}
            onClick={() => nav(dd.c.stakeholderId ? `/stakeholders/${dd.c.stakeholderId}?tab=commitments` : `/commitments?open=${dd.c.id}`)} />
        ))}
      </svg>
      <div className="hz-tip" aria-live="polite">
        {h ? <><span className="mono c3">{h.c.key}</span><span className="truncate grow">{h.c.title}</span><span className={`num t-small ${h.d < 0 ? 'is-overdue' : 'c2'}`}>{fmtDate(h.c.dueDate)}</span></> : <span className="c3 t-small">{items.length ? 'Hover a commitment to inspect · click to open' : 'No open commitments due in this window'}</span>}
      </div>
    </Card>
  )
}

function PendingDecisions({ d }: { d?: Dashboard }) {
  const items = (d?.decisions ?? []).slice(0, 5)
  return (
    <Card title="Decisions in progress" meta={d ? d.decisions.length : undefined} loading={!d}>
      {!items.length ? <p className="t-small c3">No decisions are waiting. <Link to="/decisions" className="inline-link">Decision register</Link></p> : (
        <ul className="ap-list">
          {items.map(x => {
            const due = x.dueDate ? daysFromToday(x.dueDate) : null
            return (
              <li key={x.id}>
                <Link className="ap" to={`/decisions?open=${x.id}`}>
                  <span className="row gap-2"><span className="mono c3">{x.key}</span><span className="truncate grow t-strong">{x.title}</span></span>
                  <span className="row gap-2 t-small">
                    <Pill tone={x.status === 'under_review' ? 'attention' : 'neutral'}>{DECISION_STATUS_LABEL[x.status]}</Pill>
                    {x.initiativeCode && <span className="mono lcode">{x.initiativeCode}</span>}
                    <span className="grow" />
                    <span className={`num ${due !== null && due < 0 ? 'is-overdue' : 'c3'}`}>{due === null ? `opened ${fmtRelative(x.createdAt)}` : due < 0 ? `${-due}d late` : `needed ${fmtDate(x.dueDate)}`}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function InitiativeActivity({ d }: { d?: Dashboard }) {
  return (
    <Card title="Initiatives" meta="key people engaged · 60 days" loading={!d}>
      {!d?.initiatives.length ? <p className="t-small c3">No initiatives yet.</p> : (
        <div className="cov">
          {d.initiatives.map(r => {
            const pct = r.keyTotal ? Math.round((r.keyEngaged / r.keyTotal) * 100) : 0
            return (
              <Link key={r.id} to={`/initiatives/${r.id}`} className="cov-row" title={`${r.engagements30} engagements in 30 days · ${r.openCommitments} open commitments · ${r.pendingDecisions} pending decisions`}>
                <span className="mono cov-code">{r.code}</span>
                <span className="cov-bar" aria-hidden>
                  <motion.i style={{ width: `${pct}%`, transformOrigin: '0 50%' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1, transition: t.slow }} data-low={pct < 70 || undefined} />
                  <span className="cov-target" style={{ left: '80%' }} />
                </span>
                <span className="num cov-n">{r.keyEngaged}/{r.keyTotal}</span>
                <span className="num cov-p">{r.keyTotal ? `${pct}%` : '—'}</span>
              </Link>
            )
          })}
        </div>
      )}
      <p className="t-small c3 cov-note">High and very-high influence stakeholders. Marker at 80%.</p>
    </Card>
  )
}

const stanceLabel = (v: string) => (STANCE_LABEL as Record<string, string>)[v] ?? v

/** Last 7 days of recorded change, newest first. Each line links to the record it came from. */
function WhatChanged({ d }: { d?: Dashboard }) {
  const c = d?.changes
  type Line = { key: string; at: string; href: string; icon: ReactNode; title: string; sub: string }
  const lines: Line[] = c ? [
    ...c.stance.map(x => ({ key: `s${x.id}`, at: x.at, href: `/stakeholders/${x.id}?tab=history`, icon: <TrendingDown size={13} className="c3" />,
      title: x.name, sub: x.from && x.to ? `Stance ${stanceLabel(x.from)} → ${stanceLabel(x.to)}` : 'Stance changed' })),
    ...c.decided.map(x => ({ key: `d${x.id}`, at: x.at, href: `/decisions?open=${x.id}`, icon: <Gavel size={13} className="c3" />,
      title: x.title, sub: `${x.key} · ${(DECISION_STATUS_LABEL as Record<string, string>)[x.status] ?? x.status}` })),
    ...c.completed.map(x => ({ key: `c${x.id}`, at: x.at, href: `/commitments?open=${x.id}`, icon: <CheckCircle2 size={13} className="chg-done" />,
      title: x.title, sub: `${x.key} · Completed` })),
    // Additions arrive in bulk (an import, a new initiative): more than two become one line, so they can't crowd out
    // decisions and completed work.
    ...(c.counts.added > 2 && c.added[0]
      ? [{ key: 'added', at: c.added[0].at, href: '/stakeholders?sort=updated', icon: <UserPlus size={13} className="c3" />,
          title: `${c.counts.added.toLocaleString()} stakeholders added`, sub: `Latest: ${c.added[0].name}` }]
      : c.added.map(x => ({ key: `a${x.id}`, at: x.at, href: `/stakeholders/${x.id}`, icon: <UserPlus size={13} className="c3" />,
          title: x.name, sub: `Added${x.title ? ` · ${x.title}` : ''}` }))),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6) : []
  const stats = c ? [
    { n: c.counts.decided, label: c.counts.decided === 1 ? 'decision made' : 'decisions made', href: '/decisions?status=approved' },
    { n: c.counts.completed, label: 'completed', href: '/commitments?view=completed' },
    { n: c.counts.stance, label: c.counts.stance === 1 ? 'stance shift' : 'stance shifts', href: '/stakeholders' },
    { n: c.counts.added, label: 'added', href: '/stakeholders?sort=updated' },
  ] : []
  return (
    <Card title="What changed" meta="7 days" loading={!d}>
      {!c ? <p className="t-small c3">Not available.</p> : !lines.length ? <p className="t-small c3">No decisions, completed commitments, stance changes or new stakeholders recorded in the last 7 days.</p> : (
        <>
          <div className="chg-stats">
            {stats.map(x => <Link key={x.label} to={x.href} className="chg-stat" data-zero={!x.n || undefined}><span className="num t-strong">{x.n.toLocaleString()}</span> <span className="c2">{x.label}</span></Link>)}
          </div>
          <ul className="chg chg-feed">
            {lines.map(l => (
              <li key={l.key}><Link to={l.href} className="chg-link"><span className="chg-ico" aria-hidden>{l.icon}</span><span className="grow chg-txt"><span className="t-strong truncate">{l.title}</span><span className="c3 t-small truncate">{l.sub}</span></span><span className="c3 t-small num">{fmtRelative(l.at)}</span></Link></li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function RecentEngagements({ d }: { d?: Dashboard }) {
  return (
    <Card title="Recent engagements" loading={!d}>
      {!d?.recentEngagements.length ? <p className="t-small c3">Nothing logged yet.</p> : (
        <ul className="chg">
          {d.recentEngagements.slice(0, 5).map(e => (
            <li key={e.id}><Link to={`/engagements/${e.id}`} className="chg-link"><span className="grow chg-txt"><span className="t-strong truncate">{e.title}</span><span className="c3 t-small">{ENGAGEMENT_KIND_LABEL[e.kind] ?? e.kind}{e.initiativeCode ? ` · ${e.initiativeCode}` : ''} · {e.participants} {e.participants === 1 ? 'person' : 'people'}</span></span><span className="c3 t-small num">{fmtRelative(e.occurredAt)}</span></Link></li>
          ))}
        </ul>
      )}
    </Card>
  )
}
