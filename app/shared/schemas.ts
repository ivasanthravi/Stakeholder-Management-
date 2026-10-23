// Shared validation. The server validates every mutation with these schemas; the client reuses
// them for inline form validation so both sides agree on what is valid.
import { z } from 'zod'
import { ROLES } from './permissions'

const trimmed = (max: number) => z.string().trim().max(max)
const name = (max = 200) => z.string().trim().min(1, 'Required').max(max)
/** Omitted stays omitted (so partial updates don't clear fields); empty string clears to null. */
const optionalText = (max: number) => trimmed(max).optional().nullable().transform(v => (v === '' ? null : v))
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
const optionalDate = isoDate.optional().nullable().or(z.literal('').transform(() => null))
const id = z.uuid()
const level = z.number().int().min(1).max(4)
const tags = z.array(trimmed(40).min(1)).max(20).default([])
/** Emails are trimmed and lowercased before validation (pasted addresses often carry spaces). */
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))
const optionalEmail = z.string().trim().toLowerCase().transform(v => (v === '' ? null : v)).pipe(z.email('Enter a valid email').nullable()).optional().nullable()
/** Optimistic concurrency token: updates must send the version they edited. */
const version = z.number().int().positive()

export const STANCES = ['champion', 'supporter', 'neutral', 'concerned', 'opposed', 'unknown'] as const
export const ENGAGEMENT_STATUSES = ['not_engaged', 'active', 'dormant', 'do_not_contact'] as const
export const ORG_TYPES = ['company', 'government', 'department', 'regulator', 'ngo', 'education', 'community', 'utility', 'landowner', 'other'] as const
export const STAKEHOLDER_TYPES = ['individual', 'official', 'community_member', 'representative', 'internal', 'other'] as const
export const INITIATIVE_STATUSES = ['planned', 'active', 'on_hold', 'completed'] as const
export const ENGAGEMENT_KINDS = ['meeting', 'call', 'email', 'workshop', 'consultation', 'site_visit', 'note', 'other'] as const
export const DECISION_STATUSES = ['proposed', 'under_review', 'approved', 'rejected', 'deferred'] as const
export const DECISION_ROLES = ['approver', 'consulted', 'informed', 'affected'] as const
export const COMMITMENT_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const
export const RELATIONSHIP_TYPES = ['reports_to', 'colleague', 'advises', 'influences', 'allied', 'opposes', 'member_of', 'partner_of', 'funds', 'regulates', 'other'] as const

// ── Workspace ─────────────────────────────────────────────────────────────────
export const workspaceCreateSchema = z.object({ name: name(80) })
export const workspaceSettingsSchema = z.object({
  name: name(80).optional(),
  vocabulary: z.object({
    initiative: trimmed(30).min(1).optional(),
    stakeholder: trimmed(30).min(1).optional(),
    organization: trimmed(30).min(1).optional(),
  }).optional(),
  organizationTypes: z.array(trimmed(40).min(1)).max(30).optional(),
  engagementKinds: z.array(trimmed(40).min(1)).max(30).optional(),
})
export const inviteSchema = z.object({
  email,
  role: z.enum(ROLES).exclude(['owner']),
})
export const roleUpdateSchema = z.object({ role: z.enum(ROLES) })

// ── Records ───────────────────────────────────────────────────────────────────
export const organizationCreateSchema = z.object({
  name: name(200),
  shortName: optionalText(20),
  type: trimmed(40).min(1).default('other'),
  website: z.url('Enter a full URL (https://…)').optional().nullable().or(z.literal('').transform(() => null)),
  description: optionalText(4000),
  tags,
})
export const organizationUpdateSchema = organizationCreateSchema.partial().extend({ version })

const associationInput = z.object({
  organizationId: id,
  role: optionalText(120),
  isPrimary: z.boolean().default(false),
  validFrom: optionalDate,
})

export const stakeholderCreateSchema = z.object({
  name: name(200),
  title: optionalText(200),
  email: optionalEmail,
  phone: optionalText(40),
  location: optionalText(120),
  stakeholderType: trimmed(40).min(1).default('individual'),
  influence: level.optional().nullable(),
  interest: level.optional().nullable(),
  stance: z.enum(STANCES).default('unknown'),
  engagementStatus: z.enum(ENGAGEMENT_STATUSES).default('not_engaged'),
  tags,
  notes: optionalText(10000),
  ownerId: z.string().min(1).optional().nullable(),
  customFields: z.record(z.string().max(60), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).default({}),
  organizations: z.array(associationInput).max(10).default([]),
  initiativeIds: z.array(id).max(50).default([]),
})
export const stakeholderUpdateSchema = stakeholderCreateSchema
  .omit({ organizations: true, initiativeIds: true })
  .partial()
  .extend({ version, restricted: z.boolean().optional() })

export const associationCreateSchema = associationInput
export const associationEndSchema = z.object({ validTo: isoDate })

