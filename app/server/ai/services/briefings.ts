// Evidence-backed briefings. Structure:
//   facts            – recorded data, stated plainly (deterministic)
//   metrics          – computed indicators with their method (deterministic)
//   interpretation   – AI-generated, every sentence cited; empty for the local engine
//   recommendations  – rule-based always; AI may add cited ones
// Every item cites refs into `sources`, which link back to the underlying records.
import { createHash } from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { Tx } from '../../db/client'
import { activityEvent, commitment, decision, decisionStakeholder, engagement, engagementParticipant, initiative, stakeholder, user } from '../../db/schema'
import { getOr404 } from '../../modules/_shared'
import { overview } from '../../modules/stakeholders'
import { STANCE_LABEL } from '../../modules/_shared'
import type { AIEngine, Evidence } from '../engine'
import { validateCites } from '../guard'

export type ItemKind = 'fact' | 'metric' | 'interpretation' | 'recommendation'
export interface Item { text: string; kind: ItemKind; cites: string[]; action?: string; method?: string; /** Recommendations only: produced by a deterministic rule or by the model. */ origin?: 'rule' | 'ai' }
export interface Section { id: string; title: string; items: Item[] }
export interface Source { ref: string; type: string; id: string; label: string; at?: string | null }
export type Lookup = (key: string) => Promise<Briefing | null>
export interface AIPart { interpretation: Item[]; recommendations: Item[]; dropped: number; error?: string }
/** Evidence gathered inside a DB transaction; interpretation happens afterwards, outside it. */
export interface Pending { key: string; refs: Refs; purpose: string; guidance: string; assemble: (ai: AIPart) => Briefing }

/** Phase 2: cache lookup, then (Claude only) a model call over the evidence — never inside a transaction. */
export async function completeBriefing(engine: AIEngine, p: Pending, signal?: AbortSignal, lookup?: Lookup) {
  const hit = engine.kind === 'claude' ? await lookup?.(p.key) : null
  if (hit) return { briefing: hit, usage: null, key: p.key, cached: true }
  const ai = await interpret(engine, p.refs, p.purpose, p.guidance, signal)
  return { briefing: p.assemble(ai), usage: ai.usage, key: p.key, cached: false }
}
export interface Briefing {
  subject: { type: string; id: string; name: string }
  mode: 'brief' | 'detailed' | 'prep'
  engine: { kind: 'claude' | 'local'; label: string }
  generatedAt: string
  sections: Section[]
  sources: Source[]
  unsupportedDropped: number
  aiError?: string
}

