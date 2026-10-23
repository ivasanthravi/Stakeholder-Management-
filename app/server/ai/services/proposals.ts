// Human-in-the-loop execution of AI proposals. Every path re-validates against the domain schema,
// re-checks the caller's permission at execution time, enforces optimistic concurrency on the proposal,
// and records activity + audit. Nothing here is reachable by the model itself.
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { TenantContext, Tx } from '../../db/client'
import { aiProposal } from '../../db/schema'
import { ApiError, conflict, forbidden, staleVersion } from '../../http'
import { recordActivity, recordAudit, type RequestMeta } from '../../history'
import { createCommitment } from '../../modules/commitments'
import { createDecision } from '../../modules/decisions'
import { can, type Role } from '../../../shared/permissions'
import { commitmentCreateSchema, decisionCreateSchema } from '../../../shared/schemas'

export const proposalEditSchema = z.object({
  version: z.number().int().positive(),
  values: z.object({
    title: z.string().trim().min(1).max(300).optional(),
    ownerId: z.string().min(1).nullable().optional(),
    stakeholderId: z.uuid().nullable().optional(),
    initiativeId: z.uuid().nullable().optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    direction: z.enum(['ours', 'theirs']).optional(),
    status: z.enum(['proposed', 'under_review', 'approved', 'rejected', 'deferred']).optional(),
    stakeholderIds: z.array(z.uuid()).max(50).optional(),
  }).default({}),
})
export type ProposalEdit = z.infer<typeof proposalEditSchema>

async function lockPending(t: Tx, id: string, version: number) {
  const [p] = await t.select().from(aiProposal).where(eq(aiProposal.id, id)).for('update').limit(1)
  if (!p) throw new ApiError(404, 'not_found', 'Proposal not found')
  if (p.status !== 'pending') throw conflict(`This proposal was already ${p.status}.`, { current: p })
  if (p.version !== version) throw staleVersion(p)
  return p
}

/** Review flags that an edit resolves. */
function resolveFlags(flags: string[], v: ProposalEdit['values']) {
  return flags.filter(f => !(
    (f === 'owner_missing' && v.ownerId) ||
    ((f === 'due_date_ambiguous' || f === 'due_date_derived') && v.dueDate !== undefined) ||
    (f === 'stakeholder_unmatched' && v.stakeholderId) ||
    (f === 'vague_wording' && v.title)
  ))
}

export async function editProposal(t: Tx, id: string, input: ProposalEdit) {
  const p = await lockPending(t, id, input.version)
  const values = { ...(p.values as object), ...input.values }
  const [u] = await t.update(aiProposal).set({ values, title: input.values.title ?? p.title, needsReview: resolveFlags(p.needsReview, input.values), version: sql`${aiProposal.version} + 1` })
    .where(eq(aiProposal.id, id)).returning()
  return u
}

export async function acceptProposal(t: Tx, tn: TenantContext & { role: Role }, id: string, input: ProposalEdit, meta: RequestMeta) {
  const p = await lockPending(t, id, input.version)
  const v = { ...(p.values as Record<string, unknown>), ...input.values } as Record<string, unknown>
  let created: { type: string; id: string; key: string }
  if (p.kind === 'commitment' || p.kind === 'action') {
    if (!can(tn.role, 'commitment.create')) throw forbidden()
    const parsed = commitmentCreateSchema.parse({
      title: v.title, ownerId: v.ownerId ?? null, stakeholderId: v.stakeholderId ?? null, initiativeId: v.initiativeId ?? null,
      direction: v.direction ?? 'ours', dueDate: v.dueDate ?? null, sourceEngagementId: v.sourceEngagementId ?? null,
    })
    const row = await createCommitment(t, tn, parsed)
    created = { type: 'commitment', id: row.id, key: row.key }
  } else if (p.kind === 'decision') {
    const status = (v.status as string) ?? 'proposed'
    if (!can(tn.role, 'decision.create') || (status !== 'proposed' && !can(tn.role, 'decision.update'))) {
      throw forbidden(status !== 'proposed' ? 'Only managers can record a decision as decided. Change the status to Proposed to submit it.' : undefined)
    }
    const parsed = decisionCreateSchema.parse({
      title: v.title, status, initiativeId: v.initiativeId ?? null, sourceEngagementId: v.sourceEngagementId ?? null,
      stakeholders: ((v.stakeholderIds as string[] | undefined) ?? []).map(sid => ({ stakeholderId: sid, role: 'consulted' })),
    })
    const row = await createDecision(t, tn, parsed)
    created = { type: 'decision', id: row.id, key: row.key }
  } else {
    throw new ApiError(422, 'invalid', 'This kind of proposal can’t be applied automatically yet')
  }
  await t.update(aiProposal).set({
    status: 'accepted', values: v, title: (v.title as string) ?? p.title, createdRecordType: created.type, createdRecordId: created.id,
    decidedBy: tn.userId, decidedAt: new Date(), version: sql`${aiProposal.version} + 1`,
  }).where(eq(aiProposal.id, id))
  if (v.sourceEngagementId) await recordActivity(t, tn, { entityType: 'engagement', entityId: v.sourceEngagementId as string, verb: 'ai_proposal_accepted', summary: `Accepted ${p.kind} from meeting analysis → ${created.key}` })
  await recordAudit(t, { workspaceId: tn.workspaceId, actorId: tn.userId, action: 'ai.proposal_accepted', entityType: created.type, entityId: created.id, metadata: { proposalId: id, kind: p.kind, basis: p.basis, edited: Object.keys(input.values).length > 0 } }, meta)
  return created
}

export async function rejectProposal(t: Tx, tn: TenantContext, id: string, version: number, meta: RequestMeta) {
  const p = await lockPending(t, id, version)
  await t.update(aiProposal).set({ status: 'rejected', decidedBy: tn.userId, decidedAt: new Date(), version: sql`${aiProposal.version} + 1` }).where(eq(aiProposal.id, id))
  await recordAudit(t, { workspaceId: tn.workspaceId, actorId: tn.userId, action: 'ai.proposal_rejected', entityType: 'ai_proposal', entityId: id, metadata: { kind: p.kind } }, meta)
}

/** Merge a duplicate into another pending proposal of the same kind: evidence is combined, the duplicate closes. */
export async function mergeProposal(t: Tx, tn: TenantContext, id: string, intoId: string, version: number, meta: RequestMeta) {
  if (id === intoId) throw new ApiError(422, 'invalid', 'Choose a different proposal to merge into')
  const p = await lockPending(t, id, version)
  const [target] = await t.select().from(aiProposal).where(and(eq(aiProposal.id, intoId), eq(aiProposal.status, 'pending'))).for('update')
  if (!target || target.kind !== p.kind || target.analysisId !== p.analysisId) throw new ApiError(422, 'invalid', 'Proposals can only be merged into another pending proposal of the same kind')
  await t.update(aiProposal).set({ evidence: [...(target.evidence as unknown[]), ...(p.evidence as unknown[])], needsReview: target.needsReview.filter(f => f !== 'possible_duplicate'), version: sql`${aiProposal.version} + 1` }).where(eq(aiProposal.id, intoId))
  await t.update(aiProposal).set({ status: 'merged', mergedInto: intoId, decidedBy: tn.userId, decidedAt: new Date(), version: sql`${aiProposal.version} + 1` }).where(eq(aiProposal.id, id))
  await recordAudit(t, { workspaceId: tn.workspaceId, actorId: tn.userId, action: 'ai.proposal_merged', entityType: 'ai_proposal', entityId: id, metadata: { into: intoId } }, meta)
}
