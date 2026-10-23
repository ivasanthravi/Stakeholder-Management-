// Copilot orchestration. Two engines, one event protocol:
//   status  – short progress line ("Checking overdue commitments")
//   text    – streamed answer text (may contain [rN] citation markers)
//   sources – records the answer may cite (refs → links)
//   card    – structured result (table of commitments / stakeholders / decisions)
//   final   – cleaned text (invalid citations removed), follow-ups, counts
import type Anthropic from '@anthropic-ai/sdk'
import type { DB, TenantContext } from '../../db/client'
import type { AIEngine, Usage } from '../engine'
import { SYSTEM_RULES } from '../engine'
import { fence, sanitizeInlineCites } from '../guard'
import { RefRegistry, runTool, toolSchemas, TOOL_DEFS, type Ref, type ToolName } from './tools'

export interface CopilotContext { route?: string; stakeholderId?: string | null; initiativeId?: string | null; organizationId?: string | null; decisionId?: string | null; label?: string | null }
export type CopilotEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  | { type: 'sources'; refs: Ref[] }
  | { type: 'card'; card: Card }
  | { type: 'final'; text: string; refs: Ref[]; followUps: string[]; unsupported: number; engine: string }
export type Card = { kind: 'commitments' | 'stakeholders' | 'decisions' | 'engagements' | 'path'; title: string; rows: Record<string, unknown>[] }

const STATUS: Record<ToolName, string> = {
  search_records: 'Searching records', get_stakeholder: 'Reading the stakeholder record', list_stakeholders: 'Listing stakeholders',
  list_commitments: 'Checking commitments', list_decisions: 'Checking decisions', engagement_history: 'Reading engagement history',
  get_initiative: 'Reading the initiative', relationship_path: 'Tracing recorded relationships',
}

const COPILOT_RULES = `You are Meridian's copilot. Answer questions about this workspace's stakeholders, organizations, initiatives, engagements, decisions and commitments.
- Use the tools to look things up. Answer only from tool results; if they don't contain the answer, say what is missing instead of guessing.
- After each factual claim, cite the supporting record with its ref in square brackets, e.g. "C-142 is 9 days overdue [r4]." Never cite a ref that wasn't in a tool result.
- Counts and dates come from tool results (total_matching, days_overdue, needed_by). Don't compute statistics the tools didn't return.
- Be brief: a direct answer first, then at most a short list. No headings. Suggest a next step only when it follows from the records.
- You cannot change records. If the user asks you to create or modify something, explain they can do it from the record page, and offer what to include.
- End with a line starting "Follow-ups:" listing up to 3 short follow-up questions separated by " | ".`

export interface RunInput {
  db: DB; tn: TenantContext; engine: AIEngine; message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  context: CopilotContext; emit: (e: CopilotEvent) => void; signal?: AbortSignal
}
export interface RunOutput { text: string; refs: Ref[]; followUps: string[]; unsupported: number; usage: Usage }

function contextBlock(ctx: CopilotContext) {
  const lines = [
    ctx.label ? `The user is viewing: ${ctx.label}` : null,
    ctx.stakeholderId ? `Current stakeholder id: ${ctx.stakeholderId}` : null,
    ctx.initiativeId ? `Current initiative id: ${ctx.initiativeId}` : null,
    ctx.organizationId ? `Current organization id: ${ctx.organizationId}` : null,
    ctx.decisionId ? `Current decision id: ${ctx.decisionId}` : null,
    `Today is ${new Date().toISOString().slice(0, 10)}.`,
  ].filter(Boolean)
  return lines.join('\n')
}

function splitFollowUps(text: string) {
  const m = text.match(/\n?\s*Follow-ups?:\s*(.+)\s*$/i)
  if (!m) return { text: text.trim(), followUps: [] as string[] }
  return { text: text.slice(0, m.index).trim(), followUps: m[1].split('|').map(s => s.trim().replace(/^[-•]\s*/, '')).filter(Boolean).slice(0, 3) }
}

