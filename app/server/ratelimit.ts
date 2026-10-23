// In-process sliding-window rate limiter. Adequate for a single API instance; a multi-instance
// deployment must move the counters to a shared store (Postgres/Redis) — see docs/ai/security-and-privacy.md.
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './context'
import { ApiError } from './http'

export interface Limit { windowMs: number; max: number }

export function createLimiter() {
  const hits = new Map<string, number[]>()
  let sweeps = 0
  return {
    /** Returns seconds to wait (0 = allowed) and records the hit when allowed. */
    take(key: string, { windowMs, max }: Limit, now = Date.now()) {
      if (++sweeps % 1000 === 0) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3_600_000) hits.delete(k)
      const arr = (hits.get(key) ?? []).filter(t => now - t < windowMs)
      if (arr.length >= max) { hits.set(key, arr); return Math.ceil((windowMs - (now - arr[0])) / 1000) }
      arr.push(now); hits.set(key, arr)
      return 0
    },
    reset() { hits.clear() },
  }
}
export type Limiter = ReturnType<typeof createLimiter>

/** Limits keyed by signed-in user (or IP for anonymous requests). */
export function rateLimit(limiter: Limiter, name: string, limit: Limit): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const who = c.var.user?.id ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
    const wait = limiter.take(`${name}:${who}`, limit)
    if (wait) {
      c.header('retry-after', String(wait))
      throw new ApiError(429, 'rate_limited', `Too many requests. Try again in ${wait} second${wait === 1 ? '' : 's'}.`, { retryAfter: wait })
    }
    await next()
  }
}
