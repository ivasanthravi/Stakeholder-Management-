// Rule-assembled briefing under the AI citation contract: every sentence is typed (fact | inference)
// and cites the records it came from. No language model is involved; the UI labels it accordingly.
import { STANCE_LABEL } from './_shared'

export interface BriefSource { id: string; kind: 'engagement' | 'commitment' | 'decision' | 'relationship' | 'stakeholder'; label: string; at?: string | null }
export interface BriefSentence { kind: 'fact' | 'inference'; text: string; cites: number[] }

const LEVEL = ['', 'low', 'medium', 'high', 'very high']
const DAY = 86_400_000
const fmt = (d: string | Date) => new Date(typeof d === 'string' && d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

interface Input {
  s: { id: string; name: string; title?: unknown; stance: unknown; influence?: unknown; organizations: { name: string; validTo: string | null; isPrimary: boolean }[] }
  engagements: { id: string; key: string; kind: string; title: string; occurredAt: Date; summary: string | null }[]
  commitments: { id: string; key: string; title: string; status: string; dueDate: string | null }[]
  decisions: { id: string; key: string; title: string; status: string; role: string }[]
  relationships: { id: string; type: string; other: { name: string } }[]
}

export function buildBriefing({ s, engagements, commitments, decisions, relationships }: Input) {
  const sources: BriefSource[] = []
  const cite = (src: BriefSource) => { const i = sources.findIndex(x => x.id === src.id); if (i >= 0) return i + 1; sources.push(src); return sources.length }
  const out: BriefSentence[] = []
  const first = s.name.split(' ')[0]
  const now = Date.now()
  const org = s.organizations.find(o => !o.validTo && o.isPrimary) ?? s.organizations.find(o => !o.validTo)

  const self = cite({ id: s.id, kind: 'stakeholder', label: `${s.name} — profile record` })
  const parts = [s.title ? `${s.title}${org ? ` at ${org.name}` : ''}` : org ? `at ${org.name}` : null].filter(Boolean)
  out.push({ kind: 'fact', text: `${s.name}${parts.length ? ` is ${parts[0]}` : ''}, recorded as ${STANCE_LABEL[s.stance as string].toLowerCase()}${s.influence ? ` with ${LEVEL[s.influence as number]} influence` : ''}.`, cites: [self] })

  if (engagements.length) {
    const last = engagements[0]
    const lc = cite({ id: last.id, kind: 'engagement', label: `${last.key} · ${last.title}`, at: last.occurredAt.toISOString() })
    const ago = Math.round((now - last.occurredAt.getTime()) / DAY)
    out.push({ kind: 'fact', text: `Last engaged ${ago <= 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`} (${last.kind.replace('_', ' ')})${last.summary ? `: ${last.summary.replace(/\.$/, '')}` : ''}.`, cites: [lc] })
    const recent = engagements.filter(e => now - e.occurredAt.getTime() <= 60 * DAY).length
    const prior = engagements.filter(e => { const d = now - e.occurredAt.getTime(); return d > 60 * DAY && d <= 120 * DAY }).length
    if (prior >= 3 && recent <= prior * 0.5) {
      const more = engagements.slice(1, 3).map(e => cite({ id: e.id, kind: 'engagement', label: `${e.key} · ${e.title}`, at: e.occurredAt.toISOString() }))
      out.push({ kind: 'inference', text: `Contact has slowed: ${recent} engagement${recent === 1 ? '' : 's'} in the last 60 days against ${prior} in the 60 days before.`, cites: [lc, ...more] })
    }
  } else {
    out.push({ kind: 'fact', text: `No engagement with ${first} has been recorded yet.`, cites: [] })
  }

  const open = commitments.filter(c => c.status === 'open' || c.status === 'in_progress')
  const overdue = open.filter(c => c.dueDate && Date.parse(c.dueDate + 'T23:59:59Z') < now)
  if (open.length) {
    const cs = open.slice(0, 3).map(c => cite({ id: c.id, kind: 'commitment', label: `${c.key} · ${c.title}`, at: c.dueDate }))
    out.push({
      kind: 'fact',
      text: overdue.length
        ? `${open.length} commitment${open.length === 1 ? ' is' : 's are'} open with ${first}; ${overdue.length} overdue, including “${overdue[0].title}” (due ${fmt(overdue[0].dueDate!)}).`
        : `${open.length} commitment${open.length === 1 ? ' is' : 's are'} open with ${first}${open.some(c => c.dueDate) ? `, next due ${fmt(open.filter(c => c.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0].dueDate!)}` : ''}.`,
      cites: cs,
    })
  }

  const pending = decisions.filter(d => d.status === 'proposed' || d.status === 'under_review')
  if (pending.length) {
    const d = pending[0]
    out.push({ kind: 'fact', text: `${first} is ${d.role === 'approver' ? 'an approver' : d.role} on ${d.key} “${d.title}”, which is ${d.status.replace('_', ' ')}.`, cites: [cite({ id: d.id, kind: 'decision', label: `${d.key} · ${d.title}` })] })
  }

  if (relationships.length) {
    const opp = relationships.filter(r => r.type === 'opposes').length
    out.push({ kind: 'fact', text: `${relationships.length} recorded relationship${relationships.length === 1 ? '' : 's'}${opp ? `, ${opp} in opposition` : ''}.`, cites: [cite({ id: relationships[0].id, kind: 'relationship', label: `Relationship with ${relationships[0].other.name}` })] })
  }

  return { sentences: out, sources, basis: `${sources.length} record${sources.length === 1 ? '' : 's'}`, method: 'rules' as const }
}
