import { Hono } from 'hono'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { organization, relationship, stakeholder } from '../db/schema'
import type { Tx } from '../db/client'
import { jsonBody, patchBody, need, tx, type AppEnv } from '../context'
import { conflict } from '../http'
import { diff, recordActivity } from '../history'
import { getOr404, versionedUpdate } from './_shared'
import { relationshipCreateSchema, relationshipUpdateSchema } from '../../shared/schemas'

/** Symmetric types are stored once; creating B→A when A→B exists is a duplicate. */
const SYMMETRIC = new Set(['colleague', 'allied', 'opposes', 'partner_of'])

async function endpointName(t: Tx, e: { kind: 'stakeholder' | 'organization'; id: string }) {
  const row = e.kind === 'stakeholder'
    ? await getOr404(t, stakeholder, e.id, 'Stakeholder', isNull(stakeholder.archivedAt))
    : await getOr404(t, organization, e.id, 'Organization', isNull(organization.archivedAt))
  return row.name as string
}

const cols = (e: { kind: 'stakeholder' | 'organization'; id: string }, side: 'source' | 'target') =>
  side === 'source'
    ? { sourceStakeholderId: e.kind === 'stakeholder' ? e.id : null, sourceOrganizationId: e.kind === 'organization' ? e.id : null }
    : { targetStakeholderId: e.kind === 'stakeholder' ? e.id : null, targetOrganizationId: e.kind === 'organization' ? e.id : null }

export const relationshipRoutes = new Hono<AppEnv>()
  .post('/', async c => {
    need(c, 'relationship.create')
    const input = await jsonBody(c, relationshipCreateSchema)
    const tn = c.var.tenant
    const row = await tx(c, async t => {
      const [a, b] = [await endpointName(t, input.source), await endpointName(t, input.target)]
      const directed = SYMMETRIC.has(input.type) ? false : input.directed
      if (!directed) {
        // Contradiction / duplicate guard for undirected types: reject the mirror of an existing edge.
        const mirror = await t.select({ id: relationship.id }).from(relationship).where(and(
          isNull(relationship.archivedAt), eq(relationship.type, input.type),
          sql`coalesce(${relationship.sourceStakeholderId}, ${relationship.sourceOrganizationId}) = ${input.target.id}`,
          sql`coalesce(${relationship.targetStakeholderId}, ${relationship.targetOrganizationId}) = ${input.source.id}`,
        )).limit(1)
        if (mirror[0]) throw conflict('This relationship already exists')
      }
      if (input.type === 'allied' || input.type === 'opposes') {
        const contra = await t.select({ id: relationship.id, type: relationship.type }).from(relationship).where(and(
          isNull(relationship.archivedAt), eq(relationship.type, input.type === 'allied' ? 'opposes' : 'allied'),
          or(
            and(sql`coalesce(${relationship.sourceStakeholderId}, ${relationship.sourceOrganizationId}) = ${input.source.id}`, sql`coalesce(${relationship.targetStakeholderId}, ${relationship.targetOrganizationId}) = ${input.target.id}`),
            and(sql`coalesce(${relationship.sourceStakeholderId}, ${relationship.sourceOrganizationId}) = ${input.target.id}`, sql`coalesce(${relationship.targetStakeholderId}, ${relationship.targetOrganizationId}) = ${input.source.id}`),
          ),
        )).limit(1)
        if (contra[0]) throw conflict(`These two are already recorded as ${contra[0].type === 'allied' ? 'allied' : 'opposed'}. Update that relationship instead.`, { existingId: contra[0].id })
      }
      const [r] = await t.insert(relationship).values({
        workspaceId: tn.workspaceId, ...cols(input.source, 'source'), ...cols(input.target, 'target'),
        type: input.type, directed, description: input.description, strength: input.strength ?? null,
        initiativeId: input.initiativeId ?? null, status: input.status, createdBy: tn.userId, updatedBy: tn.userId,
      }).returning()
      const summary = `${a} ${input.type.replace('_', ' ')} ${b}${input.status === 'inferred' ? ' (inferred)' : ''}`
      for (const e of [input.source, input.target]) if (e.kind === 'stakeholder') await recordActivity(t, tn, { entityType: 'stakeholder', entityId: e.id, verb: 'relationship_added', summary: `Relationship added: ${summary}` })
      return r
    })
    return c.json(row, 201)
  })

  .patch('/:id', async c => {
    need(c, 'relationship.update')
    const input = await patchBody(c, relationshipUpdateSchema)
    const tn = c.var.tenant
    const row = await tx(c, async t => {
      const before = await getOr404(t, relationship, c.req.param('id'), 'Relationship', isNull(relationship.archivedAt))
      const { version, ...patch } = input
      const after = await versionedUpdate(t, relationship, before.id as string, version, patch, tn.userId)
      const changes = diff(before, after, Object.keys(patch))
      const sid = (before.sourceStakeholderId ?? before.targetStakeholderId) as string | null
      if (sid && Object.keys(changes).length) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: sid, verb: 'relationship_updated', summary: `Relationship updated (${Object.keys(changes).join(', ')})`, changes })
      return after
    })
    return c.json(row)
  })

  .post('/:id/archive', async c => {
    need(c, 'relationship.archive')
    const tn = c.var.tenant
    await tx(c, async t => {
      const r = await getOr404(t, relationship, c.req.param('id'), 'Relationship', isNull(relationship.archivedAt))
      await t.update(relationship).set({ archivedAt: new Date(), updatedAt: new Date(), updatedBy: tn.userId }).where(eq(relationship.id, r.id as string))
      for (const sid of [r.sourceStakeholderId, r.targetStakeholderId]) if (sid) await recordActivity(t, tn, { entityType: 'stakeholder', entityId: sid as string, verb: 'relationship_removed', summary: `Relationship removed (${String(r.type).replace('_', ' ')})` })
    })
    return c.json({ ok: true })
  })
