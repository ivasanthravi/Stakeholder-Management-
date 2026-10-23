// Output contracts. Both engines (Claude and the local rule engine) must produce exactly these shapes;
// the server then verifies quotes, maps names to records and validates citations.
import { z } from 'zod'

const quote = z.string().describe('Exact, verbatim span copied from the meeting content that supports this item')

export const meetingExtractionSchema = z.object({
  summary: z.string().describe('3–5 sentence neutral summary of what was discussed and agreed. No speculation about motives or feelings.'),
  topics: z.array(z.string()).describe('Short topic labels, at most 8'),
  decisions: z.array(z.object({
    text: z.string().describe('The decision, stated plainly'),
    quote,
    basis: z.enum(['explicit', 'inferred']).describe('explicit = the content states it was decided/agreed; inferred = implied'),
    people: z.array(z.string()).describe('Names of people involved as written in the content'),
  })),
  commitments: z.array(z.object({
    text: z.string().describe('What was promised, as an imperative (e.g. "Share the revised noise survey")'),
    quote,
    owner_name: z.string().nullable().describe('Who promised it, exactly as named in the content; null if not stated'),
    owner_side: z.enum(['ours', 'theirs', 'unknown']).describe('ours = our team promised it; theirs = the external stakeholder promised it'),
    counterparty_name: z.string().nullable().describe('Who it was promised to, if stated'),
    due_text: z.string().nullable().describe('The deadline wording as written (e.g. "by Friday"); null if none'),
    due_date: z.string().nullable().describe('ISO date YYYY-MM-DD only if the deadline is unambiguous given the meeting date; otherwise null'),
    basis: z.enum(['explicit', 'inferred']),
  })),
  actions: z.array(z.object({
    text: z.string().describe('Follow-up action that is not an explicit promise to a stakeholder'),
    quote,
    owner_name: z.string().nullable(),
    basis: z.enum(['explicit', 'inferred']),
  })),
  open_questions: z.array(z.object({ text: z.string(), quote })),
  people_mentioned: z.array(z.string()).describe('Names of people mentioned, exactly as written'),
})
export type MeetingExtraction = z.infer<typeof meetingExtractionSchema>

/** A synthesised briefing paragraph: every sentence cites evidence refs (e.g. "r3") supplied with the request. */
export const synthesisSchema = z.object({
  interpretation: z.array(z.object({
    text: z.string().describe('One sentence. An interpretation of the recorded facts, never a new fact.'),
    cites: z.array(z.string()).describe('Evidence refs that support the sentence, e.g. ["r2","r5"]'),
  })).describe('At most 4 sentences'),
  recommendations: z.array(z.object({
    text: z.string().describe('A concrete next step for the user, imperative mood'),
    cites: z.array(z.string()),
    action: z.enum(['none', 'follow_up_commitment', 'log_engagement', 'review_decision', 'assign_owner']).describe('Structured action the user could approve, if any'),
  })).describe('At most 4'),
})
export type Synthesis = z.infer<typeof synthesisSchema>

/** Evidence item supplied to the engines. `ref` is the only identifier the model ever sees. */
export interface Evidence { ref: string; kind: string; id: string; label: string; text: string; at?: string | null }

export interface MeetingInput {
  notes: string
  meetingDate: string
  participants: { name: string; title?: string | null }[]
  members: { name: string }[]
  knownPeople: { name: string }[]
}
