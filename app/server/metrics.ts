// Operational metrics in Prometheus text format at GET /api/metrics (Bearer METRICS_TOKEN; disabled when unset).
// Request counters/latency are in-process (per instance); queue, billing, email and AI figures come from the database.
// Nothing here identifies a customer or contains record content: counts, ages and durations only.
import { timingSafeEqual } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { DB } from './db/client'

const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
const counts: Record<string, number> = {}
const hist = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }
const started = Date.now()

/** Called by the request logger for every API response. */
export function observeRequest(status: number, ms: number) {
  const cls = `${Math.floor(status / 100)}xx`
  counts[cls] = (counts[cls] ?? 0) + 1
  const s = ms / 1000
  hist.sum += s; hist.count++
  BUCKETS.forEach((b, i) => { if (s <= b) hist.buckets[i]++ })
}

export function tokenMatches(given: string | undefined, expected: string | undefined) {
  if (!expected || !given) return false
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function renderMetrics(db: DB) {
  const lines: string[] = []
  const g = (name: string, help: string, value: number, labels = '') => lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name}${labels} ${value}`)
  lines.push('# HELP meridian_http_requests_total API responses by status class', '# TYPE meridian_http_requests_total counter')
  for (const [cls, n] of Object.entries(counts)) lines.push(`meridian_http_requests_total{class="${cls}"} ${n}`)
  lines.push('# HELP meridian_http_request_duration_seconds API latency', '# TYPE meridian_http_request_duration_seconds histogram')
  BUCKETS.forEach((b, i) => lines.push(`meridian_http_request_duration_seconds_bucket{le="${b}"} ${hist.buckets[i]}`))
  lines.push(`meridian_http_request_duration_seconds_bucket{le="+Inf"} ${hist.count}`, `meridian_http_request_duration_seconds_sum ${hist.sum.toFixed(3)}`, `meridian_http_request_duration_seconds_count ${hist.count}`)
  g('meridian_uptime_seconds', 'Process uptime', Math.round((Date.now() - started) / 1000))
  g('meridian_process_rss_bytes', 'Resident memory', process.memoryUsage().rss)
  const t0 = performance.now()
  let dbUp = 1
  try { await db.execute(sql`select 1`) } catch { dbUp = 0 }
  g('meridian_db_up', 'Database reachable', dbUp)
  g('meridian_db_ping_seconds', 'Database round trip', +((performance.now() - t0) / 1000).toFixed(4))
  if (!dbUp) return lines.join('\n') + '\n'
  const one = async (q: ReturnType<typeof sql>) => Number(((await db.execute(q)) as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0)
  g('meridian_jobs_queued', 'Background jobs waiting', await one(sql`select count(*)::int n from job where status = 'queued'`))
  g('meridian_jobs_dead', 'Jobs that exhausted retries', await one(sql`select count(*)::int n from job where status = 'dead'`))
  g('meridian_jobs_oldest_queued_seconds', 'Age of the oldest ready job', await one(sql`select coalesce(extract(epoch from now() - min(run_at)), 0)::int n from job where status = 'queued' and run_at <= now()`))
  g('meridian_billing_events_unprocessed', 'Verified webhooks not processed after 15 minutes', await one(sql`select count(*)::int n from billing_event where status = 'received' and received_at < now() - interval '15 minutes'`))
  g('meridian_billing_events_failed_24h', 'Webhook events that failed in the last 24h', await one(sql`select count(*)::int n from billing_event where status = 'failed' and received_at > now() - interval '24 hours'`))
  g('meridian_subscriptions_past_due', 'Workspaces with a past-due subscription', await one(sql`select count(*)::int n from subscription where status = 'past_due'`))
  g('meridian_email_failed_24h', 'Emails failed (after retries) in the last 24h', await one(sql`select count(*)::int n from email_message where status = 'failed' and created_at > now() - interval '24 hours'`))
  g('meridian_ai_calls_1h', 'AI calls in the last hour', await one(sql`select count(*)::int n from ai_usage where created_at > now() - interval '1 hour'`))
  g('meridian_ai_errors_1h', 'AI calls that errored in the last hour', await one(sql`select count(*)::int n from ai_usage where status = 'error' and created_at > now() - interval '1 hour'`))
  g('meridian_ai_cost_micros_24h', 'Model spend in the last 24h (micro-USD)', await one(sql`select coalesce(sum(cost_micros), 0)::int n from ai_usage where created_at > now() - interval '24 hours'`))
  return lines.join('\n') + '\n'
}
