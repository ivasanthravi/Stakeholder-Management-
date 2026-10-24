import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { DB } from './db/client'
import { account, auditEvent, session, user, verification } from './db/schema'
import type { Env } from './env'
import type { Mailer } from './mail'

/** Identity is delegated to Better Auth (password hashing, sessions, verification, reset). */
export function createAuth(db: DB, env: Env, mailer: Mailer) {
  return betterAuth({
    appName: 'Meridian',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: u, url }) => {
        await mailer.send({ to: u.email, userId: u.id, template: 'reset', data: { url } })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        await mailer.send({ to: u.email, userId: u.id, template: 'verify', data: { url } })
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh daily while active
    },
    rateLimit: { enabled: env.NODE_ENV === 'production', window: 60, max: 100 },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      // Rate limits key on the client IP. Use a header the platform sets (CLIENT_IP_HEADER), or tell Better Auth which
      // proxies to trust so a forged X-Forwarded-For can't rotate identities or share one bucket across everyone.
      ipAddress: {
        ipAddressHeaders: [(env as unknown as Record<string, string | undefined>).CLIENT_IP_HEADER?.toLowerCase() || 'x-forwarded-for'],
        ...((env as unknown as Record<string, string | undefined>).TRUSTED_PROXIES ? { trustedProxies: (env as unknown as Record<string, string>).TRUSTED_PROXIES.split(',').map(x => x.trim()).filter(Boolean) } : {}),
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async s => {
            await db.insert(auditEvent).values({ action: 'auth.sign_in', actorId: s.userId, entityType: 'session', entityId: s.id, ip: s.ipAddress ?? null, userAgent: s.userAgent ?? null })
          },
        },
      },
      user: {
        create: {
          after: async u => { await db.insert(auditEvent).values({ action: 'auth.sign_up', actorId: u.id, entityType: 'user', entityId: u.id }) },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
