// Stakeholder Universe performance probe (Phase 6, parameterised for Phase 7 simulations).
// Usage: [MEASURE_EMAIL=… MEASURE_PASSWORD=… MEASURE_OUT=dir] node scripts/sim-graph-measure.mjs <base> <label> <throttle> <runs> [default|all] [shot]
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const here = p => fileURLToPath(new URL(p, import.meta.url))

const [BASE, LABEL, THR = '1', RUNS = '3', SCOPE = 'default', SHOT = ''] = process.argv.slice(2)
const OUT = process.env.MEASURE_OUT ?? here('./results/')
mkdirSync(OUT, { recursive: true })
const throttle = Number(THR)

const INIT = () => {
  window.__lt = []
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push({ s: e.startTime, d: e.duration }))).observe({ type: 'longtask', buffered: true })
  // Count canvas fills so we know Cytoscape actually drew something.
  window.__fills = 0
  const f = CanvasRenderingContext2D.prototype.fill
  CanvasRenderingContext2D.prototype.fill = function (...a) { window.__fills++; return f.apply(this, a) }
  window.__ready = null
  const poll = () => {
    const c = document.querySelector('.uni-canvas')
    const cy = c && c._cyreg && c._cyreg.cy
    if (c && cy && cy.nodes().length > 0 && !document.querySelector('.uni-loading') && window.__fills > 0) {
      window.__ready = performance.now(); return
    }
    requestAnimationFrame(poll)
  }
  requestAnimationFrame(poll)
}

const SAMPLER = () => {
  window.__frames = []; window.__long2 = []
  let last = performance.now()
  const loop = t => { window.__frames.push(t - last); last = t; window.__raf = requestAnimationFrame(loop) }
  window.__raf = requestAnimationFrame(loop)
  window.__po = new PerformanceObserver(l => l.getEntries().forEach(e => window.__long2.push(e.duration)))
  window.__po.observe({ type: 'longtask' })
}
const STOP = () => { cancelAnimationFrame(window.__raf); window.__po.disconnect(); return { frames: window.__frames.slice(1), long: window.__long2 } }
const fsum = ({ frames, long }) => {
  const f = frames.slice().sort((a, b) => a - b)
  const q = p => +(f[Math.min(f.length - 1, Math.floor(f.length * p))] ?? 0).toFixed(1)
  return { n: frames.length, p50: q(0.5), p95: q(0.95), max: +(f.at(-1) ?? 0).toFixed(1), fps: frames.length ? +(1000 / (frames.reduce((a, b) => a + b, 0) / frames.length)).toFixed(1) : 0, over50: frames.filter(x => x > 50).length, longN: long.length, longMax: Math.round(Math.max(0, ...long)) }
}

const browser = await chromium.launch({ channel: 'chrome' })
// Sign in once, reuse cookies.
const authCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const ap = await authCtx.newPage()
await ap.goto(BASE + '/sign-in')
await ap.fill('input[type=email]', process.env.MEASURE_EMAIL ?? 'rhea@sample.meridian.test')
await ap.fill('input[type=password]', process.env.MEASURE_PASSWORD ?? 'meridian-sample-2026')
await ap.click('button[type=submit]')
await ap.waitForURL(u => !u.pathname.startsWith('/sign-in'), { timeout: 60000 })
const state = await authCtx.storageState()
await authCtx.close()

