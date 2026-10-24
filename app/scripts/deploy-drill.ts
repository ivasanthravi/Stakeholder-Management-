// Staging-like deployment + rollback drill, entirely local and isolated (temp dirs, embedded PostgreSQL, ports 8795/5601).
//  1. Build the production artifact the way a pipeline would: copy sources, `npm ci --omit=dev`, `npm run build` output.
//  2. Database: real PostgreSQL, migrations + sample data.
//  3. Deploy release N (this checkout) with NODE_ENV=production → smoke test.
//  4. Roll back to release N-1 (a git ref, default the previous commit) against the SAME database → smoke test.
//  5. Roll forward to N → smoke test.
// Usage: npx tsx scripts/deploy-drill.ts [--previous=<git-ref>]
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'

const prevRef = process.argv.find(a => a.startsWith('--previous='))?.split('=')[1] ?? 'HEAD'
const root = mkdtempSync(path.join(tmpdir(), 'meridian-deploy-'))
const appDir = process.cwd()
const repoDir = path.resolve(appDir, '..')
const PG_PORT = 5601, PORT = 8795, BASE = `http://localhost:${PORT}`
const DB = `postgres://meridian:deploy-only@localhost:${PG_PORT}/meridian`
const report: Record<string, unknown> = { previousRef: prevRef }
const sh = (cmd: string, args: string[], cwd: string, env: Record<string, string> = {}) => {
  const t0 = performance.now(); const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed in ${cwd}:\n${r.stderr?.slice(-2000)}`)
  return Math.round(performance.now() - t0)
}
const prodEnv = { NODE_ENV: 'production', PORT: String(PORT), APP_URL: BASE, DATABASE_URL: DB, AUTH_SECRET: 'deploy-drill-secret-'.padEnd(48, 'x'), BILLING_PROVIDER: 'none', MAIL_TRANSPORT: 'log', REQUIRE_EMAIL_VERIFICATION: 'true', JOBS_ENABLED: 'true' }

function artifact(sourceDir: string, name: string, opts: { omitDev: boolean }) {
  const dir = path.join(root, name)
  const t0 = performance.now()
  cpSync(sourceDir, dir, { recursive: true, filter: s => !/\/(node_modules|\.data|scratch|test-results|playwright-report|dist)(\/|$)/.test(s) })
  // Build with full dependencies (as a CI build stage would), then install the runtime set.
  sh('npm', ['ci', '--no-audit', '--no-fund'], dir)
  sh('npm', ['run', 'build'], dir)
  if (opts.omitDev) { rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true }); sh('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], dir) }
  return { dir, buildMs: Math.round(performance.now() - t0) }
}

async function start(dir: string): Promise<ChildProcess> {
  const child = spawn('npm', ['start'], { cwd: dir, env: { ...process.env, ...prodEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout?.on('data', d => { out += d }); child.stderr?.on('data', d => { out += d })
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return child } catch { /* booting */ }
    if (child.exitCode !== null) throw new Error(`server exited: ${out.slice(-1500)}`)
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`server didn't become healthy: ${out.slice(-1500)}`)
}
async function stop(child: ChildProcess) { child.kill('SIGTERM'); for (let i = 0; i < 40 && child.exitCode === null; i++) await new Promise(r => setTimeout(r, 100)) }
function smoke(label: string, legacy = false) {
  const r = spawnSync('npx', ['tsx', 'scripts/smoke.ts'], { cwd: appDir, env: { ...process.env, BASE_URL: BASE, SMOKE_EMAIL: 'tom@sample.meridian.test', SMOKE_PASSWORD: 'meridian-sample-2026', SMOKE_LEGACY: legacy ? '1' : '0' }, encoding: 'utf8' })
  const passed = /(\d+)\/(\d+) smoke checks passed/.exec(r.stdout)
  report[label] = { ok: r.status === 0, checks: passed ? `${passed[1]}/${passed[2]}` : 'n/a', failures: r.stdout.split('\n').filter(l => l.startsWith('FAIL')) }
  return r.status === 0
}

let ok = true
const db = new EmbeddedPostgres({ databaseDir: path.join(root, 'pg'), user: 'meridian', password: 'deploy-only', port: PG_PORT, persistent: false, onLog: () => {}, onError: () => {} })
try {
  // Release N artifact (runtime dependencies only) — this is what production runs.
  const n = artifact(appDir, 'release-n', { omitDev: true })
  report.releaseN = { buildAndInstallMs: n.buildMs, hasTsxAtRuntime: existsSync(path.join(n.dir, 'node_modules/.bin/tsx')) }
  // Release N-1 from git (full install: releases before this drill shipped tsx as a dev dependency — see the report).
  const wt = path.join(root, 'prev-src')
  sh('git', ['worktree', 'add', '--detach', wt, prevRef], repoDir)
  const prev = artifact(path.join(wt, 'app'), 'release-prev', { omitDev: false })
  report.releasePrev = { buildAndInstallMs: prev.buildMs }

  await db.initialise(); await db.start()
  { const c = new pg.Client({ connectionString: DB.replace(/\/meridian$/, '/postgres') }); await c.connect(); await c.query('create database meridian'); await c.end() }
  // Seed (development mode; production refuses to seed by design).
  sh('npx', ['tsx', 'server/db/seed.ts'], appDir, { DATABASE_URL: DB, NODE_ENV: 'development', SEED_PEOPLE: '184' })

  let t0 = performance.now()
  let server = await start(n.dir); report.deployNStartMs = Math.round(performance.now() - t0)
  ok = smoke('smoke_release_N') && ok
  await stop(server)

  t0 = performance.now()
  server = await start(prev.dir); report.rollbackStartMs = Math.round(performance.now() - t0)
  ok = smoke('smoke_after_rollback_to_prev', true) && ok
  await stop(server)

  t0 = performance.now()
  server = await start(n.dir); report.rollForwardStartMs = Math.round(performance.now() - t0)
  ok = smoke('smoke_after_roll_forward') && ok
  await stop(server)

  // Whether the previous release's runtime-only install has tsx (it only did transitively; now it's an explicit dependency).
  rmSync(path.join(prev.dir, 'node_modules'), { recursive: true, force: true }); sh('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], prev.dir)
  report.prevReleaseRuntimeOnlyHasTsxTransitively = existsSync(path.join(prev.dir, 'node_modules/.bin/tsx'))
} catch (e) { ok = false; report.error = (e as Error).message.slice(0, 2000) } finally {
  await db.stop().catch(() => {})
  spawnSync('git', ['worktree', 'remove', '--force', path.join(root, 'prev-src')], { cwd: repoDir })
  rmSync(root, { recursive: true, force: true })
}
console.info(JSON.stringify({ verdict: ok ? 'DEPLOY + ROLLBACK VERIFIED (local)' : 'FAILED', ...report }, null, 2))
process.exit(ok ? 0 : 1)
