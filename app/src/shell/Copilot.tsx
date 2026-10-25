// Universal copilot: a right-hand panel that answers questions from the records the user can see, with citations.
// Not modal on desktop (the app stays usable beside it); a full-screen sheet below 640px.
import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowUp, ChevronDown, History, MessageCircleQuestionMark, RotateCcw, SquarePen, Square, Trash2, X } from 'lucide-react'
import {
  streamCopilot, useAIStatus, useClearConversations, useConversations, useDeleteConversation,
  type ConversationDetail, type CopilotCard, type CopilotContext, type CopilotRef, type EngineInfo, type EngineKind,
} from '../api/ai'
import { ApiError, errorMessage, request, ws } from '../api/http'
import { useLookups, useStakeholder } from '../api/hooks'
import { onCopilotOpen } from '../lib/copilotBus'
import { MOD } from '../lib/hotkeys'
import { t } from '../lib/motion'
import { DECISION_STATUS_LABEL, ENGAGEMENT_KIND_LABEL, dueLabel, fmtDate, fmtRelative } from '../lib/format'
import { Button, Kbd, Skeleton } from '../components/ui'
import { ConfirmDialog } from '../components/Drawer'
import './copilot.css'

// ── Thread model ─────────────────────────────────────────────────────────────
type TurnState = 'streaming' | 'done' | 'stopped' | 'error'
interface Turn {
  id: string
  question: string
  text: string
  status: string | null
  refs: CopilotRef[]
  cards: CopilotCard[]
  followUps: string[]
  unsupported: number
  state: TurnState
  error?: { message: string; retry: boolean }
  engine?: EngineKind
}

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LEN = 2000

/** Pre-stream failures: say what happened and whether retrying can help. */
function describeError(e: unknown): { message: string; retry: boolean } {
  if (e instanceof ApiError) {
    if (e.code === 'ai_disabled' || e.code === 'quota_exceeded') return { message: e.message, retry: false }
    if (e.code === 'rate_limited') return { message: e.message, retry: true }
    if (e.code === 'validation_failed' || e.status === 400) return { message: e.message, retry: false }
    return { message: e.message, retry: true }
  }
  return { message: errorMessage(e), retry: true }
}

/** Holds the conversation and the in-flight stream. Text deltas are batched per animation frame. */
function useCopilotThread() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const [retentionDays, setRetention] = useState<number | null>(null)
  const [streaming, setStreaming] = useState(false)
  const ctrl = useRef<AbortController | null>(null)
  const conv = useRef<string | null>(null)

  const setConv = (id: string | null) => { conv.current = id; setConversationId(id) }

  const stop = useCallback(() => { ctrl.current?.abort() }, [])

  const send = useCallback(async (raw: string, context: CopilotContext, opts: { replace?: boolean; retried?: boolean } = {}): Promise<void> => {
    const message = raw.trim().slice(0, MAX_LEN)
    if (!message) return
    ctrl.current?.abort()
    const ac = new AbortController()
    ctrl.current = ac
    const id = uid()
    setTurns(ts => [...(opts.replace ? ts.slice(0, -1) : ts), { id, question: message, text: '', status: null, refs: [], cards: [], followUps: [], unsupported: 0, state: 'streaming' }])
    setStreaming(true)

    const patch = (fn: (tn: Turn) => Turn) => setTurns(ts => ts.map(x => (x.id === id ? fn(x) : x)))
    let buf = ''
    let raf = 0
    const flush = () => { raf = 0; if (!buf) return; const d = buf; buf = ''; patch(x => ({ ...x, text: x.text + d })) }
    let finished = false
    try {
      for await (const ev of streamCopilot({ message, conversationId: conv.current, context }, ac.signal)) {
        switch (ev.type) {
          case 'meta':
            setConv(ev.conversationId); setEngine(ev.engine); setRetention(ev.retentionDays)
            patch(x => ({ ...x, engine: ev.engine.kind }))
            break
          case 'status': patch(x => ({ ...x, status: ev.text })); break
          case 'text': buf += ev.delta; if (!raf) raf = requestAnimationFrame(flush); break
          case 'sources': patch(x => ({ ...x, refs: ev.refs })); break
          case 'card': patch(x => ({ ...x, cards: [...x.cards, ev.card] })); break
          case 'final':
            cancelAnimationFrame(raf); raf = 0; buf = ''
            finished = true
            patch(x => ({ ...x, text: ev.text, refs: ev.refs, followUps: ev.followUps, unsupported: ev.unsupported, engine: ev.engine, status: null, state: 'done' }))
            break
          case 'error':
            cancelAnimationFrame(raf); flush()
            finished = true
            patch(x => ({ ...x, status: null, state: 'error', error: { message: ev.message, retry: true } }))
            break
        }
      }
      if (!finished) { cancelAnimationFrame(raf); flush(); patch(x => ({ ...x, status: null, state: 'error', error: { message: 'The answer was cut off before it finished. Nothing was changed.', retry: true } })) }
    } catch (e) {
      cancelAnimationFrame(raf); flush()
      if (ac.signal.aborted || (e as Error).name === 'AbortError') {
        patch(x => (x.state === 'streaming' ? { ...x, status: null, state: 'stopped' } : x))
      } else if (e instanceof ApiError && e.status === 404 && conv.current && !opts.retried) {
        // The conversation expired under retention: start a fresh one with the same question.
        setConv(null)
        if (ctrl.current === ac) ctrl.current = null
        return send(message, context, { replace: true, retried: true })
      } else {
        patch(x => ({ ...x, status: null, state: 'error', error: describeError(e) }))
      }
    } finally {
      if (ctrl.current === ac) { ctrl.current = null; setStreaming(false) }
    }
  }, [])

  const reset = useCallback(() => { ctrl.current?.abort(); setTurns([]); setConv(null) }, [])

  const load = useCallback((d: ConversationDetail) => {
    ctrl.current?.abort()
    const out: Turn[] = []
    for (const m of d.messages) {
      if (m.role === 'user') out.push({ id: m.id, question: m.content, text: '', status: null, refs: [], cards: [], followUps: [], unsupported: 0, state: 'done' })
      else {
        const last = out[out.length - 1]
        const fill = { text: m.content, refs: m.payload?.refs ?? [], followUps: m.payload?.followUps ?? [] }
        if (last && !last.text) Object.assign(last, fill)
        else out.push({ id: m.id, question: '', status: null, cards: [], unsupported: 0, state: 'done', ...fill })
      }
    }
    setTurns(out)
    setConv(d.id)
  }, [])

  useEffect(() => () => ctrl.current?.abort(), [])

  return { turns, conversationId, engine, retentionDays, streaming, send, stop, reset, load }
}

