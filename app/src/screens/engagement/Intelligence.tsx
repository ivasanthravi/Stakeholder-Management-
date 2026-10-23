// Meeting intelligence review workspace (/engagements/:id/intelligence).
// Left: the source notes with every proposal's quoted evidence highlighted. Right: the proposals to review.
// Humans decide; the engine only proposes. Nothing is created until a person accepts a proposal, and every
// accept/edit/reject carries the proposal's version so a stale screen can never overwrite someone else's review.
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Ban, Check, Eye, EyeOff, FileUp, GitMerge, Handshake, ListTodo, MessagesSquare, Quote, RefreshCw, Scale, ShieldAlert, Sparkles, TriangleAlert, Users, X } from 'lucide-react'
import { useInvalidate, useLookups, useRecord } from '../../api/hooks'
import { ApiError, errorMessage, NetworkError, request, ws } from '../../api/http'
import {
  REVIEW_FLAG_LABEL, useAcceptProposal, useAnalyzeMeeting, useEditProposal, useMeetingAnalysis, useMergeProposal, useRejectProposal,
  type EngineInfo, type MeetingAnalysis, type Proposal, type ProposalKind, type ProposalValues, type QuoteEvidence, type RecordEvidence,
} from '../../api/ai'
import { Avatar, Button, Skeleton } from '../../components/ui'
import { Field, type Form } from '../../components/form'
import { ConfirmDialog } from '../../components/Drawer'
import { NotFound } from '../../components/NotFound'
import type { PickerOption } from '../../components/Picker'
import { MemberPicker, StakeholderPicker } from '../../forms/pickers'
import { useHotkeys } from '../../lib/hotkeys'
import { t } from '../../lib/motion'
import { DECISION_STATUS_LABEL, ENGAGEMENT_KIND_LABEL, fmtDate, fmtRelative } from '../../lib/format'
import { useApp } from '../../shell/context'
import { useSession } from '../../session/session'
import { LoadError } from '../Home'
import './engagement.css'
import './intelligence.css'

/* ── Limits & helpers ────────────────────────────────────────────────────── */

/** The analysis endpoint refuses notes shorter than this (server: assertAnalysable). */
export const MIN_ANALYSABLE = 40
/** Upper bound for analysis is 60,000; engagement notes themselves are stored up to 50,000 characters, so that is the effective cap. */
export const NOTES_LIMIT = 50_000
const FILE_BYTES_LIMIT = 2_000_000

interface EngagementDetail {
  id: string; key: string; kind: string; title: string; occurredAt: string; notes: string | null; version: number; archivedAt: string | null
  participants: { id: string; name: string; title: string | null }[]
}

type Draft = { title: string; ownerId: string | null; stakeholderId: string | null; dueDate: string | null; direction: 'ours' | 'theirs'; status: string; stakeholderIds: string[] }
const EDITABLE: (keyof Draft)[] = ['title', 'ownerId', 'stakeholderId', 'dueDate', 'direction', 'status', 'stakeholderIds']

const KIND_LABEL: Record<ProposalKind, string> = { commitment: 'Commitment', decision: 'Decision', action: 'Action', stakeholder_note: 'Stakeholder note', follow_up_engagement: 'Follow-up meeting' }
const GROUPS: { kinds: ProposalKind[]; label: string; icon: typeof Scale; none: string }[] = [
  { kinds: ['decision'], label: 'Decisions', icon: Scale, none: 'No decisions found in these notes.' },
  { kinds: ['commitment'], label: 'Commitments', icon: Handshake, none: 'No commitments found in these notes.' },
  { kinds: ['action'], label: 'Actions', icon: ListTodo, none: 'No follow-up actions found in these notes.' },
  { kinds: ['stakeholder_note', 'follow_up_engagement'], label: 'Other', icon: MessagesSquare, none: '' },
]

const recordHref = (type: string | null, id: string | null) => !id ? null : type === 'commitment' ? `/commitments?open=${id}` : type === 'decision' ? `/decisions?open=${id}` : null
const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
function reveal(el: Element | null | undefined, block: ScrollLogicalPosition = 'center') {
  el?.scrollIntoView({ block, behavior: reduceMotion() ? 'auto' : 'smooth' })
}
function inView(el: Element) {
  const r = el.getBoundingClientRect()
  let p = el.parentElement
  while (p && p !== document.body) {
    const s = getComputedStyle(p)
    if (/(auto|scroll)/.test(s.overflowY)) { const pr = p.getBoundingClientRect(); return r.top >= pr.top && r.bottom <= pr.bottom }
    p = p.parentElement
  }
  return r.top >= 0 && r.bottom <= window.innerHeight
}

const looseRe = (s: string) => new RegExp(s.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
/** Offsets are into the notes as they were analysed. If the notes changed, re-find the quoted text; null when it's gone. */
function locate(notes: string, start: number, end: number, text: string, trust = false): { start: number; end: number } | null {
  const inBounds = start >= 0 && end > start && end <= notes.length
  if (inBounds && (trust || notes.slice(start, end) === text)) return { start, end }
  if (!text.trim()) return null
  const i = notes.indexOf(text)
  if (i >= 0) return { start: i, end: i + text.length }
  const m = looseRe(text).exec(notes)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3))
function similarity(a: string, b: string) {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const w of A) if (B.has(w)) n++
  return n / Math.min(A.size, B.size)
}

const quotes = (p: Proposal) => p.evidence.filter((e): e is QuoteEvidence => e.kind === 'quote')
const records = (p: Proposal) => p.evidence.filter((e): e is RecordEvidence => e.kind === 'record')

function engineLine(a: MeetingAnalysis, engine: EngineInfo) {
  if (a.engine === 'local') return 'Analysed by the built-in rules engine (pattern matching; no AI model)'
  return `Analysed by ${engine.kind === 'claude' ? engine.label : 'an AI model'}${a.model ? ` · ${a.model}` : ''}`
}
function engineAbout(engine: EngineInfo) {
  return engine.kind === 'local' ? `${engine.label}: rule-based pattern matching. No AI model reads these notes.` : `${engine.label}. The notes are sent to the model for this analysis only.`
}

/* ── Transcript files ────────────────────────────────────────────────────── */

const isCaptionFile = (name: string, text: string) => /\.(vtt|srt)$/i.test(name) || /^﻿?WEBVTT/.test(text) || /^\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)

