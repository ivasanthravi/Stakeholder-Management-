// Development seed: loads the Phase 0 synthetic workspace into Postgres through the real auth and data layers.
// Usage: npm run db:seed            (refuses to run when NODE_ENV=production)
// All people, organizations and events are fictional and clearly labelled as sample data.
import { eq, sql } from 'drizzle-orm'
import { mkdirSync } from 'node:fs'
import { loadEnv } from '../env'
import { createDatabase, migrate, withTenant } from './client'
import * as s from './schema'
import { createLogMailer } from '../mail'
import { createAuth } from '../auth'
import { buildWorkspace, TODAY } from './sample/generator'

const env = loadEnv()
if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database')
const PASSWORD = process.env.SEED_PASSWORD ?? 'meridian-sample-2026'
const SIZE = Number(process.env.SEED_PEOPLE) || 184

if (!env.DATABASE_URL) mkdirSync(env.PGLITE_DIR, { recursive: true })
const database = await createDatabase({ url: env.DATABASE_URL, dataDir: env.DATABASE_URL ? undefined : env.PGLITE_DIR })
await migrate(database)
const db = database.db
const auth = createAuth(db, { ...env, REQUIRE_EMAIL_VERIFICATION: false }, createLogMailer(db, { quiet: true }))

const existing = await db.select().from(s.workspace).where(eq(s.workspace.slug, 'westshire-sample'))
if (existing[0]) {
  console.info('Sample workspace already present — nothing to do. Delete .data/ to reseed from scratch.')
  await database.close(); process.exit(0)
}

const src = buildWorkspace(SIZE)
const shift = Date.now() - Date.parse(TODAY + 'T12:00:00Z') // keep relative dates realistic
// Shift sample dates so they stay relative to today, never into the future.
const at = (iso: string) => new Date(Math.min(Date.parse(iso) + shift, Date.now() - 60_000))
const day = (iso: string) => (iso ? new Date(Date.parse(iso.length === 10 ? iso + 'T12:00:00Z' : iso) + shift).toISOString().slice(0, 10) : null)

// Users through Better Auth (real password hashing), then marked verified.
const userIds = new Map<string, string>()
for (const u of src.users) {
  const email = `${u.name.split(' ')[0].toLowerCase()}@sample.meridian.test`
  const r = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: u.name } })
  await db.update(s.user).set({ emailVerified: true }).where(eq(s.user.id, r.user.id))
  userIds.set(u.id, r.user.id)
}
const me = userIds.get('u1')!
const [ws] = await db.insert(s.workspace).values({ name: 'Westshire Infrastructure Partners (sample)', slug: 'westshire-sample', settings: { sample: true }, createdBy: me, updatedBy: me }).returning()
const roles = ['owner', 'admin', 'manager', 'contributor', 'viewer'] as const
await db.insert(s.membership).values(src.users.map((u, i) => ({ workspaceId: ws.id, userId: userIds.get(u.id)!, role: roles[i], createdBy: me, updatedBy: me })))

