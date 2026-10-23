// Onboarding, invitations, notifications, data management and analytics hygiene.
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { and, desc, eq } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { addMember, client, createTestContext, createWorkspace, lastMail, ORIGIN, PASSWORD, signUp, type Client, type TestContext } from './helpers'
import { analyticsEvent, auditEvent, dataRequest, emailMessage, mailOutbox, membership, stakeholder, user, workspace } from '../server/db/schema'
import { sendCommitmentDigests } from '../server/modules/notifications'
import { processDataRequests } from '../server/modules/data'

let ctx: TestContext
let owner: Client, admin: Client, viewer: Client
let w: string
const api = (p: string) => `/api/w/${w}${p}`

beforeAll(async () => {
  ctx = await createTestContext()
  owner = await signUp(ctx, 'olive@com.test', 'Olive Owner')
  admin = await signUp(ctx, 'ada@com.test', 'Ada Admin')
  viewer = await signUp(ctx, 'vic@com.test', 'Vic Viewer')
  const r = await owner.post('/api/workspaces', { name: 'Harbour Works', template: 'construction' })
  expect(r.status).toBe(201)
  w = r.body.id
  await addMember(ctx, owner, w, admin, 'ada@com.test', 'admin')
  await addMember(ctx, owner, w, viewer, 'vic@com.test', 'viewer')
})
afterAll(async () => { await ctx.close() })

describe('onboarding and templates', () => {
  test('the template configures vocabulary and choices on the one shared product', async () => {
    const ws = (await owner.get(api(''))).body
    expect(ws.settings).toMatchObject({ template: 'construction', vocabulary: { initiative: 'Project' } })
    expect(ws.settings.engagementKinds).toContain('site_visit')
  })
  test('progress is derived from real data and resumes', async () => {
    let o = (await owner.get(api('/onboarding'))).body
    expect(o.completed).toEqual(expect.arrayContaining(['template', 'team']))
    expect(o.completed).not.toContain('initiative')
    await owner.post(api('/initiatives'), { code: 'NRL', name: 'Northern Rail Link' })
    await owner.post(api('/stakeholders'), { name: 'Bea Ellwood' })
    o = (await owner.get(api('/onboarding'))).body
    expect(o.completed).toEqual(expect.arrayContaining(['initiative', 'stakeholders']))
    expect((await viewer.patch(api('/onboarding'), { dismissed: true })).status).toBe(403)
    expect((await owner.patch(api('/onboarding'), { dismissed: true })).status).toBe(200)
    expect((await owner.get(api('/onboarding'))).body.dismissed).toBe(true)
  })
  test('activation milestones are recorded once, with no record content', async () => {
    await owner.post(api('/stakeholders'), { name: 'Second Person' })
    const ev = await ctx.db.select().from(analyticsEvent).where(eq(analyticsEvent.workspaceId, w))
    expect(ev.filter(e => e.name === 'first_stakeholder_added')).toHaveLength(1)
    expect(ev.filter(e => e.name === 'first_initiative_created')).toHaveLength(1)
    const blob = JSON.stringify(ev)
    for (const sensitive of ['Bea Ellwood', 'Second Person', 'Northern Rail', 'olive@com.test']) expect(blob).not.toContain(sensitive)
  })
  test('analytics opt-out stops recording for that user', async () => {
    await admin.put('/api/me/preferences', { analyticsOptOut: true })
    const before = (await ctx.db.select().from(analyticsEvent)).length
    await admin.post(api('/invitations'), { email: 'optout-invitee@com.test', role: 'viewer' })
    expect((await ctx.db.select().from(analyticsEvent)).length).toBe(before)
    await admin.put('/api/me/preferences', { analyticsOptOut: false })
  })
})

