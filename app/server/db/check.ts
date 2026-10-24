// Data consistency checks. Read-only; safe to run against production. Exit code 1 if any check fails.
// Usage: npm run db:check            (uses DATABASE_URL, or the development PGlite directory)
// Also exported for the backup/restore drill and tests.
import { sql } from 'drizzle-orm'
import type { DB } from './client'

export interface CheckResult { name: string; ok: boolean; count: number; detail: string }

const CHECKS: { name: string; detail: string; query: string }[] = [
  { name: 'workspace has an owner', detail: 'Workspaces with no active owner (nobody can manage billing or deletion)',
    query: `select count(*)::int as n from workspace w where w.archived_at is null and not exists (select 1 from membership m where m.workspace_id = w.id and m.role = 'owner' and m.removed_at is null)` },
  { name: 'workspace has a subscription', detail: 'Workspaces missing a subscription row (entitlements would fail)',
    query: `select count(*)::int as n from workspace w where not exists (select 1 from subscription s where s.workspace_id = w.id)` },
  { name: 'stakeholder org links stay in-tenant', detail: 'stakeholder_organization rows pointing across workspaces',
    query: `select count(*)::int as n from stakeholder_organization so join stakeholder s on s.id = so.stakeholder_id join organization o on o.id = so.organization_id where s.workspace_id <> so.workspace_id or o.workspace_id <> so.workspace_id` },
  { name: 'engagement participants stay in-tenant', detail: 'engagement_participant rows pointing across workspaces',
    query: `select count(*)::int as n from engagement_participant p join engagement e on e.id = p.engagement_id join stakeholder s on s.id = p.stakeholder_id where e.workspace_id <> p.workspace_id or s.workspace_id <> p.workspace_id` },
  { name: 'commitments reference in-tenant stakeholders', detail: 'commitments linked to another workspace’s stakeholder',
    query: `select count(*)::int as n from commitment c join stakeholder s on s.id = c.stakeholder_id where s.workspace_id <> c.workspace_id` },
  { name: 'record owners are members', detail: 'open commitments owned by someone no longer in the workspace (warning)',
    query: `select count(*)::int as n from commitment c where c.owner_id is not null and c.status in ('open','in_progress') and c.archived_at is null and not exists (select 1 from membership m where m.workspace_id = c.workspace_id and m.user_id = c.owner_id and m.removed_at is null)` },
  { name: 'human-readable keys are unique', detail: 'duplicate C-/D-/E- keys inside a workspace',
    query: `select count(*)::int as n from (select workspace_id, key from commitment group by 1,2 having count(*) > 1 union all select workspace_id, key from decision group by 1,2 having count(*) > 1 union all select workspace_id, key from engagement group by 1,2 having count(*) > 1) d` },
  { name: 'accepted proposals point at real records', detail: 'accepted AI proposals whose created record is missing',
    query: `select count(*)::int as n from ai_proposal p where p.status = 'accepted' and ((p.created_record_type = 'commitment' and not exists (select 1 from commitment c where c.id = p.created_record_id)) or (p.created_record_type = 'decision' and not exists (select 1 from decision d where d.id = p.created_record_id)))` },
  { name: 'no AI reservations leaked', detail: 'AI allowance rows with reserved tokens older than an hour of activity (stuck reservations)',
    query: `select count(*)::int as n from ai_allowance a where a.reserved > 0 and not exists (select 1 from ai_usage u where u.workspace_id = a.workspace_id and u.created_at > now() - interval '1 hour')` },
  { name: 'no dead background jobs', detail: 'jobs that exhausted their retries',
    query: `select count(*)::int as n from job where status = 'dead'` },
  { name: 'no stalled job queue', detail: 'queued jobs waiting more than 15 minutes',
    query: `select count(*)::int as n from job where status = 'queued' and run_at < now() - interval '15 minutes'` },
  { name: 'billing events processed', detail: 'verified webhooks not processed within an hour',
    query: `select count(*)::int as n from billing_event where status = 'received' and received_at < now() - interval '1 hour'` },
  { name: 'paid subscriptions have provider ids', detail: 'active/past-due subscriptions on a real provider without a provider subscription id',
    query: `select count(*)::int as n from subscription where status in ('active','past_due') and provider in ('stripe','paddle') and provider_subscription_id is null` },
  { name: 'no expired export files kept', detail: 'ready exports past their expiry (purge job behind)',
    query: `select count(*)::int as n from data_request where status = 'ready' and file_expires_at < now() - interval '2 hours'` },
  { name: 'overdue deletions ran', detail: 'workspace deletions scheduled in the past but not completed',
    query: `select count(*)::int as n from data_request where kind = 'workspace_deletion' and status = 'scheduled' and scheduled_for < now() - interval '2 hours'` },
]

export async function runChecks(db: DB): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  for (const c of CHECKS) {
    const r = await db.execute(sql.raw(c.query)) as unknown as { rows: { n: number }[] }
    const n = Number(r.rows?.[0]?.n ?? 0)
    out.push({ name: c.name, ok: n === 0, count: n, detail: c.detail })
  }
  return out
}

/** Row counts and an order-independent content hash per table, used to prove a restore is identical. */
export async function fingerprint(db: DB): Promise<Record<string, { rows: number; hash: string }>> {
  const tables = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public' order by 1`) as unknown as { rows: { tablename: string }[] }).rows.map(r => r.tablename)
  const out: Record<string, { rows: number; hash: string }> = {}
  for (const t of tables) {
    const r = await db.execute(sql.raw(`select count(*)::int as n, coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))), '') as h from "${t}" x`)) as unknown as { rows: { n: number; h: string }[] }
    out[t] = { rows: r.rows[0].n, hash: r.rows[0].h }
  }
  return out
}

// CLI
if (process.argv[1] && (await import('node:url')).fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) {
  const { loadEnv } = await import('../env')
  const { createDatabase } = await import('./client')
  const env = loadEnv()
  const database = await createDatabase({ url: env.DATABASE_URL, dataDir: env.DATABASE_URL ? undefined : env.PGLITE_DIR })
  const results = await runChecks(database.db)
  for (const r of results) console.info(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.count}: ${r.detail}`}`)
  await database.close()
  process.exit(results.every(r => r.ok) ? 0 : 1)
}
