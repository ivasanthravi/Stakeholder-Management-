// Phase 7 scale harness (local only). Loads a simulation profile into real PostgreSQL (embedded), starts the API, then:
//   1. truth checks: dashboard and register counts vs SQL at this volume;
//   2. endpoint latency (median/p95 of repeated warm requests) for every large-data screen;
//   3. gradual load at 1, 10, 25, 50 and 100 virtual users (20 s each, 85% reads / 15% writes), sampling server CPU and
//      memory, stopping early if the error rate passes 5% or p95 passes 10 s (saturation guard);
//   4. for profile E, every response is checked against the tenant's own records (isolation under load).
// Usage: npx tsx scripts/sim-scale.ts --profile C|D|E [--duration 20] [--vus 1,10,25,50,100]
// Evidence: ../docs/simulation/evidence/scale-<profile>.json
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, tmpdir, totalmem } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { INDUSTRIES } from '../server/db/sim/industries'
import { planTenants } from '../server/db/sim/generate'

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const PROFILE = arg('profile', 'C').toUpperCase()
const DURATION = Number(arg('duration', '20')) * 1000
const VUS = arg('vus', '1,10,25,50,100').split(',').map(Number)
const PG_PORT = 5621, API_PORT = 8821, ORIGIN = 'http://localhost:4191', BASE = `http://localhost:${API_PORT}`
const root = mkdtempSync(path.join(tmpdir(), 'meridian-simscale-'))
const DB = `postgres://meridian:sim-only@localhost:${PG_PORT}/meridian`
const appDir = process.cwd()
const report: Record<string, unknown> = {
  profile: PROFILE, ranAt: new Date().toISOString(),
  environment: { cpu: spawnSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).stdout.trim() || cpus()[0]?.model, cores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), node: process.version, database: 'PostgreSQL (embedded-postgres, same machine)', api: 'tsx server/index.ts (development mode, single process, pool 10)', note: 'API, database and load generator share one machine; results are a local baseline, not production capacity.' },
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const pct = (xs: number[], p: number) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(p * a.length))]) : 0 }

