// AI endpoints. All run behind the tenant gate; retrieval goes through RLS. Model calls are gated by
// workspace settings, per-user rate limits and the monthly budget, and every call is metered.
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { and, asc, desc, eq, gt, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { aiCache, aiConversation, aiMessage, aiUsage, engagement, user, workspace } from '../db/schema'
import { withTenant } from '../db/client'
import { jsonBody, meta, need, tx, type AppEnv, type Ctx } from '../context'
import { ApiError, notFound } from '../http'
import { recordAudit } from '../history'
import { getOr404 } from './_shared'
import { computeDashboard } from './insights'
import { createLocalEngine, type AIEngine } from '../ai/engine'
import { aiSettings, assertAIAllowed, DEFAULT_AI_SETTINGS, monthTokens, recordUsage } from '../ai/usage'
import { analyseMeeting, assertAnalysable, latestAnalysis, loadMeetingContext, sourceHash } from '../ai/services/meeting'
import { acceptProposal, editProposal, mergeProposal, proposalEditSchema, rejectProposal } from '../ai/services/proposals'
import { completeBriefing, decisionBriefing, stakeholderBriefing, workspaceBriefing, type Briefing, type Lookup } from '../ai/services/briefings'
import { runCopilot, type CopilotEvent } from '../ai/copilot/run'
import { relationshipPath } from '../ai/copilot/tools'
import { requireFeature, settleAi } from '../billing/entitlements'
import { trackFirst } from '../analytics'

const engineOf = (c: Ctx): AIEngine => c.var.deps.ai ?? (c.var.deps.ai = createLocalEngine())
const limiterOf = (c: Ctx) => c.var.deps.limiter!

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  retentionDays: z.number().int().min(0).max(365).optional(),
  monthlyTokenBudget: z.number().int().min(0).max(1_000_000_000).optional(),
  perUserPerMinute: z.number().int().min(1).max(120).optional(),
  thresholds: z.object({
    noContactDays: z.number().int().min(7).max(365).optional(),
    dueSoonDays: z.number().int().min(1).max(60).optional(),
    decisionStaleDays: z.number().int().min(1).max(180).optional(),
    coolingRatio: z.number().min(0.05).max(0.95).optional(),
  }).optional(),
})

/** Briefings are cached per user (results depend on what each user may see) and per evidence hash; the cache is checked before any model call. */
async function cachedBriefing(c: Ctx, feature: string, build: (lookup: Lookup) => Promise<{ briefing: Briefing; usage: { input: number; output: number; cacheRead: number; model: string | null; latencyMs: number } | null; key: string; cached: boolean }>) {
  const tn = c.var.tenant
  const engine = engineOf(c)
  const { reservation } = await assertAIAllowed(c.var.deps.db, limiterOf(c), tn.workspaceId, tn.userId, engine.kind === 'claude', { feature: 'ai.briefings', estimate: 6_000 })
  const fresh = c.req.query('fresh') === '1'
  const lookup: Lookup = async key => fresh ? null : tx(c, async t => ((await t.select().from(aiCache).where(and(eq(aiCache.key, key), gt(aiCache.expiresAt, new Date()))).limit(1))[0]?.value as Briefing) ?? null)
  const t0 = performance.now()
  let res
  try { res = await build(lookup) } catch (e) { if (reservation) await settleAi(c.var.deps.db, reservation, 0); throw e }
  if (res.cached) { if (reservation) await settleAi(c.var.deps.db, reservation, 0); return c.json({ ...res.briefing, cached: true }) }
  await recordUsage(c.var.deps.db, tn, { feature, engine: engine.kind, model: res.usage?.model ?? engine.model, input: res.usage?.input, output: res.usage?.output, cacheRead: res.usage?.cacheRead, latencyMs: Math.round(performance.now() - t0), status: res.briefing.aiError ? 'error' : 'ok' }, reservation)
  await trackFirst(c.var.deps.db, 'first_ai_briefing_generated', tn.workspaceId, tn.userId, { engine: engine.kind })
  if (engine.kind === 'claude' && !res.briefing.aiError) {
    await tx(c, t => t.insert(aiCache).values({ workspaceId: tn.workspaceId, userId: tn.userId, key: res.key, value: res.briefing, expiresAt: new Date(Date.now() + 15 * 60_000) })
      .onConflictDoUpdate({ target: [aiCache.workspaceId, aiCache.userId, aiCache.key], set: { value: res.briefing, expiresAt: new Date(Date.now() + 15 * 60_000) } }))
  }
  return c.json(res.briefing)
}

