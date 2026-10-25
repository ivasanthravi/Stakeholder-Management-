// Phase 7: serve a simulation profile for browsing and persona runs (local only). Loads the profile into embedded
// PostgreSQL, analyzes it, then runs the API and a production build of the app until interrupted.
// Usage: npx tsx scripts/sim-serve.ts --profile B|C|D [--industry construction] [--port 4196]
// Writes the manifest (users and complications) to .data/sim-serve-manifest.json. Password: simulation-2026.
import EmbeddedPostgres from 'embedded-postgres'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const PROFILE = arg('profile', 'C').toUpperCase(), INDUSTRY = arg('industry', 'construction'), WEB = Number(arg('port', '4196'))
const PG_PORT = 5622, API_PORT = 8822
const root = mkdtempSync(path.join(tmpdir(), 'meridian-simserve-'))
const DB = `postgres://meridian:sim-only@localhost:${PG_PORT}/meridian`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const kids: ChildProcess[] = []
const db = new EmbeddedPostgres({ databaseDir: path.join(root, 'pg'), user: 'meridian', password: 'sim-only', port: PG_PORT, persistent: false, onLog: () => {}, onError: () => {} })
const stop = async () => { for (const k of kids) k.kill(); await db.stop().catch(() => {}); rmSync(root, { recursive: true, force: true }); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)

await db.initialise(); await db.start()
{ const c = new pg.Client({ connectionString: DB.replace(/\/meridian$/, '/postgres') }); await c.connect(); await c.query('create database meridian'); await c.end() }
const manifest = path.join(root, 'manifest.json')
const gen = spawnSync('npx', ['tsx', 'server/db/sim/cli.ts', '--profile', PROFILE, '--industry', INDUSTRY, '--seed', '7', '--manifest', manifest], { env: { ...process.env, DATABASE_URL: DB, NODE_ENV: 'development' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
if (gen.status !== 0) { console.error(gen.stderr.slice(-2000)); await stop() }
copyFileSync(manifest, '.data/sim-serve-manifest.json')
{ const q = new pg.Client({ connectionString: DB }); await q.connect(); await q.query('analyze'); await q.end() }

const build = spawnSync('npx', ['vite', 'build', '--outDir', path.join(root, 'dist')], { encoding: 'utf8' })
if (build.status !== 0) { console.error(build.stderr.slice(-2000)); await stop() }
kids.push(spawn('npx', ['tsx', 'server/index.ts'], { env: { ...process.env, NODE_ENV: 'development', API_PORT: String(API_PORT), APP_URL: `http://localhost:${WEB}`, DATABASE_URL: DB, JOBS_ENABLED: 'false' }, stdio: 'ignore' }))
kids.push(spawn('npx', ['vite', 'preview', '--port', String(WEB), '--strictPort', '--outDir', path.join(root, 'dist')], { env: { ...process.env, API_PORT: String(API_PORT) }, stdio: 'ignore' }))
for (let i = 0; i < 240; i++) { try { if ((await fetch(`http://localhost:${API_PORT}/api/health`)).ok && (await fetch(`http://localhost:${WEB}/`)).ok) break } catch { /* booting */ } await sleep(250) }
console.log(`READY profile ${PROFILE} (${INDUSTRY}) at http://localhost:${WEB} — manifest .data/sim-serve-manifest.json`)
await new Promise(() => {})