const ORG_TYPE: Record<string, string> = { 'Local authority': 'government', Agency: 'government', Regulator: 'regulator', 'Community group': 'community', Utility: 'utility', Landowner: 'landowner', Business: 'company', Advocacy: 'ngo', Education: 'education' }
const DEC_STATUS: Record<string, string> = { decided: 'approved', awaiting: 'under_review', open: 'proposed' }
// Phase 0 "missed" commitments were never met; record them as cancelled rather than as ancient open items.
const COM_STATUS: Record<string, string> = { fulfilled: 'completed', missed: 'cancelled', open: 'open', 'in progress': 'in_progress' }
const ENG_KIND: Record<string, string> = { meeting: 'meeting', call: 'call', email: 'email', 'site visit': 'site_visit', workshop: 'workshop', note: 'note' }
const REL_TYPE: Record<string, string> = { 'reports-to': 'reports_to', advises: 'advises', influences: 'influences', allied: 'allied', opposes: 'opposes', colleague: 'colleague' }
const chunk = <T,>(a: T[], n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

await withTenant(db, { workspaceId: ws.id, userId: me, role: 'owner' }, async t => {
  const W = ws.id
  const orgId = new Map<string, string>()
  for (const o of src.orgs) {
    const [row] = await t.insert(s.organization).values({ workspaceId: W, name: o.name, shortName: o.short, type: ORG_TYPE[o.type] ?? 'other', createdBy: me, updatedBy: me }).returning({ id: s.organization.id })
    orgId.set(o.id, row.id)
  }
  const initId = new Map<string, string>()
  for (const i of src.initiatives) {
    const [row] = await t.insert(s.initiative).values({ workspaceId: W, code: i.code, name: i.name, description: `${i.phase} phase.`, ownerId: userIds.get(i.ownerId), createdBy: me, updatedBy: me }).returning({ id: s.initiative.id })
    initId.set(i.id, row.id)
  }
  const pid = new Map<string, string>()
  for (const batch of chunk(src.people, 200)) {
    const rows = await t.insert(s.stakeholder).values(batch.map(p => ({
      workspaceId: W, name: p.name, title: p.title, email: p.email, phone: p.phone, location: p.location,
      influence: p.influence, interest: p.interest, stance: p.stance, engagementStatus: p.doNotContact ? 'do_not_contact' as const : 'active' as const,
      tags: p.groups, ownerId: p.ownerId ? userIds.get(p.ownerId) : null, createdBy: me, updatedBy: me,
    }))).returning({ id: s.stakeholder.id })
    batch.forEach((p, i) => pid.set(p.id, rows[i].id))
  }
  const assoc = src.people.flatMap(p => p.affiliations.map((a, i) => ({ workspaceId: W, stakeholderId: pid.get(p.id)!, organizationId: orgId.get(a.orgId)!, role: a.title, isPrimary: i === 0, validFrom: day(a.from), validTo: a.to ? day(a.to) : null, createdBy: me, updatedBy: me })))
  for (const b of chunk(assoc)) await t.insert(s.stakeholderOrganization).values(b)
  const memberships = src.people.flatMap(p => p.initiatives.map(i => ({ workspaceId: W, initiativeId: initId.get(i.initiativeId)!, stakeholderId: pid.get(p.id)!, role: i.role, createdBy: me })))
  for (const b of chunk(memberships)) await t.insert(s.initiativeStakeholder).values(b).onConflictDoNothing()
  const rels = src.relationships.map(r => ({ workspaceId: W, sourceStakeholderId: pid.get(r.source)!, targetStakeholderId: pid.get(r.target)!, type: REL_TYPE[r.type], directed: !['colleague', 'allied', 'opposes'].includes(r.type), strength: r.strength, createdBy: me, updatedBy: me }))
  for (const b of chunk(rels)) await t.insert(s.relationship).values(b).onConflictDoNothing()

  const eid = new Map<string, string>()
  const engs = [...src.engagements].reverse()
  let n = 1000
  for (const b of chunk(engs, 300)) {
    const rows = await t.insert(s.engagement).values(b.map(e => ({
      workspaceId: W, key: `E-${++n}`, kind: ENG_KIND[e.kind] ?? 'other', title: e.title, occurredAt: at(e.at), initiativeId: initId.get(e.initiativeId),
      summary: e.summary, notes: e.notes ?? null, ownerId: userIds.get(e.internalIds[0]) ?? me, createdBy: me, updatedBy: me,
    }))).returning({ id: s.engagement.id })
    b.forEach((e, i) => eid.set(e.id, rows[i].id))
  }
  const parts = src.engagements.flatMap(e => [...new Set(e.participantIds)].map(p => ({ workspaceId: W, engagementId: eid.get(e.id)!, stakeholderId: pid.get(p)! })))
  for (const b of chunk(parts)) await t.insert(s.engagementParticipant).values(b)

  let d = 100
  for (const dec of src.decisions) {
    const [row] = await t.insert(s.decision).values({
      workspaceId: W, key: `D-${++d}`, title: dec.title, initiativeId: initId.get(dec.initiativeId), ownerId: userIds.get(dec.ownerId), status: DEC_STATUS[dec.status] as 'proposed',
      dueDate: day(dec.neededBy), decidedAt: dec.status === 'decided' ? new Date() : null, createdAt: at(dec.approvals[0]?.requestedAt ?? new Date(Date.parse(TODAY)).toISOString()), createdBy: me, updatedBy: me,
    }).returning({ id: s.decision.id })
    const approvers = new Set(dec.approvals.map(a => a.personId))
    await t.insert(s.decisionStakeholder).values(dec.stakeholderIds.map(sid => ({ workspaceId: W, decisionId: row.id, stakeholderId: pid.get(sid)!, role: approvers.has(sid) ? 'approver' as const : 'consulted' as const })))
  }
  let c = 100
  for (const b of chunk(src.commitments)) {
    await t.insert(s.commitment).values(b.map(cm => ({
      workspaceId: W, key: `C-${++c}`, title: cm.statement, direction: cm.direction, ownerId: userIds.get(cm.ownerId), stakeholderId: pid.get(cm.counterpartyId),
      initiativeId: initId.get(cm.initiativeId), dueDate: day(cm.due), status: COM_STATUS[cm.status] as 'open', completedAt: cm.status === 'fulfilled' ? at(cm.due + 'T12:00:00Z') : null,
      sourceEngagementId: eid.get(cm.sourceEngagementId), createdAt: at(cm.createdAt), createdBy: me, updatedBy: me,
    })))
  }
  await t.insert(s.workspaceCounter).values([{ workspaceId: W, scope: 'E', value: n }, { workspaceId: W, scope: 'D', value: d }, { workspaceId: W, scope: 'C', value: c }])
  // Stance history as activity so profile history and stance-shift signals have real events.
  const hist = src.people.flatMap(p => p.history.slice(0, -1).map((h, i) => ({
    workspaceId: W, actorId: userIds.get(h.by) ?? me, entityType: 'stakeholder', entityId: pid.get(p.id)!, verb: 'stance_changed',
    summary: `Stance changed from ${cap(p.history[i + 1].value)} to ${cap(h.value)}`, changes: { stance: { from: p.history[i + 1].value, to: h.value } }, createdAt: at(h.at),
  })))
  for (const b of chunk(hist)) await t.insert(s.activityEvent).values(b)
})
function cap(v: string) { return v[0].toUpperCase() + v.slice(1) }

await db.insert(s.auditEvent).values({ workspaceId: ws.id, actorId: me, action: 'workspace.seeded', metadata: { people: SIZE } })
const count = await db.execute(sql`select count(*)::int as n from stakeholder where workspace_id = ${ws.id}`)
console.info(`Seeded "${ws.name}" with ${((count as { rows: { n: number }[] }).rows ?? [])[0]?.n} stakeholders.`)
console.info(`Sign in as ${src.users.map(u => `${u.name.split(' ')[0].toLowerCase()}@sample.meridian.test`).join(', ')} (roles: owner, admin, manager, contributor, viewer).`)
console.info(`Password (development only): ${PASSWORD}`)
await database.close()
