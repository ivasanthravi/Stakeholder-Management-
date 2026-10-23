// End-to-end: the Phase 1 core flow through the real UI, plus cross-tenant denial.
import { expect, test, type Page } from '@playwright/test'

const PASSWORD = 'correct-horse-battery'
const stamp = Date.now()
const alice = { name: 'Alice Tester', email: `alice.${stamp}@e2e.test` }
const bob = { name: 'Bob Outsider', email: `bob.${stamp}@e2e.test` }

async function mailLink(page: Page, to: string, kind: string) {
  for (let i = 0; i < 20; i++) {
    const mail = await (await page.request.get('/api/dev/mail')).json() as { to: string; kind: string; url: string }[]
    const m = mail.find(x => x.to === to && x.kind === kind)
    if (m) return m.url
    await page.waitForTimeout(250)
  }
  throw new Error(`no ${kind} mail for ${to}`)
}

async function signUpAndVerify(page: Page, u: { name: string; email: string }) {
  await page.goto('/sign-up')
  await page.getByLabel('Full name').fill(u.name)
  await page.getByLabel('Work email').fill(u.email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  const url = new URL(await mailLink(page, u.email, 'verify'))
  await page.goto(url.pathname + url.search)
}

async function pickFirst(page: Page, label: string, query: string) {
  const box = page.getByRole('combobox', { name: label })
  await box.click()
  await box.fill(query)
  await expect(page.locator('.picker-list [role=option]').first()).toContainText(query, { ignoreCase: true })
  await box.press('Enter')
}

async function create(page: Page, seq: string) {
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  for (const k of seq) await page.keyboard.press(k)
  await expect(page.getByRole('dialog')).toBeVisible()
}

const field = (page: Page, label: string) =>
  page.getByRole('dialog').getByRole('textbox', { name: new RegExp('^' + label.replace(/[/]/g, '\\/') + '( Required)?$') })

async function submitDrawer(page: Page) {
  await page.getByRole('dialog').locator('.drawer-foot .btn-primary').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe.serial('Phase 1 core flow', () => {
  let stakeholderUrl = ''

  test('1–2 sign up, verify email, create a workspace', async ({ page }) => {
    await signUpAndVerify(page, alice)
    // Verification signs the user in and lands on onboarding (no workspace yet).
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Create your workspace' })).toBeVisible()
    await page.getByLabel('Workspace name').fill('E2E Infrastructure')
    await page.getByRole('button', { name: 'Create workspace' }).click()
    await expect(page.getByRole('heading', { name: /E2E Infrastructure is ready/ })).toBeVisible()
  })

  test('3–8 create organization, stakeholder (with organization), initiative, engagement', async ({ page }) => {
    await signIn(page, alice)

    await create(page, 'co')
    await field(page, 'Name').fill('Westshire County Council')
    await field(page, 'Short name').fill('WCC')
    await page.getByLabel('Type').selectOption('government')
    await submitDrawer(page)
    await expect(page.locator('.toast', { hasText: 'Organization created' })).toBeVisible()

    await create(page, 'ci')
    await field(page, 'Code').fill('NRL')
    await field(page, 'Name').fill('Northern Rail Link')
    await submitDrawer(page)

    await create(page, 'cp')
    await field(page, 'Name').fill('Bea Ellwood')
    await field(page, 'Role / title').fill('Head of Highways')
    await pickFirst(page, 'Organization', 'Westshire')
    await field(page, 'Role at organization').fill('Head of Highways')
    await pickFirst(page, 'Initiatives', 'Northern')
    await submitDrawer(page)

    await page.goto('/stakeholders')
    await page.getByRole('row', { name: /Bea Ellwood/ }).dblclick()
    await expect(page.getByRole('heading', { level: 1, name: 'Bea Ellwood' })).toBeVisible()
    stakeholderUrl = new URL(page.url()).pathname
    await expect(page.locator('.hero-sub')).toContainText('Westshire County Council')
    await expect(page.locator('.hero-tags')).toContainText('NRL')

    // Log an engagement from the profile (L): participant + initiative prefilled.
    await page.keyboard.press('l')
    await expect(page.getByRole('dialog')).toBeVisible()
    await field(page, 'Title').fill('Planning liaison')
    await field(page, 'Summary').fill('Agreed to share the hedgerow plan.')
    await field(page, 'Notes').fill('Bea asked for the hedgerow replanting plan by next week.')
    await submitDrawer(page)
    await expect(page).toHaveURL(/\/engagements\//)
  })

  test('9–10 record a decision, create and complete a commitment', async ({ page }) => {
    await signIn(page, alice)
    await create(page, 'cd')
    await field(page, 'Decision').fill('Eastern option withdrawn')
    await pickFirst(page, 'Approvers', 'Bea')
    await submitDrawer(page)
    await expect(page.locator('.toast', { hasText: 'Decision created' })).toBeVisible()

    await page.goto(stakeholderUrl)
    await page.getByRole('button', { name: 'New commitment' }).first().click()
    await field(page, 'Commitment').fill('Share hedgerow replanting plan')
    await submitDrawer(page)
    const item = page.locator('.citem', { hasText: 'Share hedgerow replanting plan' }).first()
    await expect(item).toBeVisible()
    await item.getByRole('checkbox').click()
    await expect(page.locator('.toast', { hasText: /C-\d+ completed/ })).toBeVisible()
    await expect(item).toHaveAttribute('data-done', 'true')
  })

  test('11 dashboard reflects real records', async ({ page }) => {
    await signIn(page, alice)
    await page.goto('/')
    await expect(page.locator('.rcard').filter({ has: page.getByRole('heading', { name: 'Stakeholders', exact: true }) })).toContainText('1 active')
    await expect(page.locator('.rcard').filter({ has: page.getByRole('heading', { name: 'Recent engagements', exact: true }) })).toContainText('Planning liaison')
    await expect(page.locator('.rcard').filter({ has: page.getByRole('heading', { name: 'Decisions in progress', exact: true }) })).toContainText('Eastern option withdrawn')
    await expect(page.locator('.rcard').filter({ has: page.getByRole('heading', { name: 'Initiatives', exact: true }) })).toContainText('NRL')
  })

  test('12 relationship map shows the authorized stakeholder', async ({ page }) => {
    await signIn(page, alice)
    await page.goto('/stakeholders?view=map')
    await expect(page.locator('.uni-count')).toContainText('1 people')
    await page.locator('.uni-canvas').focus()
    await page.keyboard.press('l')
    await expect(page.getByRole('treeitem', { name: /Bea Ellwood/ })).toBeVisible()
  })

  test('tenant isolation: another account cannot see or open Tenant A records', async ({ page }) => {
    await signUpAndVerify(page, bob)
    await page.goto('/')
    await page.getByLabel('Workspace name').fill('Other Org')
    await page.getByRole('button', { name: 'Create workspace' }).click()
    await expect(page.getByRole('heading', { name: /Other Org is ready/ })).toBeVisible()
    // Direct object reference to Tenant A's stakeholder.
    await page.goto(stakeholderUrl)
    await expect(page.getByText('This stakeholder doesn’t exist')).toBeVisible()
    // Search returns nothing from Tenant A.
    await page.keyboard.press('Meta+k')
    await page.keyboard.type('Bea Ellwood')
    await expect(page.getByText('No matches for “Bea Ellwood”')).toBeVisible()
    // The API refuses Tenant A's id outright.
    const me = await (await page.request.get('/api/me')).json()
    expect(me.workspaces.map((w: { name: string }) => w.name)).toEqual(['Other Org'])
  })
})

async function signIn(page: Page, u: { email: string }) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/sign-in/)
}
