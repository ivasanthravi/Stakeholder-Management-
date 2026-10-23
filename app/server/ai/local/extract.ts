// Local (no-model) meeting extraction. Deterministic, conservative pattern rules: it proposes only what
// the text states, marks anything implied as "inferred", and never guesses an owner or date it can't read.
import type { MeetingExtraction, MeetingInput } from '../contracts'
import { findInstructionLikeText } from '../guard'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Deadline wording → { text, date|null, ambiguous }. Relative dates resolve against the meeting date. */
export function parseDeadline(clause: string, meetingDate: string): { text: string | null; date: string | null; ambiguous: boolean } {
  const base = new Date(meetingDate + 'T12:00:00Z')
  const c = clause.toLowerCase()
  let m: RegExpMatchArray | null
  if ((m = c.match(new RegExp(`\\b(?:by|on|before|until)?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\b`)))
    || (m = c.match(new RegExp(`\\b(?:by|on|before|until)?\\s*${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)))) {
    const dayFirst = /^\d/.test(m[1])
    const day = Number(dayFirst ? m[1] : m[2]), monName = (dayFirst ? m[2] : m[1]).slice(0, 3)
    const month = MONTHS.findIndex(x => x.startsWith(monName))
    const d = new Date(Date.UTC(base.getUTCFullYear(), month, day, 12))
    if (d < base) d.setUTCFullYear(d.getUTCFullYear() + 1)
    return { text: m[0].trim(), date: iso(d), ambiguous: false }
  }
  if ((m = c.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) return { text: m[0], date: null, ambiguous: true } // dd/mm vs mm/dd
  if ((m = c.match(/\b(?:by|on|before|until|this|next)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))) {
    const target = WEEKDAYS.indexOf(m[1])
    const d = new Date(base)
    let add = (target - d.getUTCDay() + 7) % 7 || 7
    if (/\bnext\b/.test(m[0]) && add < 7) add += 7
    d.setUTCDate(d.getUTCDate() + add)
    return { text: m[0].trim(), date: iso(d), ambiguous: false }
  }
  if ((m = c.match(/\b(?:by\s+)?tomorrow\b/))) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + 1); return { text: m[0], date: iso(d), ambiguous: false } }
  if ((m = c.match(/\b(?:by\s+)?(?:end of (?:the )?(?:day|today))\b|\bby today\b/))) return { text: m[0], date: iso(base), ambiguous: false }
  if ((m = c.match(/\b(next week|end of (?:the )?(?:week|month|quarter|year)|soon|shortly|asap|in due course|in (?:a|the) (?:few|coming) (?:days|weeks)|before the next [a-z ]+?(?=[,.;]|$)|after the [a-z ]+?(?=[,.;]|$)|within \w+ (?:days|weeks))\b/))) {
    return { text: m[0].trim(), date: null, ambiguous: true }
  }
  return { text: null, date: null, ambiguous: false }
}

interface Sentence { text: string; start: number; heading?: string; speaker?: string }

function sentences(notes: string, flagged: { start: number; end: number }[]): Sentence[] {
  const out: Sentence[] = []
  let heading: string | undefined
  let pos = 0
  for (const line of notes.split('\n')) {
    const lineStart = notes.indexOf(line, pos)
    pos = lineStart + line.length
    const trimmed = line.trim()
    if (!trimmed) continue
    // Transcript lines: "Daniel Ross: I'll send …" — the speaker owns first-person promises on that line.
    const speaker = trimmed.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z'-]+){0,2}):\s+\S/)?.[1]
    // Headings: "1. Topic", "## Topic", or a short line without terminal punctuation.
    const h = trimmed.match(/^(?:\d+[.)]\s+|#+\s+)(.{2,80})$/)
    if (h && !/[.!?]$/.test(h[1]) && h[1].split(' ').length <= 8) { heading = h[1].trim(); continue }
    if (!/[.!?:]$/.test(trimmed) && trimmed.split(' ').length <= 6 && !/\b(will|agreed|decided)\b/i.test(trimmed)) { heading = trimmed.replace(/:$/, ''); continue }
    const re = /[^.!?]+(?:[.!?]+|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      const text = m[0].trim()
      if (!text) continue
      const start = lineStart + m.index + (m[0].length - m[0].trimStart().length)
      if (flagged.some(f => start < f.end && start + text.length > f.start)) continue // never extract from instruction-like text
      out.push({ text, start, heading, speaker })
    }
  }
  return out
}

const PROMISE = /\b(we|i|I|they|he|she|[Tt]he\s+[a-z]+(?:\s[a-z]+)?|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:['’]ll\s+|\s+(?:will|shall|(?:has |have )?agreed to|committed to|promised to|undertook to|is going to|are going to)\s+)(?!not\b|be (?:able|happy)\b)([^;]+)/
const ACTION_TO = /^(?:action[:\s-]+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+to\s+([a-z][^;]+)/
const DECISION = /\b(agreed that|decided|decision (?:was|is)|confirmed (?:that )?|approved|resolved to|signed off|endorsed|will not oppose|no longer under consideration|was withdrawn|(?:has|have) been (?:cancelled|postponed|withdrawn|dropped)|(?:was|were) (?:cancelled|postponed))\b/i
const HEDGE = /\b(might|may|could|would consider|possibly|perhaps|if\b|unless|subject to|provisionally)\b/i
const QUESTION = /\?$|\b(asked whether|asked if|unclear whether|to be confirmed|tbc|remains open|still not (?:received|clear|agreed)|no decision)\b/i
const NEEDS = /\b(need(?:s)? to|should|must|follow[- ]up on|to be arranged|to be scheduled)\b/i
/** Explicit refusals or inability ("I can't promise a date") are never obligations. */
const NEGATED = /\b(can['’]?t|cannot|unable to|not able to|won['’]?t|no longer needed)\b/i
export const PRONOUN_OBJECT = /^(?:send|share|circulate|provide|forward|check)\s+(?:it|this|that|them)\b/i

function imperative(what: string) {
  let w = what.replace(/\s+(?:by|on|before|until)\s+.+$/i, '').replace(/\s+(?:next week|tomorrow|soon|shortly)\b.*$/i, '').replace(/[.!?]+$/, '').trim()
  w = w.replace(/^(?:to\s+)/i, '')
  return w ? w[0].toUpperCase() + w.slice(1) : what
}

export function localExtract(input: MeetingInput): MeetingExtraction {
  const flagged = findInstructionLikeText(input.notes)
  const ss = sentences(input.notes, flagged)
  // Full names match anyone known; a bare first name only matches someone at this meeting (participant or member),
  // and never when a full name with that first name was already matched ("Bea Ellwood … Bea" is one person).
  const present = [...input.participants.map(p => p.name), ...input.members.map(m => m.name)]
  const known = [...new Set([...present, ...input.knownPeople.map(p => p.name)])]
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const peopleIn = (t: string) => {
    const full = known.filter(n => new RegExp(`\\b${esc(n)}\\b`).test(t))
    const firsts = present.filter(n => !full.includes(n) && n.split(' ')[0].length > 2 && new RegExp(`\\b${esc(n.split(' ')[0])}\\b`).test(t)
      && !full.some(f => f.split(' ')[0] === n.split(' ')[0]))
    // An ambiguous first name (two people at the meeting share it) is left unmatched.
    const unique = firsts.filter(n => firsts.filter(m => m.split(' ')[0] === n.split(' ')[0]).length === 1)
    return [...new Set([...full, ...unique])]
  }

  const decisions: MeetingExtraction['decisions'] = []
  const commitments: MeetingExtraction['commitments'] = []
  const actions: MeetingExtraction['actions'] = []
  const open_questions: MeetingExtraction['open_questions'] = []

  for (const s of ss) {
    const t = s.text
    if (QUESTION.test(t)) { open_questions.push({ text: t.replace(/^.*?\b(asked whether|asked if)\b\s*/i, m => m ? 'Whether ' : '').replace(/^whether whether/i, 'Whether'), quote: t }); continue }

    // Speaker attribution: "Daniel said we will …" → owner Daniel.
    const body = s.speaker ? t.slice(t.indexOf(':') + 1).trim().replace(/^(?:yes|ok(?:ay)?|sure|right),?\s+/i, '') : t
    const said = body.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:said|confirmed|noted|explained|undertook)\s+(?:that\s+)?(.+)$/)
    const clause = said ? said[2] : body
    const voice = said?.[1] ?? s.speaker ?? null
    const pm = clause.match(PROMISE)
    // "It was agreed that the fund will be administered by …" records a decision, not a promise.
    const groupDecision = !!pm && /^the\s/i.test(pm[1]) && DECISION.test(t)
    if (pm && !groupDecision && !NEGATED.test(clause) && !HEDGE.test(clause.slice(0, clause.indexOf(pm[0])) + pm[0].slice(0, 30))) {
      const subject = pm[1]
      const isPronounUs = /^(we|i)$/i.test(subject) || /^the\s+(?:team|project team)$/i.test(subject)
      // A group ("the landowners") has no named owner; the person who said it is the accountable contact.
      const group = /^the\s/i.test(subject)
      const ownerName = isPronounUs ? (/^the\s/i.test(subject) ? null : voice) : /^(they|he|she)$/i.test(subject) ? null : group ? voice : subject
      const ownerIsMember = ownerName ? input.members.some(m => m.name.startsWith(ownerName) || m.name.split(' ')[0] === ownerName) : false
      const side = isPronounUs || ownerIsMember ? 'ours' : ownerName ? 'theirs' : 'unknown'
      const dl = parseDeadline(pm[2], input.meetingDate)
      commitments.push({
        text: imperative(pm[2]), quote: t, owner_name: ownerName, owner_side: side,
        counterparty_name: null, due_text: dl.text, due_date: dl.ambiguous ? null : dl.date, basis: 'explicit',
      })
      continue
    }
    const am = t.match(ACTION_TO)
    if (am && !DECISION.test(t)) {
      actions.push({ text: imperative(am[2]), quote: t, owner_name: am[1], basis: 'explicit' })
      continue
    }
    if (DECISION.test(t) && !HEDGE.test(t)) {
      decisions.push({ text: t.replace(/^(?:the )?(?:council|board|committee|group|we)\s+/i, m => m).replace(/[.]+$/, ''), quote: t, basis: 'explicit', people: peopleIn(t) })
      continue
    }
    if (NEEDS.test(t) && !HEDGE.test(t) && !NEGATED.test(t)) actions.push({ text: t.replace(/[.]+$/, ''), quote: t, owner_name: null, basis: 'inferred' })
  }

  const topics = [...new Set(ss.map(s => s.heading).filter((h): h is string => !!h))].slice(0, 8)
  const people_mentioned = peopleIn(input.notes)
  const summary = [
    topics.length ? `Discussed ${topics.length === 1 ? topics[0] : `${topics.slice(0, -1).join(', ')} and ${topics[topics.length - 1]}`}.` : null,
    decisions.length ? `${decisions.length} decision${decisions.length === 1 ? '' : 's'} recorded in the notes.` : 'No explicit decisions recorded.',
    commitments.length ? `${commitments.length} commitment${commitments.length === 1 ? '' : 's'} stated.` : null,
    open_questions.length ? `${open_questions.length} open question${open_questions.length === 1 ? '' : 's'}.` : null,
  ].filter(Boolean).join(' ')
  return { summary, topics, decisions, commitments, actions, open_questions, people_mentioned }
}
