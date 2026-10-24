// HTTP-level security controls: CSRF origin checks, body limits, error disclosure, headers, CORS, request ids,
// session cookies and revocation, auth rate limiting, client-IP handling, redirect safety and log redaction.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { client, createTestContext, createWorkspace, lastMail, ORIGIN, PASSWORD, signUp, type Client, type TestContext } from './helpers'
import { clientIp } from '../server/net'
import { errorFields } from '../server/log'
import { safeNext } from '../shared/url'

let ctx: TestContext
let owner: Client
let w: string

beforeAll(async () => {
  ctx = await createTestContext()
  owner = await signUp(ctx, 'sec@sec.test', 'Sam Secure')
  w = await createWorkspace(owner, 'Secure Co')
})
afterAll(async () => { await ctx.close() })

const cookieOf = (c: Client) => [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ')

describe('request forgery and abuse', () => {
  test('state-changing requests from another origin are refused (CSRF defence in depth)', async () => {
    const send = (headers: Record<string, string>) => ctx.app.request(`/api/w/${w}/stakeholders`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieOf(owner), ...headers }, body: JSON.stringify({ name: 'CSRF' }) })
    expect((await send({ origin: 'https://evil.example' })).status).toBe(403)
    expect((await send({ 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await send({ origin: ORIGIN })).status).toBe(201)
    expect((await send({ 'sec-fetch-site': 'same-origin' })).status).toBe(201)
    // Reads aren't blocked, and webhooks (signature-authenticated) aren't origin-checked.
    expect((await ctx.app.request(`/api/w/${w}/stakeholders`, { headers: { cookie: cookieOf(owner), origin: 'https://evil.example' } })).status).toBe(200)
    expect((await ctx.app.request('/api/billing/webhooks/simulator', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status).toBe(400)
  })
  test('oversized bodies are rejected before parsing', async () => {
    const r = await ctx.app.request(`/api/w/${w}/stakeholders`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: cookieOf(owner) }, body: JSON.stringify({ name: 'x', notes: 'a'.repeat(600_000) }) })
    expect(r.status).toBe(413)
  })
  test('malformed JSON and invalid input get structured 4xx errors, never stack traces', async () => {
    const bad = await ctx.app.request(`/api/w/${w}/stakeholders`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, cookie: cookieOf(owner) }, body: '{not json' })
    expect(bad.status).toBe(400)
    const body = await bad.text()
    expect(body).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/)
    const invalid = await owner.post(`/api/w/${w}/stakeholders`, { name: '', influence: 99 })
    expect(invalid.status).toBe(422)
    expect(Object.keys(invalid.body.error.fields).length).toBeGreaterThan(0)
  })
  test('SQL metacharacters are treated as data', async () => {
    const name = "Robert'); DROP TABLE stakeholder;--"
    expect((await owner.post(`/api/w/${w}/stakeholders`, { name })).status).toBe(201)
    const found = await owner.get(`/api/w/${w}/search?q=${encodeURIComponent("'; select * from \"user\"--")}`)
    expect(found.status).toBe(200)
    expect((await owner.get(`/api/w/${w}/stakeholders?q=${encodeURIComponent('Robert')}`)).body.items[0].name).toBe(name)
    // Unknown sort keys fall back to the allow-listed default; the value never reaches SQL.
    expect((await owner.get(`/api/w/${w}/stakeholders?sort=name;drop`)).status).toBe(200)
  })
})

describe('headers and transport', () => {
  test('security headers on every response; no CORS for foreign origins; request ids', async () => {
    const r = await ctx.app.request('/api/health', { headers: { origin: 'https://evil.example', 'x-request-id': 'abcdef12-test' } })
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(r.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expect(r.headers.get('x-request-id')).toBe('abcdef12-test')
    const minted = await ctx.app.request('/api/health', { headers: { 'x-request-id': 'bad id with spaces' } })
    expect(minted.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })
  test('readiness reports database and job-queue health', async () => {
    const r = await ctx.app.request('/api/ready')
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, db: { ok: true }, jobs: { lagging: false } })
  })
})

