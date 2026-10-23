// Thin fetch wrapper: JSON in/out, structured errors, workspace scoping, idempotency keys.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public current?: Record<string, unknown>,
  ) { super(message) }
  get isConflict() { return this.code === 'stale_version' }
}
export class NetworkError extends Error {
  constructor() { super('You appear to be offline. Your changes have not been saved yet.') }
}

let workspaceId: string | null = null
export const setWorkspaceId = (id: string | null) => { workspaceId = id }
export const getWorkspaceId = () => workspaceId

type Listener = () => void
const unauthorizedListeners = new Set<Listener>()
/** Called when any request comes back 401 (session expired or signed out elsewhere). */
export const onUnauthorized = (l: Listener) => { unauthorizedListeners.add(l); return () => { unauthorizedListeners.delete(l) } }

export interface RequestOptions { method?: string; body?: unknown; idempotencyKey?: string; signal?: AbortSignal }

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      signal: opts.signal,
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new NetworkError()
  }
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; fields?: Record<string, string>; current?: Record<string, unknown> } } | null)?.error
    if (res.status === 401) unauthorizedListeners.forEach(l => l())
    throw new ApiError(res.status, err?.code ?? 'http_' + res.status, err?.message ?? 'Something went wrong. Please try again.', err?.fields ?? {}, err?.current)
  }
  return data as T
}

function safeJson(t: string) { try { return JSON.parse(t) } catch { return t } }

/** Path within the current workspace. */
export function ws(path: string) {
  if (!workspaceId) throw new ApiError(400, 'no_workspace', 'No workspace selected')
  return `/api/w/${workspaceId}${path}`
}

export const newIdempotencyKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

export function qs(params: Record<string, string | number | boolean | undefined | null | string[]>) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue
    u.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError || e instanceof NetworkError) return e.message
  return 'Something went wrong. Please try again.'
}
