// End-to-end: the commercial journey through the real UI on an isolated stack.
// Marketing → sign up → verify → workspace with template → guided setup (initiative, stakeholders, invite) → command center
// → teammate accepts the invitation → owner buys a plan through the provider-hosted checkout (development simulator,
// no real payment) → confirmed only after the signed webhook → plan entitlements active → cancel at period end.
import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'correct-horse-battery'
const stamp = Date.now()
const owner = { name: 'Oona Owner', email: `oona.${stamp}@e2e.test` }
const mate = { name: 'Max Mate', email: `max.${stamp}@e2e.test` }

async function mailLink(page: Page, to: string, kind: string) {
  for (let i = 0; i < 40; i++) {
    const mail = await (await page.request.get('/api/dev/mail')).json() as { to: string; kind: string; url: string }[]
    const m = mail.find(x => x.to === to && x.kind === kind)
    if (m) return new URL(m.url)
    await page.waitForTimeout(250)
  }
  throw new Error(`no ${kind} mail for ${to}`)
}

async function signUp(page: Page, u: { name: string; email: string }, from = '/sign-up') {
  await page.goto(from)
  await page.getByLabel('Full name').fill(u.name)
  const email = page.getByLabel('Work email')
  if (!(await email.inputValue())) await email.fill(u.email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  const verify = await mailLink(page, u.email, 'verify')
  await page.goto(verify.pathname + verify.search)
}

/** Waits for the next step; clicks Continue only if the flow is waiting for it. */
async function advanceTo(page: Page, next: import('@playwright/test').Locator) {
  for (let i = 0; i < 20; i++) {
    if (await next.isVisible()) return
    const cont = page.getByRole('button', { name: 'Continue', exact: true })
    if (await cont.isVisible()) await cont.click()
    await page.waitForTimeout(300)
  }
  await expect(next).toBeVisible()
}

test.describe.serial('commercial journey', () => {
  let inviteUrl: URL

  test('visitor lands on the marketing site and starts a trial', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every relationship. Every decision.')
    await page.goto('/pricing')
    await expect(page.getByText(/Pricing on request|Talk to us/).first()).toBeVisible()
    await expect(page.getByText(/\$\d/)).toHaveCount(0) // no unapproved prices anywhere
  })

  test('owner signs up, picks a template, completes setup and reaches the command center', async ({ page }) => {
    await signUp(page, owner)
    await page.goto('/onboarding')
    await page.getByLabel('Workspace name').fill('E2E Rail Partners')
    await page.getByText('Construction & infrastructure', { exact: true }).click()
    await expect(page.getByRole('radio', { name: /Construction/ })).toBeChecked()
    await page.getByRole('button', { name: 'Create workspace' }).click()
    await expect(page).toHaveURL(/\/welcome/)
    // Step 1: configure (keep defaults)
    await page.getByRole('button', { name: 'Continue' }).click()
    // Step 2: first project (template vocabulary)
    await page.getByLabel('Name', { exact: true }).fill('Northern Rail Link')
    await page.getByRole('button', { name: /Create project/i }).click()
    // Step 3: stakeholders (the flow advances by itself after a successful create)
    await advanceTo(page, page.getByLabel('Name 1'))
    await page.getByLabel('Name 1').fill('Bea Ellwood')
    await page.getByLabel('Title 1').fill('Head of Highways')
    await page.locator('.ob-continue', { hasText: /Add stakeholders/i }).click()
    // Step 4: invite a teammate
    await advanceTo(page, page.getByLabel('Email 1'))
    await page.getByLabel('Email 1').fill(mate.email)
    await page.getByRole('button', { name: 'Send invitations' }).click()
    await advanceTo(page, page.getByRole('button', { name: /Open command center/ }))
    await page.getByRole('button', { name: /Open command center/ }).click()
    await expect(page).toHaveURL(/\/$/)
    // Template vocabulary reached the navigation.
    await expect(page.getByRole('link', { name: /Projects/ }).first()).toBeVisible()
    inviteUrl = await mailLink(page, mate.email, 'invite')
  })

  test('teammate accepts the invitation as a new user', async ({ page }) => {
    await page.goto(inviteUrl.pathname)
    await expect(page.getByText('E2E Rail Partners').first()).toBeVisible()
    await page.getByRole('link', { name: /Create your account/ }).click()
    await signUp(page, mate, page.url())
    await page.goto(inviteUrl.pathname)
    await page.getByRole('button', { name: /Accept and open/ }).click()
    await expect(page).toHaveURL(/\/$/)
    const me = await (await page.request.get('/api/me')).json()
    expect(me.workspaces.map((w: { name: string }) => w.name)).toContain('E2E Rail Partners')
  })

  test('owner buys a plan through hosted checkout; access follows the webhook, not the redirect', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/sign-in/)
    await page.goto('/settings/billing')
    await expect(page.getByText(/Trial/).first()).toBeVisible()
    await page.getByRole('button', { name: 'Choose Starter' }).click()
    // Provider-hosted page (simulator in this stack): nothing is charged.
    await expect(page.getByText('Development simulator — no real payment')).toBeVisible()
    await page.getByRole('button', { name: 'Pay (simulated)' }).click()
    await expect(page).toHaveURL(/\/settings\/billing/)
    await expect(page.getByText(/Payment confirmed/)).toBeVisible({ timeout: 30_000 })
    const me = await (await page.request.get('/api/me')).json()
    const wid = me.workspaces.find((w: { name: string }) => w.name === 'E2E Rail Partners').id
    const billing = await (await page.request.get(`/api/w/${wid}/billing`)).json()
    expect(billing.entitlements).toMatchObject({ plan: 'starter', status: 'active' })
    // Starter doesn't include meeting intelligence: the server refuses it.
    const eng = await (await page.request.post(`/api/w/${wid}/engagements`, { data: { kind: 'meeting', title: 'Liaison', occurredAt: new Date().toISOString(), notes: 'We will share the hedgerow plan by 6 November with the parish council.' } })).json()
    expect((await page.request.post(`/api/w/${wid}/ai/meetings/${eng.id}/analyze`)).status()).toBe(402)

    // Cancel at period end: access continues.
    await page.getByRole('button', { name: 'Cancel subscription…' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel subscription', exact: true }).click()
    await expect(page.getByText(/will end|Resume/).first()).toBeVisible()
    const after = await (await page.request.get(`/api/w/${wid}/billing`)).json()
    expect(after.entitlements).toMatchObject({ cancelAtPeriodEnd: true, access: { level: 'full' } })
  })
})
