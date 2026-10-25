// Phase 8 cross-experience journey: Command Center → profile → timeline → relationships → Stakeholder Universe →
// profile → update the commitment → Command Center, checking that context and data stay consistent at every step.
import { expect, test, type Page } from '@playwright/test'
import { mailUrl } from './mail'

const PASSWORD = 'correct-horse-battery'
const user = { name: 'Jo Journey', email: `jo.${Date.now()}@e2e.test` }
let priya = ''

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(user.email); await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/sign-in/)
}

test.describe.serial('signature journey', () => {
  test('setup: an initiative, two related people, an engagement and an overdue commitment', async ({ page }) => {
    expect((await page.request.post('/api/auth/sign-up/email', { data: { email: user.email, password: PASSWORD, name: user.name } })).ok()).toBeTruthy()
    const v = await mailUrl(page.request, user.email, 'verify')
    await page.goto(v.pathname + v.search)
    const w = (await (await page.request.post('/api/workspaces', { data: { name: 'Journey Partners' } })).json()).id
    const ini = (await (await page.request.post(`/api/w/${w}/initiatives`, { data: { code: 'RVR', name: 'River Crossing' } })).json()).id
    priya = (await (await page.request.post(`/api/w/${w}/stakeholders`, { data: { name: 'Priya Pathak', title: 'Planning Lead', influence: 4, initiativeIds: [ini] } })).json()).id
    const omar = (await (await page.request.post(`/api/w/${w}/stakeholders`, { data: { name: 'Omar Okafor', title: 'Highways Engineer', influence: 3, initiativeIds: [ini] } })).json()).id
    expect((await page.request.post(`/api/w/${w}/relationships`, { data: { source: { kind: 'stakeholder', id: priya }, target: { kind: 'stakeholder', id: omar }, type: 'allied', directed: false } })).ok()).toBeTruthy()
    expect((await page.request.post(`/api/w/${w}/engagements`, { data: { kind: 'meeting', title: 'Junction design review', occurredAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), initiativeId: ini, participantIds: [priya] } })).ok()).toBeTruthy()
    expect((await page.request.post(`/api/w/${w}/commitments`, { data: { title: 'Send the junction drawings', stakeholderId: priya, initiativeId: ini, direction: 'ours', dueDate: '2026-01-05' } })).ok()).toBeTruthy()
  })

  test('the journey keeps context and the data stays consistent', async ({ page }) => {
    await signIn(page)
    // 1–2. The Command Center names the overdue commitment.
    await expect(page.locator('.home-intro')).toContainText('1 overdue commitment')
    await page.getByRole('button', { name: /Why this is here: .*Send the junction drawings/ }).click()
    // 3. Open the stakeholder behind it.
    await page.getByRole('button', { name: /Open profile/ }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Priya Pathak' })).toBeVisible()
    // 4. The timeline shows the engagement and the commitment, each linked to its source.
    await page.getByRole('tab', { name: /Timeline/ }).click()
    const tl = page.locator('.tl-unified')
    await expect(tl.getByText('Junction design review')).toBeVisible()
    await expect(tl.getByText('Send the junction drawings')).toBeVisible()
    await expect(tl.getByText('Commitment raised')).toBeVisible()
    // 5. Related stakeholders.
    await page.getByRole('tab', { name: /Relationships/ }).click()
    await expect(page.getByRole('link', { name: /Omar Okafor/ }).first()).toBeVisible()
    // 6–7. The Stakeholder Universe opens focused on Priya; choosing Omar in the panel moves the focus, not the page.
    await page.getByRole('button', { name: /Show in map/ }).click()
    await expect(page).toHaveURL(/view=map/)
    await page.locator('.uni-canvas').focus()
    await page.keyboard.press('ArrowRight')
    const panel = page.locator('.peek')
    await expect(panel.getByRole('heading', { level: 2 })).toBeVisible()
    const first = await panel.getByRole('heading', { level: 2 }).textContent()
    const other = first === 'Priya Pathak' ? 'Omar Okafor' : 'Priya Pathak'
    await panel.getByRole('button', { name: new RegExp(other) }).first().click()
    await expect(panel.getByRole('heading', { level: 2, name: other })).toBeVisible()
    await expect(page).toHaveURL(/view=map/)
    await expect(panel.getByText('RVR').first()).toBeVisible() // the panel lists the shared initiative
    // 8. Back to the profile.
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Priya Pathak' })).toBeVisible()
    // 9. Update the commitment from the profile.
    await page.getByRole('tab', { name: /Commitments/ }).click()
    const check = page.getByRole('checkbox', { name: /^Mark C-\d+ complete$/ }).first()
    await check.click()
    await expect(page.getByRole('checkbox', { name: /^Mark C-\d+ open$/ }).first()).toHaveAttribute('aria-checked', 'true')
    // 10–11. The Command Center reflects it: nothing overdue, and the completion appears under "What changed".
    await page.getByRole('link', { name: 'Home' }).first().click()
    await expect(page.locator('.home-intro')).not.toContainText('overdue commitment')
    await expect(page.getByRole('button', { name: /Why this is here: .*Send the junction drawings/ })).toHaveCount(0)
    const changed = page.locator('.rcard', { hasText: 'What changed' })
    await expect(changed.getByText('Send the junction drawings')).toBeVisible()
    await expect(changed.getByText(/completed/i).first()).toBeVisible()
  })
})
