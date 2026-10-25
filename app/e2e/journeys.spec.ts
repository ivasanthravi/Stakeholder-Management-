// Launch journeys not already covered by core-flow / ai-flow / commercial-flow:
//   B  team collaboration: invite → accept → change role → permissions follow → revoke access
//   D  decision management: create → owner → status with recorded outcome → history
//   I  account lifecycle: workspace export (real download) → schedule deletion → cancel it
// plus failure paths: wrong password, unusable invitation link, viewer can't reach billing controls.
// Setup that isn't the subject of a journey goes through the API; the journey itself is driven through the UI.
import { expect, test, type Page } from '@playwright/test'
import { mailUrl } from './mail'
import { readFileSync } from 'node:fs'

const PASSWORD = 'correct-horse-battery'
const stamp = Date.now()
const owner = { name: 'Juno Owner', email: `juno.${stamp}@e2e.test` }
const mate = { name: 'Kit Mate', email: `kit.${stamp}@e2e.test` }
let wid = ''

async function signUpVerified(page: Page, u: { name: string; email: string }) {
  const r = await page.request.post('/api/auth/sign-up/email', { data: { email: u.email, password: PASSWORD, name: u.name } })
  expect(r.ok()).toBeTruthy()
  const v = await mailUrl(page.request, u.email, 'verify')
  await page.goto(v.pathname + v.search)
}
async function signIn(page: Page, u: { email: string }) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(u.email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/sign-in/)
}