export const listQuerySchema = z.object({
  q: trimmed(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().max(40).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  archived: z.enum(['true', 'false']).default('false'),
})

export const stakeholderListQuerySchema = listQuerySchema.extend({
  stance: z.string().optional(), // comma-separated
  minInfluence: z.coerce.number().int().min(1).max(4).optional(),
  initiativeId: id.optional(),
  organizationId: id.optional(),
  cold: z.enum(['true', 'false']).optional(),
  ownerId: z.string().optional(),
})

const initiativeBase = z.object({
  code: z.string().trim().min(2).max(8).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes').transform(s => s.toUpperCase()),
  name: name(200),
  description: optionalText(4000),
  status: z.enum(INITIATIVE_STATUSES).default('active'),
  ownerId: z.string().min(1).optional().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
})
export const initiativeCreateSchema = initiativeBase.refine(v => !v.startDate || !v.endDate || v.startDate <= v.endDate, { message: 'End date must be after start date', path: ['endDate'] })
export const initiativeUpdateSchema = z.object({
  code: initiativeBase.shape.code.optional(),
  name: name(200).optional(),
  description: optionalText(4000),
  status: z.enum(INITIATIVE_STATUSES).optional(),
  ownerId: z.string().min(1).optional().nullable(),
  startDate: optionalDate,
  endDate: optionalDate,
  version,
})
export const initiativeMemberSchema = z.object({ stakeholderId: id, role: optionalText(80) })

const endpoint = z.object({ kind: z.enum(['stakeholder', 'organization']), id })
export const relationshipCreateSchema = z.object({
  source: endpoint,
  target: endpoint,
  type: z.enum(RELATIONSHIP_TYPES),
  directed: z.boolean().default(true),
  description: optionalText(2000),
  strength: z.number().int().min(1).max(3).optional().nullable(),
  initiativeId: id.optional().nullable(),
  status: z.enum(['confirmed', 'inferred']).default('confirmed'),
}).refine(v => !(v.source.kind === v.target.kind && v.source.id === v.target.id), { message: 'A record cannot relate to itself', path: ['target'] })
export const relationshipUpdateSchema = z.object({
  type: z.enum(RELATIONSHIP_TYPES).optional(),
  directed: z.boolean().optional(),
  description: optionalText(2000),
  strength: z.number().int().min(1).max(3).optional().nullable(),
  initiativeId: id.optional().nullable(),
  status: z.enum(['confirmed', 'inferred']).optional(),
  version,
})

export const engagementCreateSchema = z.object({
  kind: z.enum(ENGAGEMENT_KINDS),
  title: name(200),
  occurredAt: z.iso.datetime({ offset: true }),
  initiativeId: id.optional().nullable(),
  summary: optionalText(2000),
  notes: optionalText(50000),
  ownerId: z.string().min(1).optional().nullable(),
  participantIds: z.array(id).max(100).default([]),
  details: z.object({ location: trimmed(200).optional(), agenda: trimmed(4000).optional() }).default({}),
})
export const engagementUpdateSchema = engagementCreateSchema.partial().extend({ version })
export const engagementListQuerySchema = listQuerySchema.extend({
  kind: z.string().optional(),
  initiativeId: id.optional(),
  stakeholderId: id.optional(),
})

export const decisionCreateSchema = z.object({
  title: name(300),
  description: optionalText(8000),
  context: optionalText(8000),
  initiativeId: id.optional().nullable(),
  ownerId: z.string().min(1).optional().nullable(),
  status: z.enum(DECISION_STATUSES).default('proposed'),
  dueDate: optionalDate,
  outcome: optionalText(8000),
  sourceEngagementId: id.optional().nullable(),
  stakeholders: z.array(z.object({ stakeholderId: id, role: z.enum(DECISION_ROLES).default('consulted') })).max(100).default([]),
})
export const decisionUpdateSchema = decisionCreateSchema.partial().extend({ version })
export const decisionListQuerySchema = listQuerySchema.extend({
  status: z.string().optional(),
  initiativeId: id.optional(),
  stakeholderId: id.optional(),
})

export const commitmentCreateSchema = z.object({
  title: name(300),
  description: optionalText(8000),
  ownerId: z.string().min(1).optional().nullable(),
  stakeholderId: id.optional().nullable(),
  initiativeId: id.optional().nullable(),
  direction: z.enum(['ours', 'theirs']).default('ours'),
  dueDate: optionalDate,
  status: z.enum(COMMITMENT_STATUSES).default('open'),
  sourceEngagementId: id.optional().nullable(),
})
export const commitmentUpdateSchema = commitmentCreateSchema.partial().extend({ version })
export const commitmentListQuerySchema = listQuerySchema.extend({
  status: z.string().optional(),
  overdue: z.enum(['true', 'false']).optional(),
  initiativeId: id.optional(),
  stakeholderId: id.optional(),
  ownerId: z.string().optional(),
})

export type StakeholderCreate = z.input<typeof stakeholderCreateSchema>
export type OrganizationCreate = z.input<typeof organizationCreateSchema>
export type InitiativeCreate = z.input<typeof initiativeCreateSchema>
export type RelationshipCreate = z.input<typeof relationshipCreateSchema>
export type EngagementCreate = z.input<typeof engagementCreateSchema>
export type DecisionCreate = z.input<typeof decisionCreateSchema>
export type CommitmentCreate = z.input<typeof commitmentCreateSchema>
