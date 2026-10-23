// Scripted interaction audit: drives real keyboard/mouse input in headless Chrome and asserts outcomes.
// Usage: node audit/interactions.mjs [baseUrl] [outFile]
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? '../docs/audit/interaction-results.json'
const results = []
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const w = ms => page.waitForTimeout(ms)
const go = async path => { await page.goto(BASE + path); await page.waitForLoadState('networkidle'); await w(500) }
const url = () => new URL(page.url()).pathname + new URL(page.url()).search
async function test(area, name, fn) {
  try { const detail = await fn(); results.push({ area, name, pass: true, detail: detail ?? '' }) }
  catch (e) { results.push({ area, name, pass: false, detail: e.message.split('\n')[0] }) }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

// ── Shell & navigation ───────────────────────────────────────────
await go('/')
for (const [label, path] of [['Stakeholders', '/stakeholders'], ['Engagements', '/engagements'], ['Decisions', '/decisions'], ['Home', '/']]) {
  await test('Navigation', `Sidebar → ${label}`, async () => {
    await page.locator('.nav .nav-item', { hasText: label }).click(); await w(300)
    expect(new URL(page.url()).pathname === path, `url ${url()}`)
    const box = await page.locator('.nav-active').boundingBox()
    expect(box && box.width > 150, 'active surface not rendered')
    return `active surface ${Math.round(box.width)}×${Math.round(box.height)}`
  })
}
for (const [seq, path] of [['gs', '/stakeholders'], ['gm', '/stakeholders?view=map'], ['gh', '/']]) {
  await test('Navigation', `Keyboard ${seq[0].toUpperCase()} ${seq[1].toUpperCase()}`, async () => {
    await page.keyboard.press(seq[0]); await page.keyboard.press(seq[1]); await w(500)
    expect(url().startsWith(path), `url ${url()}`)
  })
}
await test('Navigation', 'Sidebar initiative link opens scoped map', async () => {
  await go('/'); await page.locator('.nav-sub', { hasText: 'Harbour' }).click(); await w(1500)
  expect(url().includes('initiative=i2') && url().includes('view=map'), url())
  const current = await page.locator('.nav-sub[aria-current="page"]').count()
  expect(current === 1, `${current} initiative links marked current`)
})
await test('Navigation', 'Browser back restores previous screen', async () => {
  await go('/'); await go('/stakeholders/p18'); await page.goBack(); await w(500)
  expect(new URL(page.url()).pathname === '/', url())
})
await test('Errors', 'Unknown route shows not-found with a way back', async () => {
  await go('/nope'); expect(await page.getByText("This page doesn’t exist").count() === 1, 'no not-found'); expect(await page.getByRole('link', { name: 'Back to Home' }).count() === 1, 'no back link')
})
await test('Errors', 'Unknown stakeholder shows not-found', async () => { await go('/stakeholders/p9999'); expect(await page.getByText('This stakeholder doesn’t exist').count() === 1, 'missing') })
await test('Errors', 'Unknown engagement shows not-found', async () => { await go('/engagements/e9999'); expect(await page.getByText('This engagement doesn’t exist').count() === 1, 'missing') })
await test('Errors', 'Placeholder sections are labelled as out of scope', async () => { await go('/reports'); expect(await page.getByText('Not part of this prototype').count() === 1, 'missing') })

// ── Command palette ──────────────────────────────────────────────
await go('/')
await test('Palette', '⌘K opens, focus in input', async () => {
  await page.keyboard.press('Meta+k'); await w(250)
  expect(await page.locator('.pal').count() === 1, 'not open')
  expect(await page.evaluate(() => document.activeElement?.getAttribute('role')) === 'combobox', 'focus not in input')
})
await test('Palette', 'Multi-word search ranks the right person first', async () => {
  await page.keyboard.type('wcc ell'); await w(200)
  const first = await page.locator('.pal-item .pal-label').first().textContent()
  expect(first === 'Bea Ellwood', `first: ${first}`); return first
})
await test('Palette', 'Enter opens the record', async () => {
  await page.keyboard.press('Enter'); await w(500); expect(url() === '/stakeholders/p18', url())
})
await test('Palette', 'Esc closes and screen shortcuts stay blocked while open', async () => {
  await page.keyboard.press('Meta+k'); await w(200); await page.keyboard.press('Escape'); await w(250)
  expect(await page.locator('.pal').count() === 0, 'still open'); expect(url() === '/stakeholders/p18', 'Esc leaked to screen: ' + url())
})
await test('Palette', '? lists shortcuts', async () => {
  await page.keyboard.press('Meta+k'); await page.keyboard.type('?'); await w(200)
  const n = await page.locator('.pal-help-row').count(); await page.keyboard.press('Escape'); expect(n >= 10, `${n} rows`); return `${n} shortcuts`
})
await test('Palette', 'Record key search (C-1xx)', async () => {
  await page.keyboard.press('Meta+k'); await page.keyboard.type('C-130'); await w(200)
  const sub = await page.locator('.pal-item .pal-sub').first().textContent(); await page.keyboard.press('Escape')
  expect(sub?.includes('C-130'), sub); return sub
})

// ── Directory ────────────────────────────────────────────────────
await go('/stakeholders')
const active = () => page.locator('.grid').getAttribute('aria-activedescendant')
await test('Directory', 'J/K moves focus', async () => {
  await page.locator('.grid').focus(); const a = await active(); await page.keyboard.press('j'); await page.keyboard.press('j'); const b = await active(); await page.keyboard.press('k'); const c = await active()
  expect(a !== b && b !== c, `${a} ${b} ${c}`)
})
await test('Directory', 'X selects, Shift+X selects range, bulk bar appears', async () => {
  await page.keyboard.press('x'); await page.keyboard.press('j'); await page.keyboard.press('j'); await page.keyboard.press('Shift+x'); await w(300)
  const n = await page.locator('.tbody .tr[aria-selected="true"]').count()
  expect(n === 3, `${n} selected`); expect(await page.locator('.bulk').isVisible(), 'bulk bar hidden'); return `${n} selected`
})
await test('Directory', 'Esc clears selection', async () => { await page.keyboard.press('Escape'); await w(300); expect(await page.locator('.tbody .tr[aria-selected="true"]').count() === 0, 'still selected') })
await test('Directory', 'Space opens peek; J follows; Esc closes', async () => {
  await page.keyboard.press('Space'); await w(400); const a = await page.locator('.peek-body h2').last().textContent()
  await page.keyboard.press('j'); await w(400); const b = await page.locator('.peek-body h2').last().textContent()
  await page.keyboard.press('Escape'); await w(400)
  expect(a !== b, 'peek did not follow'); expect(await page.locator('.peek').count() === 0, 'peek still open'); return `${a} → ${b}`
})
await test('Directory', 'S opens stance menu; choose; ⌘Z undoes', async () => {
  const row = await active(); const before = await page.locator(`#${row} .stance`).textContent()
  await page.keyboard.press('s'); await w(250); expect(await page.locator('.menu').isVisible(), 'no menu')
  await page.keyboard.type('o'); await page.keyboard.press('Enter'); await w(300)
  const after = await page.locator(`#${row} .stance`).textContent()
  await page.keyboard.press('Meta+z'); await w(300)
  const undone = await page.locator(`#${row} .stance`).textContent()
  expect(after !== before && undone === before, `${before} → ${after} → ${undone}`); return `${before} → ${after} → ${undone}`
})
await test('Directory', 'Sort by name is stable and ascending', async () => {
  await page.locator('.th-btn', { hasText: 'Name' }).click(); await w(200)
  const names = await page.locator('.tbody .tr .name').allTextContents()
  expect(names.slice(0, 10).every((n, i, a) => i === 0 || a[i - 1].localeCompare(n) <= 0), names.slice(0, 5).join(','))
  expect(await page.locator('.th-btn', { hasText: 'Name' }).getAttribute('aria-sort') === 'ascending', 'aria-sort')
})
await test('Directory', 'Stance filter narrows; Clear all resets', async () => {
  await page.locator('.chip', { hasText: 'Stance' }).locator('.chip-main').click(); await w(200)
  await page.locator('.menu-item', { hasText: 'Opposed' }).click(); await page.keyboard.press('Escape'); await w(300)
  const label = await page.locator('.toolbar .num').textContent()
  await page.getByRole('button', { name: 'Clear all' }).click(); await w(300)
  const reset = await page.locator('.toolbar .num').textContent()
  expect(label !== reset && reset.startsWith('184 of'), `${label} / ${reset}`); return `${label} → ${reset}`
})
await test('Directory', 'Text filter with no results shows empty state', async () => {
  await page.fill('.search-field input', 'zzzz'); await w(400)
  expect(await page.getByText('No stakeholders match these filters').count() === 1, 'no empty state'); await page.fill('.search-field input', '')
})
await test('Directory', 'Enter opens profile', async () => { await w(300); await page.locator('.grid').focus(); await page.keyboard.press('Enter'); await w(500); expect(/\/stakeholders\/p\d+/.test(url()), url()) })

// ── Profile ──────────────────────────────────────────────────────
await go('/stakeholders/p18')
await test('Profile', '] and [ switch tabs (URL-addressable)', async () => {
  await page.keyboard.press(']'); await w(300); const a = url(); await page.keyboard.press('['); await w(300)
  expect(a.includes('tab=activity') && !url().includes('tab='), `${a} / ${url()}`)
})
await test('Profile', 'Citation chip reveals its source', async () => {
  await page.locator('.brief .cite').first().click(); await w(350); expect(await page.locator('.src-inner').isVisible(), 'no source')
  return (await page.locator('.src-inner').textContent()).slice(0, 80)
})
await test('Profile', 'Mark commitment fulfilled, then undo', async () => {
  const item = page.locator('.citem').first(); await item.locator('.ccheck').click(); await w(300)
  const done = await item.getAttribute('data-done'); await page.keyboard.press('Meta+z'); await w(300)
  const after = await page.locator('.citem').first().getAttribute('data-done')
  expect(done === 'true' && after === null, `${done} ${after}`)
})
await test('Profile', 'J moves to next stakeholder', async () => { const a = url(); await page.keyboard.press('j'); await w(400); expect(url() !== a, url()) })
await test('Profile', 'M opens map focused on this person', async () => {
  const id = new URL(page.url()).pathname.split('/').pop(); await page.keyboard.press('m'); await w(2500)
  expect(url().includes(`focus=${id}`), url()); expect(await page.locator('.peek').count() === 1, 'no panel')
})

// ── Map ──────────────────────────────────────────────────────────
await go('/stakeholders?view=map&initiative=i1'); await w(1500)
await test('Map', 'Arrow keys select and traverse; panel follows', async () => {
  await page.locator('.uni-canvas').focus(); await page.keyboard.press('ArrowRight'); await w(500)
  const a = new URL(page.url()).searchParams.get('focus'); await page.keyboard.press('ArrowDown'); await w(500)
  const b = new URL(page.url()).searchParams.get('focus'); expect(a && b && a !== b, `${a} ${b}`); return `${a} → ${b}`
})
await test('Map', 'Selected node and neighbours are not faded', async () => {
  const r = await page.evaluate(() => { const cy = window.__cy; const s = cy.nodes('.sel'); return s.length ? [s.effectiveOpacity(), ...s.neighborhood('node.person').map(n => n.effectiveOpacity())] : [] })
  expect(r.length && r.every(o => o === 1), JSON.stringify(r)); return `${r.length} nodes at opacity 1`
})
await test('Map', 'Esc deselects', async () => { await page.keyboard.press('Escape'); await w(300); expect(!new URL(page.url()).searchParams.get('focus'), url()) })
await test('Map', 'Search + Enter selects match', async () => {
  await page.fill('.uni-search input', 'Holloway'); await w(500); await page.keyboard.press('Enter'); await w(600)
  expect(new URL(page.url()).searchParams.get('focus'), 'nothing selected')
})
await test('Map', 'Stance filter changes node count', async () => {
  await page.keyboard.press('Escape'); const a = await page.locator('.uni-count').textContent()
  await page.locator('.uni-bar .chip', { hasText: 'Stance' }).click(); await page.locator('.menu-item', { hasText: 'Opposed' }).click(); await page.keyboard.press('Escape'); await w(1200)
  const b = await page.locator('.uni-count').textContent(); expect(a !== b, `${a} / ${b}`); return `${a.split('·')[0]} → ${b.split('·')[0]}`
})
await test('Map', 'Influence grid lens, gaps and list toggles', async () => {
  await page.locator('.uni-bar .link-btn', { hasText: 'Reset' }).click(); await w(800)
  await page.locator('.uni-bar .seg-btn').nth(1).click(); await w(1000)
  const quads = await page.evaluate(() => window.__cy.nodes('.quad').length)
  await page.locator('.tool-btn', { hasText: 'Gaps' }).click(); await w(300)
  const gapped = await page.evaluate(() => window.__cy.nodes('.gapped').length)
  await page.locator('.tool-btn', { hasText: 'List' }).click(); await w(400)
  const items = await page.locator('.ul-item').count()
  expect(quads === 4 && gapped > 0 && items > 0, `${quads} ${gapped} ${items}`); return `4 quadrants, ${gapped} gaps, ${items} list items`
})
await test('Map', 'Zoom buttons change zoom', async () => {
  await page.locator('.tool-btn', { hasText: 'List' }).click(); await w(300)
  const a = await page.evaluate(() => window.__cy.zoom()); await page.getByRole('button', { name: 'Zoom in (+)' }).click(); await w(500)
  const b = await page.evaluate(() => window.__cy.zoom()); expect(b > a, `${a} ${b}`)
})

// ── Home ─────────────────────────────────────────────────────────
await go('/')
await test('Home', 'Enter expands evidence; Enter again collapses', async () => {
  await page.keyboard.press('Enter'); await w(400); const open = await page.locator('.lwhy').count()
  await page.keyboard.press('Enter'); await w(400); const closed = await page.locator('.lwhy').count()
  expect(open === 1 && closed === 0, `${open} ${closed}`)
})
await test('Home', 'D marks an overdue commitment fulfilled; count drops; ⌘Z restores', async () => {
  await page.locator('.ftab', { hasText: 'Commitments' }).click(); await w(300)
  const n0 = Number(await page.locator('.ftab[aria-selected="true"] .ftab-count').textContent())
  await page.keyboard.press('d'); await w(500); const n1 = Number(await page.locator('.ftab[aria-selected="true"] .ftab-count').textContent())
  await page.keyboard.press('Meta+z'); await w(500); const n2 = Number(await page.locator('.ftab[aria-selected="true"] .ftab-count').textContent())
  expect(n1 === n0 - 1 && n2 === n0, `${n0} ${n1} ${n2}`); return `${n0} → ${n1} → ${n2}`
})
await test('Home', 'E snoozes with undo', async () => {
  const n0 = await page.locator('.lrow').count(); await page.keyboard.press('e'); await w(500); const n1 = await page.locator('.lrow').count()
  await page.getByRole('button', { name: /Undo/ }).last().click(); await w(500); const n2 = await page.locator('.lrow').count()
  expect(n1 === n0 - 1 && n2 === n0, `${n0} ${n1} ${n2}`)
})
await test('Home', '"Assigned to me" narrows the ledger', async () => {
  await page.locator('.ftab', { hasText: 'All' }).click(); const a = await page.locator('.ftab[aria-selected="true"] .ftab-count').textContent()
  await page.locator('.seg-btn', { hasText: 'Assigned to me' }).click(); await w(300); const b = await page.locator('.ftab[aria-selected="true"] .ftab-count').textContent()
  expect(Number(b) < Number(a), `${a} ${b}`); return `${a} → ${b}`
})
await test('Home', 'Horizon dot opens the counterparty', async () => {
  await page.locator('.seg-btn', { hasText: 'Team' }).click(); await w(200)
  await page.locator('.hz-dot').first().click({ force: true }); await w(500); expect(url().includes('tab=commitments'), url())
})

// ── Meeting review ───────────────────────────────────────────────
await go('/engagements/e0')
await test('Meeting', 'A accepts decision and creates a real decision record', async () => {
  await page.keyboard.press('a'); await w(500)
  const key = await page.locator('.sg-resolved .sg-key').first().textContent()
  await go('/stakeholders/p18?tab=commitments')
  return key
})
await test('Meeting', 'Accepted stance change updates the stakeholder (and undo restores)', async () => {
  await go('/engagements/e0'); await w(300)
  const stanceCard = page.locator('.sg[data-kind="stance"]'); await stanceCard.click(); await w(200)
  await page.keyboard.press('a'); await w(400)
  const toast = await page.locator('.toast').last().textContent()
  await page.keyboard.press('Meta+z'); await w(300)
  expect(toast.includes('Neutral'), toast); return toast.replace('Undo⌘Z', '').trim()
})
await test('Meeting', 'E edits then ⌘↵ accepts edited text', async () => {
  await page.locator('.sg:not(.sg-resolved)').first().click(); await page.keyboard.press('e'); await w(200)
  await page.keyboard.press('Meta+a'); await page.keyboard.type('Edited commitment text'); await page.keyboard.press('Meta+Enter'); await w(400)
  expect(await page.getByText('Edited commitment text').count() >= 1, 'edited text missing')
})
await test('Meeting', 'X rejects; injection line is never a suggestion', async () => {
  await page.keyboard.press('x'); await w(300)
  const texts = await page.locator('.sg').allTextContents()
  expect(!texts.some(t => /fulfilled/i.test(t) && /every commitment/i.test(t)), 'injection became a suggestion')
  expect(await page.locator('.inj-mark').count() === 1, 'injection not flagged')
})
await test('Meeting', '⇧A accepts remaining high-confidence; completion state', async () => {
  await page.keyboard.press('Shift+a'); await w(400)
  while (await page.locator('.sg:not(.sg-resolved)').count()) { await page.locator('.sg:not(.sg-resolved)').first().click(); await page.keyboard.press('x'); await w(250) }
  expect(await page.getByText('Review complete').count() === 1, 'no completion')
})

// ── Reduced motion ───────────────────────────────────────────────
const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const rp = await rm.newPage()
await rp.goto(BASE + '/stakeholders'); await rp.waitForTimeout(800)
await test('Reduced motion', 'CSS transitions clamp to ≤1ms', async () => {
  const d = await rp.evaluate(() => getComputedStyle(document.querySelector('.btn, .nav-item')).transitionDuration)
  expect(d.split(',').every(x => parseFloat(x) <= 0.001), d); return d
})
await test('Reduced motion', 'Peek panel appears without a slide transform', async () => {
  await rp.locator('.grid').focus(); await rp.keyboard.press('Space')
  const samples = []
  for (let i = 0; i < 6; i++) { samples.push(await rp.evaluate(() => getComputedStyle(document.querySelector('.peek')).transform)); await rp.waitForTimeout(30) }
  expect(samples.every(s => s === 'none' || s === 'matrix(1, 0, 0, 1, 0, 0)'), samples.join(' | ')); return samples[0]
})
await rm.close()

await browser.close()
writeFileSync(OUT, JSON.stringify({ results, consoleErrors: errors }, null, 2))
const failed = results.filter(r => !r.pass)
console.log(`${results.length - failed.length}/${results.length} passed`)
for (const f of failed) console.log(`FAIL ${f.area} — ${f.name}: ${f.detail}`)
if (errors.length) console.log('Console errors:', [...new Set(errors)].slice(0, 5).join('\n'))
