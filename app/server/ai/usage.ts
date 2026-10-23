// Usage accounting, budgets and AI-specific limits.
import { and, eq, gte, sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { withTenant } from '../db/client'
import { aiUsage, workspace } from '../db/schema'
import { ApiError } from '../http'
import type { Limiter } from '../ratelimit'
import { entitlementsFor, requireFeature, reserveAi, settleAi, subscriptionInactive, type AiReservation } from '../billing/entitlements'
import type { Feature } from '../../shared/plans'
import { track } from '../analytics'

/** Published first-party prices per million tokens (USD), from the model table used in docs/ai/model-strategy.md. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
}

export function costMicros(model: string | null, u: { input: number; output: number; cacheRead: number }) {
  const p = model ? PRICES[model] : undefined
  if (!p) return 0
  return Math.round(u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead) // $/MTok × tokens = µ$
}

export interface AISettings {
  enabled: boolean
  /** Days copilot conversations are kept. 0 = not stored. */
  retentionDays: number
  /** Monthly model-token budget for the workspace (input + output). */
  monthlyTokenBudget: number
  /** Copilot/briefing/extraction requests per user per minute. */
  perUserPerMinute: number
  /** Signal thresholds. */
  thresholds: { noContactDays: number; dueSoonDays: number; decisionStaleDays: number; coolingRatio: number }
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  retentionDays: 30,
  monthlyTokenBudget: 5_000_000,
  perUserPerMinute: 20,
  thresholds: { noContactDays: 60, dueSoonDays: 7, decisionStaleDays: 14, coolingRatio: 0.4 },
}

export async function aiSettings(db: DB, workspaceId: string): Promise<AISettings> {
  const [w] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, workspaceId))
  const s = ((w?.settings ?? {}) as { ai?: Partial<AISettings> }).ai ?? {}
  return { ...DEFAULT_AI_SETTINGS, ...s, thresholds: { ...DEFAULT_AI_SETTINGS.thresholds, ...(s.thresholds ?? {}) } }
}

export async function monthTokens(db: DB, workspaceId: string) {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0)
  const [r] = await db.select({ t: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)::int`, c: sql<number>`coalesce(sum(${aiUsage.costMicros}), 0)::int` })
    .from(aiUsage).where(and(eq(aiUsage.workspaceId, workspaceId), gte(aiUsage.createdAt, start)))
  return { tokens: r?.t ?? 0, costMicros: r?.c ?? 0 }
}

/**
 * Gate before any AI work: feature enabled, per-user rate, and (for model calls) the monthly budget.
 * The local engine costs nothing, so the budget only applies when a model would be called.
 */
export async function assertAIAllowed(db: DB, limiter: Limiter, workspaceId: string, userId: string, usesModel: boolean, opts: { feature: Feature; estimate: number }) {
  // Plan first: access level (read-only workspaces can't run AI) and whether the plan includes this feature.
  const e = await entitlementsFor(db, workspaceId)
  if (e.access.level !== 'full') throw subscriptionInactive(e)
  requireFeature(e, opts.feature)
  const s = await aiSettings(db, workspaceId)
  if (!s.enabled) throw new ApiError(403, 'ai_disabled', 'AI features are turned off for this workspace')
  const wait = limiter.take(`ai:${workspaceId}:${userId}`, { windowMs: 60_000, max: s.perUserPerMinute })
  if (wait) throw new ApiError(429, 'rate_limited', `You’ve reached the AI request limit. Try again in ${wait}s.`, { retryAfter: wait })
  let reservation: AiReservation | null = null
  if (usesModel) {
    // The effective allowance is the plan's, or the admin's lower spending cap. Reservation is atomic, so concurrent
    // requests can't jointly exceed it. No overage is ever charged.
    try {
      reservation = await reserveAi(db, workspaceId, Math.min(e.aiTokenAllowance, s.monthlyTokenBudget), opts.estimate)
    } catch (err) {
      await track(db, 'ai_limit_reached', { userId, workspaceId, props: { feature: opts.feature } })
      throw err
    }
  }
  return { settings: s, reservation }
}

export interface UsageRecord {
  feature: string; engine: 'claude' | 'local'; model: string | null
  input?: number; output?: number; cacheRead?: number; latencyMs: number
  status: 'ok' | 'error' | 'refused' | 'cancelled' | 'quota_exceeded'; errorCode?: string
}

export async function recordUsage(db: DB, ctx: { workspaceId: string; userId: string; role: string }, u: UsageRecord, reservation?: AiReservation | null) {
  const input = u.input ?? 0, output = u.output ?? 0, cacheRead = u.cacheRead ?? 0
  if (reservation) await settleAi(db, reservation, input + output)
  await withTenant(db, ctx, t => t.insert(aiUsage).values({
    workspaceId: ctx.workspaceId, userId: ctx.userId, feature: u.feature, engine: u.engine, model: u.model,
    inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, costMicros: costMicros(u.model, { input, output, cacheRead }),
    latencyMs: u.latencyMs, status: u.status, errorCode: u.errorCode ?? null,
  }))
}