describe('invitations', () => {
  test('resend rotates the link: the old token stops working, the new one works for a new user', async () => {
    const inv = (await owner.post(api('/invitations'), { email: 'newbie@com.test', role: 'contributor' })).body
    const oldToken = new URL((await lastMail(ctx, 'newbie@com.test', 'invite')).url!).pathname.split('/').pop()!
    expect((await owner.post(api(`/invitations/${inv.id}/resend`))).status).toBe(200)
    expect((await owner.post(api(`/invitations/${inv.id}/resend`))).status).toBe(429) // resend throttle
    const newToken = new URL((await lastMail(ctx, 'newbie@com.test', 'invite')).url!).pathname.split('/').pop()!
    expect(newToken).not.toBe(oldToken)
    const anon = client(ctx)
    expect((await anon.get(`/api/invitations/${oldToken}`)).status).toBe(404)
    const preview = (await anon.get(`/api/invitations/${newToken}`)).body
    expect(preview).toMatchObject({ status: 'pending', workspaceName: 'Harbour Works', accountExists: false })
    const newbie = await signUp(ctx, 'newbie@com.test', 'Nia Newbie')
    expect((await newbie.post(`/api/invitations/${newToken}/accept`)).status).toBe(200)
    // Inviter is notified in-app and by email.
    expect((await owner.get(api('/notifications'))).body.notifications[0].title).toBe('Nia Newbie joined Harbour Works')
    expect((await lastMail(ctx, 'olive@com.test', 'invitation_accepted'))).toBeTruthy()
  })
  test('used, revoked and expired links reveal nothing about the workspace', async () => {
    const used = new URL((await lastMail(ctx, 'newbie@com.test', 'invite')).url!).pathname.split('/').pop()!
    const p = (await client(ctx).get(`/api/invitations/${used}`)).body
    expect(p).toEqual({ status: 'accepted', workspaceName: null, inviter: null, role: null, email: null, accountExists: null })
    expect((await client(ctx).get('/api/invitations/not-a-real-token')).status).toBe(404)
  })
  test('existing users see that they already have an account; viewers can’t invite', async () => {
    await owner.post(api('/invitations'), { email: 'existing@com.test', role: 'viewer' })
    await signUp(ctx, 'existing2@com.test', 'Existing Two')
    await owner.post(api('/invitations'), { email: 'existing2@com.test', role: 'viewer' })
    const t = new URL((await lastMail(ctx, 'existing2@com.test', 'invite')).url!).pathname.split('/').pop()!
    expect((await client(ctx).get(`/api/invitations/${t}`)).body.accountExists).toBe(true)
    expect((await viewer.post(api('/invitations'), { email: 'x@com.test', role: 'viewer' })).status).toBe(403)
  })
})

