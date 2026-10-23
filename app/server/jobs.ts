// Durable background jobs in Postgres: claimed with FOR UPDATE SKIP LOCKED (safe with several processes),
// retried with exponential backoff, dead-lettered after maxAttempts. A dedupe key collapses repeats of
// the same queued work (e.g. two webhooks for one subscription → one sync).
import { and, eq, lte, lt, sql } from 'drizzle-orm'
import type { DB } from './db/client'
import { job } from './db/schema'

export type JobHandler = (payload: Record<string, unknown>, ctx: { attempt: number }) => Promise<void>

export interface EnqueueOptions { dedupeKey?: string; delayMs?: number; maxAttempts?: number }

export interface Jobs {
  register(kind: string, handler: JobHandler): void
  enqueue(kind: string, payload?: Record<string, unknown>, opts?: EnqueueOptions): Promise<void>
  /** Runs ready jobs until none remain (tests, and the worker loop). Returns how many ran. */
  drain(limit?: number): Promise<number>
  start(intervalMs?: number): void
  stop(): void
}

const STUCK_MS = 10 * 60_000
const backoff = (attempt: number) => Math.min(60 * 60_000, 2 ** attempt * 15_000) // 30s, 1m, 2m … capped at 1h

export function createJobs(db: DB, opts: { log?: (msg: string) => void } = {}): Jobs {
  const handlers = new Map<string, JobHandler>()
  const log = opts.log ?? (m => console.warn(m))
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  async function claim() {
    return db.transaction(async t => {
      // Recover jobs whose worker died mid-run.
      await t.update(job).set({ status: 'queued', lockedAt: null }).where(and(eq(job.status, 'running'), lt(job.lockedAt, new Date(Date.now() - STUCK_MS))))
      const rows = await t.select().from(job).where(and(eq(job.status, 'queued'), lte(job.runAt, new Date()))).orderBy(job.runAt).limit(1).for('update', { skipLocked: true })
      const j = rows[0]
      if (!j) return null
      await t.update(job).set({ status: 'running', attempts: j.attempts + 1, lockedAt: new Date() }).where(eq(job.id, j.id))
      return { ...j, attempts: j.attempts + 1 }
    })
  }

  async function runOne() {
    const j = await claim()
    if (!j) return false
    const handler = handlers.get(j.kind)
    try {
      if (!handler) throw new Error(`No handler for job kind ${j.kind}`)
      await handler(j.payload, { attempt: j.attempts })
      await db.update(job).set({ status: 'done', finishedAt: new Date(), lockedAt: null, lastError: null }).where(eq(job.id, j.id))
    } catch (e) {
      const msg = (e as Error).message?.slice(0, 500) ?? 'error'
      const dead = j.attempts >= j.maxAttempts
      await db.update(job).set(dead
        ? { status: 'dead', finishedAt: new Date(), lockedAt: null, lastError: msg }
        : { status: 'queued', lockedAt: null, lastError: msg, runAt: new Date(Date.now() + backoff(j.attempts)) }).where(eq(job.id, j.id))
      log(`[job:${j.kind}#${j.id}] attempt ${j.attempts} failed${dead ? ' (dead)' : ''}: ${msg}`)
    }
    return true
  }

  return {
    register(kind, handler) { handlers.set(kind, handler) },
    async enqueue(kind, payload = {}, o = {}) {
      await db.insert(job).values({ kind, payload, dedupeKey: o.dedupeKey ?? null, maxAttempts: o.maxAttempts ?? 6, runAt: new Date(Date.now() + (o.delayMs ?? 0)) })
        .onConflictDoNothing({ target: job.dedupeKey, where: sql`status in ('queued','running')` })
    },
    async drain(limit = 100) {
      let n = 0
      while (n < limit && await runOne()) n++
      return n
    },
    start(intervalMs = 1000) {
      const tick = async () => {
        if (running) return
        running = true
        try { await this.drain(20) } catch (e) { log(`[jobs] worker error: ${(e as Error).message}`) } finally { running = false }
        timer = setTimeout(tick, intervalMs)
      }
      timer = setTimeout(tick, intervalMs)
    },
    stop() { if (timer) clearTimeout(timer); timer = null },
  }
}