const DAY = 86_400_000
const LEVEL = ['', 'low', 'medium', 'high', 'very high']
const fmt = (d: string | Date | null | undefined) => (d ? new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const ago = (d: Date | string) => { const n = Math.round((Date.now() - new Date(d).getTime()) / DAY); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago` }
const daysUntil = (iso: string) => Math.round((Date.parse(iso + 'T23:59:59Z') - Date.now()) / DAY)

export class Refs {
  list: Source[] = []
  ev: Evidence[] = []
  add(type: string, id: string, label: string, text: string, at?: string | null) {
    const existing = this.list.find(s => s.type === type && s.id === id)
    if (existing) return existing.ref
    const ref = `r${this.list.length + 1}`
    this.list.push({ ref, type, id, label, at: at ?? null })
    this.ev.push({ ref, kind: type, id, label, text, at })
    return ref
  }
}

/** Runs the engine's synthesis over the evidence and keeps only validly-cited output. */
async function interpret(engine: AIEngine, refs: Refs, purpose: string, guidance: string, signal?: AbortSignal) {
  if (engine.kind === 'local' || !refs.ev.length) return { interpretation: [] as Item[], recommendations: [] as Item[], dropped: 0, usage: null, error: undefined as string | undefined }
  try {
    const { result, usage } = await engine.synthesize({ purpose, guidance, evidence: refs.ev }, signal)
    const allowed = new Set(refs.list.map(s => s.ref))
    let dropped = 0
    const keep = <T extends { cites: string[] }>(x: T) => { const v = validateCites(x.cites, allowed); if (!v.valid.length) { dropped++; return null } return { ...x, cites: v.valid } }
    return {
      interpretation: result.interpretation.slice(0, 4).map(keep).filter(Boolean).map(x => ({ text: x!.text, kind: 'interpretation' as const, cites: x!.cites })),
      recommendations: result.recommendations.slice(0, 4).map(keep).filter(Boolean).map(x => ({ text: x!.text, kind: 'recommendation' as const, origin: 'ai' as const, cites: x!.cites, action: x!.action === 'none' ? undefined : x!.action })),
      dropped, usage, error: undefined,
    }
  } catch (e) {
    return { interpretation: [], recommendations: [], dropped: 0, usage: null, error: (e as Error).name === 'AbortError' ? 'cancelled' : 'The AI interpretation is unavailable right now; showing recorded facts and rule-based recommendations.' }
  }
}

export function evidenceKey(mode: string, engine: AIEngine, refs: Refs) {
  return createHash('sha256').update(JSON.stringify([mode, engine.kind, engine.model, refs.ev.map(e => [e.ref, e.text, e.at])])).digest('hex').slice(0, 40)
}

// ── Stakeholder ───────────────────────────────────────────────────────────────
export async function stakeholderBriefing(t: Tx, engine: AIEngine, id: string, mode: Briefing['mode']): Promise<Pending> {
  const ov = await overview(t, id)
  const s = ov.stakeholder as typeof ov.stakeholder & { id: string; name: string; title: string | null; stance: string; influence: number | null; interest: number | null }
  const refs = new Refs()
  const self = refs.add('stakeholder', s.id, s.name, `${s.name}; title ${s.title ?? 'not recorded'}; stance ${s.stance}; influence ${s.influence ?? 'not assessed'}; interest ${s.interest ?? 'not assessed'}; owner ${s.owner?.name ?? 'none'}`)
  const now = Date.now()
  const org = s.organizations.find(o => !o.validTo && o.isPrimary) ?? s.organizations.find(o => !o.validTo)
  const sections: Section[] = []

  // Context
  const ctx: Item[] = [{ kind: 'fact', cites: [self], text: `${s.name}${s.title ? `, ${s.title}` : ''}${org ? ` at ${org.name}` : ''}. Recorded as ${STANCE_LABEL[s.stance].toLowerCase()}${s.influence ? `, ${LEVEL[s.influence]} influence` : ''}${s.interest ? `, ${LEVEL[s.interest]} interest` : ''}.` }]
  for (const o of s.organizations.filter(o => o !== org).slice(0, 3)) {
    const r = refs.add('organization', o.organizationId, o.name, `${o.role ?? 'member'} ${o.validTo ? `until ${o.validTo}` : 'current'}`)
    ctx.push({ kind: 'fact', cites: [r], text: `${o.validTo ? 'Formerly' : 'Also'} ${o.role ? `${o.role} at ` : 'associated with '}${o.name}${o.validTo ? ` (until ${fmt(o.validTo)})` : ''}.` })
  }
  if (s.initiatives.length) {
    const rs = s.initiatives.map(i => refs.add('initiative', i.id, `${i.code} ${i.name}`, `${s.name} role: ${i.role ?? 'stakeholder'}`))
    ctx.push({ kind: 'fact', cites: rs, text: `Involved in ${s.initiatives.map(i => `${i.code}${i.role ? ` (${i.role})` : ''}`).join(', ')}.` })
  }
  ctx.push({ kind: 'fact', cites: [self], text: s.owner ? `Relationship owner: ${s.owner.name}.` : 'No relationship owner is assigned.' })
  sections.push({ id: 'context', title: 'Context', items: ctx })

  // Engagement
  const eng: Item[] = []
  const recent = ov.engagements.filter(e => now - Date.parse(e.occurredAt as unknown as string) <= 60 * DAY)
  const prior = ov.engagements.filter(e => { const d = now - Date.parse(e.occurredAt as unknown as string); return d > 60 * DAY && d <= 120 * DAY })
  const engRefs = ov.engagements.slice(0, mode === 'brief' ? 2 : 6).map(e => refs.add('engagement', e.id, `${e.key} ${e.title}`, e.summary ?? e.title, new Date(e.occurredAt as unknown as string).toISOString()))
  if (ov.engagements[0]) {
    const e = ov.engagements[0]
    eng.push({ kind: 'fact', cites: [engRefs[0]], text: `Last engaged ${ago(e.occurredAt as unknown as string)} (${e.kind.replace('_', ' ')}: ${e.title})${e.summary ? `. ${e.summary.replace(/\.$/, '')}` : ''}.` })
  } else eng.push({ kind: 'fact', cites: [self], text: 'No engagement has been recorded.' })
  eng.push({ kind: 'metric', cites: engRefs.slice(0, 3).length ? engRefs.slice(0, 3) : [self], method: 'Count of recorded engagements with this person in the last 60 days vs the 60 days before.', text: `${recent.length} engagement${recent.length === 1 ? '' : 's'} in the last 60 days; ${prior.length} in the 60 days before.` })
  if (mode !== 'brief') for (const [i, e] of ov.engagements.slice(1, 5).entries()) eng.push({ kind: 'fact', cites: [engRefs[i + 1]], text: `${fmt(e.occurredAt as unknown as string)} — ${e.title}${e.summary ? `: ${e.summary.replace(/\.$/, '')}` : ''}.` })
  sections.push({ id: 'engagement', title: 'Recent engagement', items: eng })

  // Concerns: recorded stance rationale and engagements whose summaries record concerns (keyword match, cited).
  const concerns: Item[] = []
  const stanceHist = await t.select({ id: activityEvent.id, summary: activityEvent.summary, at: activityEvent.createdAt }).from(activityEvent)
    .where(and(eq(activityEvent.entityType, 'stakeholder'), eq(activityEvent.entityId, id), eq(activityEvent.verb, 'stance_changed'))).orderBy(desc(activityEvent.createdAt)).limit(2)
  for (const h of stanceHist) {
    const r = refs.add('activity', String(h.id), h.summary, h.summary, h.at.toISOString())
    concerns.push({ kind: 'fact', cites: [r], text: `${h.summary} (${fmt(h.at)}).` })
  }
  for (const e of ov.engagements.filter(e => /\b(concern|raised|objection|issue|worried|complain|dispute)/i.test(e.summary ?? '')).slice(0, 3)) {
    const r = refs.add('engagement', e.id, `${e.key} ${e.title}`, e.summary ?? '', new Date(e.occurredAt as unknown as string).toISOString())
    concerns.push({ kind: 'fact', cites: [r], text: `Recorded on ${fmt(e.occurredAt as unknown as string)}: ${e.summary!.replace(/\.$/, '')}.` })
  }
  if (concerns.length) sections.push({ id: 'concerns', title: 'Recorded concerns and stance changes', items: concerns })

  // Commitments & decisions
  const open = ov.commitments.filter(c => c.status === 'open' || c.status === 'in_progress')
  const overdue = open.filter(c => c.dueDate && daysUntil(c.dueDate) < 0)
  const cm: Item[] = open.slice(0, mode === 'brief' ? 3 : 8).map(c => ({
    kind: 'fact', cites: [refs.add('commitment', c.id, `${c.key} ${c.title}`, `${c.title}; status ${c.status}; due ${c.dueDate ?? 'none'}; ${c.direction === 'theirs' ? 'they owe us' : `we owe them (owner ${c.ownerName ?? 'unassigned'})`}`, c.dueDate)],
    text: `${c.key} ${c.title} — ${c.direction === 'theirs' ? 'they owe us' : 'we owe them'}, ${c.dueDate ? (daysUntil(c.dueDate) < 0 ? `${-daysUntil(c.dueDate)} days overdue` : `due ${fmt(c.dueDate)}`) : 'no due date'}.`,
  }))
  if (!open.length) cm.push({ kind: 'fact', cites: [self], text: 'No open commitments with this person.' })
  const pendingDecs = ov.decisions.filter(d => d.status === 'proposed' || d.status === 'under_review')
  for (const d of pendingDecs.slice(0, 4)) cm.push({ kind: 'fact', cites: [refs.add('decision', d.id, `${d.key} ${d.title}`, `${d.title}; status ${d.status}; their role ${d.role}; due ${d.dueDate ?? 'none'}`, d.dueDate)], text: `${d.role === 'approver' ? 'Approver' : d.role[0].toUpperCase() + d.role.slice(1)} on ${d.key} “${d.title}” (${d.status.replace('_', ' ')}${d.dueDate ? `, needed by ${fmt(d.dueDate)}` : ''}).` })
  sections.push({ id: 'obligations', title: 'Commitments and pending decisions', items: cm })

  // Relationships
  if (ov.relationships.length && mode !== 'brief') {
    const rel = (ov.relationships as { id: string; type: string; strength: number | null; status: string; direction: string; other: { name: string } }[])
      .slice().sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)).slice(0, 5)
    sections.push({ id: 'relationships', title: 'Relevant relationships', items: rel.map(r => ({
      kind: 'fact' as const, cites: [refs.add('relationship', r.id, `Relationship with ${r.other.name}`, `${r.type} ${r.direction} ${r.other.name}; ${r.status}`)],
      text: `${r.type.replace('_', ' ')} ${r.direction === 'out' ? '→' : '←'} ${r.other.name}${r.status === 'inferred' ? ' (inferred, unconfirmed)' : ''}.`,
    })) })
  }

  // Rule-based recommendations (deterministic, always present)
  const recs: Item[] = []
  for (const c of overdue.slice(0, 2)) recs.push({ kind: 'recommendation', origin: 'rule', action: 'follow_up_commitment', cites: [refs.add('commitment', c.id, `${c.key} ${c.title}`, '', c.dueDate)], text: c.direction === 'theirs' ? `Ask for an update on ${c.key} “${c.title}”, ${-daysUntil(c.dueDate!)} days overdue.` : `Resolve or re-date ${c.key} “${c.title}” before you next meet — it is ${-daysUntil(c.dueDate!)} days overdue.` })
  for (const d of pendingDecs.filter(d => d.role === 'approver').slice(0, 2)) recs.push({ kind: 'recommendation', origin: 'rule', action: 'review_decision', cites: [refs.add('decision', d.id, `${d.key} ${d.title}`, '')], text: `Confirm what ${s.name.split(' ')[0]} needs to approve ${d.key}.` })
  const last = ov.engagements[0]
  if ((s.influence ?? 0) >= 3 && (!last || now - Date.parse(last.occurredAt as unknown as string) > 60 * DAY)) recs.push({ kind: 'recommendation', origin: 'rule', action: 'log_engagement', cites: [self], text: `Schedule contact: ${last ? `no engagement for ${Math.round((now - Date.parse(last.occurredAt as unknown as string)) / DAY)} days` : 'never engaged'} with a ${LEVEL[s.influence ?? 0]}-influence stakeholder.` })
  if (!s.owner && (s.influence ?? 0) >= 3) recs.push({ kind: 'recommendation', origin: 'rule', action: 'assign_owner', cites: [self], text: 'Assign a relationship owner.' })

  // Meeting prep view
  if (mode === 'prep') {
    const prep: Item[] = []
    for (const c of open.filter(c => c.direction === 'ours').slice(0, 4)) prep.push({ kind: 'fact', cites: [refs.add('commitment', c.id, `${c.key} ${c.title}`, '')], text: `Bring an update on ${c.key}: ${c.title}.` })
    for (const c of open.filter(c => c.direction === 'theirs').slice(0, 3)) prep.push({ kind: 'fact', cites: [refs.add('commitment', c.id, `${c.key} ${c.title}`, '')], text: `Ask about ${c.key}: ${c.title}.` })
    for (const d of pendingDecs.slice(0, 3)) prep.push({ kind: 'fact', cites: [refs.add('decision', d.id, `${d.key} ${d.title}`, '')], text: `Raise ${d.key} (${d.status.replace('_', ' ')}).` })
    if (last) prep.push({ kind: 'fact', cites: [refs.add('engagement', last.id, `${last.key} ${last.title}`, last.summary ?? '')], text: `Pick up from ${fmt(last.occurredAt as unknown as string)}: ${last.summary ?? last.title}` })
    if (!prep.length) prep.push({ kind: 'fact', cites: [self], text: 'Nothing outstanding is recorded with this person.' })
    sections.unshift({ id: 'prep', title: 'Talking points', items: prep })
  }

  return {
    key: evidenceKey(mode, engine, refs), refs,
    purpose: `Write a ${mode === 'prep' ? 'meeting-preparation' : mode === 'brief' ? 'two-sentence' : 'concise'} interpretation for someone about to engage ${s.name}, and up to 3 next steps.`,
    guidance: 'Focus on what matters for the relationship and the work: slipping commitments, pending decisions, gaps in contact, recorded concerns. Do not speculate about feelings or motives.',
    assemble: (ai: AIPart): Briefing => {
      const secs = sections.map(x => ({ ...x, items: [...x.items] }))
      if (ai.interpretation.length) secs.unshift({ id: 'summary', title: 'Summary', items: ai.interpretation })
      secs.push({ id: 'next', title: 'Suggested next steps', items: [...recs, ...ai.recommendations].slice(0, mode === 'brief' ? 3 : 6) })
      if (mode === 'brief') for (const sec of secs) sec.items = sec.items.slice(0, sec.id === 'next' ? 3 : 2)
      return { subject: { type: 'stakeholder', id: s.id, name: s.name }, mode, engine: { kind: engine.kind, label: engine.label }, generatedAt: new Date().toISOString(), sections: secs, sources: refs.list, unsupportedDropped: ai.dropped, aiError: ai.error }
    },
  } satisfies Pending
}

// ── Decision ──────────────────────────────────────────────────────────────────
export async function decisionBriefing(t: Tx, engine: AIEngine, id: string): Promise<Pending> {
  const d = await getOr404(t, decision, id, 'Decision')
  const refs = new Refs()
  const self = refs.add('decision', id, `${d.key} ${d.title}`, `${d.title}; status ${d.status}; due ${d.dueDate ?? 'none'}; outcome ${d.outcome ?? 'none'}; description ${d.description ?? ''}; context ${d.context ?? ''}`, (d.dueDate as string) ?? null)
  const people = await t.select({ id: stakeholder.id, name: stakeholder.name, stance: stakeholder.stance, role: decisionStakeholder.role })
    .from(decisionStakeholder).innerJoin(stakeholder, eq(stakeholder.id, decisionStakeholder.stakeholderId)).where(eq(decisionStakeholder.decisionId, id))
  const owner = d.ownerId ? (await t.select({ name: user.name }).from(user).where(eq(user.id, d.ownerId as string)))[0] : null
  const init = d.initiativeId ? (await t.select({ id: initiative.id, code: initiative.code, name: initiative.name }).from(initiative).where(eq(initiative.id, d.initiativeId as string)))[0] : null
  const created = d.createdAt as Date
  const engs = people.length ? await t.selectDistinct({ id: engagement.id, key: engagement.key, title: engagement.title, summary: engagement.summary, occurredAt: engagement.occurredAt })
    .from(engagementParticipant).innerJoin(engagement, eq(engagement.id, engagementParticipant.engagementId))
    .where(and(inArray(engagementParticipant.stakeholderId, people.map(p => p.id)), isNull(engagement.archivedAt), gt(engagement.occurredAt, new Date(created.getTime() - 30 * DAY))))
    .orderBy(desc(engagement.occurredAt)).limit(6) : []
  const comms = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, dueDate: commitment.dueDate, status: commitment.status }).from(commitment)
    .where(and(isNull(commitment.archivedAt), inArray(commitment.status, ['open', 'in_progress']), sql`(${commitment.sourceEngagementId} = ${d.sourceEngagementId ?? null} ${people.length ? sql`or ${commitment.stakeholderId} in (${sql.join(people.map(p => sql`${p.id}`), sql`, `)})` : sql``} ${d.initiativeId ? sql`or ${commitment.initiativeId} = ${d.initiativeId}` : sql``})`))
    .orderBy(commitment.dueDate).limit(6)

  const status: Item[] = [{ kind: 'fact', cites: [self], text: `${d.key} is ${String(d.status).replace('_', ' ')}${d.dueDate ? `, needed by ${fmt(d.dueDate as string)}${daysUntil(d.dueDate as string) < 0 && ['proposed', 'under_review'].includes(d.status as string) ? ` (${-daysUntil(d.dueDate as string)} days late)` : ''}` : ', with no decision date'}. Owner: ${owner?.name ?? 'none'}.${init ? ` Initiative: ${init.code}.` : ''}` }]
  if (d.description || d.context) status.push({ kind: 'fact', cites: [self], text: [d.description, d.context].filter(Boolean).join(' ') as string })
  if (d.outcome) status.push({ kind: 'fact', cites: [self], text: `Outcome: ${d.outcome}` })
  const who: Item[] = people.map(p => ({ kind: 'fact', cites: [refs.add('stakeholder', p.id, p.name, `${p.name}; ${p.role}; stance ${p.stance}`)], text: `${p.name} — ${p.role}, recorded as ${STANCE_LABEL[p.stance].toLowerCase()}.` }))
  const ev: Item[] = engs.map(e => ({ kind: 'fact', cites: [refs.add('engagement', e.id, `${e.key} ${e.title}`, e.summary ?? e.title, e.occurredAt.toISOString())], text: `${fmt(e.occurredAt)} — ${e.title}${e.summary ? `: ${e.summary.replace(/\.$/, '')}` : ''}.` }))
  const rel: Item[] = comms.map(c => ({ kind: 'fact', cites: [refs.add('commitment', c.id, `${c.key} ${c.title}`, `${c.title}; due ${c.dueDate ?? 'none'}`, c.dueDate)], text: `${c.key} ${c.title}${c.dueDate ? ` — due ${fmt(c.dueDate)}` : ''}.` }))

  // Deterministic gap checks ("outstanding information").
  const gaps: Item[] = []
  const approvers = people.filter(p => p.role === 'approver')
  if (!approvers.length) gaps.push({ kind: 'metric', cites: [self], method: 'No stakeholder has the approver role on this decision.', text: 'No approvers are recorded.' })
  if (!d.ownerId) gaps.push({ kind: 'metric', cites: [self], method: 'Decision owner field is empty.', text: 'No decision owner.' })
  if (!d.dueDate && ['proposed', 'under_review'].includes(d.status as string)) gaps.push({ kind: 'metric', cites: [self], method: 'Decision date is empty.', text: 'No date by which the decision is needed.' })
  if (!d.description && !d.context) gaps.push({ kind: 'metric', cites: [self], method: 'Description and context are empty.', text: 'No background or options are recorded.' })
  for (const a of approvers) if (!engs.some(() => true)) { gaps.push({ kind: 'metric', cites: [refs.add('stakeholder', a.id, a.name, '')], method: 'No engagement with this approver since 30 days before the decision was opened.', text: `No recorded engagement with approver ${a.name} since the decision was opened.` }); break }
  if (['approved', 'rejected'].includes(d.status as string) && !d.outcome) gaps.push({ kind: 'metric', cites: [self], method: 'Decided without an outcome note.', text: 'Decided, but no outcome is recorded.' })

  const recs: Item[] = []
  if (['proposed', 'under_review'].includes(d.status as string)) {
    for (const a of approvers.filter(a => ['concerned', 'opposed'].includes(a.stance)).slice(0, 2)) recs.push({ kind: 'recommendation', origin: 'rule', action: 'log_engagement', cites: [refs.add('stakeholder', a.id, a.name, '')], text: `Engage ${a.name} (recorded as ${STANCE_LABEL[a.stance].toLowerCase()}) before the decision.` })
    if (d.dueDate && daysUntil(d.dueDate as string) < 7) recs.push({ kind: 'recommendation', origin: 'rule', action: 'review_decision', cites: [self], text: daysUntil(d.dueDate as string) < 0 ? 'Agree a new decision date or escalate — the date has passed.' : 'Confirm the decision can be made by its date.' })
    if (!approvers.length) recs.push({ kind: 'recommendation', origin: 'rule', action: 'review_decision', cites: [self], text: 'Record who must approve this decision.' })
  }
  return {
    key: evidenceKey('decision', engine, refs), refs,
    purpose: 'Explain where this decision stands and what is needed to resolve it, then up to 3 next steps.',
    guidance: 'Base everything on the evidence. Do not invent dependencies between records.',
    assemble: (ai: AIPart): Briefing => ({
      subject: { type: 'decision', id, name: `${d.key} ${d.title}` }, mode: 'detailed', engine: { kind: engine.kind, label: engine.label }, generatedAt: new Date().toISOString(),
      sections: [
        ...(ai.interpretation.length ? [{ id: 'summary', title: 'Summary', items: ai.interpretation }] : []),
        { id: 'status', title: 'Current status', items: status },
        { id: 'stakeholders', title: 'Stakeholders involved', items: who.length ? who : [{ kind: 'fact', cites: [self], text: 'No stakeholders are linked.' }] },
        { id: 'evidence', title: 'Supporting engagements', items: ev.length ? ev : [{ kind: 'fact', cites: [self], text: 'No engagements with the involved stakeholders around this decision.' }] },
        ...(gaps.length ? [{ id: 'gaps', title: 'Outstanding information', items: gaps }] : []),
        ...(rel.length ? [{ id: 'commitments', title: 'Related commitments', items: rel }] : []),
        { id: 'next', title: 'Potential next steps', items: [...recs, ...ai.recommendations].slice(0, 5) },
      ],
      sources: refs.list, unsupportedDropped: ai.dropped, aiError: ai.error,
    }),
  } satisfies Pending
}

// ── Workspace (Home) ──────────────────────────────────────────────────────────
export interface SignalLite { id: string; kind: string; title: string; reason: string; commitmentId?: string; decisionId?: string; stakeholder?: { id: string; name: string } | null; severity: number }
export function workspaceBriefing(engine: AIEngine, signals: SignalLite[], counts: { overdue: number; decisions: number; cooling: number; engagements7: number }): Pending {
  const refs = new Refs()
  const top = signals.slice(0, 12)
  for (const s of top) {
    const type = s.commitmentId ? 'commitment' : s.decisionId ? 'decision' : 'stakeholder'
    const id = s.commitmentId ?? s.decisionId ?? s.stakeholder?.id ?? s.id
    refs.add(type, id, s.title, `${s.kind}: ${s.title} — ${s.reason}`)
  }
  const sigRef = (s: SignalLite) => refs.list.find(r => r.id === (s.commitmentId ?? s.decisionId ?? s.stakeholder?.id ?? s.id))!.ref
  const facts: Item[] = []
  const of = (k: string) => top.filter(s => s.kind === k)
  if (counts.overdue) facts.push({ kind: 'metric', method: 'Open commitments past their due date (workspace-wide).', cites: of('overdue').slice(0, 3).map(sigRef), text: `${counts.overdue} commitment${counts.overdue === 1 ? ' is' : 's are'} overdue${of('overdue')[0] ? `; the oldest is ${of('overdue')[0].title}` : ''}.` })
  if (counts.decisions) facts.push({ kind: 'metric', method: 'Decisions still proposed or under review near or past their date, or open 14+ days.', cites: of('decision-waiting').slice(0, 3).map(sigRef), text: `${counts.decisions} decision${counts.decisions === 1 ? ' is' : 's are'} waiting.` })
  if (counts.cooling) facts.push({ kind: 'metric', method: 'High-influence stakeholders whose engagement in the last 60 days fell below the configured share of the previous 60.', cites: of('cooling').slice(0, 3).map(sigRef), text: `${counts.cooling} key relationship${counts.cooling === 1 ? ' is' : 's are'} cooling.` })
  facts.push({ kind: 'metric', method: 'Engagements logged in the last 7 days.', cites: [], text: `${counts.engagements7} engagement${counts.engagements7 === 1 ? '' : 's'} logged in the last 7 days.` })
  return {
    key: evidenceKey('workspace', engine, refs), refs,
    purpose: 'Write a 2–3 sentence briefing for a stakeholder team lead starting their day, and up to 3 priorities.',
    guidance: 'Prioritise by consequence: overdue promises to high-influence stakeholders and late decisions first.',
    assemble: (ai: AIPart): Briefing => ({
      subject: { type: 'workspace', id: 'workspace', name: 'Workspace' }, mode: 'brief', engine: { kind: engine.kind, label: engine.label }, generatedAt: new Date().toISOString(),
      sections: [...(ai.interpretation.length ? [{ id: 'summary', title: 'Summary', items: ai.interpretation }] : []), { id: 'facts', title: 'Today', items: facts }, ...(ai.recommendations.length ? [{ id: 'next', title: 'Priorities', items: ai.recommendations }] : [])],
      sources: refs.list, unsupportedDropped: ai.dropped, aiError: ai.error,
    }),
  } satisfies Pending
}