/** Converts WebVTT / SRT captions into plain "Speaker: text" lines (timestamps, cue numbers and markup removed). */
export function captionsToText(raw: string): string {
  const lines = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const out: { speaker: string | null; text: string }[] = []
  let skip = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) { skip = false; continue }
    if (skip) continue
    if (/^WEBVTT\b/.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line)) { skip = true; continue }
    if (line.includes('-->')) continue
    if (/^\d+$/.test(line) || lines[i + 1]?.includes('-->')) continue // cue number / identifier
    let speaker: string | null = null
    const v = /^<v(?:\.[^\s>]+)?\s+([^>]+)>/.exec(line)
    if (v) speaker = v[1].trim()
    let text = line
      .replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}>/g, '')
      .replace(/<\/?[^>]+>/g, '')
      .replace(/\{\\[^}]*\}/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (!speaker) {
      const m = /^-?\s*([A-Z][\p{L}.' -]{0,40}?):\s+(.+)$/u.exec(text)
      if (m) { speaker = m[1].trim(); text = m[2] }
    }
    const last = out[out.length - 1]
    if (last && last.text.endsWith(text)) continue // rolling auto-captions repeat the previous line
    if (last && (speaker ? speaker === last.speaker : (last.speaker !== null || !/[.?!…"”]$/.test(last.text)))) {
      last.text += ' ' + text
    } else out.push({ speaker, text })
  }
  return out.map(e => (e.speaker ? `${e.speaker}: ${e.text}` : e.text)).join('\n')
}

/* ── Workspace ───────────────────────────────────────────────────────────── */

export function MeetingIntelligence() {
  const { id = '' } = useParams()
  const { can } = useSession()
  const { toast, announce, setPeek } = useApp()
  const rec = useRecord<EngagementDetail>('engagements', id)
  const d = rec.data?.id === id ? rec.data : undefined
  const q = useMeetingAnalysis(id)
  const analysis = q.data?.analysis ?? null
  const engine = q.data?.engine
  const analyze = useAnalyzeMeeting()
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [confirmReanalyse, setConfirmReanalyse] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [createdKeys, setCreatedKeys] = useState<Record<string, string>>({})
  const focusNext = useRef<string | null>(null)
  const sourceRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setPeek(null) }, [setPeek])

  const notes = (d?.notes ?? '').trim()
  const archived = !!d?.archivedAt
  const canAnalyse = can('engagement.create')
  const pendingCount = analysis?.proposals.filter(p => p.status === 'pending').length ?? 0

  // Ordered as the user reads them: by group, then by position in the source.
  const ordered = useMemo(() => {
    if (!analysis) return []
    const pos = (p: Proposal) => quotes(p)[0]?.start ?? Number.MAX_SAFE_INTEGER
    return GROUPS.flatMap(g => analysis.proposals.filter(p => g.kinds.includes(p.kind)).sort((a, b) => pos(a) - pos(b)))
  }, [analysis])
  const pendingIds = useMemo(() => ordered.filter(p => p.status === 'pending').map(p => p.id), [ordered])

  // Re-locate evidence in the current notes. When notes haven't changed this is an exact offset check.
  const located = useMemo(() => {
    const m = new Map<string, { start: number; end: number }[]>()
    if (!analysis) return m
    const trust = !analysis.stale // unchanged notes: the server's offsets are exact even when quote punctuation was normalised
    for (const p of analysis.proposals) m.set(p.id, quotes(p).map(e => locate(notes, e.start, e.end, e.text, trust)).filter((x): x is { start: number; end: number } => !!x))
    analysis.openQuestions.forEach((oq, i) => { const r = locate(notes, oq.evidence.start, oq.evidence.end, oq.evidence.text, trust); m.set(`q:${i}`, r ? [r] : []) })
    return m
  }, [analysis, notes])
  const flags = useMemo(() => (analysis?.flags ?? []).map(f => ({ ...f, at: locate(notes, f.start, f.end, f.line) })), [analysis, notes])
  const missingCount = analysis ? analysis.proposals.filter(p => p.status === 'pending' && quotes(p).length && !located.get(p.id)?.length).length : 0

  const analyseBlock = !d ? 'Loading…'
    : archived ? 'Archived engagements can’t be analysed.'
    : !canAnalyse ? 'Your role can view this analysis but not run it.'
    : notes.length < MIN_ANALYSABLE ? `Add notes or upload a transcript first (at least ${MIN_ANALYSABLE} characters; currently ${notes.length}).`
    : notes.length > 60_000 ? 'These notes are longer than 60,000 characters. Split them into separate engagements to analyse.'
    : null

  const runAnalyse = useCallback(async () => {
    if (!d) return
    setConfirmReanalyse(false); setAnalyzeError(null)
    announce('Analysing notes…')
    try {
      const a = await analyze.mutateAsync({ _engagementId: d.id })
      const n = a?.proposals?.filter(p => p.status === 'pending').length ?? 0
      setActive(null)
      toast(n ? `Analysis complete: ${n} proposal${n === 1 ? '' : 's'} to review` : 'Analysis complete: nothing to propose')
      await q.refetch()
    } catch (e) {
      setAnalyzeError(errorMessage(e))
      announce('Analysis failed')
    }
  }, [d, analyze, announce, toast, q])
  const startAnalyse = () => { if (analysis && pendingCount > 0) setConfirmReanalyse(true); else void runAnalyse() }

  /* Selection ↔ source synchronisation */
  const markFor = (key: string) => sourceRef.current?.querySelector(`[data-keys~="${CSS.escape(key)}"]`) ?? null
  const select = useCallback((key: string, from: 'card' | 'source' | 'key') => {
    setActive(key)
    if (from === 'source') {
      const card = document.getElementById(`ix-card-${key}`) ?? document.getElementById(`ix-${key.replace(':', '-')}`)
      if (card) { if (!inView(card)) reveal(card); (card as HTMLElement).focus({ preventScroll: true }) }
    } else {
      const m = markFor(key)
      if (m && !inView(m)) reveal(m)
      if (from === 'key') { const card = document.getElementById(`ix-card-${key}`); if (card) { reveal(card, 'nearest'); card.focus({ preventScroll: true }) } }
    }
  }, [])
  const hoverCard = useCallback((key: string | null) => {
    setHover(key)
    if (key) { const m = markFor(key); if (m && !inView(m)) reveal(m, 'nearest') }
  }, [])
  const showInNotes = useCallback((key: string) => {
    setShowSource(true); setActive(key)
    requestAnimationFrame(() => requestAnimationFrame(() => { const m = markFor(key) as HTMLElement | null; if (m) { reveal(m); m.focus({ preventScroll: true }) } }))
  }, [])

  useHotkeys({
    j: () => { if (!pendingIds.length) return; const i = active ? pendingIds.indexOf(active) : -1; select(pendingIds[Math.min(pendingIds.length - 1, i + 1)], 'key') },
    k: () => { if (!pendingIds.length) return; const i = active ? pendingIds.indexOf(active) : pendingIds.length; select(pendingIds[Math.max(0, i - 1)], 'key') },
  }, [pendingIds, active, select])

  /** After a card is decided, focus moves to the next pending card (or the review heading when none are left). */
  const onResolved = useCallback((p: Proposal, message: string, created?: { key: string }) => {
    const i = pendingIds.indexOf(p.id)
    const next = pendingIds[i + 1] ?? pendingIds[i - 1] ?? null
    focusNext.current = next ?? 'ix-review-head'
    if (created) setCreatedKeys(k => ({ ...k, [p.id]: created.key }))
    toast(message)
    announce(`${message}. ${Math.max(0, pendingIds.length - 1)} pending.`)
    if (next) setActive(next)
  }, [pendingIds, toast, announce])
  useEffect(() => {
    const target = focusNext.current
    if (!target) return
    const el = document.getElementById(target === 'ix-review-head' ? target : `ix-card-${target}`)
    if (el) { focusNext.current = null; el.focus({ preventScroll: true }); if (!inView(el)) reveal(el, 'nearest') }
  })

  if (rec.error instanceof ApiError && rec.error.status === 404) return <NotFound what="Engagement" back="/engagements" backLabel="All engagements" />

  const counts = {
    pending: pendingCount,
    accepted: analysis?.proposals.filter(p => p.status === 'accepted').length ?? 0,
    rejected: analysis?.proposals.filter(p => p.status === 'rejected' || p.status === 'merged').length ?? 0,
  }
  const loading = !d || q.isPending

  return (
    <>
      <header className="page-head">
        <div className="crumbs">
          <Link to="/engagements">Engagements</Link><span className="sep">/</span>
          {d ? <Link to={`/engagements/${d.id}`} className="mono">{d.key}</Link> : <Skeleton w={50} h={11} />}<span className="sep">/</span>
          <span className="here">Meeting intelligence</span>
        </div>
        <span className="grow" />
      </header>

      <div className="ix-page">
        {rec.isError && !d ? <div className="ix-pad"><LoadError error={rec.error} onRetry={() => rec.refetch()} /></div> : (
          <>
            <section className="ix-top" aria-labelledby="ix-title">
              <div className="ix-top-main">
                <p className="ix-eyebrow"><Sparkles size={12} aria-hidden />Meeting intelligence</p>
                <h1 id="ix-title" className="t-title ix-title">{d?.title ?? <Skeleton w={280} h={20} />}</h1>
                {d && (
                  <p className="t-small c2 ix-meta">
                    <span className="mono">{d.key}</span>
                    <span>{ENGAGEMENT_KIND_LABEL[d.kind] ?? d.kind}</span>
                    <time dateTime={d.occurredAt}>{fmtDate(d.occurredAt, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</time>
                  </p>
                )}
                {engine && (
                  <p className="t-small c3 ix-engine">
                    {analysis
                      ? <>{engineLine(analysis, engine)} · {analysis.createdByName ? `run by ${analysis.createdByName}` : 'run'} <time dateTime={analysis.createdAt} title={new Date(analysis.createdAt).toLocaleString('en-GB')}>{fmtRelative(analysis.createdAt).toLowerCase()}</time></>
                      : engineAbout(engine)}
                  </p>
                )}
              </div>
              <div className="ix-top-actions">
                <button type="button" className="btn btn-secondary btn-sm ix-narrow-only" aria-expanded={showSource} aria-controls="ix-source" onClick={() => setShowSource(s => !s)}>
                  {showSource ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}<span className="btn-label">{showSource ? 'Hide source' : 'Show source'}</span>
                </button>
                {d && !archived && can('engagement.update') && (
                  <TranscriptUpload d={d} pendingCount={pendingCount} canAnalyse={canAnalyse} onSavedAndAnalyse={() => void runAnalyse()} />
                )}
                <Button size="sm" variant="primary" icon={analysis ? <RefreshCw size={14} /> : <Sparkles size={14} />} loading={analyze.isPending}
                  disabled={!!analyseBlock || analyze.isPending} aria-describedby={analyseBlock ? 'ix-analyse-why' : undefined} onClick={startAnalyse}>
                  {analyze.isPending ? 'Analysing…' : analysis ? 'Re-analyse' : 'Analyse notes'}
                </Button>
              </div>
              {analyseBlock && d && <p id="ix-analyse-why" className="t-small c3 ix-why">{analyseBlock}</p>}
            </section>

            {analyzeError && <p className="ix-error ix-banner" role="alert"><TriangleAlert size={14} aria-hidden />{analyzeError}</p>}
            {analysis?.stale && (
              <div className="ix-stale ix-banner" role="status">
                <TriangleAlert size={14} aria-hidden />
                <span className="grow">The notes changed after this analysis ran. Proposals may not reflect the current notes{missingCount ? `, and ${missingCount} quoted passage${missingCount === 1 ? ' is' : 's are'} no longer in them` : ''}.</span>
                {!analyseBlock && <Button size="sm" icon={<RefreshCw size={13} />} loading={analyze.isPending} onClick={startAnalyse}>Re-analyse</Button>}
              </div>
            )}

            <div className="ix-split" data-source={showSource || undefined}>
              <section id="ix-source" className="ix-source" aria-label="Source notes">
                <div className="ix-source-inner" ref={sourceRef}>
                  <SourcePane notes={notes} loading={loading} analysis={analysis} located={located} flags={flags} ordered={ordered}
                    active={active} hover={hover} setHover={setHover} onSelect={k => select(k, 'source')} />
                </div>
              </section>

              <section className="ix-review" aria-labelledby="ix-review-head" aria-busy={analyze.isPending || undefined}>
                <div className="ix-review-inner">
                  <div className="ix-review-top">
                    <h2 id="ix-review-head" tabIndex={-1} className="t-heading">Review</h2>
                    {analysis && analysis.proposals.length > 0 && (
                      <dl className="ix-counts" aria-label="Review progress">
                        <div data-k="pending"><dt>Pending</dt><dd className="num">{counts.pending}</dd></div>
                        <div data-k="accepted"><dt>Accepted</dt><dd className="num">{counts.accepted}</dd></div>
                        <div data-k="rejected" title="Rejected or merged into another proposal"><dt>Rejected</dt><dd className="num">{counts.rejected}</dd></div>
                      </dl>
                    )}
                  </div>
                  <p className="ix-promise t-small"><Check size={13} aria-hidden />Nothing is saved until you accept it. Rejecting only dismisses the suggestion.</p>

                  {q.isError ? <LoadError error={q.error} onRetry={() => q.refetch()} />
                    : loading ? <ReviewSkeleton />
                    : !analysis ? (
                      <Empty icon={<Sparkles size={20} />} title={notes.length < MIN_ANALYSABLE ? 'Add notes or upload a transcript to analyse' : 'Not analysed yet'}>
                        {notes.length < MIN_ANALYSABLE
                          ? <>This {(ENGAGEMENT_KIND_LABEL[d!.kind] ?? 'engagement').toLowerCase()} has {notes.length ? 'only a few words of' : 'no'} notes. Add them on the <Link to={`/engagements/${d!.id}`}>engagement page</Link>, or load a transcript file above.</>
                          : <>Analysing reads the notes and proposes decisions, commitments and follow-up actions, each tied to a quote. You review every item; nothing is created automatically.</>}
                      </Empty>
                    ) : (
                      <>
                        {analysis.summary && (
                          <section className="ix-block" aria-labelledby="ix-sum-h">
                            <h3 id="ix-sum-h" className="ix-block-h">Summary <span className="ix-gen">Generated · {analysis.engine === 'local' ? 'rules engine' : 'AI'}</span></h3>
                            <p className="ix-summary">{analysis.summary}</p>
                          </section>
                        )}
                        {analysis.proposals.length === 0 && (
                          <Empty icon={<Check size={20} />} title="Nothing to review">
                            The analysis found no decisions, commitments or actions it could tie to a quote in the notes. If you expected some, check the notes say who agreed to what, then re-analyse.
                          </Empty>
                        )}
                        {analysis.proposals.length > 0 && GROUPS.map(g => {
                          const items = ordered.filter(p => g.kinds.includes(p.kind))
                          if (!items.length && !g.none) return null
                          const Icon = g.icon
                          const pend = items.filter(p => p.status === 'pending').length
                          return (
                            <section key={g.label} className="ix-group" aria-labelledby={`ix-g-${g.label}`}>
                              <h3 id={`ix-g-${g.label}`} className="ix-group-h"><Icon size={14} aria-hidden />{g.label}<span className="num c3">{pend ? `${pend} pending` : items.length ? 'all reviewed' : ''}</span></h3>
                              {!items.length ? <p className="t-small c3 ix-none">{g.none}</p> : (
                                <ul className="ix-cards">
                                  <AnimatePresence initial={false}>
                                    {items.map(p => (
                                      <motion.li key={p.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: t.base }} exit={{ opacity: 0, transition: t.exit }}>
                                        {p.status === 'pending'
                                          ? <ProposalCard p={p} d={d!} analysis={analysis} active={active === p.id} hovered={hover === p.id} sourceMissing={!!quotes(p).length && !located.get(p.id)?.length}
                                              onSelect={() => select(p.id, 'card')} onHover={hoverCard} onShowInNotes={() => showInNotes(p.id)} onResolved={onResolved} refetch={() => q.refetch()} />
                                          : <ResolvedRow p={p} createdKey={createdKeys[p.id]} all={analysis.proposals} />}
                                      </motion.li>
                                    ))}
                                  </AnimatePresence>
                                </ul>
                              )}
                            </section>
                          )
                        })}
                        <Context analysis={analysis} active={active} located={located} onSelect={k => select(k, 'card')} onShowInNotes={showInNotes} onHover={hoverCard} />
                      </>
                    )}
                </div>
              </section>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog open={confirmReanalyse} title="Re-analyse these notes?" confirmLabel="Re-analyse" busy={analyze.isPending}
        onCancel={() => setConfirmReanalyse(false)} onConfirm={() => void runAnalyse()}
        body={`The ${pendingCount} proposal${pendingCount === 1 ? '' : 's'} still pending review will be replaced by a fresh set. Accepted and rejected proposals, and records already created, are kept.`} />
    </>
  )
}

function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="ix-empty">
      <span className="ix-empty-ico" aria-hidden>{icon}</span>
      <p className="t-heading">{title}</p>
      <p className="t-small c2">{children}</p>
    </div>
  )
}

function ReviewSkeleton() {
  return (
    <div className="ix-skel" aria-hidden>
      {[0, 1, 2].map(i => <div key={i} className="ix-card ix-card-skel"><Skeleton w={90} h={10} /><Skeleton w="85%" h={14} /><Skeleton w="60%" h={12} /></div>)}
    </div>
  )
}

/* ── Source notes with highlights ────────────────────────────────────────── */

type Range = { key: string; start: number; end: number; type: 'proposal' | 'question' | 'flag'; inferred?: boolean; status?: string; label: string }

function SourcePane({ notes, loading, analysis, located, flags, ordered, active, hover, setHover, onSelect }: {
  notes: string; loading: boolean; analysis: MeetingAnalysis | null; located: Map<string, { start: number; end: number }[]>
  flags: { line: string; reason: string; at: { start: number; end: number } | null }[]; ordered: Proposal[]
  active: string | null; hover: string | null; setHover: (k: string | null) => void; onSelect: (k: string) => void
}) {
  const ranges = useMemo<Range[]>(() => {
    const out: Range[] = []
    for (const p of ordered) {
      if (p.status !== 'pending' && p.status !== 'accepted') continue
      for (const r of located.get(p.id) ?? []) out.push({ key: p.id, ...r, type: 'proposal', inferred: p.basis === 'inferred', status: p.status, label: `${KIND_LABEL[p.kind]}: ${p.title}` })
    }
    analysis?.openQuestions.forEach((oq, i) => { for (const r of located.get(`q:${i}`) ?? []) out.push({ key: `q:${i}`, ...r, type: 'question', label: `Open question: ${oq.text}` }) })
    flags.forEach((f, i) => { if (f.at) out.push({ key: `f:${i}`, ...f.at, type: 'flag', label: f.reason }) })
    return out
  }, [ordered, located, analysis, flags])

  const segments = useMemo(() => {
    if (!ranges.length) return [notes]
    const pts = [...new Set([0, notes.length, ...ranges.flatMap(r => [r.start, r.end])])].filter(n => n >= 0 && n <= notes.length).sort((a, b) => a - b)
    const out: ReactNode[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1]
      const text = notes.slice(a, b)
      const cover = ranges.filter(r => r.start <= a && r.end >= b)
      if (!cover.length) { out.push(text); continue }
      const props = cover.filter(r => r.type !== 'flag')
      const flag = cover.find(r => r.type === 'flag')
      const keys = cover.map(r => r.key)
      const head = cover.find(r => r.start === a && r.type !== 'flag') ?? (flag && flag.start === a ? flag : undefined)
      const primary = props.find(r => r.key === active) ?? props[0]
      const clickable = !!primary
      out.push(
        <mark key={a} className="ix-mark" data-keys={keys.join(' ')}
          data-type={primary ? primary.type : undefined} data-flag={flag ? '' : undefined}
          data-inferred={primary?.inferred || undefined} data-status={primary?.status}
          data-active={keys.includes(active ?? '') || undefined} data-hover={keys.includes(hover ?? '') || undefined}
          tabIndex={head ? 0 : undefined} role={clickable ? 'button' : undefined}
          aria-describedby={cover.map(r => r.type === 'flag' ? 'ix-inj-explain' : `ix-d-${r.key.replace(':', '-')}`).filter((v, j, arr) => arr.indexOf(v) === j).join(' ')}
          title={cover.map(r => r.type === 'flag' ? 'Instruction-like text — treated as content, nothing extracted from it' : r.label).join('\n')}
          onMouseEnter={() => primary && setHover(primary.key)} onMouseLeave={() => setHover(null)}
          onClick={() => { if (primary && window.getSelection()?.isCollapsed !== false) onSelect(cycle(props, active)) }}
          onKeyDown={e => { if (primary && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(cycle(props, active)) } }}>
          {flag && flag.start === a && <ShieldAlert size={12} className="ix-inj-ico" aria-hidden />}
          {text}
        </mark>,
      )
    }
    return out
  }, [notes, ranges, active, hover, setHover, onSelect])

  if (loading) return <div className="ix-src-skel" aria-hidden><Skeleton w="40%" h={10} /><Skeleton h={14} /><Skeleton w="92%" h={14} /><Skeleton w="80%" h={14} /><Skeleton w="88%" h={14} /></div>
  const flagCount = flags.length
  return (
    <>
      <div className="ix-src-head">
        <h2 className="ix-block-h">Source notes</h2>
        {analysis && ranges.length > 0 && (
          <p className="ix-legend t-small c3" aria-label="Highlight key">
            <span><i className="ix-key ix-key-stated" aria-hidden />Stated</span>
            <span><i className="ix-key ix-key-inferred" aria-hidden />Inferred</span>
            {flagCount > 0 && <span><i className="ix-key ix-key-flag" aria-hidden />Ignored instruction</span>}
          </p>
        )}
      </div>
      {flagCount > 0 && (
        <p className="ix-inj-note t-small" id="ix-inj-explain">
          <ShieldAlert size={13} aria-hidden />
          <span><strong>Instruction-like text — treated as content, nothing extracted from it.</strong> {flagCount === 1 ? 'One passage reads' : `${flagCount} passages read`} like a command to an AI system. {flagCount === 1 ? 'It stays' : 'They stay'} part of the notes, but no proposals were taken from {flagCount === 1 ? 'it' : 'them'}.</span>
        </p>
      )}
      {!notes ? <p className="t-small c3 ix-none">No notes yet.</p> : <div className="ix-notes">{segments}</div>}
      {/* Descriptions referenced by highlight aria-describedby */}
      <div hidden>
        {ranges.filter((r, i) => r.type !== 'flag' && ranges.findIndex(x => x.key === r.key) === i).map(r => <span key={r.key} id={`ix-d-${r.key.replace(':', '-')}`}>{r.type === 'proposal' ? `Source of proposed ${r.label}${r.inferred ? ' (inferred)' : ''}` : r.label}</span>)}
      </div>
    </>
  )
}
/** Clicking a passage that backs several proposals cycles through them. */
function cycle(props: Range[], active: string | null) {
  const keys = [...new Set(props.map(r => r.key))]
  const i = active ? keys.indexOf(active) : -1
  return keys[(i + 1) % keys.length]
}

/* ── Proposal card ───────────────────────────────────────────────────────── */

function draftFrom(p: Proposal, canApprove: boolean): Draft {
  const v = p.values
  const status = (v.status as string | undefined) ?? 'proposed'
  return {
    title: (v.title as string | undefined) ?? p.title, ownerId: v.ownerId ?? null, stakeholderId: v.stakeholderId ?? null, dueDate: v.dueDate ?? null,
    direction: v.direction ?? 'ours', status: p.kind === 'decision' && status !== 'proposed' && !canApprove ? 'proposed' : status, stakeholderIds: v.stakeholderIds ?? [],
  }
}
function changes(p: Proposal, d: Draft): ProposalValues {
  const base = draftFrom(p, true)
  const out: ProposalValues = {}
  const relevant: (keyof Draft)[] = p.kind === 'decision' ? ['title', 'status', 'stakeholderIds'] : p.kind === 'commitment' ? ['title', 'ownerId', 'stakeholderId', 'dueDate', 'direction'] : p.kind === 'action' ? ['title', 'ownerId', 'stakeholderId', 'dueDate'] : ['title']
  for (const k of EDITABLE) {
    if (!relevant.includes(k)) continue
    const a = JSON.stringify(base[k] ?? null), b = JSON.stringify((k === 'title' ? d.title.trim() : d[k]) ?? null)
    if (a !== b) (out as Record<string, unknown>)[k] = k === 'title' ? d.title.trim() : d[k]
  }
  return out
}

function ProposalCard({ p, d, analysis, active, hovered, sourceMissing, onSelect, onHover, onShowInNotes, onResolved, refetch }: {
  p: Proposal; d: EngagementDetail; analysis: MeetingAnalysis; active: boolean; hovered: boolean; sourceMissing: boolean
  onSelect: () => void; onHover: (k: string | null) => void; onShowInNotes: () => void
  onResolved: (p: Proposal, message: string, created?: { key: string }) => void; refetch: () => Promise<unknown>
}) {
  const { can } = useSession()
  const lookups = useLookups()
  const canEdit = can('engagement.create')
  const canApprove = can('decision.update')
  const isCommitmentLike = p.kind === 'commitment' || p.kind === 'action'
  const canAccept = isCommitmentLike ? can('commitment.create') : p.kind === 'decision' ? can('decision.create') : false
  const [draft, setDraft] = useState<Draft>(() => draftFrom(p, canApprove))
  const [savedVersion, setSavedVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'accept' | 'save' | 'reject' | 'merge' | null>(null)
  const [mergeInto, setMergeInto] = useState<string>('')
  const accept = useAcceptProposal(), edit = useEditProposal(), reject = useRejectProposal(), merge = useMergeProposal()
  const version = Math.max(p.version, savedVersion)
  const diff = useMemo(() => changes(p, draft), [p, draft])
  const dirty = Object.keys(diff).length > 0
  const statusForced = p.kind === 'decision' && (p.values.status ?? 'proposed') !== 'proposed' && !canApprove

  const form: Form = useMemo(() => ({
    values: draft as unknown as Record<string, unknown>,
    set: (k: string, v: unknown) => setDraft(x => ({ ...x, [k]: v })),
    blur: () => {}, error: () => undefined, formError: null,
  }), [draft])

  const people = useMemo<PickerOption[]>(() => {
    const seen = new Map<string, PickerOption>()
    for (const s of d.participants) seen.set(s.id, { value: s.id, label: s.name, sub: s.title ?? 'Participant', icon: <Avatar name={s.name} size={18} /> })
    for (const m of analysis.mentions) if (m.stakeholderId && !seen.has(m.stakeholderId)) seen.set(m.stakeholderId, { value: m.stakeholderId, label: m.name, sub: 'Mentioned', icon: <Avatar name={m.name} size={18} /> })
    return [...seen.values()]
  }, [d.participants, analysis.mentions])

  const memberName = (id: string | null) => (id ? lookups.data?.members.find(m => m.id === id)?.name ?? 'Workspace member' : null)
  const personName = (id: string | null) => (id ? people.find(o => o.value === id)?.label ?? 'Linked stakeholder' : null)

  const candidates = useMemo(() => {
    if (!p.needsReview.includes('possible_duplicate')) return []
    return analysis.proposals.filter(o => o.id !== p.id && o.status === 'pending' && o.kind === p.kind)
      .map(o => ({ o, s: similarity(o.title, draft.title) })).sort((a, b) => b.s - a.s).map(x => x.o)
  }, [analysis.proposals, p.id, p.kind, p.needsReview, draft.title])
  useEffect(() => { if (candidates.length && !candidates.some(c => c.id === mergeInto)) setMergeInto(candidates[0].id) }, [candidates, mergeInto])

  const fail = async (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) {
      setError(e.code === 'stale_version'
        ? 'This proposal changed since you opened it, possibly reviewed by someone else. It has been refreshed. Check it and try again; your edits are kept.'
        : `${e.message} The list has been refreshed.`)
      await refetch()
    } else if (e instanceof ApiError && e.status === 403) setError(e.message)
    else if (e instanceof NetworkError) setError('You’re offline. Nothing was saved. Try again when you’re back online.')
    else setError(errorMessage(e))
  }
  const run = async (kind: NonNullable<typeof busy>) => {
    if (busy) return
    if (kind !== 'reject' && kind !== 'merge' && !draft.title.trim()) { setError('Give it a title first.'); return }
    setBusy(kind); setError(null)
    try {
      if (kind === 'accept') {
        const r = await accept.mutateAsync({ _id: p.id, version, ...(dirty ? { values: diff } : {}) })
        onResolved(p, `${r.key} created from ${d.key}`, { key: r.key })
      } else if (kind === 'save') {
        const r = await edit.mutateAsync({ _id: p.id, version, values: diff })
        setSavedVersion(r.version)
        setDraft(draftFrom(r, canApprove))
        // stay on this card; the refreshed values come with the next fetch
      } else if (kind === 'reject') {
        await reject.mutateAsync({ _id: p.id, version })
        onResolved(p, `Rejected: ${truncate(p.title, 60)}`)
      } else if (kind === 'merge' && mergeInto) {
        await merge.mutateAsync({ _id: p.id, version, into: mergeInto })
        onResolved(p, 'Merged into the matching proposal')
      }
    } catch (e) { await fail(e) } finally { setBusy(null) }
  }

  const titleId = `ix-t-${p.id}`
  const qs = quotes(p)
  const recs = records(p)
  const inferred = p.basis === 'inferred'
  const flags = p.needsReview.filter(f => !(f === 'inferred' && inferred))
  const ownerResolved = !!draft.ownerId
  const showFlag = (f: string) => !(f === 'owner_missing' && ownerResolved) && !(f === 'stakeholder_unmatched' && draft.stakeholderId) && !((f === 'due_date_ambiguous' || f === 'due_date_derived') && draft.dueDate !== (p.values.dueDate ?? null))

  return (
    <article id={`ix-card-${p.id}`} tabIndex={-1} className="ix-card" data-basis={p.basis} data-active={active || undefined} data-hover={hovered || undefined}
      aria-labelledby={titleId} onFocusCapture={e => { if (!active && e.currentTarget.contains(e.target as Node)) onSelect() }}
      onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)} onClick={e => { if (!active && !(e.target as HTMLElement).closest('button, a, input, textarea, select, [role="combobox"]')) onSelect() }}>
      <div className="ix-card-top">
        <span className="ix-kind">{KIND_LABEL[p.kind]}</span>
        {inferred
          ? <span className="ix-basis" data-basis="inferred" title="Not said outright; worked out from the discussion. Confirm before accepting.">Inferred · confirm</span>
          : <span className="ix-basis" data-basis="explicit" title="Stated in the notes">Stated</span>}
        <span className="grow" />
        {sourceMissing && <span className="ix-chip ix-chip-warn"><TriangleAlert size={11} aria-hidden />Quote not in current notes</span>}
      </div>

      {canEdit ? (
        <label className="ix-title-wrap">
          <span className="sr-only">Title</span>
          <textarea id={titleId} className="ix-title-input" rows={1} maxLength={300} value={draft.title} onChange={e => setDraft(x => ({ ...x, title: e.target.value.replace(/\n/g, ' ') }))} />
        </label>
      ) : <p id={titleId} className="ix-title-text">{p.title}</p>}

      {flags.some(showFlag) && (
        <ul className="ix-flags" aria-label="Needs review">
          {flags.filter(showFlag).map(f => <li key={f} className="ix-chip ix-chip-warn"><TriangleAlert size={11} aria-hidden />{REVIEW_FLAG_LABEL[f]}</li>)}
        </ul>
      )}

      {qs.map((qe, i) => (
        <blockquote key={i} className="ix-quote">
          <Quote size={12} aria-hidden className="ix-quote-ico" />
          <span>{qe.text}</span>
          {!sourceMissing && i === 0 && <button type="button" className="ix-linkbtn" onClick={onShowInNotes}>Show in notes</button>}
        </blockquote>
      ))}
      {p.reasoning && <p className="t-small c3 ix-reason">{p.reasoning}</p>}

      {recs.map(r => {
        const href = recordHref(r.type, r.id)
        return (
          <p key={r.id} className="ix-dup t-small">
            <GitMerge size={13} aria-hidden />
            <span>Similar existing {r.type}: {href ? <Link to={href}>{r.label}</Link> : r.label}. If it’s the same thing, reject this proposal instead of creating a duplicate.</span>
          </p>
        )
      })}

      <div className="ix-fields">
        {isCommitmentLike && (canEdit ? (
          <>
            {p.kind === 'commitment' && (
              <Field label="Who owes it">
                {f => (
                  <div className="select-wrap">
                    <select {...f} className="input select" value={draft.direction} onChange={e => setDraft(x => ({ ...x, direction: e.target.value as Draft['direction'] }))}>
                      <option value="ours">We owe them</option>
                      <option value="theirs">They owe us</option>
                    </select>
                  </div>
                )}
              </Field>
            )}
            {draft.direction === 'theirs' ? (
              <>
                <StakeholderPicker form={form} name="stakeholderId" label="Owed by (stakeholder)" initialOptions={people}
                  hint={!draft.stakeholderId && p.values.ownerName ? `Notes name “${String(p.values.ownerName)}”` : undefined} />
                <MemberPicker form={form} name="ownerId" label="Our accountable owner" hint={!draft.ownerId ? 'If left empty, it’s assigned to you' : undefined} placeholder="You" />
              </>
            ) : (
              <>
                <MemberPicker form={form} name="ownerId" label="Owner"
                  hint={!draft.ownerId ? (p.values.ownerName ? `Notes name “${String(p.values.ownerName)}” — not matched. If left empty, it’s assigned to you.` : 'Not stated. If left empty, it’s assigned to you.') : undefined}
                  placeholder="Unassigned" />
                <StakeholderPicker form={form} name="stakeholderId" label="With stakeholder" initialOptions={people} />
              </>
            )}
            <Field label="Due date" hint={p.values.dueText ? <>said: “{String(p.values.dueText)}”{p.needsReview.includes('due_date_derived') && draft.dueDate === (p.values.dueDate ?? null) ? ' · date worked out from this, check it' : ''}</> : undefined}>
              {f => <input {...f} type="date" className="input" value={draft.dueDate ?? ''} onChange={e => setDraft(x => ({ ...x, dueDate: e.target.value || null }))} />}
            </Field>
          </>
        ) : (
          <dl className="ix-readonly t-small">
            {p.kind === 'commitment' && <><dt>Who owes it</dt><dd>{draft.direction === 'theirs' ? 'They owe us' : 'We owe them'}</dd></>}
            <dt>Owner</dt><dd>{memberName(draft.ownerId) ?? '—'}</dd>
            <dt>Stakeholder</dt><dd>{personName(draft.stakeholderId) ?? '—'}</dd>
            <dt>Due</dt><dd>{draft.dueDate ? fmtDate(draft.dueDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}{p.values.dueText ? ` (said: “${String(p.values.dueText)}”)` : ''}</dd>
          </dl>
        ))}

        {p.kind === 'decision' && (canEdit ? (
          <>
            <Field label="Record as" hint={!canApprove ? (statusForced ? 'The notes suggest this was decided, but only managers can record a decision as approved. It will be submitted as Proposed.' : 'Only managers can record a decision as approved.') : undefined}>
              {f => (
                <div className="select-wrap">
                  <select {...f} className="input select" value={draft.status} onChange={e => setDraft(x => ({ ...x, status: e.target.value }))}>
                    <option value="proposed">{DECISION_STATUS_LABEL.proposed}</option>
                    <option value="approved" disabled={!canApprove}>{DECISION_STATUS_LABEL.approved}{!canApprove ? ' (managers only)' : ''}</option>
                  </select>
                </div>
              )}
            </Field>
            <StakeholderPicker form={form} name="stakeholderIds" label="People involved" multi initialOptions={people} />
          </>
        ) : (
          <dl className="ix-readonly t-small">
            <dt>Record as</dt><dd>{DECISION_STATUS_LABEL[draft.status] ?? draft.status}</dd>
            <dt>People</dt><dd>{draft.stakeholderIds.map(personName).join(', ') || '—'}</dd>
          </dl>
        ))}
      </div>

      {error && <p className="ix-error t-small" role="alert"><TriangleAlert size={13} aria-hidden />{error}</p>}

      {canEdit || canAccept ? (
        <div className="ix-actions">
          <Button size="sm" variant="primary" icon={<Check size={14} />} loading={busy === 'accept'} disabled={!canAccept || !!busy} onClick={() => void run('accept')}
            aria-describedby={!canAccept ? `ix-na-${p.id}` : undefined}>
            {dirty ? 'Accept with edits' : 'Accept'}
          </Button>
          {canEdit && dirty && <Button size="sm" loading={busy === 'save'} disabled={!!busy} onClick={() => void run('save')}>Save edits</Button>}
          {canEdit && dirty && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => { setDraft(draftFrom(p, canApprove)); setError(null) }}>Undo edits</Button>}
          <span className="grow" />
          {canEdit && <Button size="sm" variant="ghost" icon={<Ban size={13} />} loading={busy === 'reject'} disabled={!!busy} onClick={() => void run('reject')} aria-label={`Reject: ${p.title}`}>Reject</Button>}
        </div>
      ) : <p className="t-small c3 ix-na">Your role can view proposals but not decide them.</p>}
      {!canAccept && (canEdit || canAccept) && <p id={`ix-na-${p.id}`} className="t-small c3 ix-na">{isCommitmentLike || p.kind === 'decision' ? 'Your role can’t create this kind of record.' : 'This kind of proposal can’t be applied automatically yet. Reject it once you’ve dealt with it.'}</p>}

      {canEdit && candidates.length > 0 && (
        <div className="ix-merge">
          <label className="t-small c2" htmlFor={`ix-m-${p.id}`}>Looks like a duplicate. Merge into</label>
          <div className="select-wrap ix-merge-sel">
            <select id={`ix-m-${p.id}`} className="input select" value={mergeInto} onChange={e => setMergeInto(e.target.value)}>
              {candidates.map(c => <option key={c.id} value={c.id}>{truncate(c.title, 70)}</option>)}
            </select>
          </div>
          <Button size="sm" icon={<GitMerge size={13} />} loading={busy === 'merge'} disabled={!!busy || !mergeInto} onClick={() => void run('merge')}>Merge</Button>
        </div>
      )}
    </article>
  )
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function ResolvedRow({ p, createdKey, all }: { p: Proposal; createdKey?: string; all: Proposal[] }) {
  const href = recordHref(p.createdRecordType, p.createdRecordId)
  const into = p.mergedInto ? all.find(x => x.id === p.mergedInto) : undefined
  return (
    <div className="ix-resolved" data-status={p.status} id={`ix-card-${p.id}`} tabIndex={-1}>
      <span className="ix-res-ico" aria-hidden>{p.status === 'accepted' ? <Check size={12} /> : p.status === 'merged' ? <GitMerge size={12} /> : <X size={12} />}</span>
      <span className="ix-res-text truncate" title={p.title}>{p.title}</span>
      {p.status === 'accepted' && (href
        ? <Link to={href} className="ix-res-link">{createdKey ? `Created ${createdKey}` : `Open ${p.createdRecordType}`}</Link>
        : <span className="t-small c2">Accepted</span>)}
      {p.status === 'rejected' && <span className="t-small c3">Rejected</span>}
      {p.status === 'merged' && <span className="t-small c3" title={into?.title}>Merged{into ? ` into “${truncate(into.title, 30)}”` : ''}</span>}
    </div>
  )
}

