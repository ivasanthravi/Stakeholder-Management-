// AI failure modes: model errors and timeouts never change data, always release reserved allowance, and degrade to
// facts and rules; ambiguous people are never guessed; the copilot has no write capability.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestContext, createWorkspace, signUp, sse, type Client, type TestContext } from './helpers'
import { aiAllowance, aiProposal, aiUsage } from '../server/db/schema'
import { createLocalEngine, type AIEngine } from '../server/ai/engine'
import { TOOL_DEFS } from '../server/ai/copilot/tools'

function failingEngine(kind: 'error' | 'timeout'): AIEngine {
  const err = kind === 'timeout' ? Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' }) : Object.assign(new Error('Overloaded'), { status: 529 })
  return {
    kind: 'claude', model: 'claude-opus-5-5', label: 'Failing engine',
    client: { beta: { messages: { stream: () => { throw err } } } } as never,
    async extractMeeting() { throw err },
    async synthesize() { throw err },
  }
}

const NOTES = 'Corridor liaison\nSam Okoro and Sam Lindqvist attended for the county.\nSam will circulate the traffic counts.\nPriya Raman will send the revised junction drawings to Sam Lindqvist by 12 November.'

describe.each(['error', 'timeout'] as const)('model %s', kind => {
  let ctx: TestContext, o: Client, w: string, s: string, eng: string
  beforeAll(async () => {
    ctx = await createTestContext({ ai: failingEngine(kind) })
    o = await signUp(ctx, `${kind}@ai-fail.test`, 'Fay Fail')
    w = await createWorkspace(o, 'Fail Co')
    s = (await o.post(`/api/w/${w}/stakeholders`, { name: 'Sam Okoro', influence: 4 })).body.id
    eng = (await o.post(`/api/w/${w}/engagements`, { kind: 'meeting', title: 'Liaison', occurredAt: '2026-11-04T10:00:00.000Z', participantIds: [s], notes: NOTES })).body.id
  })
  afterAll(async () => { await ctx.close() })

  test('meeting analysis fails cleanly: 503, no proposals, usage recorded as failed, allowance released', async () => {
    const r = await o.post(`/api/w/${w}/ai/meetings/${eng}/analyze`)
    expect(r.status).toBe(503); expect(r.body.error.code).toBe('ai_unavailable')
    expect(await ctx.db.select().from(aiProposal)).toHaveLength(0)
    const usage = await ctx.db.select().from(aiUsage).where(eq(aiUsage.feature, 'meeting_extraction'))
    expect(usage[0].status).toBe('error')
    const [ledger] = await ctx.db.select().from(aiAllowance).where(eq(aiAllowance.workspaceId, w))
    expect(ledger).toMatchObject({ reserved: 0, used: 0 })
  })
  test('briefings degrade to recorded facts and rules with a visible notice', async () => {
    const r = await o.get(`/api/w/${w}/ai/briefings/stakeholders/${s}?fresh=1`)
    expect(r.status).toBe(200)
    expect(r.body.aiError).toMatch(/unavailable/)
    expect(r.body.sections.flatMap((x: { items: { kind: string }[] }) => x.items).some((i: { kind: string }) => i.kind === 'interpretation')).toBe(false)
    expect(r.body.sections.length).toBeGreaterThan(0)
    expect((await ctx.db.select().from(aiAllowance).where(eq(aiAllowance.workspaceId, w)))[0].reserved).toBe(0)
  })
  test('copilot reports the failure as an error event and stores nothing half-done', async () => {
    const r = await sse(ctx, o, `/api/w/${w}/ai/copilot`, { message: 'What is overdue?' })
    expect(r.events.map(e => e.event)).toContain('error')
    expect(r.events.find(e => e.event === 'final')).toBeUndefined()
    expect((await ctx.db.select().from(aiAllowance).where(eq(aiAllowance.workspaceId, w)))[0].reserved).toBe(0)
  })
})

describe('identification and authority', () => {
  let ctx: TestContext, o: Client, w: string
  beforeAll(async () => {
    ctx = await createTestContext({ ai: createLocalEngine() })
    o = await signUp(ctx, 'ident@ai-fail.test', 'Priya Raman')
    w = await createWorkspace(o, 'Ident Co')
  })
  afterAll(async () => { await ctx.close() })

  test('an ambiguous first name is never resolved to a person; the proposal is flagged for review', async () => {
    const a = (await o.post(`/api/w/${w}/stakeholders`, { name: 'Sam Okoro' })).body.id
    const b = (await o.post(`/api/w/${w}/stakeholders`, { name: 'Sam Lindqvist' })).body.id
    const eng = (await o.post(`/api/w/${w}/engagements`, { kind: 'meeting', title: 'Corridor liaison', occurredAt: '2026-11-04T10:00:00.000Z', participantIds: [a, b], notes: NOTES })).body.id
    const r = await o.post(`/api/w/${w}/ai/meetings/${eng}/analyze`)
    const counts = r.body.proposals.find((p: { title: string }) => /traffic counts/i.test(p.title))
    expect(counts.values.ownerId ?? null).toBeNull()
    expect([a, b]).not.toContain(counts.values.stakeholderId)
    expect(counts.needsReview.length).toBeGreaterThan(0)
    const drawings = r.body.proposals.find((p: { title: string }) => /junction drawings/i.test(p.title))
    expect(drawings.values.dueDate).toBe('2026-11-12')
  })
  test('the copilot has read-only tools only — it can’t change records', () => {
    const names = Object.keys(TOOL_DEFS)
    expect(names.every(n => /^(search|get|list|engagement_history|relationship_path)/.test(n))).toBe(true)
    expect(names.some(n => /create|update|delete|archive|accept|send|assign/.test(n))).toBe(false)
  })
})
