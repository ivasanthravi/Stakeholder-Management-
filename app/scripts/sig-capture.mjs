// Phase 8 visual capture: the three flagship screens (Command Center, Stakeholder Universe, Stakeholder Profile) at
// several widths, with time-to-settle for each. Same steps before and after, so screenshots compare like for like.
// Usage: node scripts/sig-capture.mjs <base> <label> [email] [password]
// Output: ../docs/signature-experience/screenshots/<label>/ and <label>.json
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const [BASE = 'http://localhost:5173', LABEL = 'before', EMAIL = 'rhea@sample.meridian.test', PASSWORD = 'meridian-sample-2026'] = process.argv.slice(2)
const OUT = `../docs/signature-experience/screenshots/${LABEL}`
mkdirSync(OUT, { recursive: true })
const WIDTHS = [1440, 1280, 1024, 768, 390, 320]

const browser = await chromium.launch({ channel: 'chrome' })
const auth = await browser.newContext()
const ap = await auth.newPage()
await ap.goto(BASE + '/sign-in')
await ap.getByLabel('Email').fill(EMAIL)
await ap.getByLabel('Password').fill(PASSWORD)
await ap.getByRole('button', { name: 'Sign in' }).click()
await ap.waitForURL(u => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 })
const state = await auth.storageState()
// The most influential stakeholder gives a profile with history, relationships and commitments.
const list = await ap.evaluate(async () => {
  const ws = (await (await fetch('/api/me')).json()).workspaces[0].id
  const r = await (await fetch(`/api/w/${ws}/stakeholders?sort=influence&limit=1`)).json()
  return r.items?.[0]?.id
})
await auth.close()

async function settle(page) {
  const t0 = Date.now(); let quiet = null
  while (Date.now() - t0 < 30_000) {
    const busy = await page.evaluate(() => document.querySelectorAll('.skeleton, .uni-loading').length > 0 || performance.getEntriesByType('resource').some(e => e.name.includes('/api/') && e.responseEnd === 0))
    if (busy) quiet = null; else if (quiet === null) quiet = Date.now(); else if (Date.now() - quiet > 400) return quiet - t0
    await page.waitForTimeout(40)
  }
  return null
}

const screens = [
  { id: 'command-center', path: '/' },
  { id: 'universe', path: '/stakeholders?view=map' },
  { id: 'profile', path: `/stakeholders/${list}` },
]
const report = { label: LABEL, base: BASE, ranAt: new Date().toISOString(), profileId: list, shots: [] }
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w <= 390 ? 844 : 900 }, storageState: state, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  for (const s of screens) {
    const t0 = Date.now()
    await page.goto(BASE + s.path)
    const settled = await settle(page)
    await page.waitForTimeout(500)
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    await page.screenshot({ path: `${OUT}/${s.id}-${w}.png`, fullPage: w <= 768 && s.id !== 'universe' })
    report.shots.push({ screen: s.id, width: w, loadToSettleMs: settled === null ? null : Date.now() - t0 - 500, horizontalOverflow: overflowX })
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 1))
for (const s of report.shots) console.log(`${s.screen.padEnd(15)} ${String(s.width).padStart(5)}  ${String(s.loadToSettleMs).padStart(6)} ms  ${s.horizontalOverflow ? 'H-OVERFLOW' : ''}`)
