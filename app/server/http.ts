import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

/** Error envelope returned by every API failure: { error: { code, message, fields?, current? } } */
export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 503, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

export const notFound = (what = 'Record') => new ApiError(404, 'not_found', `${what} not found`)
export const forbidden = (message = 'You don’t have permission to do that') => new ApiError(403, 'forbidden', message)
export const unauthorized = () => new ApiError(401, 'unauthenticated', 'Sign in to continue')
export const conflict = (message: string, extra: Record<string, unknown> = {}) => new ApiError(409, 'conflict', message, extra)
export const staleVersion = (current: unknown) => new ApiError(409, 'stale_version', 'Someone else changed this record. Review their changes and try again.', { current })

/** Maps Postgres constraint violations to user-facing messages. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  organization_name_uq: 'An organization with this name already exists',
  initiative_code_uq: 'That initiative code is already in use',
  rel_unique_active_uq: 'This relationship already exists',
  so_current_uq: 'This person is already associated with that organization',
  group_name_uq: 'A group with this name already exists',
  membership_active_uq: 'This person is already a member',
}

function pgError(err: unknown): { code?: string; constraint?: string } | null {
  let e = err as { code?: string; constraint?: string; cause?: unknown } | undefined
  for (let i = 0; i < 3 && e; i++) {
    if (e.code && /^[0-9A-Z]{5}$/.test(e.code)) return e
    e = e.cause as typeof e
  }
  return null
}

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status)
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {}
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message
    return c.json({ error: { code: 'invalid', message: 'Some fields need attention', fields } }, 422)
  }
  if (err instanceof HTTPException) return c.json({ error: { code: 'http', message: err.message } }, err.status)
  const pg = pgError(err)
  if (pg?.code === '23505') return c.json({ error: { code: 'duplicate', message: CONSTRAINT_MESSAGES[pg.constraint ?? ''] ?? 'This already exists' } }, 409)
  if (pg?.code === '23503') return c.json({ error: { code: 'invalid_reference', message: 'A linked record no longer exists' } }, 422)
  if (pg?.code === '23514') return c.json({ error: { code: 'invalid', message: 'A value is out of range' } }, 422)
  if (pg?.code === '42501') return c.json({ error: { code: 'forbidden', message: 'You don’t have permission to do that' } }, 403)
  console.error(err)
  return c.json({ error: { code: 'internal', message: 'Something went wrong on our side. Your changes were not saved.' } }, 500)
}
