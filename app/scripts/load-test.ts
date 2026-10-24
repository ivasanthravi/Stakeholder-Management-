// Local load & reliability test. Real PostgreSQL (embedded-postgres), the real API server process, real HTTP.
// Not a substitute for staging: one machine runs the database, the server and the load generator, and the embedded
// Postgres build is x86_64 under Rosetta on Apple silicon — treat numbers as a relative baseline, not capacity.
// Usage: npx tsx scripts/load-test.ts [--people=2000] [--seconds=20] [--vus=25]
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { signSimulator } from '../server/billing/simulator'

const arg = (k: string, d: number) => Number(process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d)
const PEOPLE = arg('people', 2000), SECONDS = arg('seconds', 20), VUS = arg('vus', 25)
const PG_PORT = 5571, API_PORT = 8791, BASE = `http://localhost:${API_PORT}`, ORIGIN = 'http://localhost:5173'
const dir = mkdtempSync(path.join(tmpdir(), 'meridian-load-'))
const DB_URL = `postgres://meridian:load-only@localhost:${PG_PORT}/meridian`
const results: Record<string, unknown> = { conditions: { people: PEOPLE, seconds: SECONDS, virtualUsers: VUS, machine: 'Apple M4, 10 cores, 16 GB; server, Postgres and load generator on one machine', postgres: '18.4 x86_64 (Rosetta)', pool: 10 } }

// ── Infrastructure ───────────────────────────────────────────────────────────
const db = new EmbeddedPostgres({ databaseDir: dir, user: 'meridian', password: 'load-only', port: PG_PORT, persistent: false, onLog: () => {}, onError: () => {} })
await db.initialise(); await db.start()
{ const c = new pg.Client({ connectionString: DB_URL.replace(/\/meridian$/, '/postgres') }); await c.connect(); await c.query('create database meridian'); await c.end() }
let t0 = performance.now()
const seed = spawnSync('npx', ['tsx', 'server/db/seed.ts'], { env: { ...process.env, DATABASE_URL: DB_URL, NODE_ENV: 'development', SEED_PEOPLE: String(PEOPLE) }, encoding: 'utf8' })
if (seed.status !== 0) { console.error(seed.stderr); process.exit(1) }
results.seedMs = Math.round(performance.now() - t0)

const server: ChildProcess = spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, DATABASE_URL: DB_URL, NODE_ENV: 'development', API_PORT: String(API_PORT), APP_URL: ORIGIN, REQUIRE_EMAIL_VERIFICATION: 'false', API_RATE_LIMIT_PER_MINUTE: '1000000', BILLING_PROVIDER: 'simulator', JOBS_ENABLED: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] })
server.stdout?.on('data', () => {}); server.stderr?.on('data', () => {})
for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)) }
const rss = () => { const r = spawnSync('ps', ['-o', 'rss=', '-p', String(server.pid)], { encoding: 'utf8' }); return Math.round(Number(r.stdout.trim()) / 1024) }

// ── Measurement helpers ──────────────────────────────────────────────────────
interface Stat { n: number; errors: number; lat: number[]; codes: Record<number, number> }
const stats: Record<string, Stat> = {}
async function hit(name: string, url: string, init: RequestInit = {}, okCodes = [200, 201]) {
  const s = (stats[name] ??= { n: 0, errors: 0, lat: [], codes: {} })
  const a = performance.now()
  try {
    const r = await fetch(BASE + url, { ...init, headers: { origin: ORIGIN, ...(init.headers ?? {}) } })
    await r.arrayBuffer()
    s.codes[r.status] = (s.codes[r.status] ?? 0) + 1
    if (!okCodes.includes(r.status)) s.errors++
    return r
  } catch { s.errors++; return null } finally { s.n++; s.lat.push(performance.now() - a) }
}
const q = (xs: number[], p: number) => { if (!xs.length) return 0; const a = [...xs].sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor(p * a.length))]) }
const summarize = (names?: string[]) => Object.fromEntries(Object.entries(stats).filter(([k]) => !names || names.includes(k)).map(([k, s]) => [k, { requests: s.n, errors: s.errors, errorRate: +(s.errors / Math.max(1, s.n) * 100).toFixed(2), p50: q(s.lat, 0.5), p95: q(s.lat, 0.95), p99: q(s.lat, 0.99), codes: s.codes }]))