// ── Context from the current route ───────────────────────────────────────────
type ContextKind = 'stakeholder' | 'initiative' | 'organization' | 'decision'
const KIND_LABEL: Record<ContextKind, string> = { stakeholder: 'this stakeholder', initiative: 'this initiative', organization: 'this organization', decision: 'this decision' }

function routeContext(pathname: string, search: string): { kind: ContextKind; id: string } | null {
  const m = pathname.match(/^\/(stakeholders|initiatives|organizations)\/([^/]+)/)
  if (m && UUID.test(m[2])) return { kind: m[1].slice(0, -1) as ContextKind, id: m[2] }
  if (pathname === '/decisions') {
    const open = new URLSearchParams(search).get('open')
    if (open && UUID.test(open)) return { kind: 'decision', id: open }
  }
  return null
}

// ── Panel ────────────────────────────────────────────────────────────────────
interface CopilotProps { open: boolean; onOpenChange: (open: boolean) => void }

export function Copilot({ open, onOpenChange }: CopilotProps) {
  const loc = useLocation()
  const thread = useCopilotThread()
  const [draft, setDraft] = useState('')
  const [view, setView] = useState<'chat' | 'history'>('chat')
  // Context supplied by an openCopilot() caller; it applies only on the route it was raised from.
  const [given, setGiven] = useState<{ ctx: CopilotContext; path: string } | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)

  const route = loc.pathname + loc.search
  const derived = useMemo(() => routeContext(loc.pathname, loc.search), [loc.pathname, loc.search])
  const lookups = useLookups()
  const stakeholder = useStakeholder(open && derived?.kind === 'stakeholder' && !given ? derived.id : null)

  const context = useMemo<CopilotContext>(() => {
    if (dismissed === route) return { route: loc.pathname }
    if (given && given.path === loc.pathname) return { route: loc.pathname, ...given.ctx }
    if (!derived) return { route: loc.pathname }
    const { kind, id } = derived
    const label = kind === 'stakeholder' ? stakeholder.data?.name
      : kind === 'initiative' ? lookups.data?.initiatives.find(i => i.id === id)?.name
        : kind === 'organization' ? lookups.data?.organizations.find(o => o.id === id)?.name : null
    const ids: CopilotContext = kind === 'stakeholder' ? { stakeholderId: id } : kind === 'initiative' ? { initiativeId: id } : kind === 'organization' ? { organizationId: id } : { decisionId: id }
    return { route: loc.pathname, label: label ?? null, ...ids }
  }, [dismissed, route, given, derived, loc.pathname, stakeholder.data, lookups.data])

  const ctxKind: ContextKind | undefined = context.stakeholderId ? 'stakeholder' : context.initiativeId ? 'initiative' : context.organizationId ? 'organization' : context.decisionId ? 'decision' : undefined
  const ctxLabel = context.label || (ctxKind ? KIND_LABEL[ctxKind] : null)

  // Drop caller-supplied context once the user navigates elsewhere.
  useEffect(() => { if (given && given.path !== loc.pathname) setGiven(null) }, [given, loc.pathname])

  // A stable send that always uses the latest context, so memoised turns don't re-render on every keystroke.
  const ctxRef = useRef(context)
  ctxRef.current = context
  const threadSend = thread.send
  const send = useCallback((message: string) => { setView('chat'); void threadSend(message, ctxRef.current) }, [threadSend])
  // Retry replaces the failed or stopped answer instead of appending a duplicate question.
  const resend = useCallback((message: string) => { setView('chat'); void threadSend(message, ctxRef.current, { replace: true }) }, [threadSend])
  // A queued send is state, not a ref: setting it always re-renders, even when nothing else changed.
  const [pendingSend, setPendingSend] = useState<{ message: string } | null>(null)

  useEffect(() => onCopilotOpen(d => {
    onOpenChange(true)
    setView('chat')
    setDismissed(null)
    if (d.context) setGiven({ ctx: d.context, path: window.location.pathname })
    if (d.message && d.send) { setDraft(''); setPendingSend({ message: d.message }) }
    else if (d.message) setDraft(d.message)
  }), [onOpenChange])

  // Sends queued by the bus run after the context state above has been applied.
  useEffect(() => {
    if (!pendingSend) return
    setPendingSend(null)
    send(pendingSend.message)
  }, [pendingSend, send])

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  return (
    <AnimatePresence>
      {open && (
        <Panel
          key="copilot"
          thread={thread} draft={draft} setDraft={setDraft} view={view} setView={setView}
          ctxLabel={ctxLabel} ctxKind={ctxKind} onDismissContext={() => { setGiven(null); setDismissed(route) }}
          onSend={send} onResend={resend} onClose={close}
        />
      )}
    </AnimatePresence>
  )
}