function cardFor(name: ToolName, result: Record<string, unknown>): Card | null {
  if (name === 'list_commitments' && Array.isArray(result.commitments) && result.commitments.length) return { kind: 'commitments', title: `${result.filter === 'overdue' ? 'Overdue' : result.filter === 'due_soon' ? 'Due soon' : result.filter === 'unassigned' ? 'Unassigned' : 'Open'} commitments`, rows: result.commitments as Record<string, unknown>[] }
  if (name === 'list_stakeholders' && Array.isArray(result.stakeholders) && result.stakeholders.length) return { kind: 'stakeholders', title: 'Stakeholders', rows: result.stakeholders as Record<string, unknown>[] }
  if (name === 'list_decisions' && Array.isArray(result.decisions) && result.decisions.length) return { kind: 'decisions', title: 'Decisions', rows: result.decisions as Record<string, unknown>[] }
  if (name === 'engagement_history' && Array.isArray(result.engagements) && result.engagements.length) return { kind: 'engagements', title: 'Engagements', rows: result.engagements as Record<string, unknown>[] }
  if (name === 'relationship_path' && result.found) return { kind: 'path', title: 'Relationship path', rows: result.hops as Record<string, unknown>[] }
  return null
}

export async function runCopilot(input: RunInput): Promise<RunOutput> {
  return input.engine.kind === 'claude' && input.engine.client ? runClaude(input) : runLocal(input)
}