async function signIn(email: string) {
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email, password: 'meridian-sample-2026' }) })
  return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
}
const sample = ['rhea', 'tom', 'mei', 'daniel', 'sara']
const cookies = await Promise.all(sample.map(n => signIn(`${n}@sample.meridian.test`)))
const me = await (await fetch(`${BASE}/api/me`, { headers: { cookie: cookies[0] } })).json() as { workspaces: { id: string }[] }
const W = me.workspaces[0].id
const lookups = await (await fetch(`${BASE}/api/w/${W}/lookups`, { headers: { cookie: cookies[0] } })).json() as { initiatives: { id: string }[]; stakeholders?: { id: string }[] }
const people = (await (await fetch(`${BASE}/api/w/${W}/stakeholders?limit=200`, { headers: { cookie: cookies[0] } })).json() as { items: { id: string; name: string }[]; total: number })
results.dataset = { stakeholders: people.total, initiatives: lookups.initiatives.length }
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

async function runFor(seconds: number, vus: number, step: (vu: number) => Promise<void>) {
  const end = Date.now() + seconds * 1000
  let done = 0
  await Promise.all(Array.from({ length: vus }, async (_, vu) => { while (Date.now() < end) { await step(vu); done++ } }))
  return Math.round(done / seconds)
}

// ── Scenario 1: concurrent sign-ups + workspace creation ────────────────────
t0 = performance.now()
await Promise.all(Array.from({ length: 50 }, async (_, i) => {
  const email = `load${i}.${Date.now()}@load.test`
  const r = await hit('signup', '/api/auth/sign-up/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'load-test-password', name: `Load ${i}` }) })
  const c = r?.headers.getSetCookie().map(x => x.split(';')[0]).join('; ') ?? ''
  await hit('workspace_create', '/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json', cookie: c }, body: JSON.stringify({ name: `Load workspace ${i}`, template: 'technology' }) })
}))
results.signups = { wallMs: Math.round(performance.now() - t0), ...summarize(['signup', 'workspace_create']) }

