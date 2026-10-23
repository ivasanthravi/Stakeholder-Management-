// Notifications: an in-app entry (the inbox) plus, when the recipient allows it, an email.
// Titles name records by key or workspace only — never stakeholder details — because they also appear in email subjects.
import { eq } from 'drizzle-orm'
import { notification, user, userPreference } from './db/schema'
import type { Deps } from './context'
import type { NotificationType, OutgoingEmail } from './mail'

export interface Notice {
  userId: string
  workspaceId: string
  type: NotificationType | 'billing'
  title: string
  href?: string | null
  /** Collapses repeats (e.g. one overdue digest per user per day). */
  dedupeKey?: string
  email?: Omit<OutgoingEmail, 'to' | 'userId' | 'workspaceId'>
}

export async function notify(deps: Pick<Deps, 'db' | 'mailer'>, n: Notice) {
  const { db, mailer } = deps
  const [pref] = await db.select({ n: userPreference.notifications }).from(userPreference).where(eq(userPreference.userId, n.userId))
  const p = pref?.n?.[n.type]
  if (p?.inApp ?? true) {
    const inserted = await db.insert(notification).values({ workspaceId: n.workspaceId, userId: n.userId, kind: n.type, title: n.title.slice(0, 160), href: n.href ?? null, dedupeKey: n.dedupeKey ?? null })
      .onConflictDoNothing().returning({ id: notification.id })
    if (n.dedupeKey && !inserted[0]) return { skipped: 'duplicate' as const }
  }
  if (!n.email) return { emailed: false }
  const [u] = await db.select({ email: user.email }).from(user).where(eq(user.id, n.userId))
  if (!u) return { emailed: false }
  const r = await mailer.send({ ...n.email, to: u.email, userId: n.userId, workspaceId: n.workspaceId })
  return { emailed: r.status === 'sent' || r.status === 'queued' }
}
