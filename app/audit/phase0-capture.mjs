// Captures audit screenshots of every screen and key state at desktop and mobile sizes.
// Usage: node audit/capture.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? '../docs/audit/screenshots'
mkdirSync(OUT, { recursive: true })

const wait = ms => new Promise(r => setTimeout(r, ms))
const settle = async page => { await page.waitForLoadState('networkidle'); await wait(700) }

const SHOTS = [
  { name: 'home', url: '/' },
  { name: 'home-expanded', url: '/', act: async p => { await p.keyboard.press('j'); await p.keyboard.press('Enter') } },
  { name: 'directory', url: '/stakeholders' },
  { name: 'directory-peek-select', url: '/stakeholders', act: async p => {
    await p.locator('.grid').focus(); await p.keyboard.press('j'); await p.keyboard.press('x'); await p.keyboard.press('j'); await p.keyboard.press('x'); await p.keyboard.press('Space') } },
  { name: 'directory-stance-menu', url: '/stakeholders', act: async p => { await p.locator('.grid').focus(); await p.keyboard.press('s') } },
  { name: 'directory-empty', url: '/stakeholders', act: async p => { await p.fill('.search-field input', 'zzzz nobody') } },
  { name: 'map-network', url: '/stakeholders?view=map&initiative=i1', wait: 1500 },
  { name: 'map-selected', url: '/stakeholders?view=map&initiative=i1&focus=p10', wait: 1800 },
  { name: 'map-influence', url: '/stakeholders?view=map&initiative=i1', wait: 1200, act: async p => { await p.locator('.uni-bar .seg-btn').nth(1).click() } },
  { name: 'map-gaps', url: '/stakeholders?view=map&initiative=i1', wait: 1200, act: async p => { await p.locator('.tool-btn', { hasText: 'Gaps' }).click() } },
  { name: 'map-list', url: '/stakeholders?view=map&initiative=i1', wait: 1200, act: async p => { await p.locator('.tool-btn', { hasText: 'List' }).click() } },
  { name: 'profile', url: '/stakeholders/p18' },
  { name: 'profile-citation', url: '/stakeholders/p18', act: async p => { await p.locator('.brief .cite').nth(2).click() } },
  { name: 'profile-relationships', url: '/stakeholders/p18?tab=relationships' },
  { name: 'profile-commitments', url: '/stakeholders/p18?tab=commitments' },
  { name: 'meeting', url: '/engagements/e0' },
  { name: 'meeting-progress', url: '/engagements/e0', act: async p => { await p.keyboard.press('a'); await wait(300); await p.keyboard.press('x'); await wait(300); await p.keyboard.press('e') } },
  { name: 'palette', url: '/stakeholders/p18', act: async p => { await p.keyboard.press('Meta+k'); await p.keyboard.type('wcc ell') } },
  { name: 'palette-shortcuts', url: '/', act: async p => { await p.keyboard.press('Meta+k'); await p.keyboard.type('?') } },
  { name: 'placeholder-section', url: '/decisions' },
  { name: 'not-found-person', url: '/stakeholders/nope' },
  { name: 'not-found-engagement', url: '/engagements/e999' },
]

const VIEWPORTS = [
  { tag: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { tag: 'mobile', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
]

const browser = await chromium.launch({ channel: 'chrome' })
const log = []
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: vp.isMobile, hasTouch: vp.hasTouch })
  for (const s of SHOTS) {
    if (vp.tag === 'mobile' && /stance-menu|palette-shortcuts|citation|map-gaps|map-list/.test(s.name)) continue
    const page = await ctx.newPage()
    const errors = []
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', e => errors.push(String(e)))
    await page.goto(BASE + s.url)
    await settle(page)
    if (s.wait) await wait(s.wait)
    try { if (s.act) { await s.act(page); await wait(600) } } catch (e) { errors.push('ACTION FAILED: ' + e.message) }
    const file = `${OUT}/${vp.tag}-${s.name}.png`
    await page.screenshot({ path: file })
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    log.push({ viewport: vp.tag, shot: s.name, errors, overflowX })
    await page.close()
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`${OUT}/capture-log.json`, JSON.stringify(log, null, 2))
console.log(log.filter(l => l.errors.length || l.overflowX).map(l => `${l.viewport}/${l.shot}: ${l.errors.join(' | ')} ${l.overflowX ? 'OVERFLOW-X' : ''}`).join('\n') || 'no console errors or horizontal overflow')
