// Motion & performance profile against a production build.
// Samples every rendered frame (rAF deltas) and long tasks while driving real input,
// at 1× and 4× CPU throttling (4× approximates a mid-range business laptop).
// Usage: node audit/perf.mjs [baseUrl] [outFile]
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const OUT = process.argv[3] ?? '../docs/audit/perf-results.json'

const SAMPLER = () => {
  window.__frames = []; window.__long = []
  let last = performance.now()
  const loop = t => { window.__frames.push(t - last); last = t; window.__raf = requestAnimationFrame(loop) }
  window.__raf = requestAnimationFrame(loop)
  window.__po = new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration))))
  window.__po.observe({ type: 'longtask' })
}
const STOP = () => { cancelAnimationFrame(window.__raf); window.__po.disconnect(); return { frames: window.__frames.slice(1), long: window.__long } }

function summarise(name, { frames, long }, extra = {}) {
  const f = frames.slice().sort((a, b) => a - b)
  const q = p => +(f[Math.min(f.length - 1, Math.floor(f.length * p))] ?? 0).toFixed(1)
  const dropped = frames.filter(x => x > 25).length // > 1.5 frame budgets at 60 Hz
  return { scenario: name, frames: frames.length, p50: q(0.5), p95: q(0.95), max: +(f[f.length - 1] ?? 0).toFixed(1), droppedPct: frames.length ? +((dropped / frames.length) * 100).toFixed(1) : 0, longTasks: long.length, longestTask: Math.max(0, ...long), ...extra }
}

