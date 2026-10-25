// Phase 6 screenshot archive: the 16 major screens on desktop (1440) and mobile (390), plus key states
// (empty workspace, onboarding, loading, failed request). Also records page errors and horizontal overflow.
// Usage: node audit/excellence-capture.mjs <pass> [filter] [baseUrl]   → docs/excellence/screenshots/<pass>/
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const PASS = process.argv[2] ?? 'baseline'
const FILTER = process.argv[3] && process.argv[3] !== '-' ? new RegExp(process.argv[3]) : null
const BASE = process.argv[4] ?? 'http://localhost:5173'
const OUT = `../docs/excellence/screenshots/${PASS}`
mkdirSync(OUT, { recursive: true })
const VPS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
}
const browser = await chromium.launch({ channel: 'chrome' })
const signIn = async (ctx, email = 'rhea@sample.meridian.test', password = 'meridian-sample-2026') => {
  const r = await ctx.request.post(BASE + '/api/auth/sign-in/email', { headers: { origin: BASE }, data: { email, password } })
  if (!r.ok()) throw new Error(`sign-in ${email} → ${r.status()}`)
}

// Real record ids from the sample workspace.
const probe = await browser.newContext(); await signIn(probe)
const api = async p => (await probe.request.get(BASE + p)).json()
const w = (await api('/api/me')).workspaces[0].id
const first = async (res, q = '') => (await api(`/api/w/${w}/${res}?limit=5${q}`)).items?.[0]?.id
const ids = {
  person: (await api(`/api/w/${w}/search?q=Ellwood`)).stakeholders?.[0]?.id,
  org: await first('organizations'), init: await first('initiatives'),
  meeting: await first('engagements', '&q=planning%20liaison'),
}
await probe.close()

// A fresh verified account with no workspace (onboarding) and one with an empty workspace.
const stamp = Date.now()
async function freshUser(label) {
  const ctx = await browser.newContext()
  const email = `excellence.${label}.${stamp}@example.test`
  await ctx.request.post(BASE + '/api/auth/sign-up/email', { headers: { origin: BASE }, data: { email, password: 'correct-horse-battery', name: 'Avery Excellence' } })
  for (let i = 0; i < 20; i++) {
    const m = (await (await ctx.request.get(BASE + '/api/dev/mail')).json()).find(x => x.to === email && x.kind === 'verify')
    if (m) { const u = new URL(m.url); await ctx.request.get(BASE + u.pathname + u.search); break }
    await new Promise(r => setTimeout(r, 250))
  }
  await ctx.close()
  return email
}
const onboardEmail = await freshUser('onboard')
const emptyEmail = await freshUser('empty')
{ const c = await browser.newContext(); await signIn(c, emptyEmail, 'correct-horse-battery')
  await c.request.post(BASE + '/api/workspaces', { headers: { origin: BASE }, data: { name: 'Empty Workspace' } }); await c.close() }

