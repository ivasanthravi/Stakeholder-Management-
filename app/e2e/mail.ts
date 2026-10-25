// Reads the email a journey would have received. Development serves the outbox at /api/dev/mail; a staging
// rehearsal runs the production build (no dev routes), so it reads the same outbox from its database instead.
import type { APIRequestContext } from '@playwright/test'
import pg from 'pg'

type Mail = { to: string; kind: string; url: string }

async function outbox(req: APIRequestContext): Promise<Mail[]> {
  if (!process.env.E2E_DB_URL) return await (await req.get('/api/dev/mail')).json() as Mail[]
  const client = new pg.Client({ connectionString: process.env.E2E_DB_URL })
  await client.connect()
  try {
    const r = await client.query<Mail>('select "to", kind, url from mail_outbox order by created_at desc limit 50')
    return r.rows
  } finally { await client.end() }
}

export async function mailLink(req: APIRequestContext, to: string, kind: string) {
  for (let i = 0; i < 20; i++) {
    const m = (await outbox(req)).find(x => x.to === to && x.kind === kind)
    if (m) return m.url
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error(`no ${kind} mail for ${to}`)
}

export const mailUrl = async (req: APIRequestContext, to: string, kind: string) => new URL(await mailLink(req, to, kind))
