// Structured logging. One JSON object per line (production) or a compact line (development), always with a level,
// message and — inside requests — the request id. Never logs request bodies, query parameters of database errors,
// cookies, tokens or secrets: database errors are reduced to their code and the first line of the message.
import { randomUUID } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { observeRequest } from './metrics'

type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const SECRETISH = /(authorization|cookie|password|secret|token|api[_-]?key|signature)/i
const json = process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json'

/** Error → safe fields. Drizzle errors embed the SQL and its parameters (which can contain record content): drop them. */
export function errorFields(err: unknown): Fields {
  const e = err as { name?: string; message?: string; code?: string; constraint?: string; status?: number; cause?: unknown; stack?: string }
  const cause = e?.cause as { code?: string; message?: string; constraint?: string } | undefined
  const first = (m?: string) => (m ?? '').split('\n')[0].replace(/params:.*$/i, '').slice(0, 300)
  return {
    errName: e?.name, errMessage: /^Failed query/i.test(e?.message ?? '') ? `Failed query (${cause?.code ?? 'db'}): ${first(cause?.message)}` : first(e?.message),
    errCode: e?.code ?? cause?.code, constraint: e?.constraint ?? cause?.constraint, status: e?.status,
    stack: process.env.NODE_ENV === 'production' ? e?.stack?.split('\n').slice(1, 6).map(s => s.trim()).join(' | ') : undefined,
  }
}

function clean(f: Fields): Fields {
  const out: Fields = {}
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined) continue
    out[k] = SECRETISH.test(k) ? '[redacted]' : v
  }
  return out
}

export function log(level: Level, msg: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === 'test' && level !== 'error' && !process.env.LOG_IN_TESTS) return
  const f = clean(fields)
  const line = json ? JSON.stringify({ t: new Date().toISOString(), level, msg, ...f }) : `${level.toUpperCase().padEnd(5)} ${msg}${Object.keys(f).length ? ' ' + JSON.stringify(f) : ''}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
  if (level === 'error') reportError(msg, f)
}

// ── Error reporting hook ─────────────────────────────────────────────────────
// A deployment can register a reporter (e.g. an error-tracking service) without this module depending on it.
type Reporter = (msg: string, fields: Fields) => void
let reporter: Reporter | null = null
export const setErrorReporter = (r: Reporter | null) => { reporter = r }
function reportError(msg: string, f: Fields) { try { reporter?.(msg, f) } catch { /* never let reporting break the request */ } }

// ── Request logging + correlation ────────────────────────────────────────────
export const requestLogger: MiddlewareHandler<{ Variables: { requestId: string } }> = async (c, next) => {
  // Accept an upstream id only if it looks like one; otherwise mint our own.
  const given = c.req.header('x-request-id')
  const id = given && /^[A-Za-z0-9._-]{8,80}$/.test(given) ? given : randomUUID()
  c.set('requestId', id)
  c.header('x-request-id', id)
  const t0 = performance.now()
  await next()
  const ms = Math.round(performance.now() - t0)
  const status = c.res.status
  if (c.req.path.startsWith('/api/')) observeRequest(status, ms)
  // Paths only (no query strings: they can carry tokens, e.g. unsubscribe links).
  const path = c.req.path.replace(/\/[0-9a-f-]{36}/gi, '/:id').replace(/\/invitations\/[^/]+/, '/invitations/:token')
  if (status >= 500) log('error', 'request failed', { requestId: id, method: c.req.method, path, status, ms })
  else if (ms > 1500 || process.env.LOG_REQUESTS === 'true') log(ms > 1500 ? 'warn' : 'info', ms > 1500 ? 'slow request' : 'request', { requestId: id, method: c.req.method, path, status, ms })
}