const results = []
for (let run = 0; run < Number(RUNS); run++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state })
  await ctx.addInitScript(INIT)
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  const r = { run }
  let graphBody = null
  page.on('response', async res => { if (res.url().includes('/graph?')) { try { graphBody = await res.body() } catch {} } })
  let url = BASE + '/stakeholders?view=map'
  if (SCOPE === 'all') url += '&initiative=all'
  try {
    await page.goto(url)
    await page.waitForFunction(() => window.__ready !== null, null, { timeout: 240000, polling: 200 })
    await page.waitForTimeout(1500)
    const m = await page.evaluate(() => {
      const ready = window.__ready
      const lt = window.__lt.filter(e => e.s <= ready)
      const g = performance.getEntriesByType('resource').filter(e => e.name.includes('/graph?'))
      const ge = g.at(-1)
      const cy = document.querySelector('.uni-canvas')._cyreg.cy
      return {
        readyMs: Math.round(ready),
        longN: lt.length, longTotal: Math.round(lt.reduce((a, e) => a + e.d, 0)), longMax: Math.round(Math.max(0, ...lt.map(e => e.d))),
        longTop: lt.map(e => Math.round(e.d)).sort((a, b) => b - a).slice(0, 5),
        apiStart: ge ? Math.round(ge.startTime) : null, apiMs: ge ? Math.round(ge.duration) : null, apiTTFB: ge ? Math.round(ge.responseStart - ge.requestStart) : null,
        apiBytes: ge ? ge.decodedBodySize : null, apiTransfer: ge ? ge.transferSize : null, graphReqs: g.length,
        cyNodes: cy.nodes('.person').length, cyOrgs: cy.nodes('.org').length, cyEdges: cy.edges().length,
        countText: document.querySelector('.uni-count')?.textContent?.trim(),
        zoom: +cy.zoom().toFixed(3), labelsVisibleAtFit: cy.zoom() * 10 >= 8,
      }
    })
    Object.assign(r, m)
    if (graphBody) {
      const j = JSON.parse(graphBody.toString())
      r.apiNodes = j.nodes.length; r.apiEdges = j.edges.length; r.apiOrgs = j.orgs.length
      r.apiPersonEdges = j.edges.filter(e => e.sourceKind === 'stakeholder' && e.targetKind === 'stakeholder').length
      r.bodyBytes = graphBody.length
    }
    await cdp.send('HeapProfiler.collectGarbage')
    const heap = await cdp.send('Runtime.getHeapUsage')
    r.heapMB = +(heap.usedSize / 1048576).toFixed(1)
    if (SHOT && run === 0) await page.screenshot({ path: `${OUT}/shot-${LABEL}.png` })

    // Find an empty background point (for pan) and a person node (for select).
    const pts = await page.evaluate(() => {
      const c = document.querySelector('.uni-canvas'); const cy = c._cyreg.cy; const bb = c.getBoundingClientRect()
      const people = cy.nodes('.person')
      let empty = null
      for (let y = bb.height * 0.3; y < bb.height * 0.8 && !empty; y += 13) for (let x = bb.width * 0.2; x < bb.width * 0.6 && !empty; x += 13) {
        const hit = people.some(n => { const p = n.renderedPosition(); const w = n.renderedWidth() / 2 + 8; return Math.abs(p.x - x) < w && Math.abs(p.y - y) < w + 14 })
        if (!hit) empty = { x: bb.left + x, y: bb.top + y }
      }
      // A visible node near centre, largest first.
      const inView = people.filter(n => { const p = n.renderedPosition(); return p.x > bb.width * 0.15 && p.x < bb.width * 0.6 && p.y > bb.height * 0.2 && p.y < bb.height * 0.85 })
      const n = inView.max(x => x.renderedWidth()).ele ?? people[0]
      const p = n.renderedPosition()
      return { empty, node: { x: bb.left + p.x, y: bb.top + p.y, id: n.id(), w: n.renderedWidth() }, cx: bb.left + bb.width / 2, cy: bb.top + bb.height / 2 }
    })

    // Pan ~2 s
    if (pts.empty) {
      await page.evaluate(SAMPLER)
      await page.mouse.move(pts.empty.x, pts.empty.y); await page.mouse.down()
      const t0 = Date.now(); let i = 0
      while (Date.now() - t0 < 2000) { i++; await page.mouse.move(pts.empty.x + 160 * Math.sin(i / 10), pts.empty.y + 90 * Math.sin(i / 14)); await page.waitForTimeout(16) }
      await page.mouse.up(); await page.waitForTimeout(200)
      r.pan = fsum(await page.evaluate(STOP)); r.pan.moves = i
    } else r.pan = 'no empty background point found'

    // Wheel zoom ~2 s
    await page.mouse.move(pts.cx, pts.cy)
    await page.evaluate(SAMPLER)
    { const t0 = Date.now(); let i = 0
      while (Date.now() - t0 < 2000) { i++; await page.mouse.wheel(0, (Math.floor(i / 10) % 2 ? 1 : -1) * 100); await page.waitForTimeout(40) }
      await page.waitForTimeout(200)
      r.zoomWheel = fsum(await page.evaluate(STOP)); r.zoomWheel.wheels = i }

    // Fit back (key 0) then re-locate node.
    await page.locator('.uni-canvas').focus(); await page.keyboard.press('0'); await page.waitForTimeout(800)
    const node = await page.evaluate(id => { const c = document.querySelector('.uni-canvas'); const cy = c._cyreg.cy; const bb = c.getBoundingClientRect(); const p = cy.getElementById(id).renderedPosition(); return { x: bb.left + p.x, y: bb.top + p.y } }, pts.node.id)
    await page.mouse.move(node.x, node.y); await page.waitForTimeout(300)

    // Select: click -> node has .sel and .peek visible
    await page.evaluate(() => {
      window.__sel = {}
      addEventListener('pointerdown', () => { window.__sel.down = performance.now() }, { capture: true, once: true })
      const cy = document.querySelector('.uni-canvas')._cyreg.cy
      const loop = () => {
        const now = performance.now()
        if (window.__sel.down != null) {
          if (window.__sel.hl == null && cy.$('node.sel').length) window.__sel.hl = now
          const pk = document.querySelector('.peek')
          if (window.__sel.peek == null && pk && pk.getBoundingClientRect().width > 0) window.__sel.peek = now
          if (window.__sel.peekBody == null && document.querySelector('.peek .peek-body:not([aria-busy])') && !document.querySelector('.peek[aria-busy]')) window.__sel.peekBody = now
        }
        if (window.__sel.hl == null || window.__sel.peek == null || window.__sel.peekBody == null) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    })
    await page.evaluate(SAMPLER)
    await page.mouse.click(node.x, node.y)
    await page.waitForFunction(() => window.__sel.hl != null && window.__sel.peek != null, null, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const sel = await page.evaluate(() => window.__sel)
    const sf = fsum(await page.evaluate(STOP))
    r.select = { toHighlight: sel.hl != null ? Math.round(sel.hl - sel.down) : null, toPeek: sel.peek != null ? Math.round(sel.peek - sel.down) : null, toPeekLoaded: sel.peekBody != null ? Math.round(sel.peekBody - sel.down) : null, longN: sf.longN, longMax: sf.longMax }
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)

    // List view: focus canvas, press l
    await page.locator('.uni-canvas').focus()
    await page.evaluate(() => {
      window.__lv = {}
      addEventListener('keydown', e => { if (e.key === 'l') window.__lv.down = performance.now() }, { capture: true, once: true })
      const loop = () => { if (window.__lv.down != null && document.querySelector('.uni-list .ul-item')) { window.__lv.shown = performance.now(); requestAnimationFrame(() => { window.__lv.painted = performance.now() }) } else requestAnimationFrame(loop) }
      requestAnimationFrame(loop)
    })
    await page.evaluate(SAMPLER)
    await page.keyboard.press('l')
    await page.waitForFunction(() => window.__lv.painted != null, null, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(800)
    const lv = await page.evaluate(() => ({ ...window.__lv, items: document.querySelectorAll('.uni-list .ul-item').length, dom: document.getElementsByTagName('*').length }))
    const lf = fsum(await page.evaluate(STOP))
    r.list = { toFirstPaint: lv.painted != null ? Math.round(lv.painted - lv.down) : null, items: lv.items, domNodes: lv.dom, longN: lf.longN, longMax: lf.longMax }
    if (SHOT && run === 0) await page.screenshot({ path: `${OUT}/shot-${LABEL}-list.png` })
  } catch (e) { r.error = String(e).slice(0, 300) }
  results.push(r)
  console.error(LABEL, 'x' + throttle, 'run', run, r.error ?? `ready ${r.readyMs}ms nodes ${r.cyNodes}`)
  await ctx.close()
}
await browser.close()
writeFileSync(`${OUT}/${LABEL}-x${throttle}-${SCOPE}.json`, JSON.stringify(results, null, 1))
console.log(JSON.stringify(results))