// ── Claude: streaming manual tool loop ────────────────────────────────────────
async function runClaude({ db, tn, engine, message, history, context, emit, signal }: RunInput): Promise<RunOutput> {
  const client = engine.client!
  const reg = new RefRegistry()
  const tools = toolSchemas().map(t => { const s = { ...t.input_schema } as Record<string, unknown>; delete s.$schema; return { ...t, input_schema: s } }) as unknown as Anthropic.Beta.BetaTool[]
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: `${fence('context', contextBlock(context))}\n\n${message}` },
  ]
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, model: engine.model, latencyMs: 0 }
  const t0 = performance.now()
  let answer = ''
  for (let turn = 0; turn < 6; turn++) {
    const stream = client.beta.messages.stream({
      model: engine.model!, max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: [{ type: 'text', text: `${SYSTEM_RULES}\n\n${COPILOT_RULES}`, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low' },
      tools, messages,
    }, { signal })
    stream.on('text', delta => { answer += delta; emit({ type: 'text', delta }) })
    const msg = await stream.finalMessage()
    usage.input += msg.usage.input_tokens; usage.output += msg.usage.output_tokens; usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0; usage.model = msg.model
    if (msg.stop_reason === 'refusal') { answer += '\n\nI can’t help with that request.'; emit({ type: 'text', delta: '\n\nI can’t help with that request.' }); break }
    const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (!calls.length || msg.stop_reason === 'end_turn') break
    if (msg.stop_reason === 'max_tokens') break // never run a possibly truncated tool input
    messages.push({ role: 'assistant', content: msg.content })
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    for (const call of calls) {
      const name = call.name as ToolName
      if (!(name in TOOL_DEFS)) { results.push({ type: 'tool_result', tool_use_id: call.id, is_error: true, content: 'Unknown tool' }); continue }
      emit({ type: 'status', text: STATUS[name] })
      const r = await runTool(db, tn, reg, name, call.input)
      const card = cardFor(name, r); if (card) emit({ type: 'card', card })
      results.push({ type: 'tool_result', tool_use_id: call.id, is_error: 'error' in r, content: JSON.stringify(r) })
    }
    emit({ type: 'sources', refs: reg.refs })
    messages.push({ role: 'user', content: results })
    if (answer && !answer.endsWith('\n')) { answer += '\n\n'; emit({ type: 'text', delta: '\n\n' }) }
  }
  usage.latencyMs = Math.round(performance.now() - t0)
  const { text: cleaned, invalid } = sanitizeInlineCites(answer, reg.allowed())
  const { text, followUps } = splitFollowUps(cleaned)
  return { text, refs: reg.refs, followUps, unsupported: invalid.length, usage }
}

// ── Local engine: intent routing over the same tools ─────────────────────────
const DAYS = (n: number | null | undefined) => n == null ? 'never engaged' : n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'} ago`

async function runLocal({ db, tn, message, context, emit }: RunInput): Promise<RunOutput> {
  const t0 = performance.now()
  const reg = new RefRegistry()
  const q = message.toLowerCase()
  const lines: string[] = []
  let followUps: string[] = []
  const call = async (name: ToolName, args: Record<string, unknown>) => {
    emit({ type: 'status', text: STATUS[name] })
    const r = await runTool(db, tn, reg, name, args)
    const card = cardFor(name, r); if (card) emit({ type: 'card', card })
    return r as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  const scope = { initiative_id: context.initiativeId ?? null, stakeholder_id: context.stakeholderId ?? null }
  const here = context.label ? ` for ${context.label}` : ''

  // Resolve a named stakeholder/initiative in the question ("prepare for Bea Ellwood").
  const named = async () => {
    const m = message.match(/(?:with|for|about|meet(?:ing)?|on|to)\s+([A-Z][a-z]+(?:\s[A-Z][a-z'-]+)+)/)
    if (!m) return null
    const r = await call('search_records', { query: m[1] })
    return (r.stakeholders?.[0] ?? null) as { id: string; name: string; ref: string } | null
  }

  if (/overdue|late|slipp|behind/.test(q) && /commit|promis|follow/.test(q) || /^what.*overdue/.test(q)) {
    const r = await call('list_commitments', { filter: 'overdue', ...scope, limit: 10 })
    if (!r.total_matching) lines.push(`No commitments are overdue${here}.`)
    else {
      lines.push(`${r.total_matching} commitment${r.total_matching === 1 ? ' is' : 's are'} overdue${here}${r.total_matching > r.commitments.length ? `; the ${r.commitments.length} oldest:` : ':'}`)
      for (const c of r.commitments) lines.push(`- ${c.key} ${c.title} — ${c.days_overdue} day${c.days_overdue === 1 ? '' : 's'} overdue, ${c.owed_by === 'us' ? `owed by us${c.owner ? ` (${c.owner})` : ''}` : 'owed by them'}${c.stakeholder ? ` to ${c.stakeholder.name} [${c.stakeholder.ref}]` : ''} [${c.ref}]`)
    }
    followUps = ['Which of these are owed to high-influence stakeholders?', 'What commitments are due in the next two weeks?', 'Which commitments have no owner?']
  } else if (/(due|upcoming|deadline|next (two )?weeks?)/.test(q) && !/decision/.test(q)) {
    const r = await call('list_commitments', { filter: 'due_soon', ...scope, limit: 10 })
    lines.push(r.total_matching ? `${r.total_matching} commitment${r.total_matching === 1 ? ' is' : 's are'} due in the next 14 days${here}:` : `Nothing is due in the next 14 days${here}.`)
    for (const c of r.commitments ?? []) lines.push(`- ${c.key} ${c.title} — due ${c.due}${c.owner ? `, ${c.owner}` : ''} [${c.ref}]`)
    followUps = ['Which commitments are overdue?']
  } else if (/(unassigned|no owner|without (an )?owner)/.test(q)) {
    const r = await call('list_commitments', { filter: 'unassigned', ...scope, limit: 10 })
    lines.push(r.total_matching ? `${r.total_matching} open commitment${r.total_matching === 1 ? ' has' : 's have'} no owner:` : 'Every open commitment has an owner.')
    for (const c of r.commitments ?? []) lines.push(`- ${c.key} ${c.title} [${c.ref}]`)
  } else if (/decision/.test(q)) {
    const r = await call('list_decisions', { status: /decided|approved|made/.test(q) ? 'decided' : 'pending', ...scope, limit: 10 })
    const ds = r.decisions as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!ds.length) lines.push(`No ${/decided/.test(q) ? 'decided' : 'pending'} decisions${here}.`)
    else {
      const late = ds.filter(d => d.late)
      lines.push(`${ds.length} decision${ds.length === 1 ? ' is' : 's are'} ${/decided/.test(q) ? 'decided' : 'still pending'}${here}${late.length ? `, ${late.length} past the date it was needed` : ''}:`)
      for (const d of ds) lines.push(`- ${d.key} ${d.title} — ${d.status.replace('_', ' ')}${d.needed_by ? `, needed by ${d.needed_by}${d.late ? ' (late)' : ''}` : ''}${d.owner ? `, owner ${d.owner}` : ''} [${d.ref}]`)
    }
    followUps = ['Who are the approvers on the late decisions?', 'Which commitments relate to these decisions?']
  } else if (/(influen|most important|key stakeholders|who matters)/.test(q)) {
    const r = await call('list_stakeholders', { initiative_id: context.initiativeId ?? null, organization_id: context.organizationId ?? null, sort: 'influence', min_influence: 3, limit: 8 })
    lines.push(r.total_matching ? `${r.total_matching} stakeholder${r.total_matching === 1 ? ' is' : 's are'} recorded with high or very high influence${here}. By recorded influence:` : `No stakeholders are recorded with high influence${here}.`)
    for (const s of r.stakeholders ?? []) lines.push(`- ${s.name}${s.title ? `, ${s.title}` : ''} — influence ${s.influence}/4, ${s.stance.toLowerCase()}, last engaged ${DAYS(s.days_since_last_engagement)} [${s.ref}]`)
    lines.push('Influence is the level your team recorded, not a computed score.')
    followUps = ['Which of these have not been engaged in 60 days?', 'Which of these are concerned or opposed?']
  } else if (/(not (been )?engaged|haven.?t (we |you |i )?(been )?(engaged|contacted|met|spoken)|no (recent )?contact|neglect|gone quiet|cooling)/.test(q)) {
    const r = await call('list_stakeholders', { initiative_id: context.initiativeId ?? null, organization_id: context.organizationId ?? null, sort: 'least_recently_engaged', min_influence: 3, limit: 10 })
    const stale = (r.stakeholders as any[]).filter(s => s.days_since_last_engagement == null || s.days_since_last_engagement > 60) // eslint-disable-line @typescript-eslint/no-explicit-any
    lines.push(stale.length ? `${stale.length} high-influence stakeholder${stale.length === 1 ? ' has' : 's have'} no recorded engagement in the last 60 days${here}:` : `Every high-influence stakeholder${here} has been engaged in the last 60 days.`)
    for (const s of stale) lines.push(`- ${s.name} — last engaged ${DAYS(s.days_since_last_engagement)}${s.has_owner ? '' : ', no owner'} [${s.ref}]`)
    followUps = ['Prepare a briefing for the first of these', 'Which of them have open commitments?']
  } else if (/(prepare|prep|brief|before (meeting|i meet)|what should i know|tell me about|who is)/.test(q)) {
    const target = context.stakeholderId ? { id: context.stakeholderId } : await named()
    if (!target) lines.push('Which stakeholder? Open their profile and ask again, or include their full name.')
    else {
      const s = await call('get_stakeholder', { stakeholder_id: target.id })
      if (s.error) lines.push('I can’t find that stakeholder in records you can see.')
      else {
        lines.push(`${s.name}${s.title ? `, ${s.title}` : ''} — recorded as ${String(s.stance).toLowerCase()} [${s.ref}].`)
        if (s.recent_engagements[0]) lines.push(`Last engaged ${DAYS(s.days_since_last_engagement)}: ${s.recent_engagements[0].title}${s.recent_engagements[0].summary ? ` — ${s.recent_engagements[0].summary}` : ''} [${s.recent_engagements[0].ref}]`)
        else lines.push('No engagement is recorded yet.')
        const od = s.open_commitments.filter((c: any) => c.overdue) // eslint-disable-line @typescript-eslint/no-explicit-any
        if (s.open_commitments.length) lines.push(`Open commitments (${s.open_commitments.length}${od.length ? `, ${od.length} overdue` : ''}):`)
        for (const c of s.open_commitments.slice(0, 5)) lines.push(`- ${c.key} ${c.title}${c.due ? `, due ${c.due}` : ''}${c.overdue ? ' (overdue)' : ''} — owed by ${c.owed_by} [${c.ref}]`)
        for (const d of s.pending_decisions.slice(0, 3)) lines.push(`- ${d.their_role} on ${d.key} ${d.title} (${String(d.status).replace('_', ' ')}) [${d.ref}]`)
        followUps = ['Open the full briefing', 'What happened since our last engagement?']
      }
    }
  } else if (/(since (our )?last|what happened|latest|recent(ly)?|history|summari[sz]e)/.test(q)) {
    const target = context.stakeholderId || context.organizationId || context.initiativeId ? null : await named()
    const r = await call('engagement_history', { stakeholder_id: context.stakeholderId ?? target?.id ?? null, organization_id: context.organizationId ?? null, initiative_id: context.stakeholderId || context.organizationId ? null : context.initiativeId ?? null, since_days: /since/.test(q) ? 90 : null, limit: 8 })
    const es = r.engagements as any[] // eslint-disable-line @typescript-eslint/no-explicit-any
    lines.push(es.length ? `${es.length} recent engagement${es.length === 1 ? '' : 's'}${here}, newest first:` : `No engagements are recorded${here}.`)
    for (const e of es) lines.push(`- ${e.date} · ${e.kind.replace('_', ' ')} · ${e.title}${e.summary ? ` — ${e.summary}` : ''} [${e.ref}]`)
    followUps = ['Which commitments came out of these engagements?']
  } else if (/(risk|block|delay|unresolved|issues?|stuck)/.test(q)) {
    const [c, d] = [await call('list_commitments', { filter: 'overdue', ...scope, limit: 5 }), await call('list_decisions', { status: 'pending', ...scope, limit: 5 })]
    const late = (d.decisions as any[]).filter(x => x.late) // eslint-disable-line @typescript-eslint/no-explicit-any
    lines.push(`From the records${here}: ${c.total_matching} overdue commitment${c.total_matching === 1 ? '' : 's'} and ${late.length} decision${late.length === 1 ? '' : 's'} past the date ${late.length === 1 ? 'it was' : 'they were'} needed.`)
    for (const x of late) lines.push(`- ${x.key} ${x.title} — needed by ${x.needed_by} [${x.ref}]`)
    for (const x of c.commitments) lines.push(`- ${x.key} ${x.title} — ${x.days_overdue} days overdue [${x.ref}]`)
    lines.push('These are recorded facts; whether they will delay the work is a judgement for your team.')
  } else if (/(connect|path|reach|introduc|know)/.test(q)) {
    lines.push('Name both people in full (“How is Jonah Thorne connected to Bea Ellwood?”), or open one profile and ask about the other. The map’s “Find path” does the same.')
    // Two full names in the question, or one name plus the profile in context.
    const names = [...message.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z'-]+)+)\b/g)].map(m => m[1]).filter(n => !/^(How|What|Who|Is|Are)\b/.test(n))
    const find = async (n: string) => ((await call('search_records', { query: n })).stakeholders?.[0] ?? null) as { id: string } | null
    const from = context.stakeholderId ? { id: context.stakeholderId } : names[0] ? await find(names[0]) : null
    const target = names.length ? await find(names[names.length - 1]) : null
    if (from && target && target.id !== from.id) {
      const r = await call('relationship_path', { from_stakeholder_id: from.id, to_stakeholder_id: target.id })
      lines.length = 0
      if (!r.found) lines.push(r.note)
      else { lines.push(`Recorded path (${r.hops.length} step${r.hops.length === 1 ? '' : 's'}):`); for (const h of r.hops) lines.push(`- ${h.from.name} [${h.from.ref}] — ${String(h.relationship).replace('_', ' ')}${h.status === 'inferred' ? ' (inferred)' : ''} → ${h.to.name} [${h.to.ref}]`) }
    }
  } else {
    lines.push('Without the AI model, I can answer these directly from your records:')
    lines.push('- Which commitments are overdue? / due soon? / have no owner?')
    lines.push('- What decisions are pending?')
    lines.push('- Who are the most influential stakeholders here?')
    lines.push('- Which stakeholders haven’t been engaged recently?')
    lines.push('- Prepare me for a meeting with <name>')
    lines.push('- What happened since our last engagement?')
    lines.push('- What unresolved issues could delay this initiative?')
  }

  const text = lines.join('\n')
  emit({ type: 'sources', refs: reg.refs })
  emit({ type: 'text', delta: text })
  return { text, refs: reg.refs, followUps, unsupported: 0, usage: { input: 0, output: 0, cacheRead: 0, model: null, latencyMs: Math.round(performance.now() - t0) } }
}
