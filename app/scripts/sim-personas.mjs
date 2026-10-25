// Phase 7 persona workflows: SIMULATED usage, scripted in a real browser against a simulation served by
// scripts/sim-serve.ts. This measures time-to-answer and whether each step works at volume. It is NOT evidence of
// human usability: there are no real users here.
// Usage: node scripts/sim-personas.mjs <base> <label>   (reads .data/sim-serve-manifest.json)
// Output: ../docs/simulation/evidence/personas-<label>.json and screenshots in ../docs/simulation/evidence/personas/
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const [BASE = 'http://localhost:4196', LABEL = 'C'] = process.argv.slice(2)
const OUT = '../docs/simulation/evidence'
mkdirSync(`${OUT}/personas`, { recursive: true })
const [m] = JSON.parse(readFileSync('.data/sim-serve-manifest.json', 'utf8'))
// First active user holding the first available role, in the order given.
const userWith = (...roles) => roles.map(r => m.users.find(u => !u.departed && u.role === r)).find(Boolean)

const browser = await chromium.launch({ channel: 'chrome' })
const results = []

/** Time from the action until the screen settles: no skeletons and no API request in flight for 300 ms. */
async function settle(page, inflight) {
  const t0 = Date.now()
  let quietSince = null
  while (Date.now() - t0 < 60_000) {
    const busy = inflight.size > 0 || await page.locator('.skeleton').count() > 0
    if (busy) quietSince = null
    else if (quietSince === null) quietSince = Date.now()
    else if (Date.now() - quietSince >= 300) return quietSince - t0
    await page.waitForTimeout(25)
  }
  throw new Error('did not settle within 60 s')
}

async function persona(name, user, steps) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const inflight = new Set()
  page.on('request', r => { if (r.url().includes('/api/')) inflight.add(r) })
  page.on('requestfinished', r => inflight.delete(r)); page.on('requestfailed', r => inflight.delete(r))
  const errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`) })
  const out = { persona: name, role: user.role, steps: [] }
  await page.goto(BASE + '/sign-in')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('simulation-2026')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(u => !u.pathname.startsWith('/sign-in'), { timeout: 60_000 })
  for (const [i, s] of steps.entries()) {
    const t0 = Date.now()
    const step = { step: s.name }
    try {
      await s.run(page)
      const acted = Date.now() - t0
      step.ms = acted + await settle(page, inflight)
      if (s.check) step.observed = await s.check(page)
      step.ok = s.expect ? s.expect(step.observed) : true
    } catch (e) { step.ok = false; step.error = String(e.message ?? e).split('\n')[0].slice(0, 200) }
    await page.screenshot({ path: `${OUT}/personas/${LABEL}-${name.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.png` })
    out.steps.push(step)
  }
  out.errors = errors
  results.push(out)
  await ctx.close()
}

const text = async (page, sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
const go = path => page => page.goto(BASE + path)

await persona('Executive', userWith('owner'), [
  { name: 'Command Center: what needs attention', run: go('/'), check: p => text(p, 'main'), expect: o => /overdue/i.test(o) },
  { name: 'Decisions waiting', run: go('/decisions'), check: p => p.getByRole('row').count(), expect: n => n > 1 },
  { name: 'Relationship map (default initiative)', run: async p => { await p.goto(BASE + '/stakeholders?view=map'); await p.locator('.uni-count').waitFor({ timeout: 60_000 }) }, check: p => text(p, '.uni-count') },
])

await persona('Program Manager', userWith('manager', 'admin', 'owner'), [
  { name: 'Initiatives register', run: go('/initiatives'), check: p => p.getByRole('row').count(), expect: n => n > 1 },
  { name: 'Open the first initiative', run: async p => { await p.getByRole('row').nth(1).dblclick(); await p.waitForURL(/\/initiatives\//) }, check: p => text(p, 'h1') },
  { name: 'Overdue commitments', run: go('/commitments?view=overdue'), check: p => text(p, 'main') },
])

await persona('Relationship Manager', userWith('contributor'), [
  { name: 'Directory', run: go('/stakeholders'), check: p => p.getByRole('row').count(), expect: n => n > 1 },
  { name: 'Filter by name', run: async p => { await p.getByLabel(/Filter stake/).fill('an') }, check: p => p.getByRole('row').count() },
  { name: 'Open a profile', run: async p => { await p.getByLabel(/Filter stake/).fill(''); await p.getByRole('row').nth(1).dblclick(); await p.waitForURL(/\/stakeholders\/[0-9a-f-]{36}/) }, check: p => text(p, 'h1') },
  { name: 'Profile engagements tab', run: async p => { await p.goto(p.url().split('?')[0] + '?tab=activity') }, check: p => text(p, 'main') },
])

await persona('Operations Lead', userWith('manager', 'admin', 'owner'), [
  { name: 'Command Center: items needing an owner', run: async p => { await p.goto(BASE + '/'); await p.getByRole('tab', { name: /^Commitments/ }).click().catch(() => {}) }, check: p => text(p, 'main') },
  { name: 'Commitments due this week', run: go('/commitments?view=week'), check: p => text(p, 'main'), expect: o => !/Due this week 0\b/.test(o) },
  { name: 'Engagements register', run: go('/engagements'), check: p => p.getByRole('row').count(), expect: n => n > 1 },
])

await persona('Workspace Admin', userWith('owner'), [
  { name: 'Members', run: go('/settings/members'), check: p => p.getByRole('button', { name: /^Role for / }).count(), expect: n => n >= 1 },
  { name: 'Audit log', run: go('/settings/audit'), check: p => text(p, 'main') },
  { name: 'Usage and plan', run: go('/settings/billing'), check: p => text(p, 'main') },
])

await browser.close()
const report = { label: LABEL, ranAt: new Date().toISOString(), simulated: true, note: 'Scripted automation on simulated data. Timings are local (one machine, production build, PostgreSQL). Not user research.', workspace: { users: m.users.length, counts: m.counts }, results }
writeFileSync(`${OUT}/personas-${LABEL}.json`, JSON.stringify(report, null, 1))
for (const r of results) for (const s of r.steps) console.log(`${r.persona.padEnd(21)} ${s.ok ? '✓' : '✗'} ${String(s.ms ?? '-').padStart(6)} ms  ${s.step}${s.error ? '  ERROR ' + s.error : ''}`)
for (const r of results) if (r.errors.length) console.log(r.persona, 'errors:', r.errors.slice(0, 5))