describe('sessions', () => {
  test('session cookie is HttpOnly and SameSite=Lax', async () => {
    const res = await ctx.app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'sec@sec.test', password: PASSWORD }) })
    const set = res.headers.getSetCookie().find(c => /session_token=/.test(c))!
    expect(set).toMatch(/HttpOnly/i)
    expect(set).toMatch(/SameSite=Lax/i)
  })
  test('password reset signs out every existing session', async () => {
    const victim = await signUp(ctx, 'reset@sec.test', 'Rita Reset')
    expect((await victim.get('/api/me')).status).toBe(200)
    await client(ctx).post('/api/auth/request-password-reset', { email: 'reset@sec.test', redirectTo: '/reset-password' })
    const token = new URL((await lastMail(ctx, 'reset@sec.test', 'reset')).url!).pathname.split('/').pop()!
    const r = await client(ctx).post('/api/auth/reset-password', { newPassword: 'another-strong-password', token })
    expect(r.status).toBe(200)
    expect((await victim.get('/api/me')).status).toBe(401)
  })
  test('unverified accounts can’t create or join workspaces', async () => {
    const c = client(ctx)
    await c.post('/api/auth/sign-up/email', { email: 'unverified@sec.test', password: PASSWORD, name: 'Una Verified' })
    // Sign-in is refused until the address is verified, so there is no session to use.
    const s = await c.post('/api/auth/sign-in/email', { email: 'unverified@sec.test', password: PASSWORD })
    expect(s.status).not.toBe(200)
    expect((await c.post('/api/workspaces', { name: 'Nope' })).status).toBe(401)
  })
})

describe('production configuration', () => {
  let prod: TestContext
  beforeAll(async () => {
    prod = await createTestContext({ env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://unused/x', AUTH_SECRET: 'x'.repeat(40), BILLING_PROVIDER: 'none', REQUIRE_EMAIL_VERIFICATION: 'false' } })
  })
  afterAll(async () => { await prod.close() })
  test('CSP and HSTS are sent; cookies are Secure; the simulator and dev routes don’t exist', async () => {
    const r = await prod.app.request('/api/health')
    expect(r.headers.get('content-security-policy')).toMatch(/default-src 'self'.*frame-ancestors 'none'/)
    expect(r.headers.get('strict-transport-security')).toMatch(/max-age=\d+/)
    const s = await prod.app.request('/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'p@prod.test', password: PASSWORD, name: 'Pat Prod' }) })
    expect(s.headers.getSetCookie().find(c => /session_token=/.test(c))).toMatch(/Secure/)
    expect((await prod.app.request('/api/dev/mail')).status).toBe(404)
    expect((await prod.app.request('/api/dev/email-preview/verify')).status).toBe(404)
    expect((await prod.app.request('/api/billing/simulator/checkout/x')).status).toBe(404)
  })
  test('sign-in is rate limited per client, and a forged X-Forwarded-For can’t rotate identities', async () => {
    const attempt = (xff: string) => prod.app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': xff }, body: JSON.stringify({ email: 'p@prod.test', password: 'wrong-password-123' }) })
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await attempt(`10.0.0.${i}, 203.0.113.7`)).status)
    expect(statuses.filter(s => s === 429).length).toBeGreaterThan(0)
  })
})

describe('helpers', () => {
  test('client IP uses the trusted right-most hop or the platform header, never the forgeable left-most entry', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' })
    expect(clientIp(h, {})).toBe('203.0.113.7')
    expect(clientIp(h, { hops: 2 })).toBe('6.6.6.6')
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.9', 'x-forwarded-for': '6.6.6.6' }), { header: 'x-real-ip' })).toBe('198.51.100.9')
    expect(clientIp(new Headers(), {})).toBe('local')
  })
  test('redirect targets are same-site paths only', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', null, '/\u0000x']) expect(safeNext(bad)).toBe('/')
    expect(safeNext('/invite/abc?x=1#y')).toBe('/invite/abc?x=1#y')
  })
  test('logged database errors drop SQL parameters (record content)', () => {
    const err = Object.assign(new Error('Failed query: insert into "stakeholder" ("name") values ($1)\nparams: Aurelia Vance'), { cause: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    const f = errorFields(err)
    expect(JSON.stringify(f)).not.toContain('Aurelia')
    expect(f.errCode).toBe('23505')
  })
})

describe('metrics endpoint', () => {
  test('disabled without a token; requires the bearer token; exposes counts only', async () => {
    expect((await ctx.app.request('/api/metrics')).status).toBe(404)
    const m = await createTestContext({ env: { METRICS_TOKEN: 'metrics-secret-123' } })
    try {
      expect((await m.app.request('/api/metrics')).status).toBe(401)
      expect((await m.app.request('/api/metrics', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
      await m.app.request('/api/health')
      const r = await m.app.request('/api/metrics', { headers: { authorization: 'Bearer metrics-secret-123' } })
      const body = await r.text()
      expect(r.status).toBe(200)
      for (const k of ['meridian_http_requests_total', 'meridian_db_up 1', 'meridian_jobs_dead', 'meridian_billing_events_unprocessed', 'meridian_email_failed_24h', 'meridian_ai_cost_micros_24h']) expect(body).toContain(k)
      expect(body).not.toMatch(/@|workspace_id|[0-9a-f]{8}-[0-9a-f]{4}-/)
    } finally { await m.close() }
  })
})