export const aiRoutes = new Hono<AppEnv>()
  // ── Status, settings, usage ───────────────────────────────────────────────
  .get('/status', async c => {
    const engine = engineOf(c)
    const s = await aiSettings(c.var.deps.db, c.var.tenant.workspaceId)
    const used = await monthTokens(c.var.deps.db, c.var.tenant.workspaceId)
    return c.json({ engine: { kind: engine.kind, label: engine.label, model: engine.model }, settings: s, month: used })
  })
  .patch('/settings', async c => {
    need(c, 'workspace.update')
    const input = await jsonBody(c, settingsSchema)
    const tn = c.var.tenant
    const { db } = c.var.deps
    const [w] = await db.select({ settings: workspace.settings }).from(workspace).where(eq(workspace.id, tn.workspaceId))
    const cur = await aiSettings(db, tn.workspaceId)
    const next = { ...cur, ...input, thresholds: { ...cur.thresholds, ...(input.thresholds ?? {}) } }
    await db.update(workspace).set({ settings: { ...(w.settings as object), ai: next }, updatedAt: new Date(), updatedBy: tn.userId }).where(eq(workspace.id, tn.workspaceId))
    await recordAudit(db, { workspaceId: tn.workspaceId, actorId: tn.userId, action: 'ai.settings_updated', entityType: 'workspace', entityId: tn.workspaceId, metadata: { fields: Object.keys(input) } }, meta(c))
    return c.json(next)
  })
  .get('/usage', async c => {
    need(c, 'audit.read')
    const rows = await tx(c, t => t.select({
      feature: aiUsage.feature, engine: aiUsage.engine, calls: sql<number>`count(*)::int`, errors: sql<number>`count(*) filter (where ${aiUsage.status} <> 'ok')::int`,
      input: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`, output: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
      costMicros: sql<number>`coalesce(sum(${aiUsage.costMicros}),0)::int`, p50: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${aiUsage.latencyMs}),0)::int`,
      p95: sql<number>`coalesce(percentile_cont(0.95) within group (order by ${aiUsage.latencyMs}),0)::int`,
    }).from(aiUsage).where(gt(aiUsage.createdAt, new Date(Date.now() - 30 * 86_400_000))).groupBy(aiUsage.feature, aiUsage.engine).orderBy(aiUsage.feature))
    return c.json({ since: new Date(Date.now() - 30 * 86_400_000).toISOString(), rows, month: await monthTokens(c.var.deps.db, c.var.tenant.workspaceId), budget: (await aiSettings(c.var.deps.db, c.var.tenant.workspaceId)).monthlyTokenBudget })
  })

  // ── Meeting intelligence ──────────────────────────────────────────────────
  .get('/meetings/:engagementId', async c => {
    const id = c.req.param('engagementId')
    const data = await tx(c, async t => {
      const e = await getOr404(t, engagement, id, 'Engagement')
      const a = await latestAnalysis(t, id)
      const authors = a?.createdBy ? await t.select({ name: user.name }).from(user).where(eq(user.id, a.createdBy)) : []
      return a ? { ...a, createdByName: authors[0]?.name ?? null, stale: !!e.notes && sourceHash(String(e.notes).trim()) !== a.sourceHash } : null
    })
    return c.json({ analysis: data, engine: { kind: engineOf(c).kind, label: engineOf(c).label } })
  })
  .post('/meetings/:engagementId/analyze', async c => {
    need(c, 'engagement.create')
    const tn = c.var.tenant
    const engine = engineOf(c)
    const { reservation } = await assertAIAllowed(c.var.deps.db, limiterOf(c), tn.workspaceId, tn.userId, engine.kind === 'claude', { feature: 'ai.meeting_intelligence', estimate: 12_000 })
    const id = c.req.param('engagementId')
    const ctx = await tx(c, t => loadMeetingContext(t, id))
    const notes = assertAnalysable(ctx.e.notes as string | null)
    const t0 = performance.now()
    let raw
    try {
      raw = await engine.extractMeeting({
        notes, meetingDate: (ctx.e.occurredAt as Date).toISOString().slice(0, 10),
        participants: ctx.participants, members: ctx.members, knownPeople: ctx.known.slice(0, 400),
      }, c.req.raw.signal)
    } catch (e) {
      await recordUsage(c.var.deps.db, tn, { feature: 'meeting_extraction', engine: engine.kind, model: engine.model, latencyMs: Math.round(performance.now() - t0), status: (e as Error).name === 'AbortError' ? 'cancelled' : 'error', errorCode: (e as { status?: number }).status ? String((e as { status?: number }).status) : (e as Error).name }, reservation)
      throw new ApiError(503, 'ai_unavailable', 'Analysis failed. Nothing was changed — try again.')
    }
    const out = await tx(c, t => analyseMeeting(t, tn, engine, ctx, raw, notes))
    await recordUsage(c.var.deps.db, tn, { feature: 'meeting_extraction', engine: engine.kind, model: raw.usage.model, input: raw.usage.input, output: raw.usage.output, cacheRead: raw.usage.cacheRead, latencyMs: Math.round(performance.now() - t0), status: raw.refused ? 'refused' : 'ok' }, reservation)
    await recordAudit(c.var.deps.db, { workspaceId: tn.workspaceId, actorId: tn.userId, action: 'ai.meeting_analyzed', entityType: 'engagement', entityId: id, metadata: { engine: engine.kind, ...out.counts } }, meta(c))
    return c.json(await tx(c, t => latestAnalysis(t, id)), 201)
  })
  .patch('/proposals/:id', async c => {
    need(c, 'engagement.create')
    const input = await jsonBody(c, proposalEditSchema)
    return c.json(await tx(c, t => editProposal(t, c.req.param('id'), input)))
  })
  .post('/proposals/:id/accept', async c => {
    const input = await jsonBody(c, proposalEditSchema)
    const created = await tx(c, t => acceptProposal(t, c.var.tenant, c.req.param('id'), input, meta(c)))
    return c.json(created, 201)
  })
  .post('/proposals/:id/reject', async c => {
    need(c, 'engagement.create')
    const { version } = await jsonBody(c, z.object({ version: z.number().int().positive() }))
    await tx(c, t => rejectProposal(t, c.var.tenant, c.req.param('id'), version, meta(c)))
    return c.json({ ok: true })
  })
  .post('/proposals/:id/merge', async c => {
    need(c, 'engagement.create')
    const { version, into } = await jsonBody(c, z.object({ version: z.number().int().positive(), into: z.uuid() }))
    await tx(c, t => mergeProposal(t, c.var.tenant, c.req.param('id'), into, version, meta(c)))
    return c.json({ ok: true })
  })

  // ── Briefings ─────────────────────────────────────────────────────────────
  .get('/briefings/stakeholders/:id', c => {
    const mode = z.enum(['brief', 'detailed', 'prep']).catch('detailed').parse(c.req.query('mode'))
    return cachedBriefing(c, `briefing_stakeholder_${mode}`, async lookup => completeBriefing(engineOf(c), await tx(c, t => stakeholderBriefing(t, engineOf(c), c.req.param('id'), mode)), c.req.raw.signal, lookup))
  })
  .get('/briefings/decisions/:id', c => cachedBriefing(c, 'briefing_decision', async lookup => completeBriefing(engineOf(c), await tx(c, t => decisionBriefing(t, engineOf(c), c.req.param('id'))), c.req.raw.signal, lookup)))
  .get('/briefings/workspace', c => cachedBriefing(c, 'briefing_workspace', async lookup => {
    const th = (await aiSettings(c.var.deps.db, c.var.tenant.workspaceId)).thresholds
    const d = await tx(c, t => computeDashboard(t, c.var.tenant.userId, th))
    const eng7 = await tx(c, async t => ((await t.execute(sql`select count(*)::int as n from engagement where archived_at is null and occurred_at > now() - interval '7 days'`)) as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0)
    return completeBriefing(engineOf(c), workspaceBriefing(engineOf(c), d.signals as never, { overdue: d.signals.filter(s => s.kind === 'overdue').length, decisions: d.signals.filter(s => s.kind === 'decision-waiting').length, cooling: d.signals.filter(s => s.kind === 'cooling').length, engagements7: eng7 }), c.req.raw.signal, lookup)
  }))

  // ── Relationship paths (deterministic) ────────────────────────────────────
  .get('/paths', async c => {
    requireFeature(c.var.entitlements, 'map.path_finder')
    const q = z.object({ from: z.uuid(), to: z.uuid() }).parse(c.req.query())
    const path = await tx(c, t => relationshipPath(t, q.from, q.to))
    return c.json({ found: !!path, hops: path ?? [], method: 'Shortest chain of recorded person-to-person relationships you can see, up to 4 steps. Inferred relationships are labelled.' })
  })

  // ── Copilot ───────────────────────────────────────────────────────────────
  .get('/conversations', async c => {
    const rows = await tx(c, t => t.select({ id: aiConversation.id, title: aiConversation.title, updatedAt: aiConversation.updatedAt, expiresAt: aiConversation.expiresAt })
      .from(aiConversation).where(gt(aiConversation.expiresAt, new Date())).orderBy(desc(aiConversation.updatedAt)).limit(30))
    return c.json({ conversations: rows })
  })
  .get('/conversations/:id', async c => {
    const data = await tx(c, async t => {
      const [conv] = await t.select().from(aiConversation).where(and(eq(aiConversation.id, c.req.param('id')), gt(aiConversation.expiresAt, new Date())))
      if (!conv) throw notFound('Conversation')
      const messages = await t.select().from(aiMessage).where(eq(aiMessage.conversationId, conv.id)).orderBy(asc(aiMessage.createdAt))
      return { ...conv, messages }
    })
    return c.json(data)
  })
  .delete('/conversations/:id', async c => {
    // RLS limits this to the caller's own conversations; deleting nothing means it isn't theirs (or doesn't exist).
    const gone = await tx(c, t => t.delete(aiConversation).where(eq(aiConversation.id, c.req.param('id'))).returning({ id: aiConversation.id }))
    if (!gone[0]) throw notFound('Conversation')
    return c.json({ ok: true })
  })
  .delete('/conversations', async c => {
    await tx(c, t => t.delete(aiConversation))
    return c.json({ ok: true })
  })
  .post('/copilot', async c => {
    const body = await jsonBody(c, z.object({
      message: z.string().trim().min(1).max(2000),
      conversationId: z.uuid().nullable().optional(),
      context: z.object({ route: z.string().max(200).optional(), label: z.string().max(200).nullable().optional(), stakeholderId: z.uuid().nullable().optional(), initiativeId: z.uuid().nullable().optional(), organizationId: z.uuid().nullable().optional(), decisionId: z.uuid().nullable().optional() }).default({}),
    }))
    const tn = c.var.tenant
    const { db } = c.var.deps
    const engine = engineOf(c)
    const { settings, reservation } = await assertAIAllowed(db, limiterOf(c), tn.workspaceId, tn.userId, engine.kind === 'claude', { feature: 'ai.copilot', estimate: 30_000 })
    // Retention: purge this workspace's expired conversations (cheap, indexed).
    await withTenant(db, tn, t => t.delete(aiConversation).where(lt(aiConversation.expiresAt, new Date())))
    const history = body.conversationId ? await tx(c, async t => {
      const [conv] = await t.select({ id: aiConversation.id }).from(aiConversation).where(eq(aiConversation.id, body.conversationId!))
      if (!conv) throw notFound('Conversation')
      return (await t.select({ role: aiMessage.role, content: aiMessage.content }).from(aiMessage).where(eq(aiMessage.conversationId, conv.id)).orderBy(asc(aiMessage.createdAt))).slice(-8)
    }) : []

    return streamSSE(c, async stream => {
      const abort = new AbortController()
      stream.onAbort(() => abort.abort())
      const send = (e: CopilotEvent | { type: 'meta' | 'error'; [k: string]: unknown }) => stream.writeSSE({ event: e.type, data: JSON.stringify(e) })
      let conversationId = body.conversationId ?? null
      if (settings.retentionDays > 0 && !conversationId) {
        const [conv] = await withTenant(db, tn, t => t.insert(aiConversation).values({ workspaceId: tn.workspaceId, userId: tn.userId, title: body.message.slice(0, 80), context: body.context, expiresAt: new Date(Date.now() + settings.retentionDays * 86_400_000) }).returning({ id: aiConversation.id }))
        conversationId = conv.id
      }
      await send({ type: 'meta', conversationId, engine: { kind: engine.kind, label: engine.label }, retentionDays: settings.retentionDays })
      const t0 = performance.now()
      try {
        const out = await runCopilot({ db, tn, engine, message: body.message, history, context: body.context, emit: e => { void send(e) }, signal: abort.signal })
        await send({ type: 'final', text: out.text, refs: out.refs, followUps: out.followUps, unsupported: out.unsupported, engine: engine.kind })
        if (conversationId && settings.retentionDays > 0) {
          await withTenant(db, tn, async t => {
            await t.insert(aiMessage).values([
              { workspaceId: tn.workspaceId, conversationId: conversationId!, userId: tn.userId, role: 'user', content: body.message },
              { workspaceId: tn.workspaceId, conversationId: conversationId!, userId: tn.userId, role: 'assistant', content: out.text, payload: { refs: out.refs, followUps: out.followUps }, engine: engine.kind },
            ])
            await t.update(aiConversation).set({ updatedAt: new Date() }).where(eq(aiConversation.id, conversationId!))
          })
        }
        await recordUsage(db, tn, { feature: 'copilot', engine: engine.kind, model: out.usage.model, input: out.usage.input, output: out.usage.output, cacheRead: out.usage.cacheRead, latencyMs: Math.round(performance.now() - t0), status: 'ok' }, reservation)
      } catch (e) {
        const cancelled = abort.signal.aborted || (e as Error).name === 'AbortError'
        await recordUsage(db, tn, { feature: 'copilot', engine: engine.kind, model: engine.model, latencyMs: Math.round(performance.now() - t0), status: cancelled ? 'cancelled' : 'error', errorCode: (e as Error).name }, reservation)
        if (!cancelled) await send({ type: 'error', message: 'Something went wrong while answering. Nothing was changed — try again.' })
      }
    })
  })

export { DEFAULT_AI_SETTINGS }
