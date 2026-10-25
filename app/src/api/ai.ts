// Client for the AI layer: types mirroring server/modules/ai.ts, query hooks, and the streaming copilot client.
import { useQuery } from '@tanstack/react-query'
import { ApiError, NetworkError, qs, request, ws } from './http'
import { useApiMutation, wk } from './hooks'

export type EngineKind = 'claude' | 'local'
export interface EngineInfo { kind: EngineKind; label: string; model?: string | null }

export interface AISettings {
  enabled: boolean
  retentionDays: number
  monthlyTokenBudget: number
  perUserPerMinute: number
  thresholds: { noContactDays: number; dueSoonDays: number; decisionStaleDays: number; coolingRatio: number }
}
export interface MonthUsage { tokens: number; costMicros: number }
export interface AIStatus { engine: EngineInfo; settings: AISettings; month: MonthUsage }
export interface AIUsage {
  since: string; month: MonthUsage; budget: number
  rows: { feature: string; engine: EngineKind; calls: number; errors: number; input: number; output: number; costMicros: number; p50: number; p95: number }[]
}

// ── Meeting intelligence ─────────────────────────────────────────────────────
export interface QuoteEvidence { kind: 'quote'; start: number; end: number; text: string }
export interface RecordEvidence { kind: 'record'; type: string; id: string; label: string }
export type ProposalKind = 'commitment' | 'decision' | 'action' | 'stakeholder_note' | 'follow_up_engagement'
export type ReviewFlag = 'owner_missing' | 'due_date_ambiguous' | 'due_date_derived' | 'vague_wording' | 'inferred' | 'possible_duplicate' | 'stakeholder_unmatched'
export interface ProposalValues {
  title?: string; ownerId?: string | null; stakeholderId?: string | null; initiativeId?: string | null
  dueDate?: string | null; dueText?: string | null; direction?: 'ours' | 'theirs'; status?: string; stakeholderIds?: string[]
  [k: string]: unknown
}
export interface Proposal {
  id: string; kind: ProposalKind; status: 'pending' | 'accepted' | 'rejected' | 'merged'
  title: string; values: ProposalValues; evidence: (QuoteEvidence | RecordEvidence)[]
  reasoning: string | null; basis: 'explicit' | 'inferred'; needsReview: ReviewFlag[]
  requiredPermission: string; mergedInto: string | null
  createdRecordType: string | null; createdRecordId: string | null
  decidedBy: string | null; decidedAt: string | null; version: number; createdAt: string
}
export interface InjectionFlag { line: string; start: number; end: number; reason: string }
export interface MeetingAnalysis {
  id: string; engagementId: string; engine: EngineKind; model: string | null
  summary: string | null; topics: string[]
  openQuestions: { text: string; evidence: QuoteEvidence }[]
  mentions: { name: string; memberId: string | null; stakeholderId: string | null; participant: boolean }[]
  flags: InjectionFlag[]
  createdBy: string | null; createdByName?: string | null; createdAt: string
  stale?: boolean
  proposals: Proposal[]
}

export const REVIEW_FLAG_LABEL: Record<ReviewFlag, string> = {
  owner_missing: 'Owner not stated',
  due_date_ambiguous: 'Due date unclear',
  due_date_derived: 'Date worked out from wording',
  vague_wording: 'Vague wording',
  inferred: 'Inferred, not stated',
  possible_duplicate: 'May duplicate an existing record',
  stakeholder_unmatched: 'Person not matched to a record',
}

// ── Briefings ────────────────────────────────────────────────────────────────
export type BriefingMode = 'brief' | 'detailed' | 'prep'
export type ItemKind = 'fact' | 'metric' | 'interpretation' | 'recommendation'
export interface BriefingItem { text: string; kind: ItemKind; cites: string[]; action?: string; method?: string; origin?: 'rule' | 'ai' }
export interface BriefingSection { id: string; title: string; items: BriefingItem[] }
export interface BriefingSource { ref: string; type: string; id: string; label: string; at?: string | null }
export interface Briefing {
  subject: { type: string; id: string; name: string }
  mode: BriefingMode
  engine: EngineInfo
  generatedAt: string
  sections: BriefingSection[]
  sources: BriefingSource[]
  unsupportedDropped: number
  aiError?: string
  cached?: boolean
}

export const sourceHref = (s: { type: string; id: string }) =>
  s.type === 'stakeholder' ? `/stakeholders/${s.id}` : s.type === 'organization' ? `/organizations/${s.id}` : s.type === 'initiative' ? `/initiatives/${s.id}`
    : s.type === 'engagement' ? `/engagements/${s.id}` : s.type === 'decision' ? `/decisions?open=${s.id}` : s.type === 'commitment' ? `/commitments?open=${s.id}` : '#'

// ── Paths ────────────────────────────────────────────────────────────────────
export interface PathHop { from: { id: string; name: string }; to: { id: string; name: string }; type: string; status: string; relationshipId: string }
export interface PathResult { found: boolean; hops: PathHop[]; method: string }

