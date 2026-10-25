// Command Center signals: every overdue commitment stays in view, however old (a 60-day window used to drop them).
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createTestContext, createWorkspace, signUp, type TestContext } from './helpers'

let ctx: TestContext
beforeAll(async () => { ctx = await createTestContext() })
afterAll(async () => { await ctx.close() })

test('commitments overdue for months still raise a signal and appear on the horizon', async () => {
  const owner = await signUp(ctx, 'dash@dash.test', 'Dana Dash')
  const w = await createWorkspace(owner, 'Dash Co')
  const s = await owner.post(`/api/w/${w}/stakeholders`, { name: 'Olu Overdue' })
  const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
  for (const [title, due] of [['Long forgotten', iso(-200)], ['Recently late', iso(-3)], ['Coming up', iso(10)], ['Far future', iso(90)]] as const) {
    expect((await owner.post(`/api/w/${w}/commitments`, { title, stakeholderId: s.body.id, dueDate: due })).status).toBe(201)
  }
  const d = (await owner.get(`/api/w/${w}/dashboard`)).body as { signals: { kind: string; title: string; reason: string }[]; horizon: { title: string }[] }
  const overdue = d.signals.filter(x => x.kind === 'overdue').map(x => x.title)
  expect(overdue.some(t => t.includes('Long forgotten'))).toBe(true)
  expect(overdue.some(t => t.includes('Recently late'))).toBe(true)
  expect(d.signals.find(x => x.title.includes('Long forgotten'))!.reason).toMatch(/^200 days overdue/)
  const horizon = d.horizon.map(h => h.title)
  expect(horizon).toEqual(expect.arrayContaining(['Long forgotten', 'Recently late', 'Coming up']))
  expect(horizon).not.toContain('Far future')
})
