import { describe, expect, test } from 'vitest'
import { can, canChangeRole, PERMISSIONS, ROLES } from '../shared/permissions'
import { commitmentCreateSchema, initiativeCreateSchema, inviteSchema, relationshipCreateSchema, stakeholderCreateSchema, stakeholderUpdateSchema } from '../shared/schemas'
import { diff } from '../server/history'
import { buildBriefing } from '../server/modules/briefing'

describe('permission matrix', () => {
  test('roles are strictly ordered: every higher role can do what a lower role can', () => {
    for (const action of Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]) {
      const allowed = ROLES.map(r => can(r, action))
      // ROLES is owner → viewer; once false it must stay false down the list
      const firstFalse = allowed.indexOf(false)
      if (firstFalse >= 0) expect(allowed.slice(firstFalse).every(v => !v), action).toBe(true)
    }
  })
  test('key boundaries', () => {
    expect(can('viewer', 'record.read')).toBe(true)
    expect(can('viewer', 'stakeholder.create')).toBe(false)
    expect(can('contributor', 'stakeholder.create')).toBe(true)
    expect(can('contributor', 'stakeholder.archive')).toBe(false)
    expect(can('manager', 'initiative.create')).toBe(true)
    expect(can('manager', 'members.invite')).toBe(false)
    expect(can('admin', 'audit.read')).toBe(true)
    expect(can('admin', 'workspace.delete')).toBe(false)
    expect(can(null, 'record.read')).toBe(false)
  })
  test('role changes', () => {
    expect(canChangeRole('admin', 'viewer', 'manager')).toBe(true)
    expect(canChangeRole('admin', 'viewer', 'owner')).toBe(false)
    expect(canChangeRole('admin', 'owner', 'viewer')).toBe(false)
    expect(canChangeRole('owner', 'admin', 'owner')).toBe(true)
    expect(canChangeRole('manager', 'viewer', 'contributor')).toBe(false)
  })
})

describe('validation', () => {
  test('stakeholder: minimal input is valid, optional fields normalised', () => {
    const v = stakeholderCreateSchema.parse({ name: '  Bea  ', email: '', title: '' })
    expect(v).toMatchObject({ name: 'Bea', email: null, title: null, stance: 'unknown', tags: [], organizations: [] })
  })
  test('stakeholder: rejects bad values', () => {
    expect(stakeholderCreateSchema.safeParse({ name: '' }).success).toBe(false)
    expect(stakeholderCreateSchema.safeParse({ name: 'x', influence: 5 }).success).toBe(false)
    expect(stakeholderCreateSchema.safeParse({ name: 'x', email: 'not-an-email' }).success).toBe(false)
    expect(stakeholderUpdateSchema.safeParse({ name: 'x' }).success).toBe(false) // version required
  })
  test('initiative code normalised, dates ordered', () => {
    expect(initiativeCreateSchema.parse({ code: 'nrl', name: 'X' }).code).toBe('NRL')
    expect(initiativeCreateSchema.safeParse({ code: 'N', name: 'X' }).success).toBe(false)
    expect(initiativeCreateSchema.safeParse({ code: 'AB', name: 'X', startDate: '2026-02-01', endDate: '2026-01-01' }).success).toBe(false)
  })
  test('relationship cannot be self-referential', () => {
    const id = '0198f0c2-7a1b-7c3d-9e4f-123456789abc'
    expect(relationshipCreateSchema.safeParse({ source: { kind: 'stakeholder', id }, target: { kind: 'stakeholder', id }, type: 'advises' }).success).toBe(false)
  })
  test('invite cannot grant owner; commitment requires title', () => {
    expect(inviteSchema.safeParse({ email: 'a@b.co', role: 'owner' }).success).toBe(false)
    expect(inviteSchema.parse({ email: ' A@B.CO ', role: 'viewer' }).email).toBe('a@b.co')
    expect(commitmentCreateSchema.safeParse({ title: ' ' }).success).toBe(false)
  })
})

describe('domain helpers', () => {
  test('diff ignores unchanged, secret and bookkeeping fields', () => {
    expect(diff({ a: 1, b: 'x', notes: 'old', version: 1 }, { a: 2, b: 'x', notes: 'new', version: 2 })).toEqual({ a: { from: 1, to: 2 } })
    expect(diff({ tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual({})
  })
  test('briefing cites every factual sentence and labels inference', () => {
    const now = Date.now()
    const engagements = [0, 70, 80, 90, 100].map((d, i) => ({ id: `e${i}`, key: `E-${i}`, kind: 'meeting', title: 'm', occurredAt: new Date(now - d * 86_400_000), summary: 'ok' }))
    const b = buildBriefing({
      s: { id: 's', name: 'Bea Ellwood', title: 'Head', stance: 'concerned', influence: 4, organizations: [{ name: 'WCC', validTo: null, isPrimary: true }] },
      engagements, commitments: [{ id: 'c', key: 'C-1', title: 'Send survey', status: 'open', dueDate: '2000-01-01' }], decisions: [], relationships: [],
    })
    expect(b.sentences.filter(s => s.kind === 'fact').every(s => s.cites.length > 0)).toBe(true)
    expect(b.sentences.some(s => s.kind === 'inference' && /slowed/.test(s.text))).toBe(true)
    expect(b.sentences.some(s => /overdue/.test(s.text))).toBe(true)
    expect(b.method).toBe('rules')
  })
})

describe('calendar-day arithmetic for due dates', () => {
  test('counts whole calendar days whatever the time of day (C-137 read "7 days" in copilot and "8" elsewhere)', async () => {
    const { daysFromToday } = await import('../shared/dates')
    for (const hour of ['00:00:01', '07:53:00', '12:00:00', '23:59:59']) {
      const now = Date.parse(`2026-10-24T${hour}Z`)
      expect(daysFromToday('2026-10-16', now)).toBe(-8)
      expect(daysFromToday('2026-10-24', now)).toBe(0)
      expect(daysFromToday('2026-10-23', now)).toBe(-1)
      expect(daysFromToday('2026-10-31', now)).toBe(7)
    }
  })
})
