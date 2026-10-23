// First-party product analytics. Events are stored in our own database (no third-party scripts or cookies),
// names and properties are allow-listed, and nothing that describes stakeholders or record content is accepted.
// Users can opt out in Settings › Notifications & privacy; opted-out users are not recorded at all.
import { and, eq, gte, sql } from 'drizzle-orm'
import type { DB } from './db/client'
import { analyticsEvent, userPreference } from './db/schema'

export const EVENTS = {
  signup_started: [], signup_completed: [], workspace_created: ['template'], onboarding_step_completed: ['step'], onboarding_completed: ['skipped'],
  first_stakeholder_added: [], first_initiative_created: [], first_engagement_recorded: [], first_ai_briefing_generated: ['engine'],
  teammate_invited: ['role'], invitation_accepted: ['role'], trial_started: ['plan'], trial_expired: ['plan'],
  checkout_initiated: ['plan', 'interval', 'seats'], subscription_activated: ['plan', 'interval', 'seats', 'from'],
  plan_changed: ['from', 'to', 'seats'], seats_changed: ['from', 'to', 'seats'], subscription_cancel_scheduled: ['plan'], subscription_canceled: ['plan'],
  ai_limit_reached: ['feature'], upgrade_prompt_shown: ['feature', 'surface'], data_export_requested: ['scope'],
  marketing_cta_clicked: ['cta', 'page'], pricing_viewed: [],
} as const satisfies Record<string, readonly string[]>
export type EventName = keyof typeof EVENTS

type Props = Record<string, string | number | boolean | null | undefined>

export async function track(db: DB, name: EventName, opts: { userId?: string | null; workspaceId?: string | null; props?: Props } = {}) {
  try {
    if (opts.userId) {
      const [p] = await db.select({ out: userPreference.analyticsOptOut }).from(userPreference).where(eq(userPreference.userId, opts.userId))
      if (p?.out) return
    }
    const allowed = EVENTS[name] as readonly string[]
    const props: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(opts.props ?? {})) {
      if (!allowed.includes(k) || v === null || v === undefined) continue
      props[k] = typeof v === 'string' ? v.slice(0, 40) : v
    }
    await db.insert(analyticsEvent).values({ name, userId: opts.userId ?? null, workspaceId: opts.workspaceId ?? null, props })
  } catch (e) {
    // Analytics must never break a user action.
    console.warn(`[analytics] ${name} not recorded: ${(e as Error).message}`)
  }
}

/** Records a "first X" milestone once per workspace. */
export async function trackFirst(db: DB, name: EventName, workspaceId: string, userId: string, props?: Props) {
  const [hit] = await db.select({ id: analyticsEvent.id }).from(analyticsEvent).where(and(eq(analyticsEvent.name, name), eq(analyticsEvent.workspaceId, workspaceId))).limit(1)
  if (!hit) await track(db, name, { userId, workspaceId, props })
}

/** Funnel and activation metrics over a window, for the internal metrics endpoint. Aggregates only. */
export async function funnel(db: DB, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000)
  const counts = await db.select({ name: analyticsEvent.name, n: sql<number>`count(*)::int`, workspaces: sql<number>`count(distinct ${analyticsEvent.workspaceId})::int` })
    .from(analyticsEvent).where(gte(analyticsEvent.createdAt, since)).groupBy(analyticsEvent.name)
  const ttfv = await db.execute(sql`
    select percentile_cont(0.5) within group (order by extract(epoch from (f.created_at - w.created_at))) as p50
    from analytics_event w join lateral (
      select created_at from analytics_event f where f.workspace_id = w.workspace_id and f.name in ('first_stakeholder_added','first_engagement_recorded','first_ai_briefing_generated') order by created_at limit 1
    ) f on true
    where w.name = 'workspace_created' and w.created_at >= ${since}`) as unknown as { rows: { p50: number | null }[] }
  const by = Object.fromEntries(counts.map(c => [c.name, c]))
  const rate = (a: string, b: string) => (by[b]?.workspaces ? Math.round(((by[a]?.workspaces ?? 0) / by[b].workspaces) * 1000) / 10 : null)
  return {
    windowDays: days, events: counts,
    activationRate: rate('first_engagement_recorded', 'workspace_created'),
    trialConversion: rate('subscription_activated', 'workspace_created'),
    medianSecondsToFirstValue: ttfv.rows?.[0]?.p50 ?? null,
  }
}
