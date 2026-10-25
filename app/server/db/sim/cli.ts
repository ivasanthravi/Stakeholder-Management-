// Simulation CLI. Generates and loads a deterministic synthetic business universe, or removes it.
//   npm run sim -- --profile B --industry construction [--seed 7] [--anchor 2026-10-25]
//   npm run sim -- --profile B --industry all           (one workspace per industry, ten in total)
//   npm run sim -- --profile E                           (fifty isolated workspaces across all industries)
//   npm run sim -- --clean                               (removes simulated workspaces and their users)
// Target: DATABASE_URL, else a PGlite directory (default .data/sim). Refuses production, and refuses a non-local
// DATABASE_URL unless SIM_ALLOW_REMOTE=1 (an authorised staging database only — never production).
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { sql } from 'drizzle-orm'
import { loadEnv } from '../../env'
import { createDatabase, migrate } from '../client'
import { createAuth } from '../../auth'
import { createLogMailer } from '../../mail'
import { INDUSTRIES, industryById } from './industries'
import { counts, planTenants, planWorkspace, PROFILES, type Plan } from './generate'
import { writePlan } from './write'

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback }
const env = loadEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV === 'production' ? 'production' : 'development' })
if (env.NODE_ENV === 'production' || process.env.DEPLOY_ENV === 'production') throw new Error('Refusing to run the simulation in production')
if (env.DATABASE_URL && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(env.DATABASE_URL) && process.env.SIM_ALLOW_REMOTE !== '1') {
  throw new Error('DATABASE_URL is not local. Set SIM_ALLOW_REMOTE=1 only for an authorised, non-production staging database.')
}
const dataDir = process.env.PGLITE_DIR && process.env.PGLITE_DIR !== '.data/pglite' ? process.env.PGLITE_DIR : '.data/sim'
if (!env.DATABASE_URL) mkdirSync(dataDir, { recursive: true })
const database = await createDatabase({ url: env.DATABASE_URL, dataDir: env.DATABASE_URL ? undefined : dataDir })
await migrate(database)
const db = database.db

if (process.argv.includes('--clean')) {
  const r = await db.execute(sql`delete from workspace where settings ? 'simulation' returning id`)
  const u = await db.execute(sql`delete from "user" u where u.email like '%.example.com' and not exists (select 1 from membership m where m.user_id = u.id) returning id`)
  console.info(`Removed ${(r as unknown as { rows: unknown[] }).rows.length} simulated workspace(s) and ${(u as unknown as { rows: unknown[] }).rows.length} simulated user(s).`)
  await database.close(); process.exit(0)
}

const profile = (arg('profile', 'A') ?? 'A').toUpperCase() as keyof typeof PROFILES
if (!(profile in PROFILES)) throw new Error(`Unknown profile ${profile} (A–E)`)
const seed = Number(arg('seed', '7'))
const anchor = arg('anchor')
const which = arg('industry', 'construction')!
const auth = createAuth(db, { ...env, REQUIRE_EMAIL_VERIFICATION: false, SIGNUP_MODE: 'open' }, createLogMailer(db, { quiet: true }))

let plans: Plan[]
if (profile === 'E') plans = planTenants(INDUSTRIES, seed, anchor)
else if (which === 'all') plans = INDUSTRIES.map(p => planWorkspace(p, PROFILES[profile], seed, anchor))
else {
  const pack = industryById(which)
  if (!pack) throw new Error(`Unknown industry ${which}. One of: ${INDUSTRIES.map(i => i.id).join(', ')}, all`)
  plans = [planWorkspace(pack, PROFILES[profile], seed, anchor)]
}

const t0 = performance.now()
const manifest = []
for (const plan of plans) {
  const t1 = performance.now()
  const { workspaceId, userIds } = await writePlan(db, auth, plan, { profile })
  const c = counts(plan)
  manifest.push({ workspaceId, industry: plan.industry, slug: plan.workspace.slug, profile, seed, anchor: plan.anchor, counts: c, users: plan.users.map(u => ({ email: u.email, role: u.role, departed: u.departed, id: userIds[u.key] })), complications: plan.complications })
  console.info(`${plan.workspace.name}: ${c.stakeholders} stakeholders, ${c.relationships} relationships, ${c.activity} activity records (${c.engagements} engagements, ${c.commitments} commitments, ${c.decisions} decisions, ${c.events} history) in ${Math.round(performance.now() - t1)} ms`)
}
// Planner statistics: PGlite has no autovacuum, and on PostgreSQL autoanalyze lags a bulk load. Without them the
// relationship-map query took 6.2 s instead of 0.08 s at profile C (docs/simulation/graph-stress-results.md).
await db.execute(sql`analyze`)
const out = arg('manifest', `${env.DATABASE_URL ? '.data' : dataDir}/manifest-${profile}${which === 'all' ? '-all' : ''}.json`)!
writeFileSync(out, JSON.stringify(manifest, null, 2))
console.info(`Loaded ${plans.length} workspace(s) in ${Math.round(performance.now() - t0)} ms → manifest ${out}`)
await database.close()