const copilot = async p => {
  await p.keyboard.press('Meta+j'); await p.waitForTimeout(500)
  await p.keyboard.type('Which commitments are overdue?'); await p.keyboard.press('Enter'); await p.waitForTimeout(2500)
}
const SCREENS = [
  ['01-command-center', '/'], ['02-directory', '/stakeholders'], ['03-profile', `/stakeholders/${ids.person}`],
  ['04-universe', '/stakeholders?view=map', null, 2500], ['05-organizations', '/organizations'], ['05b-organization', `/organizations/${ids.org}`],
  ['06-initiatives', '/initiatives'], ['06b-initiative', `/initiatives/${ids.init}`], ['07-engagements', '/engagements'],
  ['08-decisions', '/decisions'], ['09-commitments', '/commitments'], ['10-copilot', '/', copilot],
  ['11-meeting-intelligence', `/engagements/${ids.meeting}/intelligence`, null, 1500], ['12-settings', '/settings'],
  ['12b-settings-members', '/settings/members'], ['15-billing', '/settings/billing'],
]
const PUBLIC = [['14-pricing', '/pricing'], ['16-marketing-home', '/'], ['16b-marketing-ai', '/ai'], ['16c-sign-in', '/sign-in']]
const log = []
async function shot(ctx, vp, name, path, act, wait = 1000, opts = {}) {
  if (FILTER && !FILTER.test(name)) return
  const page = await ctx.newPage(); const errs = []
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
  page.on('console', m => { if (m.type() === 'error' && !/401|404|409|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200)) })
  if (opts.route) await page.route(opts.route.pattern, opts.route.handler)
  const t0 = Date.now()
  await page.goto(BASE + path); await page.waitForLoadState('networkidle').catch(() => {})
  const loadMs = Date.now() - t0
  await page.waitForTimeout(opts.snapAt ?? wait)
  if (act) { try { await act(page) } catch (e) { errs.push('ACTION ' + e.message.slice(0, 160)) } }
  await page.screenshot({ path: `${OUT}/${vp}-${name}.png` })
  if (!act && !opts.noFull) await page.screenshot({ path: `${OUT}/${vp}-${name}-full.png`, fullPage: true })
  const ov = await page.evaluate(() => {
    const W = innerWidth; const bad = []
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed') { bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} → ${Math.round(r.right)}`); if (bad.length > 4) break }
    }
    return { docOverflow: document.documentElement.scrollWidth > W + 1, overflowing: bad }
  })
  log.push({ vp, name, path, loadMs, errs, ...ov }); await page.close()
}

for (const [vp, opts] of Object.entries(VPS)) {
  const ctx = await browser.newContext(opts); await signIn(ctx)
  for (const [name, path, act, wait] of SCREENS) await shot(ctx, vp, name, path, act, wait)
  // States: loading (API held for 4 s), failed request.
  await shot(ctx, vp, 'state-loading-directory', '/stakeholders', null, 0, { noFull: true, snapAt: 300, route: { pattern: /\/api\/w\/[^/]+\/stakeholders(\?|$)/, handler: async r => { await new Promise(x => setTimeout(x, 4000)); await r.continue().catch(() => {}) } } })
  await shot(ctx, vp, 'state-error-directory', '/stakeholders', null, 6000, { noFull: true, route: { pattern: /\/api\/w\/[^/]+\/stakeholders(\?|$)/, handler: r => r.abort('internetdisconnected') } })
  await shot(ctx, vp, 'state-loading-home', '/', null, 0, { noFull: true, snapAt: 300, route: { pattern: /\/api\/w\/[^/]+\/(insights|ai)\//, handler: async r => { await new Promise(x => setTimeout(x, 4000)); await r.continue().catch(() => {}) } } })
  // No results: type a filter that matches nobody (the Directory doesn't read a ?q= URL parameter).
  await shot(ctx, vp, 'state-no-results-directory', '/stakeholders', async p => { await p.getByPlaceholder(/Filter by name/).fill('zzqx-no-such-person'); await p.waitForTimeout(1200) }, 1200)
  await ctx.close()

  const empty = await browser.newContext(opts); await signIn(empty, emptyEmail, 'correct-horse-battery')
  for (const [name, path] of [['state-empty-command-center', '/'], ['state-empty-directory', '/stakeholders'], ['state-empty-universe', '/stakeholders?view=map'], ['state-empty-commitments', '/commitments']]) await shot(empty, vp, name, path, null, 1500)
  await empty.close()

  const onboard = await browser.newContext(opts); await signIn(onboard, onboardEmail, 'correct-horse-battery')
  await shot(onboard, vp, '13-onboarding', '/onboarding', null, 1200)
  await onboard.close()

  const anon = await browser.newContext(opts)
  for (const [name, path] of PUBLIC) await shot(anon, vp, name, path, null, 1500)
  await anon.close()
}
writeFileSync(`${OUT}/capture-log.json`, JSON.stringify({ base: BASE, capturedAt: new Date().toISOString(), ids, log }, null, 2))
await browser.close()
const problems = log.filter(l => l.errs.length || l.docOverflow)
console.log(`${log.length} captures → ${OUT}; ${problems.length} with page errors or horizontal overflow`)
for (const p of problems) console.log(`  ${p.vp}/${p.name}: ${[...p.errs, ...(p.docOverflow ? ['overflow: ' + p.overflowing.join(', ')] : [])].join(' | ')}`)
