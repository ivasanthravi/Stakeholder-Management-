// Email delivery against Postmark's API contract (fetch stubbed): permanent rejections are recorded and never retried
// (so they can't fill the dead-job queue and page someone), temporary failures are retried by a job.
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestContext, type TestContext } from './helpers'
import { createMailer, createPostmarkTransport } from '../server/mail'
import { emailMessage, job } from '../server/db/schema'

let ctx: TestContext
beforeAll(async () => { ctx = await createTestContext() })
afterAll(async () => { vi.unstubAllGlobals(); await ctx.close() })

const reply = (status: number, body: object) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
const mailer = () => createMailer(ctx.db, createPostmarkTransport('server-token-for-tests'), { from: 'Meridian <no-reply@example.test>', appUrl: 'https://app.example.test', jobs: ctx.jobs })
const send = (to: string) => mailer().send({ to, template: 'verify', data: { url: 'https://app.example.test/verify?token=t' } })
const retries = async (to: string) => (await ctx.db.select().from(job).where(eq(job.kind, 'email.retry'))).filter(j => (j.payload.mail as { to?: string })?.to === to).length

describe('Postmark delivery', () => {
  test('accepted: sent with the provider message id; the token header is sent and nothing secret is stored', async () => {
    const f = reply(200, { ErrorCode: 0, MessageID: 'pm-123' }); vi.stubGlobal('fetch', f)
    expect((await send('ok@example.test')).status).toBe('sent')
    const [row] = await ctx.db.select().from(emailMessage).where(eq(emailMessage.to, 'ok@example.test'))
    expect(row.status).toBe('sent'); expect(row.providerMessageId).toBe('pm-123')
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>)['x-postmark-server-token']).toBe('server-token-for-tests')
    expect(JSON.stringify(row)).not.toContain('server-token-for-tests')
  })
  test('inactive recipient (406) and invalid address (300): failed, not retried', async () => {
    for (const [to, code] of [['bounced@example.test', 406], ['bad@example.test', 300]] as const) {
      vi.stubGlobal('fetch', reply(422, { ErrorCode: code, Message: 'You tried to send to a recipient that has been marked as inactive.' }))
      expect((await send(to)).status).toBe('failed')
      const [row] = await ctx.db.select().from(emailMessage).where(eq(emailMessage.to, to))
      expect(row.status).toBe('failed')
      expect(await retries(to)).toBe(0)
    }
  })
  test('a temporary failure (server error) is queued for retry', async () => {
    vi.stubGlobal('fetch', reply(503, { ErrorCode: 0, Message: 'Service unavailable' }))
    expect((await send('later@example.test')).status).toBe('queued')
    expect(await retries('later@example.test')).toBe(1)
  })
})
