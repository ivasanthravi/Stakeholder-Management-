// Scripted "manual" accessibility checks that automated rule engines (axe) can't make:
// keyboard-only operation, focus trapping/return in dialogs, visible focus, 320 px reflow (≈ 400% zoom),
// WCAG 2.2 target size (24×24), and reduced-motion behaviour. Usage: node audit/a11y-manual.mjs [baseUrl] [out.json]
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = process.argv[3] ?? 'scratch/a11y-manual.json'
// AUDIT_SELF_SIGNED=1 accepts the staging rehearsal's self-signed certificate (local only).
const browser = await chromium.launch({ channel: 'chrome', args: process.env.AUDIT_SELF_SIGNED === '1' ? ['--ignore-certificate-errors'] : [] })
const results = []
const record = (check, ok, detail = '') => { results.push({ check, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}${detail ? ' — ' + detail : ''}`) }

async function signedIn(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
  const p = await ctx.newPage()
  await p.goto(BASE + '/sign-in')
  // Keyboard-only sign-in: tab to each field, type, submit with Enter.
  await p.waitForLoadState('networkidle')
  // The email field is autofocused; Tab moves to the password field.
  let guard = 0
  while (!(await p.evaluate(() => document.activeElement?.getAttribute('type') === 'email')) && guard++ < 10) await p.keyboard.press('Tab')
  await p.keyboard.type('rhea@sample.meridian.test')
  await p.keyboard.press('Tab')
  await p.keyboard.type('meridian-sample-2026')
  await p.keyboard.press('Enter')
  await p.waitForURL(u => !u.pathname.startsWith('/sign-in'), { timeout: 15000 })
  await p.waitForLoadState('networkidle')
  return { ctx, p }
}
const focusInfo = p => p.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return null
  const s = getComputedStyle(e)
  return { tag: e.tagName, label: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 40), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, ring: s.boxShadow !== 'none' }
})

// 1. Keyboard-only sign-in and navigation
{
  const { ctx, p } = await signedIn()
  record('keyboard-only sign-in', !p.url().includes('/sign-in'))
  // Visible focus on the first few tab stops of the app shell.
  await p.locator('body').click({ position: { x: 700, y: 5 } })
  let visible = 0, total = 0
  for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); const f = await focusInfo(p); if (f) { total++; if (f.outline || f.ring) visible++ } }
  record('focus indicator visible on shell tab stops', visible === total && total > 0, `${visible}/${total}`)
  // Command palette by keyboard; Esc returns focus.
  await p.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
  const palOpen = await p.getByRole('combobox').isVisible().catch(() => false)
  await p.keyboard.type('Ellwood'); await p.waitForTimeout(500)
  await p.keyboard.press('Enter'); await p.waitForTimeout(800)
  record('command palette: open, search, Enter navigates', palOpen && /stakeholders\//.test(p.url()), p.url().replace(BASE, ''))
  // Create drawer: focus trapped inside, Esc closes and focus returns to the page.
  await p.goto(BASE + '/stakeholders'); await p.waitForLoadState('networkidle')
  await p.locator('body').click({ position: { x: 700, y: 5 } })
  await p.keyboard.press('c'); await p.keyboard.press('p')
  const dialog = p.getByRole('dialog')
  await dialog.waitFor({ timeout: 5000 })
  let escaped = false
  for (let i = 0; i < 40; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => !!document.activeElement?.closest('[role=dialog]')))) { escaped = true; break } }
  record('create drawer traps focus (40 tabs)', !escaped)
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  record('Esc closes the drawer', !(await dialog.isVisible().catch(() => false)))
  // Confirm dialogs: role=alertdialog, focus inside, Esc cancels.
  await p.goto(BASE + '/settings/data'); await p.waitForLoadState('networkidle')
  const del = p.getByRole('button', { name: 'Delete workspace…' })
  if (await del.isVisible().catch(() => false)) {
    await del.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(300)
    const inside = await p.evaluate(() => !!document.activeElement?.closest('[role=alertdialog],[role=dialog]'))
    await p.keyboard.press('Escape'); await p.waitForTimeout(300)
    const back = await p.evaluate(() => document.activeElement?.textContent?.includes('Delete workspace'))
    record('destructive confirm: focus moves in, Esc cancels, focus returns to trigger', inside && !!back)
  }
  // Map has a keyboard/list alternative.
  await p.goto(BASE + '/stakeholders?view=map'); await p.waitForTimeout(2500)
  // Focus the map itself (role=application), then use its L shortcut.
  await p.locator('.uni-canvas').first().focus()
  await p.keyboard.press('l'); await p.waitForTimeout(800)
  const list = await p.getByRole('tree').or(p.getByRole('list')).or(p.getByRole('table')).or(p.getByRole('grid')).count()
  record('relationship map has an accessible list alternative (L)', list > 0)
  await ctx.close()
}

// 2. Reflow at 320 CSS px (WCAG 1.4.10) and 3. target size on touch (WCAG 2.5.8)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const pub = ['/', '/pricing', '/security', '/contact', '/sign-in', '/sign-up']
  for (const path of pub) {
    await p.setViewportSize({ width: 320, height: 640 }); await p.goto(BASE + path); await p.waitForLoadState('networkidle'); await p.waitForTimeout(400)
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    record(`reflow 320px ${path}`, over <= 1, `overflow ${over}px`)
  }
  await ctx.close()
  const { ctx: c2, p: q } = await signedIn({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  for (const path of ['/', '/stakeholders', '/commitments', '/decisions', '/settings/billing', '/settings/members']) {
    await q.goto(BASE + path); await q.waitForLoadState('networkidle'); await q.waitForTimeout(500)
    // Effective target: hit-test a 24 px box around the control's centre (catches enlarged ::after hit areas).
    const small = await q.evaluate(() => [...document.querySelectorAll('button, a[href], input, select, [role=button], [role=tab], [role=option]')]
      .filter(e => {
        const r = e.getBoundingClientRect(); const s = getComputedStyle(e)
        if (!(r.width > 0 && r.height > 0 && s.visibility !== 'hidden') || (r.width >= 24 && r.height >= 24)) return false
        if (e.tagName === 'A' && e.closest('p,li') && s.display === 'inline') return false
        // WCAG 2.5.8 inline exception: citation chips sit inside sentences of text.
        if (e.classList.contains('cite')) return false
        if (r.bottom < 0 || r.top > innerHeight) return false
        // Only measure controls fully inside their scroll container (edge rows are partly under sticky headers).
        let sc = e.parentElement
        while (sc && !/(auto|scroll|hidden)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement
        if (sc) { const b = sc.getBoundingClientRect(); const cy0 = r.top + r.height / 2; if (cy0 < b.top + 40 || cy0 > b.bottom - 14) return false }
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2
        const hits = [[-11.5, 0], [11.5, 0], [0, -11.5], [0, 11.5]].every(([dx, dy]) => { const h = document.elementFromPoint(cx + dx, cy + dy); return !!h && (h === e || e.contains(h)) })
        return !hits
      })
      .map(e => `${e.tagName.toLowerCase()}:${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`))
    record(`touch targets ≥24px ${path}`, small.length === 0, small.slice(0, 6).join(' | '))
    const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    record(`no horizontal scroll at 390px ${path}`, over <= 1, `overflow ${over}px`)
  }
  await c2.close()
}

// 4. Reduced motion: transitions collapse
{
  const { ctx, p } = await signedIn({ reducedMotion: 'reduce' })
  const slow = await p.evaluate(() => [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); const d = Math.max(...s.transitionDuration.split(',').map(parseFloat), ...s.animationDuration.split(',').map(parseFloat)); return d > 0.02 }).length)
  record('reduced motion: no CSS transitions/animations longer than 20 ms', slow === 0, `${slow} elements`)
  // Motion (JS) animations of opacity, SVG attributes and staggered delays: MotionConfig's reducedMotion alone doesn't
  // stop these. On the first frame the Command Center's horizon dots exist, every one must already be fully visible.
  await p.goto(BASE + '/')
  const op = await p.evaluate(() => new Promise(res => {
    const t0 = performance.now()
    const tick = () => { const d = [...document.querySelectorAll('.hz-dot')]; if (d.length || performance.now() - t0 > 8000) res(d.map(x => +getComputedStyle(x).opacity)); else requestAnimationFrame(tick) }
    tick()
  }))
  record('reduced motion: Motion animations (opacity, SVG, staggered) finish instantly', op.length > 0 && op.every(o => o > 0.99), `${op.filter(o => o <= 0.99).length}/${op.length} horizon dots still animating on their first frame`)
  await ctx.close()
}

await browser.close()
writeFileSync(OUT, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2))
const failed = results.filter(r => !r.ok).length
console.log(`${results.length - failed}/${results.length} checks passed`)