let api: ChildProcess | null = null
const db = new EmbeddedPostgres({ databaseDir: path.join(root, 'pg'), user: 'meridian', password: 'sim-only', port: PG_PORT, persistent: false, onLog: () => {}, onError: () => {} })
try {
  await db.initialise(); await db.start()
  { const c = new pg.Client({ connectionString: DB.replace(/\/meridian$/, '/postgres') }); await c.connect(); await c.query('create database meridian'); await c.end() }

  // ── Generate and load ──
  const t0 = performance.now()
  const gen = spawnSync('npx', ['tsx', 'server/db/sim/cli.ts', '--profile', PROFILE, '--industry', 'construction', '--seed', '7', '--manifest', path.join(root, 'manifest.json')], { cwd: appDir, env: { ...process.env, DATABASE_URL: DB, NODE_ENV: 'development' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (gen.status !== 0) throw new Error(`generation failed: ${gen.stderr.slice(-2000)}`)
  report.generation = { ms: Math.round(performance.now() - t0), output: gen.stdout.split('\n').filter(l => /stakeholders|Loaded/.test(l)).slice(-3) }
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')) as { workspaceId: string; anchor: string; users: { email: string; role: string; departed: boolean }[]; complications: { kind: string; refs: Record<string, string> }[]; counts: Record<string, number> }[]
  const q = new pg.Client({ connectionString: DB }); await q.connect()
  await q.query('analyze')
  const size = (await q.query(`select pg_size_pretty(pg_database_size('meridian')) as s`)).rows[0].s
  report.dataset = { workspaces: manifest.length, totals: manifest.reduce((s, m) => { for (const [k, v] of Object.entries(m.counts)) s[k] = (s[k] ?? 0) + v; return s }, {} as Record<string, number>), databaseSize: size }

  // ── API ──
  api = spawn('npx', ['tsx', 'server/index.ts'], { cwd: appDir, env: { ...process.env, NODE_ENV: 'development', API_PORT: String(API_PORT), APP_URL: ORIGIN, DATABASE_URL: DB, JOBS_ENABLED: 'false', API_RATE_LIMIT_PER_MINUTE: '100000000' }, stdio: ['ignore', 'pipe', 'pipe'] })
  for (let i = 0; i < 240; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break } catch { /* booting */ } await sleep(250) }
  const pidOf = () => spawnSync('lsof', ['-t', `-iTCP:${API_PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim().split('\n')[0]
  const serverPid = pidOf()
  const sampleProc = () => { const out = spawnSync('ps', ['-o', '%cpu=,rss=', '-p', serverPid], { encoding: 'utf8' }).stdout.trim().split(/\s+/); return { cpu: Number(out[0]), rssMB: Math.round(Number(out[1]) / 1024) } }

  const signIn = async (email: string) => {
    const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify({ email, password: 'simulation-2026' }) })
    if (!r.ok) throw new Error(`sign-in ${email} → ${r.status}`)
    return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
  }
  const get = async (cookie: string, p: string) => { const s = performance.now(); const r = await fetch(BASE + p, { headers: { cookie, origin: ORIGIN } }); const body = await r.json().catch(() => null); return { ms: performance.now() - s, status: r.status, body } }

  // Tenants to drive: the main workspace (A–D) or ten tenants (E).
  const tenants = await Promise.all(manifest.slice(0, PROFILE === 'E' ? 10 : 1).map(async m => ({ m, ws: m.workspaceId, cookie: await signIn(m.users.find(u => u.role === 'owner')!.email) })))
  const main = tenants[0]

  // ── 1. Truth at volume ──
  const truth = (await q.query(`select
    (select count(*)::int from commitment where workspace_id = $1 and archived_at is null and status in ('open','in_progress') and due_date < current_date) as overdue,
    (select count(*)::int from decision where workspace_id = $1 and archived_at is null and status in ('proposed','under_review')) as waiting,
    (select count(*)::int from stakeholder where workspace_id = $1 and archived_at is null) as stakeholders`, [main.ws])).rows[0]
  const dash = await get(main.cookie, `/api/w/${main.ws}/dashboard`)
  const signals = (dash.body?.signals ?? []) as { kind: string }[]
  const reg = await get(main.cookie, `/api/w/${main.ws}/commitments?overdue=true&limit=1`)
  const longId = main.m.complications.find(c => c.kind === 'long_history')?.refs.stakeholderId
  const longTruth = longId ? (await q.query(`select count(*)::int as n from engagement_participant ep join engagement e on e.id = ep.engagement_id where ep.stakeholder_id = $1 and e.archived_at is null`, [longId])).rows[0].n : null
  const longOv = longId ? await get(main.cookie, `/api/w/${main.ws}/stakeholders/${longId}/overview`) : null
  report.truth = {
    overdueCommitments: { database: truth.overdue, register: reg.body?.total, dashboardListed: signals.filter(s => s.kind === 'overdue').length, totalSignalsReturned: signals.length, dashboardTrueCount: dash.body?.signalCounts?.team?.overdue ?? null, horizonOlder: dash.body?.horizonOlder ?? null },
    waitingDecisions: { database: truth.waiting },
    longHistory: longId ? { database: longTruth, overviewReturned: longOv?.body?.engagements?.length, overviewTotal: longOv?.body?.engagementTotal ?? null } : null,
  }

  // ── 2. Endpoint latency (warm, sequential) ──
  const people = (await get(main.cookie, `/api/w/${main.ws}/stakeholders?limit=200`)).body.items as { id: string; name: string }[]
  const total = (await get(main.cookie, `/api/w/${main.ws}/stakeholders?limit=1`)).body.total as number
  const someone = people[Math.floor(people.length / 2)]
  const endpoints: [string, string][] = [
    ['dashboard', `/api/w/${main.ws}/dashboard`],
    ['directory page 1', `/api/w/${main.ws}/stakeholders?limit=50`],
    ['directory sorted by name', `/api/w/${main.ws}/stakeholders?limit=50&sort=name`],
    ['directory filter stance', `/api/w/${main.ws}/stakeholders?limit=50&stance=opposed`],
    ['directory text filter', `/api/w/${main.ws}/stakeholders?limit=50&q=${encodeURIComponent(someone.name.split(' ')[1])}`],
    ['directory deep page', `/api/w/${main.ws}/stakeholders?limit=50&offset=${Math.max(0, total - 50)}`],
    ['global search', `/api/w/${main.ws}/search?q=${encodeURIComponent(someone.name.split(' ')[0])}`],
    ['profile detail', `/api/w/${main.ws}/stakeholders/${someone.id}`],
    ['profile overview', `/api/w/${main.ws}/stakeholders/${someone.id}/overview`],
    ...(longId ? [['profile overview (long history)', `/api/w/${main.ws}/stakeholders/${longId}/overview`] as [string, string]] : []),
    ['engagements page 1', `/api/w/${main.ws}/engagements?limit=50`],
    ['commitments overdue', `/api/w/${main.ws}/commitments?overdue=true&limit=50`],
    ['decisions open', `/api/w/${main.ws}/decisions?status=proposed,under_review&limit=50`],
    ['organizations', `/api/w/${main.ws}/organizations?limit=50`],
    ['graph (no initiative parameter = whole workspace)', `/api/w/${main.ws}/graph`],
    ['graph (whole workspace)', `/api/w/${main.ws}/graph?initiativeId=all`],
  ]
  const latency: Record<string, { p50: number; p95: number; status: number; bytes: number }> = {}
  for (const [name, p] of endpoints) {
    await get(main.cookie, p)
    const ms: number[] = []; let status = 0, bytes = 0
    for (let i = 0; i < 7; i++) { const r = await get(main.cookie, p); ms.push(r.ms); status = r.status; bytes = JSON.stringify(r.body ?? '').length }
    latency[name] = { p50: pct(ms, 0.5), p95: pct(ms, 0.95), status, bytes }
  }
  report.latency = latency

  // ── 3. Gradual load (and 4. isolation under load for E) ──
  const own = PROFILE === 'E' ? planTenants(INDUSTRIES, 7, manifest[0].anchor) : null
  // Tenants are the first ten workspaces, in the same order as the deterministic plans.
  const ownIds = own ? tenants.map((_, i) => new Set(own[i].people.map(p => p.id))) : null
  let leaks = 0, checked = 0
  const tenantPeople = await Promise.all(tenants.map(async t => ((await get(t.cookie, `/api/w/${t.ws}/stakeholders?limit=200`)).body.items as { id: string }[]).map(x => x.id)))
  const loadRuns = []
  for (const vus of VUS) {
    const lat: Record<string, number[]> = {}; let errors = 0, n = 0
    const cpu: number[] = [], rss: number[] = []
    const end = Date.now() + DURATION
    const sampler = setInterval(() => { const s = sampleProc(); cpu.push(s.cpu); rss.push(s.rssMB) }, 1000)
    const vu = async (k: number) => {
      const ti = k % tenants.length, t = tenants[ti], pp = tenantPeople[ti]
      while (Date.now() < end) {
        const r = Math.random(); let name: string, res
        const s0 = performance.now()
        try {
          if (r < 0.15) { name = 'dashboard'; res = await fetch(`${BASE}/api/w/${t.ws}/dashboard`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.35) { name = 'directory'; res = await fetch(`${BASE}/api/w/${t.ws}/stakeholders?limit=50&offset=${Math.floor(Math.random() * 10) * 50}`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.5) { name = 'profile'; res = await fetch(`${BASE}/api/w/${t.ws}/stakeholders/${pp[Math.floor(Math.random() * pp.length)]}/overview`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.6) { name = 'search'; res = await fetch(`${BASE}/api/w/${t.ws}/search?q=${['a', 'an', 'el', 'or', 'ra'][Math.floor(Math.random() * 5)]}`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.7) { name = 'commitments'; res = await fetch(`${BASE}/api/w/${t.ws}/commitments?overdue=true&limit=50`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.78) { name = 'graph'; res = await fetch(`${BASE}/api/w/${t.ws}/graph`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.85) { name = 'engagements'; res = await fetch(`${BASE}/api/w/${t.ws}/engagements?limit=50`, { headers: { cookie: t.cookie } }) }
          else if (r < 0.93) { name = 'create engagement'; res = await fetch(`${BASE}/api/w/${t.ws}/engagements`, { method: 'POST', headers: { cookie: t.cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'call', title: `Load call ${k}`, occurredAt: new Date().toISOString(), participantIds: [pp[Math.floor(Math.random() * pp.length)]] }) }) }
          else { name = 'create commitment'; res = await fetch(`${BASE}/api/w/${t.ws}/commitments`, { method: 'POST', headers: { cookie: t.cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ title: `Load follow-up ${k}`, stakeholderId: pp[Math.floor(Math.random() * pp.length)], dueDate: '2027-01-15' }) }) }
          const body = await res.text()
          if (res.status >= 400) errors++
          // Isolation under load: directory responses may only contain this tenant's people.
          // Load writes create engagements and commitments, never stakeholders, so every directory row must be one of
          // this tenant's generated people.
          if (ownIds && name === 'directory' && res.ok) { checked++; for (const it of (JSON.parse(body).items as { id: string }[])) if (!ownIds[ti].has(it.id)) leaks++ }
        } catch { errors++; name = 'network' }
        n++; (lat[name] ??= []).push(performance.now() - s0)
      }
    }
    const s = Date.now()
    await Promise.all(Array.from({ length: vus }, (_, k) => vu(k)))
    clearInterval(sampler)
    const all = Object.values(lat).flat()
    const run = { vus, requests: n, throughputRps: Math.round(n / ((Date.now() - s) / 1000)), errorRate: Math.round((errors / Math.max(1, n)) * 10000) / 100, p50: pct(all, 0.5), p95: pct(all, 0.95), p99: pct(all, 0.99), serverCpuPctMax: Math.max(0, ...cpu), serverCpuPctMean: Math.round(cpu.reduce((a, b) => a + b, 0) / Math.max(1, cpu.length)), serverRssMBMax: Math.max(0, ...rss), endpoints: Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: pct(v, 0.5), p95: pct(v, 0.95) }])) }
    loadRuns.push(run)
    console.info(`${vus} VUs: ${run.throughputRps} req/s, p95 ${run.p95} ms, errors ${run.errorRate}%, CPU max ${run.serverCpuPctMax}%, RSS max ${run.serverRssMBMax} MB`)
    if (run.errorRate > 5 || run.p95 > 10_000) { report.stoppedEarly = `saturation guard at ${vus} VUs (errors ${run.errorRate}%, p95 ${run.p95} ms)`; break }
  }
  report.load = loadRuns
  if (ownIds) report.isolationUnderLoad = { directoryResponsesChecked: checked, foreignRecordsSeen: leaks }
  const dbStats = (await q.query(`select numbackends, xact_commit, blks_hit, blks_read, round(100.0 * blks_hit / greatest(1, blks_hit + blks_read), 2) as cache_hit_pct from pg_stat_database where datname = 'meridian'`)).rows[0]
  report.databaseStats = dbStats
  await q.end()
} catch (e) { report.error = (e as Error).message.slice(0, 3000); console.error(e) } finally {
  if (api) { api.kill('SIGTERM'); await sleep(1500) }
  await db.stop().catch(() => {})
  rmSync(root, { recursive: true, force: true })
}
const out = path.resolve(appDir, `../docs/simulation/evidence/scale-${PROFILE}.json`)
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(report, null, 2))
console.info(`→ ${out}`)
