// Email delivery: render a template, respect preferences, log the attempt, deliver, retry on failure.
//
// Transports: `log` (development/test — stores in mail_outbox, visible at /dev/mail, nothing leaves the machine) and
// `postmark` (production). Account and billing email is attempted immediately; a failure is retried by a background job.
// The delivery log (email_message) records template, recipient and status — never bodies or links, which may carry tokens.
import { errorFields, log } from './log'
import { createHash, randomBytes } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { DB } from './db/client'
import { emailMessage, mailOutbox, user, userPreference } from './db/schema'
import { render, type TemplateName } from './email/templates'
import type { Jobs } from './jobs'

export interface OutgoingEmail { to: string; template: TemplateName; data: Record<string, unknown>; userId?: string | null; workspaceId?: string | null }
export interface Mailer { send(mail: OutgoingEmail): Promise<{ status: 'sent' | 'queued' | 'suppressed' | 'failed' }> }

export interface Delivery { to: string; from: string; subject: string; html: string; text: string; tag: string; headers: Record<string, string>; url?: string | null }
export interface Transport { name: string; deliver(d: Delivery): Promise<{ messageId: string | null }> }

/** Notification types users can switch off. Account and billing email can't be (they're needed to use the service). */
export const NOTIFICATION_TYPES = {
  commitments_digest: 'Commitments due soon and overdue (daily digest)',
  decision_assigned: 'A decision is assigned to me',
  invitation_accepted: 'Someone accepts my invitation',
} as const
export type NotificationType = keyof typeof NOTIFICATION_TYPES

export function createLogTransport(db: DB, opts: { quiet?: boolean } = {}): Transport {
  return {
    name: 'log',
    async deliver(d) {
      await db.insert(mailOutbox).values({ to: d.to, subject: d.subject, text: d.text, url: d.url ?? null, kind: d.tag })
      // Links can carry sign-in tokens: printed only in development, never in production logs.
      if (!opts.quiet) log('info', 'mail (log transport)', { template: d.tag, to: d.to, ...(process.env.NODE_ENV !== 'production' && d.url ? { link: d.url } : {}) })
      return { messageId: null }
    },
  }
}

/** A delivery that can never succeed (invalid or inactive recipient): recorded as failed, never retried. */
export class PermanentMailError extends Error {}

