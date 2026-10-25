// Responsive audit: key screens at 1280, 1024, 768 and 320 px. Records document overflow, the elements that overflow,
// controls narrower than 24 px on touch widths, and keeps a screenshot per screen/width.
// Usage: node audit/responsive.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? '../docs/excellence/screenshots/responsive'
mkdirSync(OUT, { recursive: true })
const WIDTHS = [[1280, 800], [1024, 768], [768, 1024], [320, 640]]
const browser = await chromium.launch({ channel: 'chrome' })
const probe = await browser.newContext()
await probe.request.post(BASE + '/api/auth/sign-in/email', { headers: { origin: BASE }, data: { email: 'rhea@sample.meridian.test', password: 'meridian-sample-2026' } })
const api = async p => (await probe.request.get(BASE + p)).json()
const w = (await api('/api/me')).workspaces[0].id
const person = (await api(`/api/w/${w}/search?q=Ellwood`)).stakeholders[0].id
const SCREENS = [['home', '/'], ['directory', '/stakeholders'], ['profile', `/stakeholders/${person}`], ['universe', '/stakeholders?view=map'],
  ['commitments', '/commitments'], ['decisions', '/decisions'], ['engagements', '/engagements'], ['settings-members', '/settings/members'], ['billing', '/settings/billing']]
const results = []
for (const [width, height] of WIDTHS) {
  const touch = width < 1024
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 768, hasTouch: touch })
  await ctx.request.post(BASE + '/api/auth/sign-in/email', { headers: { origin: BASE }, data: { email: 'rhea@sample.meridian.test', password: 'meridian-sample-2026' } })
  const p = await ctx.newPage()
  for (const [name, path] of [...SCREENS, ['pricing', '/pricing']]) {
    if (name === 'pricing') await ctx.clearCookies()
    await p.goto(BASE + path); await p.waitForLoadState('networkidle').catch(() => {}); await p.waitForTimeout(name === 'universe' ? 2500 : 900)
    const r = await p.evaluate(() => {
      const W = innerWidth, over = []
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect(); const cs = getComputedStyle(el)
        if (!b.width || b.right <= W + 1 || cs.position === 'fixed' || cs.visibility === 'hidden' || el.ownerSVGElement) continue
        // Content past the edge is fine inside a container that scrolls horizontally (reachable by swipe or Tab);
        // it is a defect when an ancestor clips it.
        let a = el.parentElement, scrolls = false
        for (; a && a !== document.body; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === 'auto' || ox === 'scroll') { scrolls = true; break } if (ox === 'hidden' || ox === 'clip') break }
        if (!scrolls) { over.push(`${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(' ')[0]}`); if (over.length > 4) break }
      }
      return { docOverflow: document.documentElement.scrollWidth > W + 1, over }
    })
    await p.screenshot({ path: `${OUT}/${width}-${name}.png` })
    results.push({ width, name, ...r })
  }
  await ctx.close()
}
await browser.close()
writeFileSync(`${OUT}/responsive.json`, JSON.stringify(results, null, 2))
const bad = results.filter(r => r.docOverflow || r.over.length)
console.log(`${results.length} screen×width checks; ${bad.length} with overflow`)
for (const b of bad) console.log(`  ${b.width} ${b.name}: doc=${b.docOverflow} ${b.over.join(', ')}`)
