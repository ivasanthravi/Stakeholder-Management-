// Phase 8 interaction capture: the signature interactions on each flagship screen, screenshotted step by step with
// the time each step takes to settle. Usage: node scripts/sig-interact.mjs <base> <label>
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const [BASE = 'http://localhost:5173', LABEL = 'before', EMAIL = 'rhea@sample.meridian.test', PASSWORD = 'meridian-sample-2026'] = process.argv.slice(2)
const OUT = `../docs/signature-experience/screenshots/${LABEL}`
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
await page.goto(BASE + '/sign-in')
await page.getByLabel('Email').fill(EMAIL)
await page.getByLabel('Password').fill(PASSWORD)
await page.getByRole('button', { name: 'Sign in' }).click()
await page.waitForURL(u => !u.pathname.startsWith('/sign-in'))

const steps = []
async function step(name, fn, opts = {}) {
  const t0 = Date.now()
  let ok = true, error
  try { await fn() } catch (e) { ok = false; error = String(e.message ?? e).split('\n')[0].slice(0, 200) }
  await page.waitForTimeout(opts.wait ?? 450)
  steps.push({ name, ok, ms: Date.now() - t0 - (opts.wait ?? 450), error })
  await page.screenshot({ path: `${OUT}/i-${String(steps.length).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`, fullPage: !!opts.full })
}

// Command Center
await step('cc full page', async () => { await page.goto(BASE + '/'); await page.locator('.skeleton').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {}) }, { full: true, wait: 900 })
await step('cc hover first commitment', async () => { await page.getByText(/^C-\d+/).first().hover() })
await step('cc select first commitment', async () => { await page.getByText(/^C-\d+/).first().click() })
await step('cc escape', async () => { await page.keyboard.press('Escape') })
// Universe
await step('universe open', async () => { await page.goto(BASE + '/stakeholders?view=map'); await page.locator('.uni-count').waitFor() }, { wait: 1200 })
await step('universe search', async () => { await page.getByPlaceholder('Find in map').fill('Bea') }, { wait: 700 })
await step('universe select result', async () => { await page.keyboard.press('Enter') }, { wait: 900 })
await step('universe escape', async () => { await page.keyboard.press('Escape') }, { wait: 600 })
await step('universe list view', async () => { await page.getByRole('button', { name: /list/i }).last().click() }, { wait: 600 })
// Profile
const id = await page.evaluate(async () => { const ws = (await (await fetch('/api/me')).json()).workspaces[0].id; return (await (await fetch(`/api/w/${ws}/stakeholders?sort=influence&limit=1`)).json()).items[0].id })
await step('profile overview', async () => { await page.goto(`${BASE}/stakeholders/${id}`); await page.locator('h1').waitFor() }, { full: true, wait: 900 })
for (const t of ['activity', 'relationships', 'commitments', 'history']) await step(`profile tab ${t}`, async () => { await page.goto(`${BASE}/stakeholders/${id}?tab=${t}`); await page.locator('h1').waitFor() }, { full: true, wait: 800 })

writeFileSync(`${OUT}/interactions.json`, JSON.stringify({ steps, errors }, null, 1))
for (const s of steps) console.log(`${s.ok ? '✓' : '✗'} ${String(s.ms).padStart(5)} ms ${s.name}${s.error ? ' — ' + s.error : ''}`)
console.log('console/page errors:', errors.length, errors.slice(0, 5))
await browser.close()