describe('notifications', () => {
  test('emails are rendered from templates with HTML + text, and logged without bodies or links', async () => {
    const [m] = await ctx.db.select().from(mailOutbox).where(eq(mailOutbox.kind, 'invite')).orderBy(desc(mailOutbox.createdAt)).limit(1)
    expect(m.text).toContain('Accept invitation:')
    const log = await ctx.db.select().from(emailMessage).where(eq(emailMessage.template, 'invite'))
    expect(log.length).toBeGreaterThan(0)
    expect(Object.keys(log[0])).not.toContain('html')
    expect(log.every(l => l.status === 'sent')).toBe(true)
  })
  test('decision assignment notifies the new owner; subjects never name stakeholders', async () => {
    const adminId = (await ctx.db.select().from(user).where(eq(user.email, 'ada@com.test')))[0].id
    const s = (await owner.post(api('/stakeholders'), { name: 'Secretive Sam' })).body
    const d = await owner.post(api('/decisions'), { title: 'Depot access route', ownerId: adminId, stakeholders: [{ stakeholderId: s.id, role: 'approver' }] })
    expect(d.status).toBe(201)
    const mail = await lastMail(ctx, 'ada@com.test', 'decision_assigned')
    expect(mail.subject).toBe('A decision was assigned to me'.replace('to me', 'to you'))
    expect(mail.subject + mail.text).not.toContain('Secretive Sam')
    expect((await admin.get(api('/notifications'))).body.unread).toBeGreaterThan(0)
    await admin.post(api('/notifications/read'), {})
    expect((await admin.get(api('/notifications'))).body.unread).toBe(0)
  })
  test('daily digest: own commitments only, respects preferences, once per day, one-click unsubscribe', async () => {
    const ownerId = (await ctx.db.select().from(user).where(eq(user.email, 'olive@com.test')))[0].id
    await owner.post(api('/commitments'), { title: 'Send drainage study', ownerId, dueDate: '2026-01-05' })
    expect(await sendCommitmentDigests(ctx.deps)).toBeGreaterThan(0)
    const mail = await ctx.db.select().from(mailOutbox).where(and(eq(mailOutbox.kind, 'commitments_digest'), eq(mailOutbox.to, 'olive@com.test')))
    expect(mail).toHaveLength(1)
    expect(mail[0].text).toContain('Send drainage study')
    await sendCommitmentDigests(ctx.deps)
    expect((await ctx.db.select().from(mailOutbox).where(and(eq(mailOutbox.kind, 'commitments_digest'), eq(mailOutbox.to, 'olive@com.test'))))).toHaveLength(1)
    // Unsubscribe via the emailed link: GET only shows a confirmation; POST unsubscribes.
    const link = /unsubscribe from all notification emails \((http[^)\s]+)\)/.exec(mail[0].text)?.[1]
    expect(link).toBeTruthy()
    const path = new URL(link!).pathname + new URL(link!).search
    expect((await ctx.app.request(path)).status).toBe(200)
    expect((await owner.get('/api/me/preferences')).body.notifications.commitments_digest.email).toBe(true)
    expect((await ctx.app.request(path, { method: 'POST', headers: { origin: ORIGIN } })).status).toBe(200)
    expect((await owner.get('/api/me/preferences')).body.notifications.commitments_digest.email).toBe(false)
    const r = await ctx.deps.mailer.send({ to: 'olive@com.test', userId: ownerId, workspaceId: w, template: 'commitments_digest', data: { workspaceName: 'x', due: [], overdue: [{ label: 'x', meta: 'y' }], url: 'http://x' } })
    expect(r.status).toBe('suppressed')
  })
})

