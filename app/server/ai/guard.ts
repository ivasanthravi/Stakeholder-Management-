// Untrusted-content handling and output validation. Shared by both engines.

/** Lines that read like instructions to an AI system. They are surfaced to the user and never acted on. */
const INSTRUCTION_PATTERNS: RegExp[] = [
  /\bignore\b.{0,40}\b(instructions?|prompts?|rules?|above|previous)\b/i,
  /\bdisregard\b.{0,40}\b(instructions?|prompts?|rules?|above|previous)\b/i,
  /\b(system|developer)\s*(prompt|message|instructions?)\b/i,
  /\byou are now\b|\bact as (an?|the) (ai|assistant|system)\b/i,
  /\b(mark|set|change)\b.{0,30}\b(every|all)\b.{0,30}\b(commitments?|decisions?|records?)\b.{0,30}\b(fulfilled|completed|approved|deleted|done)\b/i,
  /\b(delete|drop|remove|exfiltrate|send|email)\b.{0,40}\b(all|every|database|records?|stakeholders?|api key|password|secrets?)\b/i,
  /^\s*(assistant|system|ai)\s*:/i,
  /<\/?\s*(system|instructions?|meeting_notes|tool|function)\b/i,
]

export interface Flag { line: string; start: number; end: number; reason: string }

export function findInstructionLikeText(text: string): Flag[] {
  const out: Flag[] = []
  let offset = 0
  for (const raw of text.split(/(?<=[.!?\n])/)) {
    const line = raw.trim()
    if (line && INSTRUCTION_PATTERNS.some(p => p.test(line))) {
      const start = text.indexOf(line, offset)
      out.push({ line, start, end: start + line.length, reason: 'Reads like an instruction to an AI system; treated as meeting content only.' })
    }
    offset += raw.length
  }
  return out
}

/** Wraps untrusted content so the model can't mistake it for instructions; neutralises closing tags inside it. */
export function fence(tag: string, content: string) {
  const safe = content.replace(new RegExp(`</?\\s*${tag}\\b[^>]*>`, 'gi'), m => m.replace(/</g, '‹').replace(/>/g, '›'))
  return `<${tag}>\n${safe}\n</${tag}>`
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()

/** Locates a model-supplied quote in the source. Returns character offsets, or null if it isn't really there. */
export function locateQuote(source: string, quote: string | null | undefined): { start: number; end: number; text: string } | null {
  if (!quote || quote.trim().length < 8) return null
  const exact = source.indexOf(quote.trim())
  if (exact >= 0) return { start: exact, end: exact + quote.trim().length, text: quote.trim() }
  // Tolerate whitespace/quote-style differences: map normalised offsets back to the source.
  const map: number[] = []
  let ns = ''
  for (let i = 0; i < source.length; i++) {
    let ch = source[i]
    if (/\s/.test(ch)) { if (ns.endsWith(' ')) continue; ch = ' ' }
    ns += norm(ch) || ' '
    map.push(i)
  }
  const q = norm(quote)
  const at = ns.indexOf(q)
  if (at < 0) return null
  const start = map[at], end = (map[at + q.length - 1] ?? source.length - 1) + 1
  return { start, end, text: source.slice(start, end) }
}

/** Keeps only citations that point at evidence actually supplied for this request. */
export function validateCites(cites: unknown, allowed: Set<string>) {
  const list = Array.isArray(cites) ? cites.filter((x): x is string => typeof x === 'string') : []
  const valid = [...new Set(list.filter(c => allowed.has(c)))]
  return { valid, invalid: list.filter(c => !allowed.has(c)) }
}

/** Replaces [rN] markers that don't resolve to supplied evidence, and reports them. */
export function sanitizeInlineCites(text: string, allowed: Set<string>) {
  const invalid: string[] = []
  const cleaned = text.replace(/\[(r\d+)\]/g, (m, ref) => { if (allowed.has(ref)) return m; invalid.push(ref); return '' })
  return { text: cleaned.replace(/[ \t]{2,}/g, ' '), invalid }
}

export const MAX_SOURCE_CHARS = 60_000