// ── Copilot ──────────────────────────────────────────────────────────────────
export interface CopilotRef { ref: string; type: string; id: string; label: string; href: string; at?: string | null }
export interface CopilotCard { kind: 'commitments' | 'stakeholders' | 'decisions' | 'engagements' | 'path'; title: string; rows: Record<string, unknown>[] }
export interface CopilotContext { route?: string; label?: string | null; stakeholderId?: string | null; initiativeId?: string | null; organizationId?: string | null; decisionId?: string | null }
export type CopilotEvent =
  | { type: 'meta'; conversationId: string | null; engine: EngineInfo; retentionDays: number }
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  | { type: 'sources'; refs: CopilotRef[] }
  | { type: 'card'; card: CopilotCard }
  | { type: 'final'; text: string; refs: CopilotRef[]; followUps: string[]; unsupported: number; engine: EngineKind }
  | { type: 'error'; message: string }
export interface ConversationSummary { id: string; title: string; updatedAt: string; expiresAt: string }
export interface ConversationDetail extends ConversationSummary {
  messages: { id: string; role: 'user' | 'assistant'; content: string; payload: { refs?: CopilotRef[]; followUps?: string[] } | null; createdAt: string }[]
}

/**
 * POSTs to the copilot endpoint and yields server-sent events as they arrive.
 * Errors before the stream starts (rate limit, quota, AI disabled) surface as ApiError.
 */
export async function* streamCopilot(body: { message: string; conversationId?: string | null; context?: CopilotContext }, signal: AbortSignal): AsyncGenerator<CopilotEvent> {
  let res: Response
  try {
    res = await fetch(ws('/ai/copilot'), { method: 'POST', credentials: 'same-origin', signal, headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify(body) })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new NetworkError(false)
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(res.status, data?.error?.code ?? 'http_' + res.status, data?.error?.message ?? 'Something went wrong. Please try again.')
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2)
      const data = chunk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
      if (data) { try { yield JSON.parse(data) as CopilotEvent } catch { /* ignore malformed chunk */ } }
    }
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────
export const useAIStatus = () => useQuery({ queryKey: wk('ai', 'status'), queryFn: () => request<AIStatus>(ws('/ai/status')), staleTime: 60_000 })
export const useAIUsage = (enabled = true) => useQuery({ queryKey: wk('ai', 'usage'), queryFn: () => request<AIUsage>(ws('/ai/usage')), enabled })
export const useMeetingAnalysis = (engagementId: string | undefined) => useQuery({
  queryKey: wk('ai', 'meeting', engagementId),
  queryFn: () => request<{ analysis: MeetingAnalysis | null; engine: EngineInfo }>(ws(`/ai/meetings/${engagementId}`)),
  enabled: !!engagementId,
})
/** Briefings are generated on request, not prefetched: `enabled` lets callers wait for an explicit action. */
export const useStakeholderBriefing = (id: string | undefined, mode: BriefingMode, enabled = true) => useQuery({
  queryKey: wk('ai', 'briefing', 'stakeholder', id, mode),
  queryFn: ({ signal }) => request<Briefing>(ws(`/ai/briefings/stakeholders/${id}${qs({ mode })}`), { signal }),
  enabled: !!id && enabled, staleTime: 5 * 60_000, retry: false,
})
export const useDecisionBriefing = (id: string | null | undefined, enabled = true) => useQuery({
  queryKey: wk('ai', 'briefing', 'decision', id),
  queryFn: ({ signal }) => request<Briefing>(ws(`/ai/briefings/decisions/${id}`), { signal }),
  enabled: !!id && enabled, staleTime: 5 * 60_000, retry: false,
})
export const useWorkspaceBriefing = (enabled = true) => useQuery({
  queryKey: wk('ai', 'briefing', 'workspace'),
  queryFn: ({ signal }) => request<Briefing>(ws('/ai/briefings/workspace'), { signal }),
  enabled, staleTime: 5 * 60_000, retry: false,
})
export const usePath = (from: string | null, to: string | null) => useQuery({
  queryKey: wk('ai', 'path', from, to),
  queryFn: () => request<PathResult>(ws(`/ai/paths${qs({ from: from ?? undefined, to: to ?? undefined })}`)),
  enabled: !!from && !!to && from !== to,
})
export const useConversations = (enabled = true) => useQuery({ queryKey: wk('ai', 'conversations'), queryFn: () => request<{ conversations: ConversationSummary[] }>(ws('/ai/conversations')), enabled })

export const useAnalyzeMeeting = () => useApiMutation<{ _engagementId: string }, MeetingAnalysis>('POST', b => `/ai/meetings/${b._engagementId}/analyze`)
export const useEditProposal = () => useApiMutation<{ _id: string; version: number; values: ProposalValues }, Proposal>('PATCH', b => `/ai/proposals/${b._id}`)
export const useAcceptProposal = () => useApiMutation<{ _id: string; version: number; values?: ProposalValues }, { id: string; key: string; type: string }>('POST', b => `/ai/proposals/${b._id}/accept`)
export const useRejectProposal = () => useApiMutation<{ _id: string; version: number }, { ok: true }>('POST', b => `/ai/proposals/${b._id}/reject`)
export const useMergeProposal = () => useApiMutation<{ _id: string; version: number; into: string }, { ok: true }>('POST', b => `/ai/proposals/${b._id}/merge`)
export const useUpdateAISettings = () => useApiMutation<Partial<Omit<AISettings, 'thresholds'>> & { thresholds?: Partial<AISettings['thresholds']> }, AISettings>('PATCH', () => '/ai/settings')
export const useDeleteConversation = () => useApiMutation<{ _id: string }, { ok: true }>('DELETE', b => `/ai/conversations/${b._id}`)
export const useClearConversations = () => useApiMutation<Record<string, never>, { ok: true }>('DELETE', () => '/ai/conversations')
