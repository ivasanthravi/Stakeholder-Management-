import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { createLimiter, rateLimit } from './ratelimit'
import { desc } from 'drizzle-orm'
import { idempotency, sessionMiddleware, tenantMiddleware, type AppEnv, type Deps } from './context'
import { errorHandler, notFound } from './http'
import { mailOutbox } from './db/schema'
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

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()
  app.onError(errorHandler)
  app.use('*', async (c, next) => { c.set('deps', deps); await next() })
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

  app.get('/api/health', c => c.json({ ok: true }))
  app.on(['GET', 'POST'], '/api/auth/*', c => deps.auth.handler(c.req.raw))

  app.use('/api/*', sessionMiddleware)
  // General API limit (generous: keyboard-driven UIs make many small requests).
  app.use('/api/w/*', rateLimit(limiter, 'api', deps.env.NODE_ENV === 'test' ? { windowMs: 60_000, max: 100_000 } : { windowMs: 60_000, max: 600 }))
  app.route('/api', accountRoutes)

  const tenant = new Hono<AppEnv>()
  tenant.use('*', tenantMiddleware)
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
  app.route('/api/w/:workspaceId', tenant)

  // Development mailbox: shows verification, reset and invitation emails that would have been sent.
  if (deps.env.NODE_ENV !== 'production') {
    app.get('/api/dev/mail', async c => c.json(await deps.db.select().from(mailOutbox).orderBy(desc(mailOutbox.createdAt)).limit(50)))
  }

  app.all('/api/*', () => { throw notFound('Endpoint') })
  return app
}

export type App = ReturnType<typeof createApp>
