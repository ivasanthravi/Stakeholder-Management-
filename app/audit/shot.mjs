// Authenticated screenshot helper for visual QA.
// Usage: node audit/shot.mjs <path> <out.png> [--mobile] [--wait=ms] [--email=..] [--password=..]
// Signs in once through the real UI and caches the session in scratch/auth-<email>.json.
import { chromium } from 'playwright-core'
import { existsSync, mkdirSync } from 'node:fs'

const [path = '/', out = 'scratch/shot.png', ...flags] = process.argv.slice(2)
const opt = Object.fromEntries(flags.map(f => f.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const email = opt.email ?? 'rhea@sample.meridian.test'
const password = opt.password ?? 'meridian-sample-2026'
mkdirSync('scratch', { recursive: true })
const state = `scratch/auth-${email}.json`
const mobile = !!opt.mobile
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({
  viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: mobile ? 2 : 1,
  isMobile: mobile, hasTouch: mobile, storageState: existsSync(state) ? state : undefined,
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(BASE + path)
await page.waitForLoadState('networkidle')
if (page.url().includes('/sign-in')) {
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(u => !u.pathname.startsWith('/sign-in'), { timeout: 15000 })
  await ctx.storageState({ path: state })
  await page.goto(BASE + path)
  await page.waitForLoadState('networkidle')
}
await page.waitForTimeout(Number(opt.wait ?? 900))
await page.screenshot({ path: out, fullPage: !!opt.full })
console.log(`saved ${out}${errors.length ? `\nconsole errors:\n${[...new Set(errors)].join('\n')}` : ''}`)
await browser.close()
