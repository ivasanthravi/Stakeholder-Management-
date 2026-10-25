// Local staging rehearsal: the closest thing to a staging deployment this machine can run without a hosting account.
//  - Artifact: runtime-only install + production build (what a container or platform build runs).
//  - Database: real PostgreSQL. The app connects as a NON-superuser owner role with only CREATEROLE, the privilege
//    level managed providers grant (verifies the RLS role migration and least-privilege operation).
//  - Edge: an HTTPS reverse proxy with a locally generated certificate in front of the app (one trusted hop, like a
//    platform load balancer), plus an HTTP listener that redirects to HTTPS (platform behaviour, emulated).
//  - App: NODE_ENV=production, DEPLOY_ENV=staging, log mail transport (outbox read from the database), no billing
//    provider (the sandbox is BLOCKED), rules-engine AI.
// Then: smoke, TLS/redirect/cookie/CORS/metrics checks, database privilege checks, the full E2E suite, the axe sweep,
// the scripted accessibility checks, db:check, and a restart (migrations idempotent).
// Usage: npx tsx scripts/staging-rehearsal.ts [--skip-build=<dir>]   Evidence: docs/launch/evidence/staging-rehearsal-<date>.json
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'
import tls from 'node:tls'
import pg from 'pg'

const root = mkdtempSync(path.join(tmpdir(), 'meridian-staging-'))
const appDir = process.cwd()
const PG_PORT = 5611, APP_PORT = 8796, TLS_PORT = 8443, HTTP_PORT = 8081
const ORIGIN = `https://localhost:${TLS_PORT}`
const ADMIN = `postgres://postgres_admin:staging-admin-only@localhost:${PG_PORT}`
const ownerPassword = randomBytes(18).toString('base64url')
const DB = `postgres://meridian_owner:${ownerPassword}@localhost:${PG_PORT}/meridian`
const metricsToken = randomBytes(24).toString('base64url')
const results: { step: string; ok: boolean; detail?: string }[] = []
const report: Record<string, unknown> = { ranAt: new Date().toISOString(), origin: ORIGIN, deviationsFromProduction: ['DEPLOY_ENV=staging (log mail transport, no billing provider)', 'AUTH_RATE_LIMIT_PER_10S=60 (one shared test-runner IP)', 'self-signed certificate (local CA)'] }
// Evidence is committed: never let a cookie, token or password from a tool's output into it.
const redact = (t?: string) => t?.replace(/(session_token|token|password)=[^;\s'",&]+/gi, '$1=…')
const step = (name: string, ok: boolean, raw?: string) => { const detail = redact(raw); results.push({ step: name, ok, detail }); console.info(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const sh = (cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}
// Child processes that talk to the edge must not block this process's event loop: the HTTPS proxy runs here.
const run = (cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) => new Promise<{ ok: boolean; out: string }>(resolve => {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout?.on('data', d => { out += d }); child.stderr?.on('data', d => { out += d })
  child.on('close', code => resolve({ ok: code === 0, out }))
})
const must = (r: { ok: boolean; out: string }, what: string) => { if (!r.ok) throw new Error(`${what} failed:\n${r.out.slice(-2500)}`); return r }

const stagingEnv: Record<string, string> = {
  NODE_ENV: 'production', DEPLOY_ENV: 'staging', PORT: String(APP_PORT), APP_URL: ORIGIN, DATABASE_URL: DB,
  AUTH_SECRET: randomBytes(48).toString('base64url'), MAIL_TRANSPORT: 'log', BILLING_PROVIDER: 'none', AI_ENGINE: 'local',
  REQUIRE_EMAIL_VERIFICATION: 'true', JOBS_ENABLED: 'true', TRUSTED_PROXY_HOPS: '1', TRUSTED_PROXIES: '127.0.0.1,::1',
  METRICS_TOKEN: metricsToken, LOG_FORMAT: 'json', EXPORT_DIR: path.join(root, 'exports'),
  // The only deviation from production defaults: every E2E browser shares one client IP here, so the per-IP sign-in
  // limit (3 per 10 s) is raised for the synthetic test runner. The production limit is asserted in security.test.ts.
  AUTH_RATE_LIMIT_PER_10S: '60',
}

function buildArtifact() {
  const reuse = process.argv.find(a => a.startsWith('--skip-build='))?.split('=')[1]
  if (reuse) return reuse
  const dir = path.join(root, 'release')
  cpSync(appDir, dir, { recursive: true, filter: s => !/\/(node_modules|\.data|scratch|test-results|playwright-report|dist)(\/|$)/.test(s) })
  must(sh('npm', ['ci', '--no-audit', '--no-fund'], dir), 'npm ci')
  must(sh('npm', ['run', 'build'], dir), 'build')
  rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true })
  must(sh('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], dir), 'runtime install')
  return dir
}

let appLog = ''
async function startApp(dir: string): Promise<ChildProcess> {
  const child = spawn('npm', ['start'], { cwd: dir, env: { ...process.env, ...stagingEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.on('data', d => { appLog += d }); child.stderr?.on('data', d => { appLog += d })
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(`http://localhost:${APP_PORT}/api/health`)).ok) return child } catch { /* booting */ }
    if (child.exitCode !== null) throw new Error(`app exited: ${appLog.slice(-2000)}`)
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`app didn't become healthy: ${appLog.slice(-2000)}`)
}
async function stopApp(child: ChildProcess) { child.kill('SIGTERM'); for (let i = 0; i < 50 && child.exitCode === null; i++) await new Promise(r => setTimeout(r, 100)) }

/** The edge: TLS termination + one X-Forwarded-For hop, as a platform load balancer would add. */
function startEdge(cert: string, key: string) {
  const proxy = https.createServer({ cert, key }, (req, res) => {
    const xff = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ')
    const up = http.request({ host: '127.0.0.1', port: APP_PORT, method: req.method, path: req.url, headers: { ...req.headers, 'x-forwarded-for': xff, 'x-forwarded-proto': 'https' } }, r => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) })
    up.on('error', () => { res.writeHead(502); res.end() })
    req.pipe(up)
  }).listen(TLS_PORT)
  const redirect = http.createServer((req, res) => { res.writeHead(301, { location: `${ORIGIN}${req.url}` }); res.end() }).listen(HTTP_PORT)
  return () => { proxy.close(); redirect.close() }
}

const certOk = (ca: string) => new Promise<{ authorized: boolean; error?: string; validTo?: string }>(resolve => {
  const s = tls.connect({ host: 'localhost', port: TLS_PORT, ca, servername: 'localhost' }, () => { resolve({ authorized: s.authorized, validTo: s.getPeerCertificate().valid_to }); s.end() })
  s.on('error', e => resolve({ authorized: false, error: e.message }))
})


const db = new EmbeddedPostgres({ databaseDir: path.join(root, 'pg'), user: 'postgres_admin', password: 'staging-admin-only', port: PG_PORT, persistent: false, onLog: () => {}, onError: () => {} })
let app: ChildProcess | null = null
let stopEdge = () => {}
try {
  const t0 = performance.now()
  const dir = buildArtifact()
  report.buildMs = Math.round(performance.now() - t0)

  // Certificate for the edge (local only; a real staging uses the platform's managed certificate).
  const certPath = path.join(root, 'cert.pem'), keyPath = path.join(root, 'key.pem')
  must(sh('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], root), 'certificate')
  const cert = readFileSync(certPath, 'utf8'), key = readFileSync(keyPath, 'utf8')

  // Database with a managed-provider-like owner role: login, CREATEROLE, not a superuser, no BYPASSRLS.
  await db.initialise(); await db.start()
  { const c = new pg.Client({ connectionString: `${ADMIN}/postgres` }); await c.connect()
    await c.query(`create role meridian_owner login password '${ownerPassword}' createrole nosuperuser nobypassrls`)
    await c.query('create database meridian owner meridian_owner'); await c.end() }
  // Synthetic sample data for the smoke account and the audit scripts (seeding runs in development mode by design).
  must(sh('npx', ['tsx', 'server/db/seed.ts'], appDir, { DATABASE_URL: DB, NODE_ENV: 'development', SEED_PEOPLE: '184' }), 'seed')

  let s0 = performance.now()
  app = await startApp(dir)
  report.startMs = Math.round(performance.now() - s0)
  stopEdge = startEdge(cert, key)
  const caEnv = { NODE_EXTRA_CA_CERTS: certPath }

  // ── Edge, TLS, headers, cookies, CORS ──
  const c = await certOk(cert)
  step('TLS certificate valid for localhost (trusted with the local CA)', c.authorized, c.error ?? `valid to ${c.validTo}`)
  const redirect = await fetch(`http://localhost:${HTTP_PORT}/pricing?x=1`, { redirect: 'manual' })
  step('HTTP redirects to HTTPS with path preserved (edge)', redirect.status === 301 && redirect.headers.get('location') === `${ORIGIN}/pricing?x=1`)
  const smoke = await run('npx', ['tsx', 'scripts/smoke.ts'], appDir, { ...caEnv, BASE_URL: ORIGIN, SMOKE_EXPECT_ENV: 'staging', SMOKE_EMAIL: 'tom@sample.meridian.test', SMOKE_PASSWORD: 'meridian-sample-2026' })
  const sm = /(\d+)\/(\d+) smoke checks passed/.exec(smoke.out)
  step('smoke test over HTTPS (incl. sign-in, environment = staging)', smoke.ok, sm ? `${sm[1]}/${sm[2]}` : smoke.out.slice(-600))
  report.smoke = smoke.out.split('\n').filter(l => /^(ok|FAIL)/.test(l))

  // Node fetch with the local CA (child process env doesn't apply here, so use https.request directly).
  const req = (p: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const r = https.request({ host: 'localhost', port: TLS_PORT, path: p, method: init.method ?? 'GET', headers: init.headers, ca: cert }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: b })) })
    r.on('error', reject); if (init.body) r.write(init.body); r.end()
  })
  const signIn = await req('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'tom@sample.meridian.test', password: 'meridian-sample-2026' }) })
  const cookie = (signIn.headers['set-cookie'] ?? []).find(x => /session_token=/.test(x)) ?? ''
  step('session cookie: __Secure- prefix, Secure, HttpOnly, SameSite=Lax', /^__Secure-/.test(cookie) && /;\s*Secure/i.test(cookie) && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie), cookie.replace(/=[^;]+/, '=…').slice(0, 140))
  const health = await req('/api/health')
  step('HSTS + CSP sent over HTTPS', /max-age=\d+/.test(String(health.headers['strict-transport-security'])) && /frame-ancestors 'none'/.test(String(health.headers['content-security-policy'])))
  const pre = await req('/api/me', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } })
  step('CORS: no Access-Control-Allow-Origin for a foreign origin', !pre.headers['access-control-allow-origin'], `status ${pre.status}`)
  const csrf = await req('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: cookie.split(';')[0] }, body: '{"name":"x"}' })
  step('cross-site state change refused (CSRF)', csrf.status === 403, `status ${csrf.status}`)
  const callback = await req('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'tom@sample.meridian.test', password: 'meridian-sample-2026', callbackURL: 'https://evil.example/steal' }) })
  step('auth callback to a foreign origin refused', callback.status >= 400, `status ${callback.status}`)
  const m0 = await req('/api/metrics'), m1 = await req('/api/metrics', { headers: { authorization: `Bearer ${metricsToken}` } })
  step('metrics: refused without token, served with it', m0.status === 401 && m1.status === 200 && m1.body.includes('meridian_db_up 1'), `${m0.status}/${m1.status}`)
  step('dev routes absent', (await req('/api/dev/mail')).status === 404)
  step('canonical origin: index served with app shell at /', (await req('/')).body.includes('<div id="root">'))
  step('a forged left-most X-Forwarded-For value is never recorded as the client IP', await (async () => {
    await req('/api/health', { headers: { 'x-forwarded-for': '6.6.6.6' } })
    return !appLog.includes('6.6.6.6') || /"ip":"(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)"/.test(appLog)
  })())

  // ── Database privileges ──
  { const q = new pg.Client({ connectionString: DB }); await q.connect()
    const r = await q.query(`select current_user, r.rolsuper, r.rolbypassrls, r.rolcreaterole, exists(select 1 from pg_roles where rolname = 'app_user') as app_user,
      (select count(*)::int from pg_tables where schemaname = 'public' and rowsecurity) as rls_tables,
      (select count(*)::int from pg_tables where schemaname = 'public') as tables from pg_roles r where r.rolname = current_user`)
    const row = r.rows[0]; await q.end()
    report.database = row
    step('app connects as a non-superuser without BYPASSRLS; migrations created app_user', !row.rolsuper && !row.rolbypassrls && row.app_user, `${row.current_user}: superuser=${row.rolsuper}, bypassrls=${row.rolbypassrls}, RLS on ${row.rls_tables}/${row.tables} tables`)
  }

  // ── Full E2E suite against the deployment ──
  const e2e = await run('npx', ['playwright', 'test', '--reporter=list'], appDir, { E2E_BASE_URL: ORIGIN, E2E_DB_URL: DB })
  const passed = /(\d+) passed/.exec(e2e.out)?.[1], failed = /(\d+) failed/.exec(e2e.out)?.[1], skipped = /(\d+) skipped/.exec(e2e.out)?.[1]
  step('E2E suite against staging', e2e.ok, `${passed ?? 0} passed, ${failed ?? 0} failed, ${skipped ?? 0} skipped`)
  report.e2e = e2e.out.split('\n').filter(l => /^\s+(✓|✘|-)\s/.test(l)).map(l => l.trim())
  if (!e2e.ok) report.e2eFailures = e2e.out.split('\n').filter(l => /Error:|Expected|Received/.test(l)).slice(0, 30)

  // ── Content Security Policy: no violations on key pages under the real production policy ──
  { const { chromium } = await import('@playwright/test')
    const browser = await chromium.launch({ channel: 'chrome' })
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
    const page = await ctx.newPage()
    const violations: string[] = []
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text().slice(0, 200)) })
    const visit = async (p: string) => { await page.goto(ORIGIN + p); await page.waitForLoadState('networkidle') }
    for (const p of ['/', '/pricing', '/ai', '/security', '/sign-in', '/sign-up']) await visit(p)
    await visit('/sign-in')
    await page.getByLabel('Email').fill('tom@sample.meridian.test'); await page.getByLabel('Password').fill('meridian-sample-2026')
    await page.getByRole('button', { name: 'Sign in' }).click(); await page.waitForURL(u => !u.pathname.startsWith('/sign-in'))
    for (const p of ['/', '/stakeholders', '/stakeholders?view=map', '/engagements', '/decisions', '/commitments', '/initiatives', '/settings/billing']) await visit(p)
    await browser.close()
    step('no Content Security Policy violations (public and signed-in pages, production CSP)', violations.length === 0, violations.slice(0, 3).join(' | ') || '14 pages')
  }

  // ── Accessibility against the production build ──
  const axe = await run('node', ['audit/phase1-qa.mjs', ORIGIN, path.join(root, 'qa')], appDir, { AUDIT_SELF_SIGNED: '1' })
  const axeLine = /(\d+) views checked; (\d+) clean/.exec(axe.out)
  step('axe sweep (production build)', !!axeLine && axeLine[1] === axeLine[2], axeLine ? `${axeLine[2]}/${axeLine[1]} clean` : axe.out.slice(-400))
  report.axeIssues = axe.out.split('\n').filter(l => /^(desktop|mobile|[a-z]+)\/|^\s+(axe|console|horizontal)/.test(l)).slice(0, 40)
  const a11y = await run('node', ['audit/a11y-manual.mjs', ORIGIN, path.join(root, 'a11y.json')], appDir, { AUDIT_SELF_SIGNED: '1' })
  const a11yLine = /(\d+)\/(\d+) checks passed/.exec(a11y.out)
  step('scripted keyboard/focus/reflow/target-size checks (production build)', a11y.ok, a11yLine ? `${a11yLine[1]}/${a11yLine[2]}` : a11y.out.slice(-400))
  if (!a11y.ok) report.a11yFailures = a11y.out.split('\n').filter(l => l.startsWith('FAIL'))

  // ── Data integrity after all journeys, then a restart ──
  const check = await run('npx', ['tsx', 'server/db/check.ts'], appDir, { DATABASE_URL: DB, NODE_ENV: 'development' })
  step('db:check after the journeys', check.ok, check.out.split('\n').filter(l => /FAIL|checks/.test(l)).slice(0, 5).join(' | '))
  await stopApp(app)
  s0 = performance.now(); app = await startApp(dir)
  step('restart: migrations idempotent, healthy again', true, `${Math.round(performance.now() - s0)} ms`)
  const ready = await req('/api/ready')
  step('readiness after restart', ready.status === 200, ready.body.slice(0, 160))
  step('no internal errors logged during the rehearsal', !/"level":"error"/.test(appLog), (appLog.match(/"level":"error"[^\n]*/g) ?? []).slice(0, 3).join(' | ').slice(0, 600))
  step('no record content or secrets in logs', !appLog.includes(ownerPassword) && !appLog.includes(metricsToken) && !/meridian-sample-2026/.test(appLog))
} catch (e) { step('rehearsal aborted', false, (e as Error).message.slice(0, 2500)) } finally {
  stopEdge()
  if (app) await stopApp(app)
  await db.stop().catch(() => {})
  rmSync(root, { recursive: true, force: true })
}
const ok = results.every(r => r.ok)
const out = path.resolve(appDir, `../docs/launch/evidence/staging-rehearsal-${new Date().toISOString().slice(0, 10)}.json`)
writeFileSync(out, JSON.stringify({ verdict: ok ? 'STAGING REHEARSAL PASSED (local)' : 'FAILED', ...report, results }, null, 2))
console.info(`\n${results.filter(r => r.ok).length}/${results.length} steps passed → ${out}`)
process.exit(ok ? 0 : 1)
