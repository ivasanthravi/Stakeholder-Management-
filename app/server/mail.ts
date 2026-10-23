import type { DB } from './db/client'
import { mailOutbox } from './db/schema'

export interface Mail { to: string; subject: string; text: string; url?: string; kind: 'verify' | 'reset' | 'invite' }

export interface Mailer { send(mail: Mail): Promise<void> }

/**
 * Development/test transport: stores every message in `mail_outbox` (visible at /dev/mail) and logs it.
 * Nothing leaves the machine. A real transport (SMTP/API) must be configured before production use.
 */
export function createLogMailer(db: DB, opts: { quiet?: boolean } = {}): Mailer {
  return {
    async send(mail) {
      await db.insert(mailOutbox).values(mail)
      if (!opts.quiet) console.info(`[mail:${mail.kind}] to=${mail.to} subject="${mail.subject}"${mail.url ? ` url=${mail.url}` : ''}`)
    },
  }
}
