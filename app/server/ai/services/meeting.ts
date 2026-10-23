// Meeting intelligence: analyse an engagement's notes/transcript into reviewable proposals.
// The engine's raw output is never trusted directly: every item must quote the source verbatim,
// people are mapped to records the user can see, and anything uncertain is flagged for review.
import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { TenantContext, Tx } from '../../db/client'
import { aiProposal, commitment, engagement, engagementParticipant, meetingAnalysis, membership, stakeholder, user } from '../../db/schema'
import { ApiError } from '../../http'
import { getOr404 } from '../../modules/_shared'
import type { AIEngine } from '../engine'
import type { MeetingExtraction } from '../contracts'
import { findInstructionLikeText, locateQuote, MAX_SOURCE_CHARS } from '../guard'
import { PRONOUN_OBJECT } from '../local/extract'

export const sourceHash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32)

export interface QuoteEvidence { kind: 'quote'; start: number; end: number; text: string }
export interface RecordEvidence { kind: 'record'; type: string; id: string; label: string }

interface Person { id: string; name: string }
const first = (n: string) => n.split(' ')[0].toLowerCase()

function matchPerson(name: string | null | undefined, people: Person[]): Person | null {
  if (!name) return null
  const n = name.trim().toLowerCase()
  const exact = people.find(p => p.name.toLowerCase() === n)
  if (exact) return exact
  const byFirst = people.filter(p => first(p.name) === n || first(p.name) === first(name))
  if (byFirst.length === 1 && n.split(' ').length === 1) return byFirst[0]
  const byLast = people.filter(p => p.name.toLowerCase().endsWith(' ' + n.split(' ').pop()))
  return n.split(' ').length > 1 && byLast.length === 1 ? byLast[0] : null
}

