import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { bodyLimit } from 'hono/body-limit'
import { requestLogger } from './log'
import { clientIp, ipConfig } from './net'
import { signupAllowed } from './auth'
import { renderMetrics, tokenMatches } from './metrics'
import { sql as dsql } from 'drizzle-orm'
import { job } from './db/schema'
import { createLimiter, rateLimit } from './ratelimit'
import { desc } from 'drizzle-orm'
import { idempotency, jsonBody, requireUser, sessionMiddleware, tenantMiddleware, type AppEnv, type Deps } from './context'
import { ApiError, errorHandler, notFound } from './http'
import { z } from 'zod'
import { mailOutbox } from './db/schema'
import { funnel } from './analytics'
import { render, TEMPLATES, type TemplateName } from './email/templates'
import { accountRoutes, workspaceRoutes } from './modules/workspaces'
import { stakeholderRoutes } from './modules/stakeholders'
import { organizationRoutes } from './modules/organizations'
import { initiativeRoutes } from './modules/initiatives'
import { relationshipRoutes } from './modules/relationships'
import { engagementRoutes } from './modules/engagements'
import { decisionRoutes } from './modules/decisions'
import { commitmentRoutes } from './modules/commitments'
import { insightRoutes } from './modules/insights'
import { aiRoutes } from './modules/ai'
import { createEngine } from './ai/engine'
import { billingRoutes, publicBillingRoutes } from './modules/billing'
import { entitlementMiddleware } from './billing/entitlements'
import { createBilling } from './billing'
import { createBillingNotifier } from './billing/notices'
import { createJobs } from './jobs'
import { registerJobs } from './runtime'
import { dataRoutes, personalDataRoutes } from './modules/data'
import { inboxRoutes, meRoutes, unsubscribeRoutes } from './modules/notifications'

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()
  app.onError(errorHandler)
  app.use('*', requestLogger as never)
  app.use('*', async (c, next) => { c.set('deps', deps); await next() })
  // Request bodies are small JSON documents; the largest legitimate one is meeting notes (≤ 60,000 characters).
  app.use('/api/*', bodyLimit({ maxSize: 512 * 1024, onError: () => { throw new ApiError(413, 'too_large', 'This request is too large.') } }))
  // CSRF defence in depth (session cookies are already SameSite=Lax): a state-changing request that carries an Origin
  // must come from the app's own origin. Provider webhooks and one-click unsubscribe are authenticated by signature
  // or token, not cookies, so they're exempt. Requests without an Origin (server-to-server, CLI) carry no browser cookies' intent.
  const appOrigin = new URL(deps.env.APP_URL).origin
  app.use('/api/*', async (c, next) => {
    const m = c.req.method
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !c.req.path.startsWith('/api/billing/webhooks/') && !c.req.path.startsWith('/api/notifications/unsubscribe')) {
      const origin = c.req.header('origin')
      const site = c.req.header('sec-fetch-site')
      if ((origin && origin !== appOrigin) || (!origin && site && site !== 'same-origin' && site !== 'none')) {
        throw new ApiError(403, 'bad_origin', 'This request didn’t come from the Meridian app.')
      }
    }
    await next()
  })
  // Security headers on every response. The CSP allows only same-origin scripts and connections;
  // inline styles are needed by the animation library and inline SVG.
  app.use('*', secureHeaders({
    contentSecurityPolicy: deps.env.NODE_ENV === 'production' ? {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'], connectSrc: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    } : undefined,
    referrerPolicy: 'strict-origin-when-cross-origin',
    crossOriginEmbedderPolicy: false,
  }))
  const limiter = deps.limiter ?? (deps.limiter = createLimiter())
  deps.ai ??= createEngine(process.env)
  deps.jobs ??= createJobs(deps.db)
  if (deps.billing === undefined) {
    const b = createBilling(deps.env)
    deps.billing = b.provider
    deps.simulator = b.simulator
  }
  deps.billingNotify ??= createBillingNotifier(deps)
  // The simulator delivers its signed webhooks through the same public endpoint a real provider would use.
  deps.simulator?.setDeliver(async (raw, headers) => {
    const res = await app.request('/api/billing/webhooks/simulator', { method: 'POST', headers, body: raw })
    if (!res.ok) throw new Error(`Simulator webhook delivery failed: ${res.status}`)
  })
  registerJobs(deps)

  // Liveness: the process is up. Readiness: the database answers and the job queue isn't stuck.
  app.get('/api/health', c => c.json({ ok: true, environment: deps.env.NODE_ENV === 'production' ? deps.env.DEPLOY_ENV : deps.env.NODE_ENV }))
  // Prometheus scrape endpoint; disabled unless METRICS_TOKEN is configured.
  app.get('/api/metrics', async c => {
    const token = (deps.env as unknown as Record<string, string | undefined>).METRICS_TOKEN
    if (!token) throw notFound('Endpoint')
    if (!tokenMatches(c.req.header('authorization')?.replace(/^Bearer /i, ''), token)) return c.text('unauthorized', 401)
    return c.text(await renderMetrics(deps.db), 200, { 'content-type': 'text/plain; version=0.0.4' })
  })
  app.get('/api/ready', async c => {
    const t0 = performance.now()
    try {
      await deps.db.execute(dsql`select 1`)
      const [q] = await deps.db.select({ queued: dsql<number>`count(*) filter (where ${job.status} = 'queued')::int`, dead: dsql<number>`count(*) filter (where ${job.status} = 'dead')::int`,
        oldest: dsql<number>`coalesce(extract(epoch from now() - min(${job.runAt}) filter (where ${job.status} = 'queued')), 0)::int` }).from(job)
      const lagging = q.oldest > 15 * 60
      return c.json({ ok: !lagging, db: { ok: true, ms: Math.round(performance.now() - t0) }, jobs: { queued: q.queued, dead: q.dead, oldestQueuedSeconds: q.oldest, lagging } }, lagging ? 503 : 200)
    } catch {
      return c.json({ ok: false, db: { ok: false } }, 503)
    }
  })
  // Invite-only rollout: refuse closed signups with a clear answer. (The auth library would otherwise reply with a
  // generic success to avoid revealing which emails exist, and the visitor would wait for an email that never comes.)
  // The user-creation hook in auth.ts enforces the same rule as a backstop.
  app.post('/api/auth/sign-up/email', async (c, next) => {
    if (deps.env.SIGNUP_MODE === 'open') return next()
    const body = await c.req.raw.clone().json().catch(() => null) as { email?: unknown } | null
    if (typeof body?.email === 'string' && !(await signupAllowed(deps.db, deps.env, body.email))) {
      // The auth library's error shape, so the sign-up form shows this message as-is.
      return c.json({ code: 'SIGNUP_CLOSED', message: 'Meridian is invitation-only during the pilot. Ask a workspace admin to invite you, or contact us to request access.' }, 403)
    }
    return next()
  })
  app.on(['GET', 'POST'], '/api/auth/*', c => deps.auth.handler(c.req.raw))

  // Provider webhooks and the public plan catalog: no session, no user rate limit (signatures authenticate webhooks).
  app.route('/api/billing', publicBillingRoutes)
  app.route('/api/notifications', unsubscribeRoutes)

  // Public contact/sales form. Honeypot field + per-IP limit; the visitor's details go only to SALES_EMAIL.
  app.post('/api/contact', async c => {
    const input = await jsonBody(c as never, z.object({
      name: z.string().trim().min(1, 'Required').max(80), email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email')),
      company: z.string().trim().max(120).optional().default(''), teamSize: z.string().trim().max(20).optional().default(''),
      topic: z.enum(['sales', 'support', 'security', 'other']).default('sales'), message: z.string().trim().min(10, 'Tell us a little more').max(4000),
      website: z.string().max(0).optional(), // honeypot: real people leave it empty
    }))
    const ip = clientIp(c.req.raw.headers, ipConfig(deps.env as unknown as Record<string, unknown>))
    const wait = limiter.take(`contact:${ip}`, { windowMs: 60 * 60_000, max: deps.env.NODE_ENV === 'test' ? 1000 : 5 })
    if (wait) throw new ApiError(429, 'rate_limited', 'Too many messages from this connection. Please try again later or email us directly.', { retryAfter: wait })
    const to = (deps.env as unknown as Record<string, string | undefined>).SALES_EMAIL
    if (!to) throw new ApiError(503, 'unavailable', 'The contact form isn’t set up yet. Please email us instead.')
    await deps.mailer.send({ to, template: 'contact_request', data: input })
    await deps.mailer.send({ to: input.email, template: 'contact_received', data: { name: input.name } })
    return c.json({ ok: true })
  })

  app.use('/api/*', sessionMiddleware)
  // General API limit (generous: keyboard-driven UIs make many small requests).
  app.use('/api/w/*', rateLimit(limiter, 'api', { windowMs: 60_000, max: deps.env.NODE_ENV === 'test' ? 100_000 : Number((deps.env as unknown as Record<string, string | undefined>).API_RATE_LIMIT_PER_MINUTE) || 600 }))
  app.route('/api', accountRoutes)
  app.route('/api/me', meRoutes)
  app.route('/api/me', personalDataRoutes)

  const tenant = new Hono<AppEnv>()
  tenant.use('*', tenantMiddleware)
  tenant.use('*', entitlementMiddleware)
  tenant.use('*', idempotency)
  tenant.route('/', workspaceRoutes)
  tenant.route('/stakeholders', stakeholderRoutes)
  tenant.route('/organizations', organizationRoutes)
  tenant.route('/initiatives', initiativeRoutes)
  tenant.route('/relationships', relationshipRoutes)
  tenant.route('/engagements', engagementRoutes)
  tenant.route('/decisions', decisionRoutes)
  tenant.route('/commitments', commitmentRoutes)
  tenant.route('/', insightRoutes)
  tenant.route('/ai', aiRoutes)
  tenant.route('/billing', billingRoutes)
  tenant.route('/data', dataRoutes)
  tenant.route('/', inboxRoutes)
  app.route('/api/w/:workspaceId', tenant)

  // Operator metrics (aggregates only): activation, time to first value, trial conversion. Limited to OPERATOR_EMAILS.
  app.get('/api/operator/metrics', async c => {
    const u = requireUser(c)
    const allowed = String((deps.env as unknown as Record<string, string | undefined>).OPERATOR_EMAILS ?? '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
    if (!allowed.includes(u.email.toLowerCase())) throw notFound('Endpoint')
    return c.json(await funnel(deps.db, Number(c.req.query('days')) || 30))
  })

  // Development mailbox: shows verification, reset and invitation emails that would have been sent.
  if (deps.env.NODE_ENV !== 'production') {
    app.get('/api/dev/mail', async c => c.json(await deps.db.select().from(mailOutbox).orderBy(desc(mailOutbox.createdAt)).limit(50)))
    // Renders any email template with sample data, for visual review of the HTML.
    app.get('/api/dev/email-preview/:template', c => {
      const name = c.req.param('template') as TemplateName
      if (!TEMPLATES.includes(name)) throw notFound('Template')
      const url = `${deps.env.APP_URL}/settings`
      const sample = { url, workspaceName: 'Westshire Infrastructure', inviterName: 'Rhea Kapoor', roleLabel: 'Contributor', email: 'sam@example.com', expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        memberName: 'Sam Patel', planName: 'Professional', until: new Date(Date.now() + 14 * 86_400_000).toISOString(), actorName: 'Rhea Kapoor', decisionKey: 'D-107', when: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        overdue: [{ label: 'C-176 Revise working hours proposal', meta: 'Overdue since 12 Oct' }], due: [{ label: 'C-181 Share hedgerow replanting plan', meta: 'Due 6 Nov' }],
        preferencesUrl: `${deps.env.APP_URL}/settings/notifications`, unsubscribeUrl: `${deps.env.APP_URL}/settings/notifications` }
      const r = render(name, sample)
      return c.req.query('format') === 'text' ? c.text(r.text) : c.html(r.html)
    })
  }

  app.all('/api/*', () => { throw notFound('Endpoint') })
  return app
}

export type App = ReturnType<typeof createApp>
