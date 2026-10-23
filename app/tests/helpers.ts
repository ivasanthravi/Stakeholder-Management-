import { desc, eq } from 'drizzle-orm'
import { createDatabase, migrate } from '../server/db/client'
import { mailOutbox } from '../server/db/schema'
import { loadEnv } from '../server/env'
import { createLogMailer } from '../server/mail'
import { createAuth } from '../server/auth'
import { createApp } from '../server/app'

export const ORIGIN = 'http://localhost:5173'
export const PASSWORD = 'correct-horse-battery'

/** Fresh in-memory Postgres (PGlite), migrated, with the real app and auth wired up. */
export async function createTestContext(opts: { ai?: import('../server/ai/engine').AIEngine; billing?: import('../server/billing/provider').BillingProvider | null } = {}) {
  const database = await createDatabase({})
  await migrate(database)
  const env = loadEnv({ NODE_ENV: 'test', APP_URL: ORIGIN, REQUIRE_EMAIL_VERIFICATION: 'true' })
  const mailer = createLogMailer(database.db, { quiet: true })
  const auth = createAuth(database.db, env, mailer)
  const { createLocalEngine } = await import('../server/ai/engine')
  const { createLimiter } = await import('../server/ratelimit')
  const limiter = createLimiter()
  const deps: import('../server/context').Deps = { db: database.db, auth, env, mailer, limiter, ai: opts.ai ?? createLocalEngine(), ...(opts.billing !== undefined ? { billing: opts.billing } : {}) }
  const app = createApp(deps)
  return { app, db: database.db, limiter, deps, jobs: deps.jobs!, simulator: deps.simulator ?? null, close: () => database.close() }
}
export type TestContext = Awaited<ReturnType<typeof createTestContext>>

export interface Res<T = any> { status: number; body: T }

/** HTTP client with a cookie jar, as a browser would have. */
export function client(ctx: TestContext) {
  const jar = new Map<string, string>()
  const call = async <T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> => {
    const res = await ctx.app.request(path, {
      method,
      headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';')
      const i = pair.indexOf('=')
      const k = pair.slice(0, i), v = pair.slice(i + 1)
      if (v) jar.set(k, v); else jar.delete(k)
    }
    const text = await res.text()
    let parsed: unknown = text
    try { parsed = text ? JSON.parse(text) : null } catch { /* not json */ }
    return { status: res.status, body: parsed as T }
  }
  return {
    get: <T = any>(p: string) => call<T>('GET', p),
    post: <T = any>(p: string, b?: unknown, h?: Record<string, string>) => call<T>('POST', p, b ?? {}, h),
    patch: <T = any>(p: string, b: unknown) => call<T>('PATCH', p, b),
    put: <T = any>(p: string, b: unknown) => call<T>('PUT', p, b),
    del: <T = any>(p: string) => call<T>('DELETE', p),
    jar,
  }
}
export type Client = ReturnType<typeof client>

export async function lastMail(ctx: TestContext, to: string, kind: string) {
  const rows = await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.to, to)).orderBy(desc(mailOutbox.createdAt))
  const m = rows.find(r => r.kind === kind)
  if (!m?.url) throw new Error(`No ${kind} mail for ${to}`)
  return m
}

/** Sign up, follow the emailed verification link, and sign in — the full real flow. */
export async function signUp(ctx: TestContext, email: string, name = email.split('@')[0]) {
  const c = client(ctx)
  const r = await c.post('/api/auth/sign-up/email', { email, password: PASSWORD, name })
  if (r.status !== 200) throw new Error(`sign-up failed ${r.status} ${JSON.stringify(r.body)}`)
  const mail = await lastMail(ctx, email, 'verify')
  const u = new URL(mail.url!)
  await c.get(u.pathname + u.search)
  const s = await c.post('/api/auth/sign-in/email', { email, password: PASSWORD })
  if (s.status !== 200) throw new Error(`sign-in failed ${s.status} ${JSON.stringify(s.body)}`)
  return c
}

export async function createWorkspace(c: Client, name: string) {
  const r = await c.post('/api/workspaces', { name })
  if (r.status !== 201) throw new Error(`workspace failed ${r.status} ${JSON.stringify(r.body)}`)
  return r.body.id as string
}

/** Invite `email` into `wid` as `role` and accept with the given (signed-up) client. */
export async function addMember(ctx: TestContext, admin: Client, wid: string, member: Client, email: string, role: string) {
  const inv = await admin.post(`/api/w/${wid}/invitations`, { email, role })
  if (inv.status !== 201) throw new Error(`invite failed ${inv.status} ${JSON.stringify(inv.body)}`)
  const token = new URL((await lastMail(ctx, email, 'invite')).url!).pathname.split('/').pop()!
  const acc = await member.post(`/api/invitations/${token}/accept`)
  if (acc.status !== 200) throw new Error(`accept failed ${acc.status} ${JSON.stringify(acc.body)}`)
}

/** Reads a server-sent-event response into its events. */
export async function sse(ctx: TestContext, c: Client, path: string, body: unknown) {
  const res = await ctx.app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: JSON.stringify(body) })
  if (res.status !== 200) return { status: res.status, events: [] as { event: string; data: any }[], body: await res.json() }
  const text = await res.text()
  const events = text.split('\n\n').filter(Boolean).map(chunk => {
    const ev = /event: (.+)/.exec(chunk)?.[1] ?? 'message'
    const data = /data: (.+)/.exec(chunk)?.[1]
    return { event: ev, data: data ? JSON.parse(data) : null }
  })
  return { status: 200, events, body: null }
}