// ── Scenario 2: mixed workspace activity (reads 85% / writes 15%) on a large directory ──
const rssBefore = rss()
const conn = new pg.Client({ connectionString: DB_URL }); await conn.connect()
let maxConns = 0
const sampler = setInterval(async () => { try { const r = await conn.query(`select count(*)::int n from pg_stat_activity where datname = 'meridian'`); maxConns = Math.max(maxConns, r.rows[0].n) } catch { /* ignore */ } }, 250)
const mixedRps = await runFor(SECONDS, VUS, async vu => {
  const cookie = cookies[vu % cookies.length]
  const h = { cookie }
  const r = Math.random()
  if (r < 0.15) await hit('dashboard', `/api/w/${W}/dashboard`, { headers: h })
  else if (r < 0.35) await hit('directory_page', `/api/w/${W}/stakeholders?limit=100&offset=${Math.floor(Math.random() * Math.max(1, people.total - 100))}&sort=influence`, { headers: h })
  else if (r < 0.45) await hit('directory_filter', `/api/w/${W}/stakeholders?limit=100&stance=concerned,opposed&minInfluence=3`, { headers: h })
  else if (r < 0.6) await hit('search', `/api/w/${W}/search?q=${encodeURIComponent(pick(people.items).name.split(' ')[0].slice(0, 3))}`, { headers: h })
  else if (r < 0.7) await hit('profile_overview', `/api/w/${W}/stakeholders/${pick(people.items).id}/overview`, { headers: h })
  else if (r < 0.78) await hit('graph', `/api/w/${W}/graph?initiativeId=${pick(lookups.initiatives).id}`, { headers: h })
  else if (r < 0.85) await hit('commitments_list', `/api/w/${W}/commitments?limit=50&overdue=true`, { headers: h })
  else if (r < 0.93) await hit('engagement_create', `/api/w/${W}/engagements`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'call', title: `Load call ${vu}`, occurredAt: new Date().toISOString(), participantIds: [pick(people.items).id] }) }, [201, 403])
  else await hit('commitment_create', `/api/w/${W}/commitments`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Load follow-up ${vu}`, stakeholderId: pick(people.items).id, dueDate: '2026-12-01' }) }, [201, 403])
})
clearInterval(sampler)
results.mixed = { throughputRps: mixedRps, maxDbConnections: maxConns, rssMBBefore: rssBefore, rssMBAfter: rss(), endpoints: summarize(['dashboard', 'directory_page', 'directory_filter', 'search', 'profile_overview', 'graph', 'commitments_list', 'engagement_create', 'commitment_create']) }

// ── Scenario 3: AI burst (rules engine: briefings + copilot SSE) ─────────────
t0 = performance.now()
await Promise.all(Array.from({ length: 40 }, async (_, i) => {
  const cookie = cookies[i % cookies.length]
  if (i % 2) await hit('ai_briefing', `/api/w/${W}/ai/briefings/stakeholders/${pick(people.items).id}?mode=prep`, { headers: { cookie } }, [200, 429])
  else await hit('ai_copilot', `/api/w/${W}/ai/copilot`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Which commitments are overdue?' }) }, [200, 429])
}))
results.aiBurst = { wallMs: Math.round(performance.now() - t0), note: 'Per-user AI rate limit (20/min) applies; 429s are expected and correct', ...summarize(['ai_briefing', 'ai_copilot']) }

// ── Scenario 4: billing webhook burst (signed, with 20% duplicates) → queue drain ──
const subRow = await conn.query(`select workspace_id from subscription limit 1`)
void subRow
t0 = performance.now()
const raws = Array.from({ length: 200 }, (_, i) => JSON.stringify({ id: `evt_load_${i}`, type: 'subscription.updated', created: Math.floor(Date.now() / 1000), data: { subscription: `sub_unknown_${i % 20}`, workspaceId: W } }))
const deliveries = [...raws, ...raws.slice(0, 40)] // 40 redeliveries
await Promise.all(deliveries.map(raw => hit('webhook', '/api/billing/webhooks/simulator', { method: 'POST', headers: { 'content-type': 'application/json', 'x-simulator-signature': signSimulator('dev-only-simulator-secret', raw) }, body: raw })))
const ingestMs = Math.round(performance.now() - t0)
const events = (await conn.query(`select count(*)::int n from billing_event`)).rows[0].n
let drainMs = 0, peakQueue = 0
for (let i = 0; i < 240; i++) {
  const r = (await conn.query(`select count(*) filter (where status in ('queued','running'))::int q from job where kind = 'billing.sync'`)).rows[0].q
  peakQueue = Math.max(peakQueue, r)
  if (r === 0) { drainMs = Math.round(performance.now() - t0); break }
  await new Promise(res => setTimeout(res, 250))
}
const jobs = (await conn.query(`select status, count(*)::int n from job where kind = 'billing.sync' group by 1`)).rows
results.webhookBurst = { delivered: deliveries.length, uniqueEvents: raws.length, storedEvents: events, ingestWallMs: ingestMs, queueDrainedAfterMs: drainMs || 'not drained in 60s', peakQueueDepth: peakQueue, jobOutcomes: jobs, note: 'Subscriptions in this burst are unknown to the simulator, so each sync job fails and is retried with backoff — this measures ingestion, dedupe and queue behaviour, not successful syncs', ...summarize(['webhook']) }

await conn.end()
server.kill('SIGTERM')
await new Promise(r => setTimeout(r, 500))
await db.stop()
rmSync(dir, { recursive: true, force: true })
console.info(JSON.stringify(results, null, 2))
process.exit(0)
