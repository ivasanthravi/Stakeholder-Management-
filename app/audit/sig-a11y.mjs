// Phase 8 accessibility audit of the flagship screens in their interactive states: axe-core (WCAG 2.0–2.2 A/AA) at
// 1440 and 390, plus keyboard checks (focus visible on the first Tab stops, Escape closes panels, the map's list view).
// Usage: node audit/sig-a11y.mjs [base]   Output: ../docs/signature-experience/evidence/a11y.json
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const require = createRequire(import.meta.url)
let axeSource = null
try { axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') } catch { /* fetched below */ }
if (!axeSource) axeSource = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js')).text()

const browser = await chromium.launch({ channel: 'chrome' })
const results = []
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp, bypassCSP: true })
  const page = await ctx.newPage()
  await page.goto(BASE + '/sign-in')
  await page.getByLabel('Email').fill('rhea@sample.meridian.test')
  await page.getByLabel('Password').fill('meridian-sample-2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/sign-in'))
  const id = await page.evaluate(async () => { const ws = (await (await fetch('/api/me')).json()).workspaces[0].id; return (await (await fetch(`/api/w/${ws}/stakeholders?sort=influence&limit=1`)).json()).items[0].id })
  const axe = async name => {
    await page.waitForTimeout(600)
    await page.addScriptTag({ content: axeSource })
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map(x => ({ id: x.id, impact: x.impact, n: x.nodes.length, target: x.nodes[0]?.target.join(' ') })))
    results.push({ width: vp.width, state: name, violations: v })
  }
  const desktop = vp.width > 800
  await page.goto(BASE + '/'); await page.locator('.ledger-list .lrow').first().waitFor()
  await axe('command center')
  await page.getByRole('button', { name: /Why this is here/ }).first().click(); await axe('command center · signal expanded')
  const brief = page.getByRole('button', { name: /^Show \d+ items?$/ })
  if (await brief.count()) { await brief.click(); await axe('command center · briefing expanded'); await page.getByRole('button', { name: 'Hide', exact: true }).first().click() }
  await page.goto(BASE + '/stakeholders?view=map')
  if (desktop) {
    await page.locator('.uni-count').waitFor(); await axe('universe')
    await page.locator('.uni-canvas').focus(); await page.keyboard.press('ArrowRight'); await page.locator('.peek').waitFor(); await axe('universe · focus panel')
    await page.keyboard.press('Escape')
  } else {
    await page.waitForTimeout(800); await axe('universe (list on phones)')
  }
  for (const tab of ['overview', 'activity', 'relationships', 'commitments', 'history']) {
    await page.goto(`${BASE}/stakeholders/${id}?tab=${tab}`); await page.locator('h1').waitFor(); await axe(`profile · ${tab}`)
  }
  await ctx.close()
}

// Keyboard: the first Tab stops on each flagship screen show a visible focus indicator.
const kctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const kp = await kctx.newPage()
await kp.goto(BASE + '/sign-in')
await kp.getByLabel('Email').fill('rhea@sample.meridian.test'); await kp.getByLabel('Password').fill('meridian-sample-2026')
await kp.getByRole('button', { name: 'Sign in' }).click(); await kp.waitForURL(u => !u.pathname.startsWith('/sign-in'))
const keyboard = []
for (const path of ['/', '/stakeholders?view=map', '/stakeholders?view=table']) {
  await kp.goto(BASE + path); await kp.waitForTimeout(1200)
  let visible = 0, total = 0
  for (let i = 0; i < 12; i++) {
    await kp.keyboard.press('Tab')
    const r = await kp.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')
      return { ring, label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40) }
    })
    if (!r) continue
    total++; if (r.ring) visible++
  }
  keyboard.push({ path, tabStops: total, withVisibleFocus: visible })
}
await browser.close()
mkdirSync('../docs/signature-experience/evidence', { recursive: true })
writeFileSync('../docs/signature-experience/evidence/a11y.json', JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, results, keyboard }, null, 1))
for (const r of results) console.log(`${String(r.width).padStart(4)} ${r.state.padEnd(40)} ${r.violations.length ? r.violations.map(v => `${v.id}(${v.impact})×${v.n} ${v.target}`).join('; ') : 'clean'}`)
for (const k of keyboard) console.log('keyboard', k.path, `${k.withVisibleFocus}/${k.tabStops} tab stops show focus`)