describe('data management', () => {
  test('admins export the whole workspace in the background; viewers can’t', async () => {
    expect((await viewer.post(api('/data/export'))).status).toBe(403)
    const r = await admin.post(api('/data/export'))
    expect(r.status).toBe(202)
    expect((await admin.post(api('/data/export'))).status).toBe(409) // one at a time
    await ctx.jobs.drain()
    const list = (await admin.get(api('/data/requests'))).body.requests
    expect(list[0]).toMatchObject({ kind: 'workspace_export', status: 'ready', downloadable: true })
    const dl = await admin.get(api(`/data/exports/${list[0].id}`))
    expect(dl.status).toBe(200)
    expect(dl.body.format).toBe('meridian-workspace-export')
    expect(dl.body.stakeholders.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(['Bea Ellwood', 'Secretive Sam']))
    expect(JSON.stringify(dl.body)).not.toContain('password')
    expect((await lastMail(ctx, 'ada@com.test', 'data_export_ready'))).toBeTruthy()
    // Expired files are purged.
    await ctx.db.update(dataRequest).set({ fileExpiresAt: new Date(Date.now() - 1000) }).where(eq(dataRequest.id, list[0].id))
    const file = (await ctx.db.select().from(dataRequest).where(eq(dataRequest.id, list[0].id)))[0].file!
    await processDataRequests(ctx.deps)
    expect(existsSync(file)).toBe(false)
    expect((await admin.get(api(`/data/exports/${list[0].id}`))).status).toBe(404)
  })
  test('personal data export contains my data, not other people’s records', async () => {
    const r = await viewer.get('/api/me/export')
    expect(r.status).toBe(200)
    expect(r.body.profile.email).toBe('vic@com.test')
    expect(JSON.stringify(r.body)).not.toContain('Bea Ellwood')
  })
  test('workspace deletion: owner-only, confirmed by name, cooling-off, cancellable, then deleted with an audit trail', async () => {
    expect((await admin.post(api('/data/deletion'), { confirmName: 'Harbour Works' })).status).toBe(403)
    expect((await owner.post(api('/data/deletion'), { confirmName: 'harbour works' })).status).toBe(422)
    const r = await owner.post(api('/data/deletion'), { confirmName: 'Harbour Works' })
    expect(r.status).toBe(202)
    expect((await lastMail(ctx, 'olive@com.test', 'workspace_deletion_scheduled'))).toBeTruthy()
    expect((await owner.del(api('/data/deletion'))).status).toBe(200)
    await owner.post(api('/data/deletion'), { confirmName: 'Harbour Works' })
    await processDataRequests(ctx.deps)
    expect((await ctx.db.select().from(workspace).where(eq(workspace.id, w)))).toHaveLength(1) // not due yet
    await ctx.db.update(dataRequest).set({ scheduledFor: new Date(Date.now() - 1000) }).where(and(eq(dataRequest.workspaceId, w), eq(dataRequest.status, 'scheduled')))
    expect((await processDataRequests(ctx.deps)).deleted).toBe(1)
    expect(await ctx.db.select().from(workspace).where(eq(workspace.id, w))).toHaveLength(0)
    expect(await ctx.db.select().from(stakeholder).where(eq(stakeholder.workspaceId, w))).toHaveLength(0)
    const [audit] = await ctx.db.select().from(auditEvent).where(eq(auditEvent.action, 'workspace.deleted'))
    expect(audit.metadata).toMatchObject({ name: 'Harbour Works' })
  })
})

describe('account closure', () => {
  test('the last owner of a shared workspace must hand over first; shared records survive closure', async () => {
    const o = await signUp(ctx, 'closer@com.test', 'Cleo Closer')
    const m = await signUp(ctx, 'mate@com.test', 'Max Mate')
    const wid = await createWorkspace(o, 'Shared Co')
    await addMember(ctx, o, wid, m, 'mate@com.test', 'admin')
    await o.post(`/api/w/${wid}/stakeholders`, { name: 'Shared Person' })
    expect((await o.post('/api/me/close', { confirmEmail: 'wrong@com.test' })).status).toBe(422)
    const blocked = await o.post('/api/me/close', { confirmEmail: 'closer@com.test' })
    expect(blocked.status).toBe(409); expect(blocked.body.error.workspaces).toEqual(['Shared Co'])
    const members = (await o.get(`/api/w/${wid}/members`)).body.members
    await o.patch(`/api/w/${wid}/members/${members.find((x: { email: string }) => x.email === 'mate@com.test').id}`, { role: 'owner' })
    expect((await o.post('/api/me/close', { confirmEmail: 'closer@com.test' })).status).toBe(200)
    expect(await ctx.db.select().from(user).where(eq(user.email, 'closer@com.test'))).toHaveLength(0)
    expect((await m.get(`/api/w/${wid}/stakeholders`)).body.items.map((s: { name: string }) => s.name)).toContain('Shared Person')
    expect((await ctx.db.select().from(membership).where(eq(membership.workspaceId, wid)))).toHaveLength(1)
    // The closed account can't sign in.
    const again = await client(ctx).post('/api/auth/sign-in/email', { email: 'closer@com.test', password: PASSWORD })
    expect(again.status).not.toBe(200)
    expect(await ctx.db.select().from(mailOutbox).where(and(eq(mailOutbox.kind, 'account_closed'), eq(mailOutbox.to, 'closer@com.test')))).toHaveLength(1)
  })
})