/* ── Topics, open questions, people ──────────────────────────────────────── */

function Context({ analysis, active, located, onSelect, onShowInNotes, onHover }: {
  analysis: MeetingAnalysis; active: string | null; located: Map<string, { start: number; end: number }[]>
  onSelect: (k: string) => void; onShowInNotes: (k: string) => void; onHover: (k: string | null) => void
}) {
  const lookups = useLookups()
  return (
    <>
      {analysis.openQuestions.length > 0 && (
        <section className="ix-block" aria-labelledby="ix-oq-h">
          <h3 id="ix-oq-h" className="ix-block-h">Open questions <span className="num c3">{analysis.openQuestions.length}</span></h3>
          <ul className="ix-oq">
            {analysis.openQuestions.map((oq, i) => {
              const k = `q:${i}`
              const found = !!located.get(k)?.length
              return (
                <li key={i} id={`ix-q-${i}`} tabIndex={-1} data-active={active === k || undefined} onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)}>
                  <span className="grow">{oq.text}</span>
                  {found && <button type="button" className="ix-linkbtn" onClick={() => { onSelect(k); onShowInNotes(k) }}>Show in notes</button>}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {analysis.topics.length > 0 && (
        <section className="ix-block" aria-labelledby="ix-tp-h">
          <h3 id="ix-tp-h" className="ix-block-h">Topics</h3>
          <ul className="ix-topics">{analysis.topics.map(tp => <li key={tp}>{tp}</li>)}</ul>
        </section>
      )}
      {analysis.mentions.length > 0 && (
        <section className="ix-block" aria-labelledby="ix-pp-h">
          <h3 id="ix-pp-h" className="ix-block-h"><Users size={13} aria-hidden />People mentioned <span className="num c3">{analysis.mentions.length}</span></h3>
          <ul className="ix-people">
            {analysis.mentions.map(m => {
              const member = m.memberId ? lookups.data?.members.find(x => x.id === m.memberId) : undefined
              return (
                <li key={m.name}>
                  <Avatar name={m.name} size={20} internal={!!m.memberId} />
                  <span className="grow truncate">{m.stakeholderId ? <Link to={`/stakeholders/${m.stakeholderId}`}>{m.name}</Link> : m.name}</span>
                  {m.memberId ? <span className="ix-chip" data-match="yes"><Check size={11} aria-hidden />Team member{member && member.name !== m.name ? ` · ${member.name}` : ''}</span>
                    : m.stakeholderId ? <span className="ix-chip" data-match="yes"><Check size={11} aria-hidden />{m.participant ? 'Participant' : 'Stakeholder'}</span>
                    : <span className="ix-chip" data-match="no"><TriangleAlert size={11} aria-hidden />Not matched</span>}
                </li>
              )
            })}
          </ul>
          {analysis.mentions.some(m => !m.memberId && !m.stakeholderId) && <p className="t-small c3 ix-none">Unmatched names aren’t linked to any record. Add them as stakeholders if they matter.</p>}
        </section>
      )}
    </>
  )
}

/* ── Transcript upload ───────────────────────────────────────────────────── */

function TranscriptUpload({ d, pendingCount, canAnalyse, onSavedAndAnalyse }: { d: EngagementDetail; pendingCount: number; canAnalyse: boolean; onSavedAndAnalyse: () => void }) {
  const { toast } = useApp()
  const invalidate = useInvalidate()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<{ name: string; text: string; converted: boolean } | null>(null)
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const existing = (d.notes ?? '').trim()
  const panelId = 'ix-upload-panel'

  const pick = async (f: File | undefined) => {
    setError(null); setFile(null)
    if (!f) return
    if (!/\.(txt|md|markdown|vtt|srt)$/i.test(f.name)) { setError('Choose a .txt, .md, .vtt or .srt file.'); return }
    if (f.size > FILE_BYTES_LIMIT) { setError(`“${f.name}” is too large (${Math.round(f.size / 1000).toLocaleString()} KB). Notes can hold up to ${NOTES_LIMIT.toLocaleString()} characters.`); return }
    let raw: string
    try { raw = await f.text() } catch { setError(`Couldn’t read “${f.name}”. Nothing was changed.`); return }
    const converted = isCaptionFile(f.name, raw)
    const text = (converted ? captionsToText(raw) : raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')).trim()
    if (!text) { setError(`“${f.name}” has no readable text.`); return }
    if (text.length > NOTES_LIMIT) { setError(`“${f.name}” has ${text.length.toLocaleString()} characters${converted ? ' after removing timestamps' : ''}. Notes are limited to ${NOTES_LIMIT.toLocaleString()} — split the meeting into separate engagements or trim the file.`); return }
    setFile({ name: f.name, text, converted })
    setMode('replace')
  }

  const next = file ? (mode === 'append' && existing ? `${existing}\n\n${file.text}` : file.text) : ''
  const tooLong = next.length > NOTES_LIMIT

  const save = async (andAnalyse: boolean) => {
    if (!file || busy || tooLong) return
    setBusy(true); setError(null)
    try {
      await request(ws(`/engagements/${d.id}`), { method: 'PATCH', body: { notes: next, version: d.version } })
      await invalidate()
      toast(`Notes ${mode === 'append' && existing ? 'extended' : 'replaced'} from ${file.name}`)
      setFile(null)
      if (input.current) input.current.value = ''
      if (andAnalyse) onSavedAndAnalyse()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setError('Someone edited this engagement while you were loading the file. It has been refreshed — choose Save again to use the latest version.'); await invalidate() }
      else setError(errorMessage(e))
    } finally { setBusy(false) }
  }

  return (
    <>
      <input ref={input} type="file" accept=".txt,.md,.markdown,.vtt,.srt,text/plain,text/markdown,text/vtt" className="sr-only" tabIndex={-1} aria-hidden onChange={e => void pick(e.target.files?.[0])} />
      <Button size="sm" icon={<FileUp size={14} />} onClick={() => input.current?.click()} aria-expanded={!!file || !!error} aria-controls={panelId}>Load notes from a text file</Button>
      <AnimatePresence>
        {(file || error) && (
          <motion.div id={panelId} className="ix-upload" role="region" aria-label="Load notes from file"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0, transition: t.fast }} exit={{ opacity: 0, transition: t.exit }}>
            {error && <p className="ix-error t-small" role="alert"><TriangleAlert size={13} aria-hidden />{error}</p>}
            {file && (
              <>
                <p className="t-small"><strong>{file.name}</strong> · {file.text.length.toLocaleString()} characters{file.converted ? ' · timestamps and cue numbers removed, kept as “Speaker: text” lines' : ''}</p>
                <pre className="ix-preview" tabIndex={0} aria-label="Preview of the file’s text">{file.text.slice(0, 1200)}{file.text.length > 1200 ? '\n…' : ''}</pre>
                {existing && (
                  <fieldset className="ix-mode">
                    <legend className="t-small c2">This engagement already has notes ({existing.length.toLocaleString()} characters)</legend>
                    <label><input type="radio" name="ix-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />Replace them</label>
                    <label><input type="radio" name="ix-mode" checked={mode === 'append'} onChange={() => setMode('append')} />Add after them</label>
                  </fieldset>
                )}
                {tooLong && <p className="ix-error t-small" role="alert"><TriangleAlert size={13} aria-hidden />Together that’s {next.length.toLocaleString()} characters, over the {NOTES_LIMIT.toLocaleString()} limit. Replace instead.</p>}
                {canAnalyse && pendingCount > 0 && <p className="t-small c3">Analysing will replace the {pendingCount} proposal{pendingCount === 1 ? '' : 's'} still pending review.</p>}
                <div className="ix-actions">
                  {canAnalyse && next.trim().length >= MIN_ANALYSABLE && <Button size="sm" variant="primary" loading={busy} disabled={busy || tooLong} onClick={() => void save(true)}>Save notes and analyse</Button>}
                  <Button size="sm" loading={busy} disabled={busy || tooLong} onClick={() => void save(false)}>Save notes only</Button>
                  <span className="grow" />
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setFile(null); setError(null); if (input.current) input.current.value = '' }}>Cancel</Button>
                </div>
              </>
            )}
            {!file && error && <div className="ix-actions"><span className="grow" /><Button size="sm" variant="ghost" onClick={() => setError(null)}>Dismiss</Button></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
