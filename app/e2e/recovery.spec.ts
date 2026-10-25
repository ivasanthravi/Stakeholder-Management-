// Account and failure-recovery journeys (launch journey 10 plus the authentication paths no other spec drives):
// sign-out, password recovery by email, an expired session, workspace switching, a network failure with retry,
// and an unavailable AI service. Setup goes through the API; each journey is driven through the UI.
import { expect, test, type Page } from '@playwright/test'
import { mailUrl } from './mail'

const PASSWORD = 'correct-horse-battery'
const NEW_PASSWORD = 'a-different-horse-battery'
const stamp = Date.now()
const user = { name: 'Rowan Recovery', email: `rowan.${stamp}@e2e.test` }
let alpha = '', beta = ''

async function signIn(page: Page, password = PASSWORD) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/sign-in/)
}

test.describe.serial('account and recovery journeys', () => {
  test('setup: a verified user with two workspaces', async ({ page }) => {
    expect((await page.request.post('/api/auth/sign-up/email', { data: { email: user.email, password: PASSWORD, name: user.name } })).ok()).toBeTruthy()
    const v = await mailUrl(page.request, user.email, 'verify')
    await page.goto(v.pathname + v.search)
    alpha = (await (await page.request.post('/api/workspaces', { data: { name: 'Alpha Holdings' } })).json()).id
    beta = (await (await page.request.post('/api/workspaces', { data: { name: 'Beta Partners' } })).json()).id
    expect((await page.request.post(`/api/w/${alpha}/stakeholders`, { data: { name: 'Aria Alphason' } })).ok()).toBeTruthy()
    expect((await page.request.post(`/api/w/${beta}/stakeholders`, { data: { name: 'Bram Betaworth' } })).ok()).toBeTruthy()
  })

  test('workspace switching shows only the selected workspace’s records', async ({ page }) => {
    await signIn(page)
    await page.goto('/stakeholders')
    const sw = page.getByRole('button', { name: /^Workspace: .*Switch workspace$/ })
    // Land on Alpha first, whichever workspace the session opened.
    if (!(await sw.getAttribute('aria-label'))?.includes('Alpha')) {
      await sw.click(); await page.getByRole('option', { name: /Alpha Holdings/ }).click()
      await page.goto('/stakeholders')
    }
    await expect(page.getByText('Aria Alphason')).toBeVisible()
    await expect(page.getByText('Bram Betaworth')).toHaveCount(0)
    await sw.click()
    await page.getByRole('option', { name: /Beta Partners/ }).click()
    // Switching lands on the new workspace's Home, never on a page holding the previous workspace's records.
    await expect(page.getByRole('button', { name: /Workspace: Beta Partners/ })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await page.goto('/stakeholders')
    await expect(page.getByText('Bram Betaworth')).toBeVisible()
    await expect(page.getByText('Aria Alphason')).toHaveCount(0)
  })

  test('a network failure shows a recoverable error, and Retry recovers', async ({ page }) => {
    await signIn(page)
    let fail = true
    await page.route(/\/api\/w\/[^/]+\/stakeholders(\?|$)/, route => fail ? route.abort('internetdisconnected') : route.continue())
    await page.goto('/stakeholders')
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load this' })
    await expect(alert).toBeVisible({ timeout: 20_000 })
    fail = false
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(alert).toHaveCount(0)
    await expect(page.getByText(/Aria Alphason|Bram Betaworth/).first()).toBeVisible()
  })

  test('an unavailable AI service fails visibly, without breaking the page', async ({ page }) => {
    await signIn(page)
    await page.route(/\/api\/w\/[^/]+\/ai\/briefings\//, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ai_unavailable', message: 'The AI service is unavailable. Try again shortly.' } }) }))
    await page.goto('/stakeholders')
    await page.getByRole('row', { name: /Aria Alphason|Bram Betaworth/ }).first().dblclick()
    await expect(page).toHaveURL(/\/stakeholders\/[^/]+$/)
    await page.goto(new URL(page.url()).pathname + '/briefing')
    await expect(page.getByRole('alert').filter({ hasText: 'Couldn’t prepare this briefing' })).toBeVisible({ timeout: 20_000 })
    // The rest of the app still works.
    await page.goto('/stakeholders')
    await expect(page.getByRole('row', { name: /Aria Alphason|Bram Betaworth/ }).first()).toBeVisible()
  })

  test('an expired session returns to sign-in and then to the same page', async ({ page }) => {
    await signIn(page)
    await page.goto('/commitments')
    await page.context().clearCookies()
    await page.goto('/decisions')
    await expect(page).toHaveURL(/\/sign-in/)
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/decisions/)
  })

  test('sign-out ends the session: protected pages and the API refuse it', async ({ page }) => {
    await signIn(page)
    await page.getByRole('button', { name: `Account: ${user.name}` }).click()
    await page.getByRole('option', { name: /Sign out/ }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    expect((await page.request.get('/api/me')).status()).toBe(401)
    await page.goto('/stakeholders')
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('password recovery by email: the new password works, the old one doesn’t, the link is single-use', async ({ page }) => {
    await page.goto('/sign-in')
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    // Both pages have an Email field: wait for the reset page before typing.
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByText(/a reset link is on its way/)).toBeVisible()
    const link = await mailUrl(page.request, user.email, 'reset')
    await page.goto(link.pathname + link.search)
    await page.getByLabel('New password').fill(NEW_PASSWORD)
    await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
    await page.getByRole('button', { name: 'Update password' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    // Old password refused, new one accepted.
    await page.getByLabel('Email').fill(user.email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await signIn(page, NEW_PASSWORD)
    // Reusing the link fails.
    await page.context().clearCookies()
    await page.goto(link.pathname + link.search)
    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible()
    await expect(page.getByLabel('New password')).toHaveCount(0)
  })

  test('invite-only pilot: a closed signup explains itself instead of waiting for an email', async ({ page }) => {
    // The server's response when SIGNUP_MODE=invite_only refuses an address (asserted in security.test.ts).
    await page.route('**/api/auth/sign-up/email', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'SIGNUP_CLOSED', message: 'Meridian is invitation-only during the pilot. Ask a workspace admin to invite you, or contact us to request access.' }) }))
    await page.goto('/sign-up')
    await page.getByLabel('Full name').fill('Nia Newcomer')
    await page.getByLabel('Work email').fill(`nia.${stamp}@e2e.test`)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText(/invitation-only during the pilot/)).toBeVisible()
    await expect(page).toHaveURL(/\/sign-up/)
  })
})