/** Postmark HTTP API (https://postmarkapp.com/developer/api/email-api). The server token is never logged. */
export function createPostmarkTransport(token: string, stream = 'outbound'): Transport {
  return {
    name: 'postmark',
    async deliver(d) {
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-postmark-server-token': token },
        body: JSON.stringify({ From: d.from, To: d.to, Subject: d.subject, HtmlBody: d.html, TextBody: d.text, Tag: d.tag, MessageStream: stream,
          Headers: Object.entries(d.headers).map(([Name, Value]) => ({ Name, Value })) }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = await res.json().catch(() => ({})) as { MessageID?: string; ErrorCode?: number; Message?: string }
      const code = body.ErrorCode ?? 0
      // 300 invalid address; 406 inactive recipient (Postmark suppresses hard bounces and spam complaints itself).
      if (code === 300 || code === 406) throw new PermanentMailError(`Postmark ${code}: recipient can't receive email`)
      if (!res.ok || code !== 0) throw new Error(`Postmark ${res.status} ${code || ''}: ${body.Message ?? 'request failed'}`)
      return { messageId: body.MessageID ?? null }
    },
  }
}

const hash = (t: string) => createHash('sha256').update(t).digest('hex')

/** Creates (or rotates) the user's unsubscribe token; returns the raw token for the link. */
async function unsubscribeToken(db: DB, userId: string) {
  const raw = randomBytes(24).toString('base64url')
  await db.insert(userPreference).values({ userId, unsubscribeTokenHash: hash(raw) })
    .onConflictDoUpdate({ target: userPreference.userId, set: { unsubscribeTokenHash: hash(raw), updatedAt: new Date() } })
  return raw
}

export async function notificationEnabled(db: DB, userId: string, type: NotificationType) {
  const [p] = await db.select({ n: userPreference.notifications }).from(userPreference).where(eq(userPreference.userId, userId))
  return p?.n?.[type]?.email ?? true
}

export function createMailer(db: DB, transport: Transport, opts: { from: string; appUrl: string; jobs?: Jobs }): Mailer {
  async function attempt(id: string, mail: OutgoingEmail, userId: string | null) {
    const r = render(mail.template, mail.data)
    const headers: Record<string, string> = { 'X-Entity-Ref-ID': id }
    if (r.category === 'notification' && userId) {
      // RFC 8058 one-click unsubscribe; the same link works from the email body.
      const token = await unsubscribeToken(db, userId)
      const url = `${opts.appUrl}/api/notifications/unsubscribe?token=${token}`
      mail.data.unsubscribeUrl = url
      headers['List-Unsubscribe'] = `<${url}>`
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
      Object.assign(r, render(mail.template, mail.data))
    }
    const res = await transport.deliver({ to: mail.to, from: opts.from, subject: r.subject, html: r.html, text: r.text, tag: mail.template, headers, url: typeof mail.data.url === 'string' ? mail.data.url : null })
    await db.update(emailMessage).set({ status: 'sent', providerMessageId: res.messageId, attempts: sql`${emailMessage.attempts} + 1`, error: null, sentAt: new Date() }).where(eq(emailMessage.id, id))
  }

  opts.jobs?.register('email.retry', async p => {
    const mail = p.mail as OutgoingEmail
    try { await attempt(String(p.id), mail, (p.userId as string | null) ?? null) } catch (e) {
      await db.update(emailMessage).set({ status: 'failed', attempts: sql`${emailMessage.attempts} + 1`, error: (e as Error).message.slice(0, 300) }).where(eq(emailMessage.id, String(p.id)))
      if (!(e instanceof PermanentMailError)) throw e
    }
  })

  return {
    async send(mail) {
      const meta = render(mail.template, { ...mail.data, preferencesUrl: `${opts.appUrl}/settings/notifications`, unsubscribeUrl: `${opts.appUrl}/settings/notifications` })
      mail.data.preferencesUrl = `${opts.appUrl}/settings/notifications`
      let userId = mail.userId ?? null
      if (!userId) userId = (await db.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${mail.to.toLowerCase()}`).limit(1))[0]?.id ?? null
      const suppressed = meta.category === 'notification' && userId && !(await notificationEnabled(db, userId, mail.template as NotificationType))
      const [row] = await db.insert(emailMessage).values({
        to: mail.to, userId, workspaceId: mail.workspaceId ?? null, template: mail.template, category: meta.category, subject: meta.subject,
        status: suppressed ? 'suppressed' : 'queued', transport: transport.name,
      }).returning({ id: emailMessage.id })
      if (suppressed) return { status: 'suppressed' }
      try {
        await attempt(row.id, mail, userId)
        return { status: 'sent' }
      } catch (e) {
        await db.update(emailMessage).set({ status: 'failed', attempts: 1, error: (e as Error).message.slice(0, 300) }).where(eq(emailMessage.id, row.id))
        if (e instanceof PermanentMailError) {
          log('warn', 'mail not deliverable', { template: mail.template, ...errorFields(e) })
          return { status: 'failed' }
        }
        if (!opts.jobs) throw e
        await opts.jobs.enqueue('email.retry', { id: row.id, mail, userId }, { maxAttempts: 5 })
        log('warn', 'mail delivery failed, queued for retry', { template: mail.template, ...errorFields(e) })
        return { status: 'queued' }
      }
    },
  }
}

/** Kept for tests and tools that construct a mailer without a jobs runner. */
export function createLogMailer(db: DB, opts: { quiet?: boolean; appUrl?: string } = {}): Mailer {
  return createMailer(db, createLogTransport(db, opts), { from: 'Meridian <no-reply@localhost>', appUrl: opts.appUrl ?? 'http://localhost:5173' })
}
