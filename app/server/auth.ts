import { betterAuth } from 'better-auth'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import type { DB } from './db/client'
import { APIError } from 'better-auth/api'
import { and, gt, isNull, sql } from 'drizzle-orm'
import { account, auditEvent, invitation, session, user, verification } from './db/schema'
import type { Env } from './env'
import type { Mailer } from './mail'
import { track } from './analytics'

/** Invite-only rollout: an account may be created for an allow-listed address or one holding a pending invitation. */
export async function signupAllowed(db: DB, env: Env, email: string) {
  if (env.SIGNUP_MODE === 'open') return true
  const e = email.trim().toLowerCase()
  const list = env.SIGNUP_ALLOWLIST.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  if (list.some(x => (x.startsWith('@') ? e.endsWith(x) : e === x))) return true
  const [inv] = await db.select({ id: invitation.id }).from(invitation)
    .where(and(sql`lower(${invitation.email}) = ${e}`, isNull(invitation.acceptedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, new Date()))).limit(1)
  return !!inv
}

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
      // Signup completes when the address is verified (the funnel's first step after signup_started).
      afterEmailVerification: async u => { await track(db, 'signup_completed', { userId: u.id }) },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh daily while active
    },
    // Sign-in/sign-up attempts per client IP per 10 s (library default 3). Customers behind one office NAT share an IP,
    // so this is a deliberate setting (AUTH_RATE_LIMIT_PER_10S), not a hidden default.
    rateLimit: {
      enabled: env.NODE_ENV === 'production', window: 60, max: 100,
      customRules: Object.fromEntries(['/sign-in/*', '/sign-up/*'].map(p => [p, { window: 10, max: env.AUTH_RATE_LIMIT_PER_10S }])),
    },
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
          before: async u => {
            if (!(await signupAllowed(db, env, u.email))) {
              throw new APIError('FORBIDDEN', { message: 'Meridian is invitation-only during the pilot. Ask a workspace admin to invite you, or contact us to request access.' })
            }
          },
          after: async u => {
            await db.insert(auditEvent).values({ action: 'auth.sign_up', actorId: u.id, entityType: 'user', entityId: u.id })
            await track(db, 'signup_started', { userId: u.id })
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
