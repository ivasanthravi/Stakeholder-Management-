// Post-deployment smoke test. Read-only: it never creates, changes or deletes data.
// Usage: BASE_URL=https://staging.example.com [SMOKE_EMAIL=… SMOKE_PASSWORD=…] npx tsx scripts/smoke.ts
// Exit code 1 on any failure. Use a dedicated smoke-test account in a dedicated workspace, never a customer's.
const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const results: { check: string; ok: boolean; detail?: string }[] = []
const check = (name: string, ok: boolean, detail?: string) => { results.push({ check: name, ok, detail }); console.info(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const get = (p: string, init: RequestInit = {}) => fetch(BASE + p, { redirect: 'manual', ...init, signal: AbortSignal.timeout(15_000) })

async function main() {
  const health = await get('/api/health').catch(() => null)
  check('liveness /api/health', health?.status === 200)
  // SMOKE_LEGACY=1 when verifying a rollback to a release older than the readiness endpoint and request ids (Phase 4).
  const legacy = process.env.SMOKE_LEGACY === '1'
  const ready = await get('/api/ready').catch(() => null)
  const r = ready ? await ready.json().catch(() => ({})) as { ok?: boolean; jobs?: { dead?: number } } : {}
  if (legacy && ready?.status === 404) check('readiness /api/ready', true, 'not in this release (legacy)')
  else check('readiness /api/ready (database + job queue)', ready?.status === 200 && r.ok === true, ready ? `status ${ready.status}${r.jobs?.dead ? `, ${r.jobs.dead} dead jobs` : ''}` : 'unreachable')
  for (const p of ['/', '/pricing', '/sign-in']) {
    const res = await get(p).catch(() => null)
    const html = res ? await res.text() : ''
    check(`page ${p} serves the app shell`, res?.status === 200 && html.includes('<div id="root">'))
  }
  const h = health?.headers
  if (h) {
    check('security headers present', !!h.get('x-content-type-options') && !!h.get('referrer-policy'))
    if (BASE.startsWith('https://')) {
      check('HSTS on HTTPS', /max-age=\d+/.test(h.get('strict-transport-security') ?? ''))
      check('CSP in production', /default-src 'self'/.test(h.get('content-security-policy') ?? ''))
    }
    check('request id echoed', !!h.get('x-request-id') || legacy, legacy && !h.get('x-request-id') ? 'not in this release (legacy)' : undefined)
  }
  const plans = await get('/api/billing/plans').catch(() => null)
  check('public plan catalog', plans?.status === 200)
  const devMail = await get('/api/dev/mail').catch(() => null)
  if (BASE.startsWith('https://')) check('development routes absent', devMail?.status === 404)

  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    const origin = new URL(BASE).origin
    const s = await get('/api/auth/sign-in/email', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD }) })
    check('sign-in with the smoke account', s.status === 200)
    const cookie = s.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
    const me = await get('/api/me', { headers: { cookie } })
    const body = await me.json().catch(() => ({})) as { workspaces?: { id: string }[] }
    check('session works (/api/me)', me.status === 200 && Array.isArray(body.workspaces))
    const w = body.workspaces?.[0]?.id
    if (w) {
      for (const p of ['/stakeholders?limit=5', '/dashboard', '/billing', '/search?q=a']) {
        const t0 = performance.now()
        const res = await get(`/api/w/${w}${p}`, { headers: { cookie } })
        check(`workspace read ${p}`, res.status === 200, `${Math.round(performance.now() - t0)} ms`)
      }
    }
    await get('/api/auth/sign-out', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' })
  } else check('authenticated checks', true, 'skipped (SMOKE_EMAIL/SMOKE_PASSWORD not set)')

  const failed = results.filter(x => !x.ok).length
  console.info(`${results.length - failed}/${results.length} smoke checks passed against ${BASE}`)
  process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error('smoke test crashed:', (e as Error).message); process.exit(1) })
