import { afterAll, beforeAll, expect, test } from 'vitest'
import { createTestContext, createWorkspace, signUp, type TestContext } from './helpers'

let ctx: TestContext
beforeAll(async () => { ctx = await createTestContext() })
afterAll(async () => { await ctx.close() })

test('sign up → verify → sign in → create workspace → me', async () => {
  const a = await signUp(ctx, 'ada@example.com', 'Ada Lovelace')
  const wid = await createWorkspace(a, 'Acme Infrastructure')
  const me = await a.get('/api/me')
  expect(me.status).toBe(200)
  expect(me.body.workspaces).toEqual([expect.objectContaining({ id: wid, role: 'owner' })])
})