const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3))
export function similarity(a: string, b: string) {
  const A = words(a), B = words(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / Math.min(A.size, B.size)
}

/** Loads what the engine may see for this engagement — all through RLS, so restricted people never appear. */
export async function loadMeetingContext(t: Tx, engagementId: string) {
  const e = await getOr404(t, engagement, engagementId, 'Engagement', isNull(engagement.archivedAt))
  const participants = await t.select({ id: stakeholder.id, name: stakeholder.name, title: stakeholder.title })
    .from(engagementParticipant).innerJoin(stakeholder, eq(stakeholder.id, engagementParticipant.stakeholderId))
    .where(eq(engagementParticipant.engagementId, engagementId))
  const members = await t.select({ id: user.id, name: user.name }).from(membership).innerJoin(user, eq(user.id, membership.userId)).where(isNull(membership.removedAt))
  // Known stakeholders mentioned by name anywhere in the workspace (bounded).
  const known = await t.select({ id: stakeholder.id, name: stakeholder.name }).from(stakeholder).where(isNull(stakeholder.archivedAt)).limit(5000)
  return { e, participants, members, known }
}

export interface AnalysisOutcome {
  analysisId: string
  counts: { decisions: number; commitments: number; actions: number; openQuestions: number; dropped: number }
  usage: Awaited<ReturnType<AIEngine['extractMeeting']>>['usage']
  refused?: boolean
}

export async function analyseMeeting(
  t: Tx, tn: TenantContext, engine: AIEngine, ctx: Awaited<ReturnType<typeof loadMeetingContext>>, raw: { result: MeetingExtraction; usage: AnalysisOutcome['usage']; refused?: boolean }, notes: string,
): Promise<AnalysisOutcome> {
  const { e, participants, members, known } = ctx
  const flags = findInstructionLikeText(notes)
  const inFlag = (q: { start: number; end: number }) => flags.some(f => q.start < f.end && q.end > f.start)
  let dropped = 0
  const verify = (quote: string) => {
    const q = locateQuote(notes, quote)
    if (!q || inFlag(q)) { dropped++; return null }
    return { kind: 'quote' as const, ...q }
  }
  const memberPeople: Person[] = members
  const externalPeople: Person[] = [...participants, ...known.filter(k => !participants.some(p => p.id === k.id))]

  const [analysis] = await t.insert(meetingAnalysis).values({
    workspaceId: tn.workspaceId, engagementId: e.id as string, sourceHash: sourceHash(notes), engine: engine.kind, model: raw.usage.model,
    summary: raw.result.summary || null, topics: raw.result.topics.slice(0, 8),
    openQuestions: raw.result.open_questions.map(q => ({ text: q.text, evidence: verify(q.quote) })).filter(q => q.evidence),
    mentions: [...new Set(raw.result.people_mentioned)].map(n => {
      const m = matchPerson(n, memberPeople), s = m ? null : matchPerson(n, externalPeople)
      return { name: n, memberId: m?.id ?? null, stakeholderId: s?.id ?? null, participant: !!s && participants.some(p => p.id === s.id) }
    }),
    flags, createdBy: tn.userId,
  }).returning({ id: meetingAnalysis.id })

  // Superseded pending proposals from earlier analyses of this engagement are removed (decided ones are history).
  await t.delete(aiProposal).where(and(eq(aiProposal.status, 'pending'), sql`${aiProposal.analysisId} in (select id from meeting_analysis where engagement_id = ${e.id} and id <> ${analysis.id})`))

  const existing = await t.select({ id: commitment.id, key: commitment.key, title: commitment.title, stakeholderId: commitment.stakeholderId })
    .from(commitment).where(and(isNull(commitment.archivedAt), inArray(commitment.status, ['open', 'in_progress']),
      participants.length ? sql`(${commitment.sourceEngagementId} = ${e.id} or ${commitment.stakeholderId} in (${sql.join(participants.map(p => sql`${p.id}`), sql`, `)}))` : eq(commitment.sourceEngagementId, e.id as string)))

  const rows: (typeof aiProposal.$inferInsert)[] = []
  const base = { workspaceId: tn.workspaceId, analysisId: analysis.id, source: 'meeting' as const }

  for (const c of raw.result.commitments) {
    const ev = verify(c.quote); if (!ev) continue
    const review: string[] = []
    const ownerMember = c.owner_side !== 'theirs' ? matchPerson(c.owner_name, memberPeople) : null
    const ownerExternal = c.owner_side === 'theirs' ? matchPerson(c.owner_name, externalPeople) : null
    const direction = c.owner_side === 'theirs' ? 'theirs' : 'ours'
    if (direction === 'ours' && !ownerMember) review.push('owner_missing')
    if (direction === 'theirs' && !ownerExternal) review.push('stakeholder_unmatched')
    if (c.due_text && !c.due_date) review.push('due_date_ambiguous')
    if (c.due_date && c.due_text && !/\d/.test(c.due_text)) review.push('due_date_derived')
    if (c.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(c.due_date)) { review.push('due_date_ambiguous'); c.due_date = null }
    if (PRONOUN_OBJECT.test(c.text) || c.text.split(' ').length < 3) review.push('vague_wording')
    if (c.basis === 'inferred') review.push('inferred')
    const counterparty = ownerExternal ?? matchPerson(c.counterparty_name, externalPeople) ?? (participants.length === 1 ? participants[0] : null)
    const dup = existing.find(x => similarity(x.title, c.text) >= 0.6)
    const evidence: (QuoteEvidence | RecordEvidence)[] = [ev]
    if (dup) { review.push('possible_duplicate'); evidence.push({ kind: 'record', type: 'commitment', id: dup.id, label: `${dup.key} ${dup.title}` }) }
    rows.push({
      ...base, kind: 'commitment', title: c.text, basis: c.basis, needsReview: [...new Set(review)], requiredPermission: 'commitment.create', evidence,
      reasoning: `${direction === 'ours' ? 'Our team' : 'The stakeholder'} stated this${c.due_text ? ` with the deadline “${c.due_text}”` : ''}.`,
      values: {
        title: c.text, direction, ownerId: ownerMember?.id ?? null, stakeholderId: counterparty?.id ?? null, dueDate: c.due_date ?? null,
        dueText: c.due_text, initiativeId: e.initiativeId ?? null, sourceEngagementId: e.id, ownerName: c.owner_name,
      },
    })
  }
  for (const a of raw.result.actions) {
    const ev = verify(a.quote); if (!ev) continue
    const owner = matchPerson(a.owner_name, memberPeople)
    rows.push({
      ...base, kind: 'action', title: a.text, basis: a.basis, evidence: [ev], requiredPermission: 'commitment.create',
      needsReview: [...(owner ? [] : ['owner_missing']), ...(a.basis === 'inferred' ? ['inferred'] : [])],
      reasoning: 'A follow-up action mentioned in the notes. Accepting records it as a commitment owned by your team.',
      values: { title: a.text, direction: 'ours', ownerId: owner?.id ?? null, stakeholderId: participants[0]?.id ?? null, dueDate: null, initiativeId: e.initiativeId ?? null, sourceEngagementId: e.id, ownerName: a.owner_name },
    })
  }
  for (const d of raw.result.decisions) {
    const ev = verify(d.quote); if (!ev) continue
    const people = d.people.map(n => matchPerson(n, externalPeople)).filter((p): p is Person => !!p)
    rows.push({
      ...base, kind: 'decision', title: d.text, basis: d.basis, evidence: [ev], requiredPermission: 'decision.create',
      needsReview: d.basis === 'inferred' ? ['inferred'] : [],
      reasoning: d.basis === 'explicit' ? 'The notes state this was agreed or decided.' : 'Implied by the discussion; confirm before recording.',
      values: { title: d.text, status: d.basis === 'explicit' ? 'approved' : 'proposed', initiativeId: e.initiativeId ?? null, sourceEngagementId: e.id, stakeholderIds: [...new Set(people.map(p => p.id))] },
    })
  }
  // Duplicates within this extraction: keep the first, flag the rest so the reviewer can merge.
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
    if (rows[i].kind === rows[j].kind && similarity(rows[i].title, rows[j].title) >= 0.7) rows[i].needsReview = [...new Set([...(rows[i].needsReview ?? []), 'possible_duplicate'])]
  }
  if (rows.length) await t.insert(aiProposal).values(rows)
  return {
    analysisId: analysis.id, usage: raw.usage, refused: raw.refused,
    counts: { decisions: rows.filter(r => r.kind === 'decision').length, commitments: rows.filter(r => r.kind === 'commitment').length, actions: rows.filter(r => r.kind === 'action').length, openQuestions: raw.result.open_questions.length, dropped },
  }
}

export function assertAnalysable(notes: string | null | undefined) {
  const text = (notes ?? '').trim()
  if (text.length < 40) throw new ApiError(422, 'invalid', 'Add meeting notes or a transcript first (at least a few sentences).', { fields: { notes: 'Too short to analyse' } })
  if (text.length > MAX_SOURCE_CHARS) throw new ApiError(422, 'invalid', `The content is too long to analyse (${text.length.toLocaleString()} characters; limit ${MAX_SOURCE_CHARS.toLocaleString()}). Split it into separate engagements.`)
  return text
}

export async function latestAnalysis(t: Tx, engagementId: string) {
  const [a] = await t.select().from(meetingAnalysis).where(eq(meetingAnalysis.engagementId, engagementId)).orderBy(desc(meetingAnalysis.createdAt)).limit(1)
  if (!a) return null
  const proposals = await t.select().from(aiProposal).where(eq(aiProposal.analysisId, a.id)).orderBy(aiProposal.createdAt)
  return { ...a, proposals }
}