interface PanelProps {
  thread: ReturnType<typeof useCopilotThread>
  draft: string
  setDraft: (v: string) => void
  view: 'chat' | 'history'
  setView: (v: 'chat' | 'history') => void
  ctxLabel: string | null
  ctxKind?: ContextKind
  onDismissContext: () => void
  onSend: (m: string) => void
  onResend: (m: string) => void
  onClose: () => void
}

function Panel({ thread, draft, setDraft, view, setView, ctxLabel, ctxKind, onDismissContext, onSend, onResend, onClose }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(document.activeElement as HTMLElement)
  const status = useAIStatus()
  const { turns, streaming } = thread

  const engine = thread.engine ?? status.data?.engine ?? null
  const retention = thread.retentionDays ?? status.data?.settings.retentionDays ?? null
  const disabled = status.data ? !status.data.settings.enabled : false

  useEffect(() => {
    inputRef.current?.focus()
    const prev = restore.current
    return () => {
      // The opener may be gone (e.g. the command palette); fall back to the shell's Ask button.
      const target = prev?.isConnected && prev !== document.body ? prev : document.querySelector<HTMLElement>('[data-copilot-opener]')
      target?.focus?.()
    }
  }, [])

  useEffect(() => { if (view === 'chat') inputRef.current?.focus() }, [view])

  // Keep the newest answer in view while it streams, unless the user has scrolled up to read.
  const pinned = useRef(true)
  const last = turns[turns.length - 1]
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [last?.text, last?.cards.length, last?.state, turns.length])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); onClose() }
  }

  const submit = () => { if (!draft.trim() || streaming || disabled) return; onSend(draft); setDraft('') }
  const lastQ = useRef('')
  lastQ.current = last?.question ?? ''
  const retry = useCallback(() => { if (lastQ.current) onResend(lastQ.current) }, [onResend])
  // Navigating from a full-screen sheet should reveal the page underneath.
  const onNavigate = useCallback(() => { if (window.matchMedia('(max-width: 640px)').matches) onClose() }, [onClose])

  const live = last?.state === 'streaming' ? (last.status ? `${last.status}…` : 'Answering…')
    : last?.state === 'done' ? 'Answer ready' : last?.state === 'stopped' ? 'Stopped' : ''

  return (
    <motion.aside
      ref={ref}
      className="cp" role="dialog" aria-label="Copilot"
      initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0, transition: t.panel }} exit={{ opacity: 0, x: 12, transition: t.exit }}
      onKeyDown={onKeyDown}
    >
      <header className="cp-head">
        {view === 'history'
          ? <Button variant="ghost" size="sm" icon={<ArrowLeft size={15} />} aria-label="Back to conversation" onClick={() => setView('chat')} />
          : <span className="cp-mark" aria-hidden><MessageCircleQuestionMark size={15} /></span>}
        <div className="grow">
          <h2 className="t-heading">{view === 'history' ? 'History' : 'Copilot'}</h2>
          <p className="cp-engine truncate" title={engine?.kind === 'local' ? 'Answers are assembled by fixed rules from your records. No AI model is used.' : undefined}>
            {engine ? (engine.kind === 'local' ? 'Built-in rules engine · no AI model' : engine.label) : ' '}
          </p>
        </div>
        {view === 'chat' && (
          <>
            <Button variant="ghost" size="sm" icon={<History size={15} />} aria-label="Conversation history" title="History" onClick={() => setView('history')} />
            <Button variant="ghost" size="sm" icon={<SquarePen size={15} />} aria-label="New conversation" title="New conversation" onClick={() => { thread.reset(); inputRef.current?.focus() }} disabled={!turns.length} />
          </>
        )}
        <Button variant="ghost" size="sm" icon={<X size={15} />} aria-label={`Close copilot (Esc or ${MOD} J)`} title="Close" onClick={onClose} />
      </header>

      {view === 'history' ? (
        <HistoryView currentId={thread.conversationId} retention={retention} onOpen={d => { thread.load(d); setView('chat') }} onDeletedCurrent={thread.reset} />
      ) : (
        <>
          <div className="cp-body" ref={scrollRef} onScroll={e => { const el = e.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }}>
            {turns.length === 0 ? (
              <EmptyState kind={ctxKind} label={ctxLabel} disabled={disabled} onAsk={onSend} />
            ) : turns.map((tn, i) => (
              <TurnView key={tn.id} turn={tn} latest={i === turns.length - 1} onAsk={onSend} onRetry={retry} onNavigate={onNavigate} busy={streaming} />
            ))}
          </div>

          <div className="cp-compose">
            {ctxLabel && (
              <span className="cp-ctx">
                <span className="truncate">About: <b>{ctxLabel}</b></span>
                <button type="button" onClick={onDismissContext} aria-label={`Stop asking about ${ctxLabel}`} title="Ask about the whole workspace"><X size={12} /></button>
              </span>
            )}
            <div className="cp-input" data-disabled={disabled || undefined}>
              <textarea
                ref={inputRef} rows={1} value={draft} maxLength={MAX_LEN} disabled={disabled}
                placeholder={disabled ? 'AI features are turned off for this workspace' : 'Ask about your stakeholders and commitments…'}
                aria-label="Ask copilot"
                onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px` }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              />
              {streaming
                ? <Button variant="secondary" size="sm" icon={<Square size={12} fill="currentColor" />} aria-label="Stop answering" title="Stop" onClick={thread.stop} />
                : <Button variant="primary" size="sm" icon={<ArrowUp size={15} />} aria-label="Send" title="Send (↵)" onClick={submit} disabled={!draft.trim() || disabled} />}
            </div>
            <Footer retention={retention} />
          </div>
        </>
      )}
      <div className="sr-only" role="status" aria-live="polite">{live}</div>
    </motion.aside>
  )
}

function Footer({ retention }: { retention: number | null }) {
  return (
    <p className="cp-foot">
      Answers come from records you can access. Copilot can’t change records.
      {retention != null && <> {retention > 0 ? `Conversations kept ${retention} day${retention === 1 ? '' : 's'}.` : 'Conversations aren’t stored.'}</>}
    </p>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────────
function suggestions(kind: ContextKind | undefined, label: string | null): string[] {
  const name = label && kind && label !== KIND_LABEL[kind] ? label : null
  if (kind === 'stakeholder') return [
    name ? `Brief me on ${name}` : 'Brief me on this stakeholder',
    'What happened since our last engagement?',
    'Which commitments are overdue?',
    'What decisions are pending?',
  ]
  if (kind === 'initiative') return [
    'What unresolved issues could delay this initiative?',
    'Which commitments are overdue?',
    'What decisions are pending?',
    'Who are the most influential stakeholders here?',
    'Which stakeholders haven’t been engaged recently?',
  ]
  if (kind === 'organization') return [
    'Who are the most influential stakeholders here?',
    'What happened recently?',
    'Which stakeholders haven’t been engaged recently?',
    'Which commitments are overdue?',
  ]
  return [
    'Which commitments are overdue?',
    'What decisions are pending?',
    'Which stakeholders haven’t been engaged recently?',
    'Who are the most influential stakeholders?',
    'What commitments are due in the next two weeks?',
    'Which commitments have no owner?',
  ]
}

function EmptyState({ kind, label, disabled, onAsk }: { kind?: ContextKind; label: string | null; disabled: boolean; onAsk: (q: string) => void }) {
  return (
    <div className="cp-empty">
      <MessageCircleQuestionMark size={20} className="c3" aria-hidden />
      <p className="t-strong">Ask about your records</p>
      <p className="c2 t-small">Answers cite the stakeholders, commitments and decisions they come from. Press <Kbd>{MOD}J</Kbd> to open or close.</p>
      {disabled ? (
        <p className="cp-note">AI features are turned off for this workspace. An administrator can turn them on in Settings.</p>
      ) : (
        <ul className="cp-suggest" aria-label="Suggested questions">
          {suggestions(kind, label).map(q => <li key={q}><button type="button" className="cp-chip" onClick={() => onAsk(q)}>{q}</button></li>)}
        </ul>
      )}
    </div>
  )
}

// ── One question and its answer ──────────────────────────────────────────────
interface TurnProps { turn: Turn; latest: boolean; busy: boolean; onAsk: (q: string) => void; onRetry: () => void; onNavigate: () => void }

const TurnView = memo(function TurnView({ turn, latest, busy, onAsk, onRetry, onNavigate }: TurnProps) {
  const refMap = useMemo(() => new Map(turn.refs.map(r => [r.ref, r])), [turn.refs])
  const streaming = turn.state === 'streaming'
  return (
    <section className="cp-turn" aria-busy={streaming || undefined}>
      {turn.question && <p className="cp-q">{turn.question}</p>}
      <div className="cp-a" data-engine={turn.engine ?? undefined}>
        {streaming && !turn.text && (
          <div className="cp-status"><span className="cp-pulse" aria-hidden />{turn.status ? `${turn.status}…` : 'Thinking…'}</div>
        )}
        {(turn.text || turn.state === 'done') && <Answer text={turn.text} refMap={refMap} streaming={streaming} onNavigate={onNavigate} />}
        {streaming && turn.text && turn.status && <div className="cp-status cp-status-inline"><span className="cp-pulse" aria-hidden />{turn.status}…</div>}
        {turn.cards.map((c, i) => <CardView key={i} card={c} refMap={refMap} onNavigate={onNavigate} />)}
        {turn.state === 'done' && <Sources text={turn.text} refs={turn.refs} onNavigate={onNavigate} />}
        {turn.unsupported > 0 && <p className="cp-note">{turn.unsupported} uncited statement{turn.unsupported === 1 ? '' : 's'} removed</p>}
        {turn.state === 'stopped' && <p className="cp-note">Stopped. {latest && !busy && <button type="button" className="cp-link" onClick={onRetry}>Ask again</button>}</p>}
        {turn.state === 'error' && turn.error && (
          <div className="cp-error" role="alert">
            <span className="grow">{turn.error.message}</span>
            {turn.error.retry && latest && !busy && <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={onRetry}>Retry</Button>}
          </div>
        )}
        {latest && turn.state === 'done' && turn.followUps.length > 0 && (
          <ul className="cp-suggest cp-follow" aria-label="Follow-up questions">
            {turn.followUps.map(q => <li key={q}><button type="button" className="cp-chip" disabled={busy} onClick={() => onAsk(q)}>{q}</button></li>)}
          </ul>
        )}
      </div>
    </section>
  )
})

// ── Answer text with inline citations ────────────────────────────────────────
const CITE_RE = /\[(r\d+)\]/g

/** Citation numbers follow the order refs first appear in the text; unknown refs get none. */
function citeOrder(text: string, refMap: Map<string, CopilotRef>) {
  const order = new Map<string, number>()
  for (const m of text.matchAll(CITE_RE)) if (refMap.has(m[1]) && !order.has(m[1])) order.set(m[1], order.size + 1)
  return order
}

function Answer({ text, refMap, streaming, onNavigate }: { text: string; refMap: Map<string, CopilotRef>; streaming: boolean; onNavigate: () => void }) {
  // While streaming, hide a citation token that has only half arrived ("[r1").
  const shown = streaming ? text.replace(/\[r?\d*$/, '') : text
  const order = useMemo(() => citeOrder(shown, refMap), [shown, refMap])
  const blocks = useMemo(() => {
    const out: { list: 'ul' | 'ol' | null; lines: string[] }[] = []
    for (const raw of shown.split('\n')) {
      const line = raw.trimEnd()
      if (!line.trim()) { out.push({ list: null, lines: [] }); continue }
      const ul = line.match(/^\s*[-*•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
      const list = ul ? 'ul' : ol ? 'ol' : null
      const body = ul?.[1] ?? ol?.[1] ?? line
      const prev = out[out.length - 1]
      if (list && prev?.list === list) prev.lines.push(body)
      else out.push({ list, lines: [body] })
    }
    return out.filter(b => b.lines.length)
  }, [shown])

  const inline = (line: string, k: string) => {
    const parts: ReactNode[] = []
    const re = /\[(r\d+)\]|\*\*([^*]+)\*\*/g
    let at = 0
    for (const m of line.matchAll(re)) {
      if (m.index! > at) parts.push(line.slice(at, m.index))
      if (m[1]) {
        const r = refMap.get(m[1])
        if (r) parts.push(<CiteChip key={`${k}-${m.index}`} n={order.get(m[1])!} r={r} onNavigate={onNavigate} />)
        else if (typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] = (parts[parts.length - 1] as string).replace(/\s+$/, '')
      }
      else parts.push(<strong key={`${k}-${m.index}`}>{m[2]}</strong>)
      at = m.index! + m[0].length
    }
    if (at < line.length) parts.push(line.slice(at))
    return parts
  }

  if (!shown.trim()) return streaming ? null : <p className="c3">No answer was returned.</p>
  return (
    <div className="cp-text">
      {blocks.map((b, i) => b.list === 'ul'
        ? <ul key={i}>{b.lines.map((l, j) => <li key={j}>{inline(l, `${i}-${j}`)}</li>)}</ul>
        : b.list === 'ol'
          ? <ol key={i}>{b.lines.map((l, j) => <li key={j}>{inline(l, `${i}-${j}`)}</li>)}</ol>
          : <p key={i}>{b.lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l, `${i}-${j}`)}</span>)}</p>)}
      {streaming && <span className="cp-caret" aria-hidden />}
    </div>
  )
}

function CiteChip({ n, r, onNavigate }: { n: number; r: CopilotRef; onNavigate: () => void }) {
  return (
    <Link to={r.href} className="cp-cite" data-label={r.label} aria-label={`Source ${n}: ${r.label}`} onClick={onNavigate}>{n}</Link>
  )
}

const TYPE_LABEL: Record<string, string> = { stakeholder: 'Stakeholder', organization: 'Organization', initiative: 'Initiative', engagement: 'Engagement', decision: 'Decision', commitment: 'Commitment' }

function Sources({ text, refs, onNavigate }: { text: string; refs: CopilotRef[]; onNavigate: () => void }) {
  const refMap = useMemo(() => new Map(refs.map(r => [r.ref, r])), [refs])
  const order = useMemo(() => citeOrder(text, refMap), [text, refMap])
  const list = order.size ? [...order.keys()].map(k => refMap.get(k)!) : refs.slice(0, 8)
  // A long source list pushed the answer itself out of view: show the first few, the rest on request.
  const [all, setAll] = useState(false)
  if (!list.length) return null
  const shown = all ? list : list.slice(0, SOURCE_LIMIT)
  return (
    <div className="cp-sources">
      <div className="label-rule">Sources{list.length > SOURCE_LIMIT ? ` · ${list.length}` : ''}</div>
      <ol>
        {shown.map((r, i) => (
          <li key={r.ref}>
            <Link to={r.href} onClick={onNavigate}>
              <span className="cp-src-n" aria-hidden>{order.size ? i + 1 : '·'}</span>
              <span className="truncate grow">{r.label}</span>
              <span className="c3 t-small">{TYPE_LABEL[r.type] ?? r.type}</span>
            </Link>
          </li>
        ))}
      </ol>
      {list.length > SOURCE_LIMIT && (
        <button type="button" className="cp-link cp-more" aria-expanded={all} onClick={() => setAll(v => !v)}>{all ? 'Show fewer sources' : `Show all ${list.length} sources`}</button>
      )}
    </div>
  )
}
const SOURCE_LIMIT = 5

// ── Structured result cards ──────────────────────────────────────────────────
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null)
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const humanize = (s: string) => s.replace(/_/g, ' ')

interface CardRow { key?: string | null; title: string; meta: (string | null | undefined | false)[]; tone?: 'critical' | 'attention'; ref?: string | null }

function cardRow(kind: CopilotCard['kind'], r: Record<string, unknown>): CardRow {
  switch (kind) {
    case 'commitments': {
      const overdue = num(r.days_overdue) ?? 0
      const due = str(r.due)
      const sh = obj(r.stakeholder)
      return {
        key: str(r.key), title: str(r.title) ?? 'Commitment', ref: str(r.ref), tone: overdue > 0 ? 'critical' : undefined,
        meta: [overdue > 0 ? `${overdue} day${overdue === 1 ? '' : 's'} overdue` : due ? dueLabel(due) : 'No due date',
          str(r.owner) ?? (r.owed_by === 'them' ? 'Owed by them' : 'No owner'), sh && str(sh.name)],
      }
    }
    case 'stakeholders': {
      const inf = num(r.influence), days = r.days_since_last_engagement
      return {
        title: str(r.name) ?? 'Stakeholder', ref: str(r.ref),
        meta: [str(r.title), inf != null && `Influence ${inf}/4`, str(r.stance),
          days === null ? 'Never engaged' : typeof days === 'number' ? `Engaged ${days === 0 ? 'today' : `${days}d ago`}` : null],
      }
    }
    case 'decisions': {
      const s = str(r.status), late = r.late === true
      return {
        key: str(r.key), title: str(r.title) ?? 'Decision', ref: str(r.ref), tone: late ? 'attention' : undefined,
        meta: [s && (DECISION_STATUS_LABEL[s] ?? humanize(s)), str(r.needed_by) && `Needed by ${fmtDate(str(r.needed_by))}${late ? ' (late)' : ''}`, str(r.owner)],
      }
    }
    case 'engagements': {
      const k = str(r.kind)
      return { key: str(r.key), title: str(r.title) ?? 'Engagement', ref: str(r.ref), meta: [str(r.date) && fmtDate(str(r.date)), k && (ENGAGEMENT_KIND_LABEL[k] ?? humanize(k))] }
    }
    default: {
      const title = str(r.title) ?? str(r.name) ?? str(r.label) ?? 'Record'
      const meta = Object.entries(r).filter(([k, v]) => !['ref', 'id', 'title', 'name', 'label'].includes(k) && str(v)).slice(0, 3).map(([k, v]) => `${humanize(k)}: ${str(v)}`)
      return { key: str(r.key), title, ref: str(r.ref), meta }
    }
  }
}

const CARD_LIMIT = 6

function CardView({ card, refMap, onNavigate }: { card: CopilotCard; refMap: Map<string, CopilotRef>; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const [all, setAll] = useState(false)
  const rows = Array.isArray(card.rows) ? card.rows : []
  const shown = all ? rows : rows.slice(0, CARD_LIMIT)
  const href = (ref: unknown) => { const s = str(ref); return s ? refMap.get(s)?.href : undefined }

  return (
    <div className="cp-card">
      <button type="button" className="cp-card-head" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <span className="grow truncate">{card.title}</span>
        <span className="c3 num">{rows.length}</span>
        <ChevronDown size={14} className="c3 cp-chev" data-open={expanded || undefined} aria-hidden />
      </button>
      {expanded && (
        card.kind === 'path' ? (
          <ol className="cp-path">
            {shown.map((r, i) => {
              const from = obj(r.from), to = obj(r.to)
              const rel = str(r.relationship) ?? str(r.type)
              const name = (o: Record<string, unknown> | null) => { const n = str(o?.name) ?? 'Unknown'; const h = href(o?.ref); return h ? <Link to={h} onClick={onNavigate}>{n}</Link> : <span>{n}</span> }
              return (
                <li key={i}>
                  {name(from)}
                  <span className="cp-rel">{rel ? humanize(rel) : 'related to'}{r.status === 'inferred' ? ' (inferred)' : ''} →</span>
                  {name(to)}
                </li>
              )
            })}
          </ol>
        ) : (
          <ul className="cp-rows">
            {shown.map((r, i) => {
              const row = cardRow(card.kind, r)
              const meta = row.meta.filter(Boolean) as string[]
              const h = href(row.ref)
              const body = (
                <>
                  {row.key && <span className="mono cp-key">{row.key}</span>}
                  <span className="cp-row-main">
                    <span className="truncate cp-row-title">{row.title}</span>
                    {meta.length > 0 && <span className="truncate cp-row-meta" data-tone={row.tone}>{meta.join(' · ')}</span>}
                  </span>
                </>
              )
              return <li key={i}>{h ? <Link to={h} className="cp-row" onClick={onNavigate}>{body}</Link> : <div className="cp-row">{body}</div>}</li>
            })}
          </ul>
        )
      )}
      {expanded && rows.length > CARD_LIMIT && (
        <button type="button" className="cp-link cp-more" onClick={() => setAll(v => !v)}>{all ? 'Show fewer' : `Show ${rows.length - CARD_LIMIT} more`}</button>
      )}
    </div>
  )
}

// ── History ──────────────────────────────────────────────────────────────────
function HistoryView({ currentId, retention, onOpen, onDeletedCurrent }: { currentId: string | null; retention: number | null; onOpen: (d: ConversationDetail) => void; onDeletedCurrent: () => void }) {
  const list = useConversations()
  const del = useDeleteConversation()
  const clear = useClearConversations()
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; title: string } | 'all' | null>(null)
  const ctrl = useRef<AbortController | null>(null)
  useEffect(() => () => ctrl.current?.abort(), [])

  const open = async (id: string) => {
    ctrl.current?.abort()
    const ac = new AbortController(); ctrl.current = ac
    setOpening(id); setError(null)
    try { onOpen(await request<ConversationDetail>(ws(`/ai/conversations/${id}`), { signal: ac.signal })) }
    catch (e) { if (!ac.signal.aborted) setError(errorMessage(e)) }
    finally { if (ctrl.current === ac) setOpening(null) }
  }

  const doConfirm = () => {
    if (!confirm) return
    if (confirm === 'all') clear.mutate({}, { onSuccess: () => { onDeletedCurrent(); setConfirm(null) }, onError: e => { setError(errorMessage(e)); setConfirm(null) } })
    else {
      const id = confirm.id
      del.mutate({ _id: id }, { onSuccess: () => { if (id === currentId) onDeletedCurrent(); setConfirm(null) }, onError: e => { setError(errorMessage(e)); setConfirm(null) } })
    }
  }

  const rows = list.data?.conversations ?? []
  const one = confirm && confirm !== 'all' ? confirm : null
  return (
    <div className="cp-body cp-history">
      {error && <div className="cp-error" role="alert"><span className="grow">{error}</span></div>}
      {list.isPending ? (
        <div className="cp-hist-skel">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={14} w={`${80 - i * 12}%`} />)}</div>
      ) : list.isError ? (
        <div className="cp-error" role="alert"><span className="grow">{errorMessage(list.error)}</span><Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={() => void list.refetch()}>Retry</Button></div>
      ) : rows.length === 0 ? (
        <div className="cp-empty">
          <History size={20} className="c3" aria-hidden />
          <p className="t-strong">No saved conversations</p>
          <p className="c2 t-small">{retention === 0 ? 'This workspace doesn’t store copilot conversations.' : 'Questions you ask are kept here so you can pick them up again.'}</p>
        </div>
      ) : (
        <>
          <ul className="cp-hist" aria-label="Saved conversations">
            {rows.map(c => (
              <li key={c.id} className="cp-hist-item" aria-current={c.id === currentId || undefined}>
                <button type="button" className="cp-hist-open" onClick={() => void open(c.id)} aria-busy={opening === c.id || undefined}>
                  <span className="truncate grow">{c.title || 'Untitled conversation'}</span>
                  <span className="c3 t-small">{opening === c.id ? 'Opening…' : fmtRelative(c.updatedAt)}</span>
                </button>
                <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} aria-label={`Delete conversation “${c.title}”`} title="Delete" onClick={() => setConfirm({ id: c.id, title: c.title })} />
              </li>
            ))}
          </ul>
          <div className="cp-hist-foot">
            <span className="c3 t-small grow">{retention != null && retention > 0 ? `Kept ${retention} day${retention === 1 ? '' : 's'}, then deleted.` : ''}</span>
            <Button variant="danger" size="sm" onClick={() => setConfirm('all')}>Clear all</Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm === 'all' ? `Delete all ${rows.length} conversations?` : 'Delete this conversation?'}
        body={confirm === 'all' ? 'Your copilot history in this workspace is removed. Records are not affected. This can’t be undone.' : <>“{one?.title}” is removed. Records are not affected. This can’t be undone.</>}
        confirmLabel={confirm === 'all' ? 'Delete all' : 'Delete conversation'}
        danger busy={del.isPending || clear.isPending}
        onConfirm={doConfirm} onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
