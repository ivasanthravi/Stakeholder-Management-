// Phase 1 QA sweep: signs in as the sample owner, visits every screen at desktop and mobile size,
// saves screenshots, runs axe-core (WCAG 2.0–2.2 A/AA) and records console errors and horizontal overflow.
// Usage: node audit/phase1-qa.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? '../docs/implementation/screenshots'
mkdirSync(OUT, { recursive: true })
const require = createRequire(import.meta.url)
let axeSource = null
try { axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') } catch { /* fetched below */ }
if (!axeSource) axeSource = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js')).text()

// AUDIT_SELF_SIGNED=1 accepts the staging rehearsal's self-signed certificate (local only).
// axe-core is injected as an inline script, which a production CSP rightly blocks; audit contexts bypass CSP, and the
// staging rehearsal checks for real CSP violations separately.
const browser = await chromium.launch({ channel: 'chrome', args: process.env.AUDIT_SELF_SIGNED === '1' ? ['--ignore-certificate-errors'] : [] })
// One saved session per origin (dev server, staging rehearsal), so one never reuses the other's cookies.
const state = `scratch/qa-auth-${new URL(BASE).port || 'default'}.json`
async function signedInContext(vp) {
  const ctx = await browser.newContext({ ...vp, ignoreHTTPSErrors: process.env.AUDIT_SELF_SIGNED === '1', bypassCSP: true, storageState: existsSync(state) ? state : undefined })
  const p = await ctx.newPage()
  // A protected page: signed-out visitors are sent to sign-in (the root shows the marketing site to them).
  await p.goto(BASE + '/stakeholders')
  await p.waitForLoadState('networkidle')
  if (p.url().includes('/sign-in')) {
    await p.fill('input[type=email]', 'rhea@sample.meridian.test')
    await p.fill('input[type=password]', 'meridian-sample-2026')
    await p.click('button[type=submit]')
    await p.waitForURL(u => !u.pathname.startsWith('/sign-in'))
    await ctx.storageState({ path: state })
  }
  await p.close()
  return ctx
}

// Resolve real record ids through the API (as the signed-in user).
const probe = await signedInContext({ viewport: { width: 1440, height: 900 } })
const api = async path => { const r = await probe.request.get(BASE + path); return r.json() }
const me = await api('/api/me')
const w = me.workspaces[0].id
const pick = async (res, q = '') => (await api(`/api/w/${w}/${res}?limit=5${q}`)).items[0]?.id
const ids = {
  person: (await api(`/api/w/${w}/search?q=Ellwood`)).stakeholders[0]?.id,
  org: await pick('organizations'), init: await pick('initiatives'), eng: await pick('engagements'),
  dec: await pick('decisions', '&status=under_review'), com: await pick('commitments', '&overdue=true'),
  meeting: await pick('engagements', '&q=planning%20liaison'),
}

const ROUTES = [
  ['home', '/'], ['stakeholders', '/stakeholders'], ['stakeholder-peek', `/stakeholders`, async p => { await p.locator('.grid').focus(); await p.keyboard.press('j'); await p.keyboard.press('Space') }],
  ['profile', `/stakeholders/${ids.person}`], ['profile-relationships', `/stakeholders/${ids.person}?tab=relationships`], ['profile-history', `/stakeholders/${ids.person}?tab=history`],
  ['map', '/stakeholders?view=map'], ['map-selected', `/stakeholders?view=map&focus=${ids.person}`],
  ['organizations', '/organizations'], ['organization', `/organizations/${ids.org}`],
  ['initiatives', '/initiatives'], ['initiative', `/initiatives/${ids.init}`],
  ['engagements', '/engagements'], ['engagement', `/engagements/${ids.eng}`],
  ['decisions', `/decisions?open=${ids.dec}`], ['commitments', `/commitments?view=overdue&open=${ids.com}`],
  ['settings-members', '/settings/members'], ['settings-audit', '/settings/audit'],
  ['create-stakeholder', '/stakeholders', async p => { await p.locator('body').click({ position: { x: 5, y: 5 } }); await p.keyboard.press('c'); await p.keyboard.press('p') }],
  ['create-engagement', '/', async p => { await p.locator('body').click({ position: { x: 5, y: 5 } }); await p.keyboard.press('c'); await p.keyboard.press('e') }],
  ['palette', '/', async p => { await p.keyboard.press('Meta+k'); await p.keyboard.type('ellw') }],
  ['not-found', '/stakeholders/00000000-0000-0000-0000-000000000000'],
  // Phase 2: AI views
  ['ai-intelligence', `/engagements/${ids.meeting}/intelligence`],
  ['ai-briefing', `/stakeholders/${ids.person}/briefing`], ['ai-briefing-prep', `/stakeholders/${ids.person}/briefing?mode=prep`],
  ['ai-decision-briefing', `/decisions?open=${ids.dec}`, async p => { await p.getByRole('button', { name: /Decision briefing/ }).click(); await p.waitForTimeout(800) }],
  ['ai-copilot', '/', async p => { await p.keyboard.press('Meta+j'); await p.keyboard.type('Which commitments are overdue?'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200) }],
  ['ai-home-signal', '/', async p => { await p.locator('.lchev-btn').first().click() }],
  ['ai-settings', '/settings/ai'],
  ['ai-map-path', '/stakeholders?view=map', async p => { await p.getByRole('button', { name: /Find path|Find a chain/ }).click() }],
  // Phase 3: account, billing and workspace administration
  ...['profile', 'notifications', 'security', 'members', 'roles', 'billing', 'invoices', 'usage', 'data'].map(t => [`settings-${t}`, `/settings/${t}`]),
  ['inbox', '/', async p => { await p.getByRole('button', { name: /Inbox|Notifications/ }).first().click() }],
]
const PUBLIC = [['sign-in', '/sign-in'], ['sign-up', '/sign-up'], ['forgot-password', '/forgot-password'],
  // Phase 3: public marketing site
  ['site-home', '/'], ['site-product', '/product'], ['site-features', '/features'], ['site-stakeholders', '/stakeholder-intelligence'], ['site-mapping', '/relationship-mapping'],
  ['site-ai', '/ai'], ['site-pricing', '/pricing'], ['site-security', '/security'], ['site-contact', '/contact']]

const results = []
async function visit(ctx, tag, name, path, act) {
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error' && !(/401|409|503/.test(m.text()) || (name === 'not-found' && /404/.test(m.text())))) errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(BASE + path)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(name.startsWith('map') ? 2500 : 900)
  if (act) { try { await act(page); await page.waitForTimeout(700) } catch (e) { errors.push('ACTION: ' + e.message) } }
  await page.screenshot({ path: `${OUT}/${tag}-${name}.png` })
  let violations = []
  if (tag === 'desktop') {
    await page.addScriptTag({ content: axeSource })
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0]?.target.join(' ') })))
    violations = r
  }
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
  results.push({ tag, name, errors, violations, overflowX })
  await page.close()
}

for (const [tag, vp] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await signedInContext(vp)
  for (const [name, path, act] of ROUTES) {
    if (tag === 'mobile' && /create-|palette|peek|history|relationships/.test(name)) continue
    await visit(ctx, tag, name, path, act)
  }
  await ctx.close()
  const anon = await browser.newContext({ ...vp, ignoreHTTPSErrors: process.env.AUDIT_SELF_SIGNED === '1', bypassCSP: true })
  for (const [name, path] of PUBLIC) await visit(anon, tag, name, path)
  await anon.close()
}
await probe.close()
await browser.close()
writeFileSync(`${OUT}/qa-results.json`, JSON.stringify(results, null, 2))
for (const r of results) {
  const issues = [...r.errors.map(e => 'console: ' + e.slice(0, 140)), ...r.violations.map(v => `axe ${v.id} (${v.impact}) ×${v.n} ${v.target}`), ...(r.overflowX ? ['horizontal overflow'] : [])]
  if (issues.length) console.log(`${r.tag}/${r.name}:\n  ${issues.join('\n  ')}`)
}
console.log(`${results.length} views checked; ${results.filter(r => !r.errors.length && !r.violations.length && !r.overflowX).length} clean`)
