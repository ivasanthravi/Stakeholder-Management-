// Loads a simulation plan through the same layers the product uses: users through Better Auth (real password hashing),
// every workspace record inside `withTenant` (row-level security applies to the simulation exactly as to real data).
import { eq } from 'drizzle-orm'
import type { DB } from '../client'
import { withTenant } from '../client'
import * as s from '../schema'
import type { Auth } from '../../auth'
import { startTrial } from '../../billing/entitlements'
import { templateById, templateSettings } from '../../../shared/templates'
import type { Plan } from './generate'

/** Test-only password for simulated users (documented in docs/simulation/data-generation.md). */
export const SIM_PASSWORD = 'simulation-2026'
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

export async function writePlan(db: DB, auth: Auth, plan: Plan, opts: { profile: string }) {
  // Users: real accounts, verified. Departed users exist (they owned records); their membership is marked removed.
  const userId = new Map<string, string>()
  for (const u of plan.users) {
    const r = await auth.api.signUpEmail({ body: { email: u.email, password: SIM_PASSWORD, name: u.name } })
    await db.update(s.user).set({ emailVerified: true }).where(eq(s.user.id, r.user.id))
    userId.set(u.key, r.user.id)
  }
  const uid = (k: string | null) => (k ? userId.get(k) ?? null : null)
  const me = userId.get(plan.users[0].key)!
  const template = templateById(plan.workspace.template)
  const [ws] = await db.insert(s.workspace).values({
    name: plan.workspace.name, slug: plan.workspace.slug, createdBy: me, updatedBy: me,
    settings: { ...(template ? templateSettings(template) : {}), simulation: { industry: plan.industry, profile: opts.profile, seed: plan.seed, anchor: plan.anchor } },
  }).returning()
  // People who left keep their membership row marked removed, as when an admin removes them in Settings.
  await db.insert(s.membership).values(plan.users.map(u => ({ workspaceId: ws.id, userId: userId.get(u.key)!, role: u.role, createdBy: me, updatedBy: me, removedAt: u.departed ? new Date(Date.parse(plan.anchor) - 30 * 86_400_000) : null })))
  // Realistic commercial state: small teams trial; larger teams (beyond trial seats) are on a paid plan.
  if (plan.users.length > 10) await db.insert(s.subscription).values({ workspaceId: ws.id, plan: 'professional', status: 'active', seats: plan.users.length, provider: 'manual', interval: 'year' })
  else await startTrial(db, ws.id, me)

  const W = ws.id
  await withTenant(db, { workspaceId: W, userId: me, role: 'owner' }, async t => {
    const by = { createdBy: me, updatedBy: me }
    // Parents before children (departments reference the client organisation).
    const orgs = [...plan.orgs.filter(o => !o.parentId), ...plan.orgs.filter(o => o.parentId)]
    for (const b of chunk(orgs, 500)) await t.insert(s.organization).values(b.map(o => ({ id: o.id, workspaceId: W, name: o.name, shortName: o.short, type: o.type, parentId: o.parentId, archivedAt: o.archived ? new Date(Date.parse(plan.anchor) - 20 * 86_400_000) : null, ...by })))
    for (const b of chunk(plan.people, 500)) await t.insert(s.stakeholder).values(b.map(p => ({
      id: p.id, workspaceId: W, name: p.name, title: p.title, email: p.email, location: p.location, stakeholderType: p.type, influence: p.influence, interest: p.interest,
      stance: p.stance, engagementStatus: p.engagementStatus, ownerId: uid(p.ownerKey), restricted: p.restricted, notes: p.notes,
      archivedAt: p.archived ? new Date(Date.parse(plan.anchor) - 45 * 86_400_000) : null, ...by,
    })))
    for (const b of chunk(plan.affiliations, 1000)) await t.insert(s.stakeholderOrganization).values(b.map(({ orgId, ...a }) => ({ workspaceId: W, ...a, organizationId: orgId, createdBy: me })))
    if (plan.access.length) await t.insert(s.stakeholderAccess).values(plan.access.map(a => ({ workspaceId: W, stakeholderId: a.stakeholderId, userId: uid(a.userKey)! })).filter(a => a.userId)).onConflictDoNothing()
    for (const i of plan.initiatives) await t.insert(s.initiative).values({ id: i.id, workspaceId: W, code: i.code, name: i.name, description: i.description, status: i.status, ownerId: uid(i.ownerKey), startDate: i.startDate, endDate: i.endDate, ...by })
    for (const b of chunk(plan.members, 1000)) await t.insert(s.initiativeStakeholder).values(b.map(m => ({ workspaceId: W, ...m, createdBy: me }))).onConflictDoNothing()
    for (const b of chunk(plan.relationships, 1000)) await t.insert(s.relationship).values(b.map(r => ({
      id: r.id, workspaceId: W, type: r.type, directed: r.directed, strength: r.strength, status: r.status, initiativeId: r.initiativeId, validFrom: r.validFrom, validTo: r.validTo,
      sourceStakeholderId: r.src.kind === 'stakeholder' ? r.src.id : null, sourceOrganizationId: r.src.kind === 'organization' ? r.src.id : null,
      targetStakeholderId: r.tgt.kind === 'stakeholder' ? r.tgt.id : null, targetOrganizationId: r.tgt.kind === 'organization' ? r.tgt.id : null,
      archivedAt: r.archived ? new Date(Date.parse(plan.anchor) - 10 * 86_400_000) : null, ...by,
    })))
    for (const b of chunk(plan.engagements, 500)) await t.insert(s.engagement).values(b.map(e => ({ id: e.id, workspaceId: W, key: e.key, kind: e.kind, title: e.title, occurredAt: new Date(e.occurredAt), initiativeId: e.initiativeId, summary: e.summary, notes: e.notes, ownerId: uid(e.ownerKey), ...by })))
    for (const b of chunk(plan.engagements.flatMap(e => e.participants.map(p => ({ workspaceId: W, engagementId: e.id, stakeholderId: p.id, attendance: p.attendance }))), 2000)) await t.insert(s.engagementParticipant).values(b)
    for (const b of chunk(plan.decisions, 500)) await t.insert(s.decision).values(b.map(d => ({ id: d.id, workspaceId: W, key: d.key, title: d.title, description: d.description, context: d.context, initiativeId: d.initiativeId, ownerId: uid(d.ownerKey), status: d.status, dueDate: d.dueDate, outcome: d.outcome, decidedAt: d.decidedAt ? new Date(d.decidedAt) : null, sourceEngagementId: d.sourceEngagementId, ...by })))
    for (const b of chunk(plan.decisions.flatMap(d => d.participants.map(p => ({ workspaceId: W, decisionId: d.id, stakeholderId: p.id, role: p.role }))), 2000)) await t.insert(s.decisionStakeholder).values(b).onConflictDoNothing()
    for (const b of chunk(plan.commitments, 500)) await t.insert(s.commitment).values(b.map(c => ({ id: c.id, workspaceId: W, key: c.key, title: c.title, description: c.description, ownerId: uid(c.ownerKey), stakeholderId: c.stakeholderId, initiativeId: c.initiativeId, direction: c.direction, dueDate: c.dueDate, status: c.status, completedAt: c.completedAt ? new Date(c.completedAt) : null, sourceEngagementId: c.sourceEngagementId, ...by })))
    // Keys continue after the simulated records when people add new ones.
    await t.insert(s.workspaceCounter).values([
      { workspaceId: W, scope: 'E', value: 100 + plan.engagements.length }, { workspaceId: W, scope: 'D', value: 100 + plan.decisions.length }, { workspaceId: W, scope: 'C', value: 100 + plan.commitments.length },
    ])
    for (const b of chunk(plan.events, 1000)) await t.insert(s.activityEvent).values(b.map(e => ({ workspaceId: W, actorId: uid(e.actorKey), entityType: e.entityType, entityId: e.entityId, verb: e.verb, summary: e.summary, changes: e.changes, createdAt: new Date(e.createdAt) })))
  })
  await db.insert(s.auditEvent).values({ workspaceId: W, actorId: me, action: 'workspace.simulated', metadata: { industry: plan.industry, profile: opts.profile, seed: plan.seed } })
  return { workspaceId: W, userIds: Object.fromEntries(userId) }
}
