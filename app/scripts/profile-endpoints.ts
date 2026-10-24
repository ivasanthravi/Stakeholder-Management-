// Sequential (no concurrency) latency per endpoint on real PostgreSQL with a large seeded workspace, plus the slowest
// SQL statements from pg_stat_statements. Usage: npx tsx scripts/profile-endpoints.ts [--people=2000]
import EmbeddedPostgres from 'embedded-postgres'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'

const PEOPLE = Number(process.argv.find(a => a.startsWith('--people='))?.split('=')[1] ?? 2000)
const PORT = 5581, URL = `postgres://meridian:prof@localhost:${PORT}/meridian`, ORIGIN = 'http://localhost:5173'
const dir = mkdtempSync(path.join(tmpdir(), 'meridian-prof-'))
const pgs = new EmbeddedPostgres({ databaseDir: dir, user: 'meridian', password: 'prof', port: PORT, persistent: false, onLog: () => {}, onError: () => {}, postgresFlags: ['-c', 'shared_preload_libraries=pg_stat_statements'] })
await pgs.initialise(); await pgs.start()
{ const c = new pg.Client({ connectionString: URL.replace(/\/meridian$/, '/postgres') }); await c.connect(); await c.query('create database meridian'); await c.end() }
const seed = spawnSync('npx', ['tsx', 'server/db/seed.ts'], { env: { ...process.env, DATABASE_URL: URL, NODE_ENV: 'development', SEED_PEOPLE: String(PEOPLE) }, encoding: 'utf8' })
if (seed.status !== 0) { console.error(seed.stderr); process.exit(1) }
const admin = new pg.Client({ connectionString: URL }); await admin.connect()
let statements = true
try { await admin.query('create extension if not exists pg_stat_statements'); await admin.query('select pg_stat_statements_reset()') } catch { statements = false }

const { loadEnv } = await import('../server/env')
const { createDatabase } = await import('../server/db/client')
const { createLogMailer } = await import('../server/mail')
const { createAuth } = await import('../server/auth')
const { createApp } = await import('../server/app')
const database = await createDatabase({ url: URL })
const env = loadEnv({ NODE_ENV: 'development', APP_URL: ORIGIN, DATABASE_URL: URL, BILLING_PROVIDER: 'none', API_RATE_LIMIT_PER_MINUTE: '1000000' })
const mailer = createLogMailer(database.db, { quiet: true })
const app = createApp({ db: database.db, auth: createAuth(database.db, env, mailer), env, mailer })
const sign = await app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email: 'rhea@sample.meridian.test', password: 'meridian-sample-2026' }) })
const cookie = sign.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
const me = await (await app.request('/api/me', { headers: { cookie } })).json() as { workspaces: { id: string }[] }
const W = me.workspaces[0].id
const get = async (p: string) => { const a = performance.now(); const r = await app.request(`/api/w/${W}${p}`, { headers: { cookie } }); await r.arrayBuffer(); return { ms: performance.now() - a, status: r.status, r } }
const people = await (await app.request(`/api/w/${W}/stakeholders?limit=50`, { headers: { cookie } })).json() as { items: { id: string }[] }
const lookups = await (await app.request(`/api/w/${W}/lookups`, { headers: { cookie } })).json() as { initiatives: { id: string }[] }
const endpoints: [string, string][] = [
  ['health (no auth)', '__health'], ['workspace (auth + tenant + entitlements only)', ''], ['dashboard', '/dashboard'], ['directory page', '/stakeholders?limit=100&sort=influence'],
  ['directory filter', '/stakeholders?limit=100&stance=concerned,opposed&minInfluence=3'], ['search', '/search?q=Ell'], ['profile overview', `/stakeholders/${people.items[0].id}/overview`],
  ['graph (initiative)', `/graph?initiativeId=${lookups.initiatives[0].id}`], ['commitments overdue', '/commitments?limit=50&overdue=true'], ['decisions', '/decisions?limit=50'],
  ['engagements', '/engagements?limit=50'], ['lookups', '/lookups'], ['activity', '/activity'],
]
const out: Record<string, unknown> = {}
for (const [name, p] of endpoints) {
  const times: number[] = []
  for (let i = 0; i < 7; i++) {
    if (p === '__health') { const a = performance.now(); await (await app.request('/api/health')).arrayBuffer(); times.push(performance.now() - a) } else times.push((await get(p)).ms)
  }
  times.sort((a, b) => a - b)
  out[name] = { medianMs: Math.round(times[3]), minMs: Math.round(times[0]), maxMs: Math.round(times[6]) }
}
let slow: unknown[] = []
if (statements) slow = (await admin.query(`select calls, round(mean_exec_time::numeric,1) as mean_ms, round(total_exec_time::numeric) as total_ms, left(regexp_replace(query, '\\s+', ' ', 'g'), 160) as q from pg_stat_statements where dbid = (select oid from pg_database where datname='meridian') order by total_exec_time desc limit 12`)).rows
console.info(JSON.stringify({ people: PEOPLE, sequentialLatency: out, slowestStatements: slow }, null, 2))
await database.close(); await admin.end(); await pgs.stop(); rmSync(dir, { recursive: true, force: true })
process.exit(0)