test.describe.serial('launch journeys', () => {
  test('setup: owner with a workspace; teammate invited and accepted', async ({ browser }) => {
    const op = await (await browser.newContext()).newPage()
    await signUpVerified(op, owner)
    wid = (await (await op.request.post('/api/workspaces', { data: { name: 'Journey Works' } })).json()).id
    await op.request.post(`/api/w/${wid}/invitations`, { data: { email: mate.email, role: 'contributor' } })
    const invite = await mailUrl(op.request, mate.email, 'invite')
    const mp = await (await browser.newContext()).newPage()
    await signUpVerified(mp, mate)
    await mp.goto(invite.pathname)
    await mp.getByRole('button', { name: /Accept and open/ }).click()
    await expect(mp).toHaveURL(/\/(welcome)?$/)
  })

  test('B: owner changes the teammate’s role, permissions follow immediately, then revokes access', async ({ browser }) => {
    const op = await (await browser.newContext()).newPage()
    const mp = await (await browser.newContext()).newPage()
    await signIn(op, owner); await signIn(mp, mate)
    expect((await mp.request.post(`/api/w/${wid}/stakeholders`, { data: { name: 'Allowed as contributor' } })).status()).toBe(201)

    await op.goto('/settings/members')
    await op.getByRole('button', { name: `Role for ${mate.name}: Contributor. Change role` }).click()
    await op.getByRole('listbox', { name: `Role for ${mate.name}` }).getByRole('option', { name: 'Viewer' }).click()
    const demote = op.getByRole('alertdialog').or(op.getByRole('dialog'))
    if (await demote.isVisible().catch(() => false)) await demote.getByRole('button', { name: /Make Viewer/ }).click()
    await expect(op.getByRole('button', { name: `Role for ${mate.name}: Viewer. Change role` })).toBeVisible()
    expect((await mp.request.post(`/api/w/${wid}/stakeholders`, { data: { name: 'Denied as viewer' } })).status()).toBe(403)

    await op.getByRole('button', { name: `Remove ${mate.name}` }).click()
    await op.getByRole('alertdialog').getByRole('button', { name: 'Remove member' }).click()
    await expect(op.getByText(mate.email)).toHaveCount(0)
    expect((await mp.request.get(`/api/w/${wid}/stakeholders`)).status()).toBe(404)
    await mp.goto('/stakeholders')
    await expect(mp).not.toHaveURL(new RegExp(wid))
  })

  test('D: decision with owner → approved with a recorded outcome → visible in history', async ({ page }) => {
    await signIn(page, owner)
    const me = await (await page.request.get('/api/me')).json()
    const s = await (await page.request.post(`/api/w/${wid}/stakeholders`, { data: { name: 'Dana Approver' } })).json()
    const d = await (await page.request.post(`/api/w/${wid}/decisions`, { data: { title: 'Depot access route', ownerId: me.user.id, stakeholders: [{ stakeholderId: s.id, role: 'approver' }] } })).json()
    await page.goto(`/decisions?open=${d.id}`)
    await page.getByRole('button', { name: /^Status: Proposed\. Change/ }).click()
    await page.getByRole('option', { name: /^Approved/ }).click()
    await page.getByLabel(/Outcome/).fill('Approved subject to a revised noise survey before construction')
    await page.getByRole('button', { name: 'Mark approved' }).click()
    await expect(page.getByText('Approved subject to a revised noise survey before construction').first()).toBeVisible()
    const detail = await (await page.request.get(`/api/w/${wid}/decisions/${d.id}`)).json()
    expect(detail).toMatchObject({ status: 'approved', outcome: 'Approved subject to a revised noise survey before construction' })
    const history = await (await page.request.get(`/api/w/${wid}/activity?entityType=decision&entityId=${d.id}`)).json()
    expect(JSON.stringify(history.events)).toMatch(/Approved/)
  })

  test('I: export the workspace (real download), schedule deletion, then cancel it', async ({ page }) => {
    await signIn(page, owner)
    await page.goto('/settings/data')
    await page.getByRole('button', { name: 'Export workspace' }).click()
    const link = page.getByRole('link', { name: 'Download', exact: true }).first()
    await expect(link).toBeVisible({ timeout: 30_000 })
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()])
    const data = JSON.parse(readFileSync(await download.path(), 'utf8'))
    expect(data.format).toBe('meridian-workspace-export')
    expect(data.decisions.map((x: { title: string }) => x.title)).toContain('Depot access route')

    await page.getByRole('button', { name: 'Delete workspace…' }).click()
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await dialog.getByRole('textbox').fill('Journey Works')
    await dialog.getByRole('button', { name: 'Schedule deletion' }).click()
    await expect(page.getByRole('button', { name: 'Cancel deletion' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel deletion' }).click()
    await expect(page.getByRole('button', { name: 'Delete workspace…' })).toBeVisible()
    const reqs = await (await page.request.get(`/api/w/${wid}/data/requests`)).json()
    expect(reqs.requests.find((r: { kind: string }) => r.kind === 'workspace_deletion').status).toBe('canceled')
  })

  test('failure paths: wrong password, unusable invitation link, viewer has no billing controls', async ({ page, browser }) => {
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page).toHaveURL(/sign-in/)

    await page.goto('/invite/this-token-does-not-exist')
    await expect(page.getByText(/can’t be used/i).first()).toBeVisible()
    await expect(page.getByText('Journey Works')).toHaveCount(0)

    // A viewer sees no billing controls, and the API refuses them.
    const v = { name: 'Vee Viewer', email: `vee.${stamp}@e2e.test` }
    const op = await (await browser.newContext()).newPage()
    await signIn(op, owner)
    await op.request.post(`/api/w/${wid}/invitations`, { data: { email: v.email, role: 'viewer' } })
    const invite = await mailUrl(op.request, v.email, 'invite')
    const vp = await (await browser.newContext()).newPage()
    await signUpVerified(vp, v)
    await vp.request.post(`/api/invitations/${invite.pathname.split('/').pop()}/accept`)
    await vp.goto('/settings')
    await expect(vp.getByRole('tab', { name: /Subscription/ })).toHaveCount(0)
    expect((await vp.request.post(`/api/w/${wid}/billing/checkout`, { data: { plan: 'starter', interval: 'month', seats: 3 } })).status()).toBe(403)
  })
})