async function run(throttle) {
  const browser = await chromium.launch({ channel: 'chrome' })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  // Phase 1: sign in through the real UI first, then resolve a real stakeholder id.
  await page.goto(BASE + '/sign-in')
  await page.fill('input[type=email]', 'rhea@sample.meridian.test')
  await page.fill('input[type=password]', 'meridian-sample-2026')
  await page.click('button[type=submit]')
  await page.waitForURL(u => !u.pathname.startsWith('/sign-in'))
  const me = await (await page.request.get(BASE + '/api/me')).json()
  const W = me.workspaces[0].id
  const PERSON = (await (await page.request.get(`${BASE}/api/w/${W}/search?q=Ellwood`)).json()).stakeholders[0].id
  const ENG = (await (await page.request.get(`${BASE}/api/w/${W}/engagements?limit=1`)).json()).items[0].id
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const out = []
  const w = ms => page.waitForTimeout(ms)
  const measure = async (name, fn, settle = 500) => {
    await page.evaluate(SAMPLER)
    const t0 = Date.now()
    const extra = (await fn()) ?? {}
    await w(settle)
    out.push(summarise(name, await page.evaluate(STOP), { ms: Date.now() - t0 - settle, ...extra }))
  }

  // Cold load
  const t0 = Date.now()
  await page.goto(BASE + '/'); await page.waitForSelector('.lrow')
  const nav = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime
    const n = performance.getEntriesByType('navigation')[0]
    return { fcp: Math.round(fcp ?? 0), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }
  })
  out.push({ scenario: 'Cold load → Home ledger visible', msToLedger: Date.now() - t0, ...nav })
  await w(800)

  await measure('Page transition Home → Stakeholders (sidebar click)', async () => {
    const s = Date.now(); await page.locator('.nav .nav-item', { hasText: 'Stakeholders' }).click(); await page.waitForSelector('.tbody .tr'); return { msToContent: Date.now() - s }
  })
  await measure('Sidebar indicator + transition back to Home', async () => {
    await page.locator('.nav .nav-item', { hasText: 'Home' }).click(); await page.waitForSelector('.lrow')
  })
  await page.locator('.nav .nav-item', { hasText: 'Stakeholders' }).click(); await page.waitForSelector('.tbody .tr'); await w(500)
  await page.locator('.grid').focus()
  await measure('Table: hold J (40 repeats @ 33 ms)', async () => { for (let i = 0; i < 40; i++) { await page.keyboard.press('j'); await w(33) } })
  await measure('Table: X select ×10 with bulk bar', async () => { for (let i = 0; i < 10; i++) { await page.keyboard.press('x'); await page.keyboard.press('j'); await w(40) } })
  await page.keyboard.press('Escape')
  await measure('Table: wheel scroll 30 notches', async () => { await page.mouse.move(800, 500); for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 120); await w(16) } })
  await measure('Peek panel open (Space)', async () => { await page.keyboard.press('Space'); await page.waitForSelector('.peek') })
  await measure('Peek follows J ×10', async () => { for (let i = 0; i < 10; i++) { await page.keyboard.press('j'); await w(80) } })
  await measure('Peek close (Esc)', async () => { await page.keyboard.press('Escape') })
  await measure('Command palette open + type 6 chars', async () => { await page.keyboard.press('Meta+k'); await page.keyboard.type('ellwoo', { delay: 40 }) })
  await page.keyboard.press('Escape'); await w(300)

  await measure('Table → Map view switch (lazy chunk + layout)', async () => {
    const s = Date.now(); await page.locator('.seg-btn', { hasText: 'Map' }).click(); await page.waitForSelector('.uni-count'); await page.waitForFunction(() => !document.querySelector('.uni-loading')); return { msToInteractive: Date.now() - s }
  }, 800)
  const box = await page.locator('.uni-canvas').boundingBox()
  await measure('Map: hover sweep (60 pointer moves)', async () => {
    for (let i = 0; i < 60; i++) { await page.mouse.move(box.x + box.width * (0.25 + 0.5 * (i / 60)), box.y + box.height * (0.3 + 0.4 * Math.sin(i / 6))); await w(16) }
  })
  await measure('Map: wheel zoom in/out', async () => { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -100); await w(30) } for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 100); await w(30) } })
  await measure('Map: drag pan', async () => { await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); for (let i = 0; i < 30; i++) { await page.mouse.move(box.x + 300 + i * 8, box.y + 300 + i * 4); await w(16) } await page.mouse.up() })
  await page.locator('.uni-canvas').focus()
  await measure('Map: arrow-key selection + camera', async () => { for (const k of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) { await page.keyboard.press(k); await w(450) } }, 300)
  await page.keyboard.press('Escape'); await w(300)
  await measure('Map: stance filter (animated re-layout)', async () => {
    const s = Date.now(); await page.locator('.uni-bar .chip', { hasText: 'Stance' }).click(); await page.locator('.menu-item', { hasText: 'Concerned' }).click(); await page.keyboard.press('Escape'); return { msInputToEnd: Date.now() - s }
  }, 900)
  await measure('Map: influence-grid lens transition', async () => { await page.locator('.uni-bar .seg-btn').nth(1).click() }, 900)
  await measure('Map: back to network lens', async () => { await page.locator('.uni-bar .seg-btn').nth(0).click() }, 900)
  await measure('Map: toggle grouping (fcose re-layout)', async () => { await page.locator('.tool-btn').first().click() }, 1200)

  await page.goto(BASE + `/stakeholders/${PERSON}`); await page.waitForSelector('.brief'); await w(800)
  await measure('Profile: tab switch ] ×4', async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press(']'); await w(250) } })
  await measure('Profile: [ back to Overview + citation reveal', async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press('['); await w(120) } await page.locator('.brief .cite').first().click() })
  await page.goto(BASE + '/'); await page.waitForSelector('.lrow'); await w(500)
  await measure('Home: expand/collapse evidence ×4', async () => { for (let i = 0; i < 4; i++) { await page.keyboard.press('Enter'); await w(260) } })
  await measure('Home: snooze 3 rows (exit + reflow)', async () => { for (let i = 0; i < 3; i++) { await page.keyboard.press('e'); await w(260) } })
  await page.goto(BASE + '/engagements'); await page.waitForSelector('.eg-row'); await w(500)
  await measure('Engagements: J ×20 through timeline', async () => { for (let i = 0; i < 20; i++) { await page.keyboard.press('j'); await w(40) } })
  await measure('Open engagement record (Enter)', async () => { await page.keyboard.press('Enter'); await page.waitForURL(/engagements\/.+/) })
  await page.goto(BASE + `/engagements/${ENG}`); await w(300)

  await browser.close()
  return out
}

// 4× is noisy run-to-run in headless Chrome: report the median of three runs per scenario.
const median = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const four = [await run(4), await run(4), await run(4)]
const agg = four[0].map((r, i) => {
  const rs = four.map(f => f[i])
  if (r.frames == null) return { ...r, msToLedger: median(rs.map(x => x.msToLedger)), fcp: median(rs.map(x => x.fcp)) }
  const out = { ...r, runs: 3 }
  for (const k of ['p50', 'p95', 'max', 'droppedPct', 'longTasks', 'longestTask', 'ms', 'msToContent', 'msToInteractive', 'msInputToEnd']) if (r[k] != null) out[k] = median(rs.map(x => x[k]))
  return out
})
const results = { '1x': await run(1), '4x (median of 3)': agg }
writeFileSync(OUT, JSON.stringify(results, null, 2))
for (const [k, rows] of Object.entries(results)) {
  console.log(`\n=== CPU ${k} ===`)
  for (const r of rows) console.log(r.frames != null
    ? `${r.scenario.padEnd(58)} p50 ${String(r.p50).padStart(5)}  p95 ${String(r.p95).padStart(5)}  max ${String(r.max).padStart(6)}  drop ${String(r.droppedPct).padStart(5)}%  long ${r.longTasks}/${r.longestTask}ms ${r.msToContent ?? r.msToInteractive ?? r.msInputToEnd ?? ''}`
    : `${r.scenario}: ${JSON.stringify(r)}`)
}
