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
        await mailer.send({ to: u.email, subject: 'Reset your Meridian password', text: `Reset your password: ${url}\nThis link expires in 1 hour.`, url, kind: 'reset' })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        await mailer.send({ to: u.email, subject: 'Verify your email for Meridian', text: `Confirm your email address: ${url}`, url, kind: 'verify' })
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh daily while active
    },
    rateLimit: { enabled: env.NODE_ENV === 'production', window: 60, max: 100 },
    advanced: { useSecureCookies: env.NODE_ENV === 'production' },
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
