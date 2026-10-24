// Backup & restore drill on real PostgreSQL (embedded-postgres), isolated in a temp directory. Never touches real data.
// 1. Seed a database (migrations + sample workspace) and fingerprint every table (row count + content hash).
// 2. Cold physical backup: stop the server, copy the data directory.
// 3. Disaster: delete data on the original.
// 4. Restore: start a new server from the backup copy, re-run migrations (idempotent), compare fingerprints,
//    run consistency checks, and smoke-test the application (health, readiness, sign-in, tenant data).
// Usage: npx tsx scripts/restore-drill.ts            Output: timings and verdict (exit 1 on any mismatch)
import EmbeddedPostgres from 'embedded-postgres'
import { chmodSync, mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { createDatabase, migrate } from '../server/db/client'
import { fingerprint, runChecks } from '../server/db/check'

const root = mkdtempSync(path.join(tmpdir(), 'meridian-drill-'))
const primaryDir = path.join(root, 'primary'), backupDir = path.join(root, 'backup')
const user = 'meridian', password = 'drill-only'
const url = (port: number, dbName = 'meridian') => `postgres://${user}:${password}@localhost:${port}/${dbName}`
const t = () => performance.now()
const ms = (a: number) => `${Math.round(t() - a)} ms`
const quiet = { onLog: () => {}, onError: (e: unknown) => { if (process.env.DRILL_DEBUG) console.error('[pg]', String(e)) } }
const dirSize = (d: string): number => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? dirSize(path.join(d, e.name)) : statSync(path.join(d, e.name)).size), 0)

const report: Record<string, unknown> = {}
const stage = (m: string) => { if (process.env.DRILL_DEBUG) console.error('» ' + m) }
let ok = true
const primary = new EmbeddedPostgres({ databaseDir: primaryDir, user, password, port: 5561, persistent: true, ...quiet })
stage('init')
await primary.initialise(); await primary.start()
const admin = new pg.Client({ connectionString: url(5561, 'postgres') }); await admin.connect(); await admin.query('create database meridian'); await admin.end()

// 1. Seed through the real seed script (migrations + Better Auth users + sample workspace).
stage('seed')
let a = t()
const seed = spawnSync('npx', ['tsx', 'server/db/seed.ts'], { env: { ...process.env, DATABASE_URL: url(5561), NODE_ENV: 'development', SEED_PEOPLE: '184' }, encoding: 'utf8' })
if (seed.status !== 0) { console.error(seed.stderr); process.exit(1) }
report.seed = ms(a)
stage('fingerprint')
let db = await createDatabase({ url: url(5561) })
const before = await fingerprint(db.db)
report.tables = Object.keys(before).length
report.rows = Object.values(before).reduce((n, x) => n + x.rows, 0)
await db.close()

// 2. Cold physical backup.
stage('backup')
a = t(); await primary.stop(); report.stopPrimary = ms(a)
// cp -Rp keeps modes: Postgres refuses a data directory that isn't 0700 (Node's cpSync doesn't preserve it).
a = t(); spawnSync('cp', ['-Rp', primaryDir, backupDir]); chmodSync(backupDir, 0o700); report.backupCopy = ms(a)
report.backupSizeMB = Math.round(dirSize(backupDir) / 1e5) / 10

stage('disaster')
// 3. Disaster on the primary.
await primary.start()
db = await createDatabase({ url: url(5561) })
await db.db.execute(`delete from stakeholder` as never).catch(async () => { const c = new pg.Client({ connectionString: url(5561) }); await c.connect(); await c.query('truncate stakeholder cascade'); await c.end() })
const damaged = await fingerprint(db.db)
report.disasterDetected = damaged.stakeholder.rows !== before.stakeholder.rows
await db.close(); await primary.stop()

// 4. Restore onto a fresh server from the backup copy.
stage('restore')
a = t()
const restored = new EmbeddedPostgres({ databaseDir: backupDir, user, password, port: 5562, persistent: true, ...quiet })
await restored.start()
report.restoreStart = ms(a)
db = await createDatabase({ url: url(5562) })
a = t(); await migrate(db); report.migrateOnRestore = ms(a)
const after = await fingerprint(db.db)
const mismatched = Object.keys(before).filter(k => before[k].hash !== after[k]?.hash || before[k].rows !== after[k]?.rows)
report.tablesMismatched = mismatched
if (mismatched.length) ok = false
const checks = await runChecks(db.db)
report.consistencyChecksFailed = checks.filter(c => !c.ok).map(c => c.name)
if (checks.some(c => !c.ok)) ok = false

stage('smoke')
// Application smoke test against the restored database.
const { loadEnv } = await import('../server/env')
const { createLogMailer } = await import('../server/mail')
const { createAuth } = await import('../server/auth')
const { createApp } = await import('../server/app')
const env = loadEnv({ NODE_ENV: 'development', APP_URL: 'http://localhost:5173', DATABASE_URL: url(5562), BILLING_PROVIDER: 'none' })
const mailer = createLogMailer(db.db, { quiet: true })
const app = createApp({ db: db.db, auth: createAuth(db.db, env, mailer), env, mailer })
const ready = await app.request('/api/ready')
const signIn = await app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' }, body: JSON.stringify({ email: 'rhea@sample.meridian.test', password: process.env.SEED_PASSWORD ?? 'meridian-sample-2026' }) })
const cookie = signIn.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
const me = await (await app.request('/api/me', { headers: { cookie } })).json() as { workspaces: { id: string }[] }
const people = await (await app.request(`/api/w/${me.workspaces[0].id}/stakeholders?limit=1`, { headers: { cookie } })).json() as { total: number }
report.smoke = { ready: ready.status, signIn: signIn.status, stakeholders: people.total, expected: before.stakeholder.rows }
if (ready.status !== 200 || signIn.status !== 200 || people.total !== before.stakeholder.rows) ok = false
await db.close(); await restored.stop()
rmSync(root, { recursive: true, force: true })

console.info(JSON.stringify({ verdict: ok ? 'RESTORE VERIFIED' : 'RESTORE FAILED', postgres: '18.4 (embedded-postgres)', ...report }, null, 2))
process.exit(ok ? 0 : 1)
