// Phase 6 interaction checks on the sample-free dev stack: the Command Center keeps its context when a signal's
// stakeholder is previewed, and register toolbars say what their counts are.
import { expect, test } from '@playwright/test'
import { mailUrl } from './mail'

const PASSWORD = 'correct-horse-battery'
const user = { name: 'Cleo Context', email: `cleo.${Date.now()}@e2e.test` }

test.describe.serial('command center keeps context', () => {
  test('setup: a workspace with an overdue commitment to a stakeholder', async ({ page }) => {
    expect((await page.request.post('/api/auth/sign-up/email', { data: { email: user.email, password: PASSWORD, name: user.name } })).ok()).toBeTruthy()
    const v = await mailUrl(page.request, user.email, 'verify')
    await page.goto(v.pathname + v.search)
    const w = (await (await page.request.post('/api/workspaces', { data: { name: 'Context Works' } })).json()).id
    const s = await (await page.request.post(`/api/w/${w}/stakeholders`, { data: { name: 'Priya Peek', title: 'Planning Lead', influence: 4 } })).json()
    expect((await page.request.post(`/api/w/${w}/commitments`, { data: { title: 'Send the revised plan', stakeholderId: s.id, direction: 'ours', dueDate: '2026-01-05' } })).ok()).toBeTruthy()
  })

  test('a signal expands in place; its stakeholder opens in a peek without leaving Home', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(user.email); await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.getByRole('button', { name: /Why this is here: .*Send the revised plan/ }).click()
    await page.getByRole('button', { name: /Priya Peek/ }).first().click()
    const peek = page.locator('.peek')
    await expect(peek.getByText('Priya Peek').first()).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    // The attention list is still on screen beside the peek.
    await expect(page.getByText('Send the revised plan').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(peek).toHaveCount(0)
    await expect(page).toHaveURL(/\/$/)
  })

  test('register toolbars name their counts', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(user.email); await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/sign-in/)
    await page.goto('/stakeholders')
    await expect(page.getByText(/^1 stakeholder$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show archived' })).toBeVisible()
  })
})

test.describe.serial('workflows B and E', () => {
  const u = { name: 'Wren Workflow', email: `wren.${Date.now()}@e2e.test` }
  let ana = '', ben = ''
  const signIn = async (page: import('@playwright/test').Page) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(u.email); await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).not.toHaveURL(/sign-in/)
  }
  test('setup: two stakeholders', async ({ page }) => {
    expect((await page.request.post('/api/auth/sign-up/email', { data: { email: u.email, password: PASSWORD, name: u.name } })).ok()).toBeTruthy()
    const v = await mailUrl(page.request, u.email, 'verify')
    await page.goto(v.pathname + v.search)
    const w = (await (await page.request.post('/api/workspaces', { data: { name: 'Workflow Works' } })).json()).id
    ana = (await (await page.request.post(`/api/w/${w}/stakeholders`, { data: { name: 'Ana Alder', title: 'Programme Director', influence: 4 } })).json()).id
    ben = (await (await page.request.post(`/api/w/${w}/stakeholders`, { data: { name: 'Ben Birch', title: 'Site Manager', influence: 2 } })).json()).id
  })

  test('B: add a relationship on a profile → see it on the map → open the related profile', async ({ page }) => {
    await signIn(page)
    await page.goto(`/stakeholders/${ana}`)
    await page.getByRole('tab', { name: /Relationships/ }).click()
    await page.getByRole('button', { name: 'Add relationship' }).click()
    const box = page.getByRole('combobox', { name: 'Person' })
    await box.click(); await box.fill('Ben')
    await expect(page.locator('.picker-list [role=option]').first()).toContainText('Ben Birch')
    await box.press('Enter')
    await page.getByRole('dialog').getByRole('button', { name: 'Add relationship' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Ben Birch/ }).first()).toBeVisible()
    // The map shows both people and the relationship.
    await page.getByRole('button', { name: /Show in map/ }).click()
    await expect(page).toHaveURL(/view=map/)
    await expect(page.locator('.uni-count')).toContainText('2 people · 1 relationship ·')
    // Open the related profile from the relationship list.
    await page.goto(`/stakeholders/${ana}`)
    await page.getByRole('tab', { name: /Relationships/ }).click()
    await page.getByRole('link', { name: /Ben Birch/ }).first().click()
    await expect(page).toHaveURL(new RegExp(`/stakeholders/${ben}`))
    await expect(page.getByRole('heading', { level: 1, name: 'Ben Birch' })).toBeVisible()
  })

  test('E: search → filter → open → edit → save → reload: the change persists', async ({ page }) => {
    await signIn(page)
    await page.goto('/stakeholders')
    await page.getByPlaceholder(/Filter by name/).fill('Birch')
    await expect(page.getByRole('row', { name: /Ben Birch/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /Ana Alder/ })).toHaveCount(0)
    await page.getByRole('row', { name: /Ben Birch/ }).dblclick()
    await expect(page).toHaveURL(new RegExp(`/stakeholders/${ben}`))
    await page.getByRole('button', { name: /^Edit/ }).click()
    const title = page.getByRole('dialog').getByLabel('Title')
    await title.fill('Senior Site Manager')
    await page.getByRole('dialog').getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Senior Site Manager').first()).toBeVisible()
  })
})
