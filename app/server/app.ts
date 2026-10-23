import { Hono } from 'hono'
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

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>()
  app.onError(errorHandler)
  app.use('*', async (c, next) => { c.set('deps', deps); await next() })

  app.get('/api/health', c => c.json({ ok: true }))
  app.on(['GET', 'POST'], '/api/auth/*', c => deps.auth.handler(c.req.raw))

  app.use('/api/*', sessionMiddleware)
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
  app.route('/api/w/:workspaceId', tenant)

  // Development mailbox: shows verification, reset and invitation emails that would have been sent.
  if (deps.env.NODE_ENV !== 'production') {
    app.get('/api/dev/mail', async c => c.json(await deps.db.select().from(mailOutbox).orderBy(desc(mailOutbox.createdAt)).limit(50)))
  }

  app.all('/api/*', () => { throw notFound('Endpoint') })
  return app
}

export type App = ReturnType<typeof createApp>
