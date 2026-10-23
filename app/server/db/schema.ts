// Relational schema. Every tenant-owned table carries `workspace_id` and is protected by
// Postgres row-level security (see migrations/0001_rls.sql) in addition to application checks.
import { sql } from 'drizzle-orm'
import {
  bigint, bigserial, boolean, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique, uniqueIndex, uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const audit = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
}

// ── Identity (Better Auth contract; ids are strings it generates) ────────────
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: ts('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, t => [index('session_user_idx').on(t.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ts('access_token_expires_at'),
  refreshTokenExpiresAt: ts('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [index('account_user_idx').on(t.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [index('verification_identifier_idx').on(t.identifier)])

/** Development mail outbox: every email the app would send is stored here (and logged). */
export const mailOutbox = pgTable('mail_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  to: text('to').notNull(),
  subject: text('subject').notNull(),
  text: text('text').notNull(),
  url: text('url'),
  kind: text('kind').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
})

// ── Tenancy ──────────────────────────────────────────────────────────────────
export const workspace = pgTable('workspace', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  /** Configurable vocabulary and preferences, validated by `workspaceSettingsSchema`. */
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  archivedAt: ts('archived_at'),
  ...audit,
})

export const membership = pgTable('membership', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'admin', 'manager', 'contributor', 'viewer'] }).notNull(),
  removedAt: ts('removed_at'),
  ...audit,
}, t => [
  uniqueIndex('membership_active_uq').on(t.workspaceId, t.userId).where(sql`${t.removedAt} is null`),
  index('membership_user_idx').on(t.userId),
])

export const invitation = pgTable('invitation', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'manager', 'contributor', 'viewer'] }).notNull(),
  /** SHA-256 of the token; the raw token only exists in the emailed link. */
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').references(() => user.id, { onDelete: 'set null' }),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  acceptedBy: text('accepted_by').references(() => user.id, { onDelete: 'set null' }),
  revokedAt: ts('revoked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('invitation_ws_idx').on(t.workspaceId)])

/** Per-workspace counters for human-readable keys (C-101, D-12, E-1004). */
export const workspaceCounter = pgTable('workspace_counter', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(),
  value: integer('value').notNull().default(0),
}, t => [primaryKey({ columns: [t.workspaceId, t.scope] })])

/** Replays of POST requests carrying an Idempotency-Key header. */
export const idempotencyKey = pgTable('idempotency_key', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  userId: text('user_id').notNull(),
  status: integer('status').notNull(),
  body: jsonb('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.workspaceId, t.userId, t.key] })])

// ── Domain ───────────────────────────────────────────────────────────────────
const tenant = () => uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' })

/**
 * Same-tenant foreign key: (workspace_id, col) → (workspace_id, id) on the target. Postgres FK checks bypass
 * row-level security, so a plain FK would let a caller link to another tenant's row by id. This makes
 * cross-tenant references impossible at the database level.
 */
const sameTenant = (name: string, cols: [AnyPgColumn, AnyPgColumn], target: { workspaceId: AnyPgColumn; id: AnyPgColumn }, onDelete: 'cascade' | 'no action' = 'no action') =>
  foreignKey({ name, columns: cols, foreignColumns: [target.workspaceId, target.id] }).onDelete(onDelete)

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  name: text('name').notNull(),
  shortName: text('short_name'),
  /** Configurable type key (e.g. company, government, department, ngo, education, community, other). */
  type: text('type').notNull().default('other'),
  website: text('website'),
  description: text('description'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  parentId: uuid('parent_id'),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  unique('organization_ws_id_uq').on(t.workspaceId, t.id),
  index('organization_ws_idx').on(t.workspaceId),
  uniqueIndex('organization_name_uq').on(t.workspaceId, sql`lower(${t.name})`).where(sql`${t.archivedAt} is null`),
  sameTenant('organization_parent_fk', [t.workspaceId, t.parentId], t),
])

export const stakeholder = pgTable('stakeholder', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  name: text('name').notNull(),
  title: text('title'),
  email: text('email'),
  phone: text('phone'),
  location: text('location'),
  /** Configurable type key (e.g. individual, official, community member, internal). */
  stakeholderType: text('stakeholder_type').notNull().default('individual'),
  influence: smallint('influence'),
  interest: smallint('interest'),
  stance: text('stance', { enum: ['champion', 'supporter', 'neutral', 'concerned', 'opposed', 'unknown'] }).notNull().default('unknown'),
  engagementStatus: text('engagement_status', { enum: ['not_engaged', 'active', 'dormant', 'do_not_contact'] }).notNull().default('not_engaged'),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  notes: text('notes'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
  /** Restricted records are visible only to owners/admins and users on the access list (enforced by RLS). */
  restricted: boolean('restricted').notNull().default(false),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  unique('stakeholder_ws_id_uq').on(t.workspaceId, t.id),
  index('stakeholder_ws_name_idx').on(t.workspaceId, t.name),
  check('stakeholder_influence_ck', sql`${t.influence} between 1 and 4`),
  check('stakeholder_interest_ck', sql`${t.interest} between 1 and 4`),
])

export const stakeholderAccess = pgTable('stakeholder_access', {
  workspaceId: tenant(),
  stakeholderId: uuid('stakeholder_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, t => [
  primaryKey({ columns: [t.stakeholderId, t.userId] }),
  sameTenant('sa_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder, 'cascade'),
])

/** Person ↔ organization over time (one person, many organizations, historical). */
export const stakeholderOrganization = pgTable('stakeholder_organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  stakeholderId: uuid('stakeholder_id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  role: text('role'),
  isPrimary: boolean('is_primary').notNull().default(false),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  ...audit,
}, t => [
  index('so_stakeholder_idx').on(t.stakeholderId),
  index('so_org_idx').on(t.organizationId),
  uniqueIndex('so_current_uq').on(t.stakeholderId, t.organizationId).where(sql`${t.validTo} is null`),
  sameTenant('so_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder, 'cascade'),
  sameTenant('so_organization_fk', [t.workspaceId, t.organizationId], organization, 'cascade'),
])

export const stakeholderGroup = pgTable('stakeholder_group', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  name: text('name').notNull(),
  description: text('description'),
  archivedAt: ts('archived_at'),
  ...audit,
}, t => [
  unique('group_ws_id_uq').on(t.workspaceId, t.id),
  uniqueIndex('group_name_uq').on(t.workspaceId, sql`lower(${t.name})`),
])

export const stakeholderGroupMember = pgTable('stakeholder_group_member', {
  workspaceId: tenant(),
  groupId: uuid('group_id').notNull(),
  stakeholderId: uuid('stakeholder_id').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.groupId, t.stakeholderId] }),
  sameTenant('sgm_group_fk', [t.workspaceId, t.groupId], stakeholderGroup, 'cascade'),
  sameTenant('sgm_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder, 'cascade'),
])

export const initiative = pgTable('initiative', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: ['planned', 'active', 'on_hold', 'completed'] }).notNull().default('active'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  startDate: date('start_date'),
  endDate: date('end_date'),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  unique('initiative_ws_id_uq').on(t.workspaceId, t.id),
  uniqueIndex('initiative_code_uq').on(t.workspaceId, sql`upper(${t.code})`).where(sql`${t.archivedAt} is null`),
])

export const initiativeStakeholder = pgTable('initiative_stakeholder', {
  workspaceId: tenant(),
  initiativeId: uuid('initiative_id').notNull(),
  stakeholderId: uuid('stakeholder_id').notNull(),
  role: text('role'),
  createdAt: ts('created_at').notNull().defaultNow(),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
}, t => [
  primaryKey({ columns: [t.initiativeId, t.stakeholderId] }),
  index('is_stakeholder_idx').on(t.stakeholderId),
  sameTenant('is_initiative_fk', [t.workspaceId, t.initiativeId], initiative, 'cascade'),
  sameTenant('is_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder, 'cascade'),
])

/**
 * A relationship connects exactly one source and one target, each either a stakeholder or an organization.
 * Endpoints are real (same-tenant) foreign keys, not polymorphic ids, so referential integrity holds.
 */
export const relationship = pgTable('relationship', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  sourceStakeholderId: uuid('source_stakeholder_id'),
  sourceOrganizationId: uuid('source_organization_id'),
  targetStakeholderId: uuid('target_stakeholder_id'),
  targetOrganizationId: uuid('target_organization_id'),
  type: text('type').notNull(),
  directed: boolean('directed').notNull().default(true),
  description: text('description'),
  strength: smallint('strength'),
  initiativeId: uuid('initiative_id'),
  /** Inferred relationships are suggestions and are never presented as confirmed facts. */
  status: text('status', { enum: ['confirmed', 'inferred'] }).notNull().default('confirmed'),
  validFrom: date('valid_from'),
  validTo: date('valid_to'),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  index('rel_ws_idx').on(t.workspaceId),
  index('rel_src_s_idx').on(t.sourceStakeholderId),
  index('rel_tgt_s_idx').on(t.targetStakeholderId),
  check('rel_one_source_ck', sql`num_nonnulls(${t.sourceStakeholderId}, ${t.sourceOrganizationId}) = 1`),
  check('rel_one_target_ck', sql`num_nonnulls(${t.targetStakeholderId}, ${t.targetOrganizationId}) = 1`),
  check('rel_strength_ck', sql`${t.strength} between 1 and 3`),
  // Duplicate guard: one active relationship of a type between the same endpoints (direction-aware).
  uniqueIndex('rel_unique_active_uq').on(
    t.workspaceId, t.type,
    sql`coalesce(${t.sourceStakeholderId}, ${t.sourceOrganizationId})`,
    sql`coalesce(${t.targetStakeholderId}, ${t.targetOrganizationId})`,
  ).where(sql`${t.archivedAt} is null`),
  sameTenant('rel_src_s_fk', [t.workspaceId, t.sourceStakeholderId], stakeholder, 'cascade'),
  sameTenant('rel_src_o_fk', [t.workspaceId, t.sourceOrganizationId], organization, 'cascade'),
  sameTenant('rel_tgt_s_fk', [t.workspaceId, t.targetStakeholderId], stakeholder, 'cascade'),
  sameTenant('rel_tgt_o_fk', [t.workspaceId, t.targetOrganizationId], organization, 'cascade'),
  sameTenant('rel_initiative_fk', [t.workspaceId, t.initiativeId], initiative),
])

export const engagement = pgTable('engagement', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  key: text('key').notNull(),
  /** meeting | call | email | workshop | consultation | note | site_visit | other (configurable list). */
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  occurredAt: ts('occurred_at').notNull(),
  initiativeId: uuid('initiative_id'),
  summary: text('summary'),
  notes: text('notes'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  /** Meeting-specific detail (location, agenda) — the Meeting entity is an engagement subtype. */
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  unique('engagement_ws_id_uq').on(t.workspaceId, t.id),
  index('engagement_ws_time_idx').on(t.workspaceId, t.occurredAt),
  uniqueIndex('engagement_key_uq').on(t.workspaceId, t.key),
  sameTenant('engagement_initiative_fk', [t.workspaceId, t.initiativeId], initiative),
])

export const engagementParticipant = pgTable('engagement_participant', {
  workspaceId: tenant(),
  engagementId: uuid('engagement_id').notNull(),
  stakeholderId: uuid('stakeholder_id').notNull(),
  attendance: text('attendance', { enum: ['attended', 'apologies', 'invited'] }).notNull().default('attended'),
}, t => [
  primaryKey({ columns: [t.engagementId, t.stakeholderId] }),
  index('ep_stakeholder_idx').on(t.stakeholderId),
  sameTenant('ep_engagement_fk', [t.workspaceId, t.engagementId], engagement, 'cascade'),
  sameTenant('ep_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder, 'cascade'),
])

export const decision = pgTable('decision', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  context: text('context'),
  initiativeId: uuid('initiative_id'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['proposed', 'under_review', 'approved', 'rejected', 'deferred'] }).notNull().default('proposed'),
  dueDate: date('due_date'),
  outcome: text('outcome'),
  decidedAt: ts('decided_at'),
  sourceEngagementId: uuid('source_engagement_id'),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  unique('decision_ws_id_uq').on(t.workspaceId, t.id),
  index('decision_ws_status_idx').on(t.workspaceId, t.status),
  uniqueIndex('decision_key_uq').on(t.workspaceId, t.key),
  sameTenant('decision_initiative_fk', [t.workspaceId, t.initiativeId], initiative),
  sameTenant('decision_engagement_fk', [t.workspaceId, t.sourceEngagementId], engagement),
])

export const decisionStakeholder = pgTable('decision_stakeholder', {
  workspaceId: tenant(),
  decisionId: uuid('decision_id').notNull(),
  stakeholderId: uuid('stakeholder_id').notNull(),
  role: text('role', { enum: ['approver', 'consulted', 'informed', 'affected'] }).notNull().default('consulted'),
}, t => [
  primaryKey({ columns: [t.decisionId, t.stakeholderId] }),
  index('ds_stakeholder_idx').on(t.stakeholderId),
  sameTenant('ds_decision_fk', [t.workspaceId, t.decisionId], decision, 'cascade'),
  sameTenant('ds_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder, 'cascade'),
])

export const commitment = pgTable('commitment', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  key: text('key').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  stakeholderId: uuid('stakeholder_id'),
  initiativeId: uuid('initiative_id'),
  /** ours = we owe it to the stakeholder; theirs = the stakeholder owes it to us. */
  direction: text('direction', { enum: ['ours', 'theirs'] }).notNull().default('ours'),
  dueDate: date('due_date'),
  status: text('status', { enum: ['open', 'in_progress', 'completed', 'cancelled'] }).notNull().default('open'),
  completedAt: ts('completed_at'),
  sourceEngagementId: uuid('source_engagement_id'),
  archivedAt: ts('archived_at'),
  version: integer('version').notNull().default(1),
  ...audit,
}, t => [
  index('commitment_ws_status_due_idx').on(t.workspaceId, t.status, t.dueDate),
  index('commitment_stakeholder_idx').on(t.stakeholderId),
  uniqueIndex('commitment_key_uq').on(t.workspaceId, t.key),
  sameTenant('commitment_stakeholder_fk', [t.workspaceId, t.stakeholderId], stakeholder),
  sameTenant('commitment_initiative_fk', [t.workspaceId, t.initiativeId], initiative),
  sameTenant('commitment_engagement_fk', [t.workspaceId, t.sourceEngagementId], engagement),
])

// ── History ──────────────────────────────────────────────────────────────────
/** User-facing timeline of changes ("Bea's stance changed to Concerned"). */
export const activityEvent = pgTable('activity_event', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  workspaceId: tenant(),
  actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  verb: text('verb').notNull(),
  summary: text('summary').notNull(),
  changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('activity_entity_idx').on(t.workspaceId, t.entityType, t.entityId, t.createdAt), index('activity_ws_time_idx').on(t.workspaceId, t.createdAt)])

/** Security audit trail. Append-only (UPDATE/DELETE revoked from the app role). */
export const auditEvent = pgTable('audit_event', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('audit_ws_time_idx').on(t.workspaceId, t.createdAt)])

// ── AI intelligence layer ────────────────────────────────────────────────────
/** One row per model (or local-engine) call. Stores counts and cost only — never prompt or response text. */
export const aiUsage = pgTable('ai_usage', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  workspaceId: tenant(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  feature: text('feature').notNull(),
  engine: text('engine', { enum: ['claude', 'local'] }).notNull(),
  model: text('model'),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  /** Estimated cost in micro-dollars (1e-6 USD) from the published per-token price. */
  costMicros: integer('cost_micros').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  status: text('status', { enum: ['ok', 'error', 'refused', 'cancelled', 'quota_exceeded'] }).notNull(),
  errorCode: text('error_code'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('ai_usage_ws_time_idx').on(t.workspaceId, t.createdAt)])

/** Copilot conversations are private to the user who started them and expire per workspace retention. */
export const aiConversation = pgTable('ai_conversation', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [unique('ai_conv_ws_id_uq').on(t.workspaceId, t.id), index('ai_conv_user_idx').on(t.workspaceId, t.userId, t.updatedAt)])

export const aiMessage = pgTable('ai_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  conversationId: uuid('conversation_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  /** Citations and structured cards for assistant messages. */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  engine: text('engine'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [
  index('ai_msg_conv_idx').on(t.conversationId, t.createdAt),
  sameTenant('ai_msg_conv_fk', [t.workspaceId, t.conversationId], aiConversation, 'cascade'),
])

/** Result of analysing one engagement's notes/transcript. Proposals hang off it. */
export const meetingAnalysis = pgTable('meeting_analysis', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  engagementId: uuid('engagement_id').notNull(),
  /** Hash of the analysed text: a changed source marks the analysis stale. */
  sourceHash: text('source_hash').notNull(),
  engine: text('engine', { enum: ['claude', 'local'] }).notNull(),
  model: text('model'),
  summary: text('summary'),
  topics: jsonb('topics').$type<string[]>().notNull().default([]),
  openQuestions: jsonb('open_questions').$type<unknown[]>().notNull().default([]),
  mentions: jsonb('mentions').$type<unknown[]>().notNull().default([]),
  /** Instruction-like lines found in the content (treated as data, surfaced to the user). */
  flags: jsonb('flags').$type<unknown[]>().notNull().default([]),
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [
  unique('analysis_ws_id_uq').on(t.workspaceId, t.id),
  index('analysis_engagement_idx').on(t.engagementId, t.createdAt),
  sameTenant('analysis_engagement_fk', [t.workspaceId, t.engagementId], engagement, 'cascade'),
])

/** A reviewable, human-approved change proposed by the AI layer. Nothing is written until accepted. */
export const aiProposal = pgTable('ai_proposal', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  analysisId: uuid('analysis_id'),
  source: text('source', { enum: ['meeting', 'signal', 'copilot'] }).notNull(),
  kind: text('kind', { enum: ['commitment', 'decision', 'action', 'stakeholder_note', 'follow_up_engagement'] }).notNull(),
  status: text('status', { enum: ['pending', 'accepted', 'rejected', 'merged'] }).notNull().default('pending'),
  title: text('title').notNull(),
  values: jsonb('values').$type<Record<string, unknown>>().notNull().default({}),
  evidence: jsonb('evidence').$type<unknown[]>().notNull().default([]),
  reasoning: text('reasoning'),
  basis: text('basis', { enum: ['explicit', 'inferred'] }).notNull(),
  needsReview: jsonb('needs_review').$type<string[]>().notNull().default([]),
  requiredPermission: text('required_permission').notNull(),
  mergedInto: uuid('merged_into'),
  createdRecordType: text('created_record_type'),
  createdRecordId: uuid('created_record_id'),
  decidedBy: text('decided_by').references(() => user.id, { onDelete: 'set null' }),
  decidedAt: ts('decided_at'),
  version: integer('version').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [
  index('proposal_analysis_idx').on(t.analysisId),
  index('proposal_ws_status_idx').on(t.workspaceId, t.status),
  sameTenant('proposal_analysis_fk', [t.workspaceId, t.analysisId], meetingAnalysis, 'cascade'),
])

/** Short-lived cache for generated briefings, keyed by a hash of the evidence they were built from. */
export const aiCache = pgTable('ai_cache', {
  workspaceId: tenant(),
  key: text('key').notNull(),
  userId: text('user_id').notNull(),
  value: jsonb('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
}, t => [primaryKey({ columns: [t.workspaceId, t.userId, t.key] })])

// ── Commercial (Phase 3) ─────────────────────────────────────────────────────
// System tables (subscription state, billing events, jobs, allowances, email log, analytics) are written only by the
// server's owner connection. Tenants can read their own subscription through RLS; nothing else is exposed to app_user.

/** One subscription per workspace. Updated only from verified provider webhooks or reconciliation — never from a redirect. */
export const subscription = pgTable('subscription', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspace.id, { onDelete: 'cascade' }),
  plan: text('plan', { enum: ['starter', 'professional', 'enterprise'] }).notNull(),
  status: text('status', { enum: ['trialing', 'active', 'past_due', 'canceled', 'expired', 'suspended', 'incomplete'] }).notNull(),
  interval: text('interval', { enum: ['month', 'year'] }),
  seats: integer('seats').notNull().default(1),
  /** 'none' = trial with no provider record yet; 'manual' = contract managed by staff; 'simulator' = development only. */
  provider: text('provider', { enum: ['none', 'stripe', 'paddle', 'simulator', 'manual'] }).notNull().default('none'),
  providerCustomerId: text('provider_customer_id'),
  providerSubscriptionId: text('provider_subscription_id').unique(),
  trialEndsAt: ts('trial_ends_at'),
  currentPeriodStart: ts('current_period_start'),
  currentPeriodEnd: ts('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  pastDueSince: ts('past_due_since'),
  endedAt: ts('ended_at'),
  /** Provider-side timestamp of the state we hold; older snapshots are ignored (out-of-order delivery). */
  providerUpdatedAt: ts('provider_updated_at'),
  /** Card brand and last four only, as reported by the provider. Never a card number. */
  paymentMethodSummary: text('payment_method_summary'),
  trialStartedBy: text('trial_started_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [index('subscription_customer_idx').on(t.providerCustomerId), index('subscription_trial_by_idx').on(t.trialStartedBy)])

/** Every webhook we accepted (after signature verification). The unique key makes processing idempotent. No payloads are stored. */
export const billingEvent = pgTable('billing_event', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  type: text('type').notNull(),
  objectId: text('object_id'),
  workspaceId: uuid('workspace_id'),
  providerCreatedAt: ts('provider_created_at'),
  status: text('status', { enum: ['received', 'processed', 'ignored', 'failed'] }).notNull().default('received'),
  error: text('error'),
  receivedAt: ts('received_at').notNull().defaultNow(),
  processedAt: ts('processed_at'),
}, t => [unique('billing_event_uq').on(t.provider, t.eventId), index('billing_event_ws_idx').on(t.workspaceId)])

/** Durable background jobs (FOR UPDATE SKIP LOCKED). A dedupe key collapses repeats of the same work. */
export const job = pgTable('job', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  dedupeKey: text('dedupe_key'),
  status: text('status', { enum: ['queued', 'running', 'done', 'dead'] }).notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(6),
  runAt: ts('run_at').notNull().defaultNow(),
  lockedAt: ts('locked_at'),
  lastError: text('last_error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
}, t => [index('job_ready_idx').on(t.status, t.runAt), uniqueIndex('job_dedupe_uq').on(t.dedupeKey).where(sql`status in ('queued','running')`)])

/** AI allowance ledger per workspace and calendar month. Reservations make concurrent requests unable to overshoot. */
export const aiAllowance = pgTable('ai_allowance', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  used: bigint('used', { mode: 'number' }).notNull().default(0),
  reserved: bigint('reserved', { mode: 'number' }).notNull().default(0),
}, t => [primaryKey({ columns: [t.workspaceId, t.period] })])

/** Delivery log for every email. Holds the template and recipient, never message bodies or links (which may carry tokens). */
export const emailMessage = pgTable('email_message', {
  id: uuid('id').primaryKey().defaultRandom(),
  to: text('to').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
  template: text('template').notNull(),
  category: text('category', { enum: ['account', 'billing', 'notification'] }).notNull(),
  subject: text('subject').notNull(),
  status: text('status', { enum: ['queued', 'sent', 'failed', 'suppressed'] }).notNull().default('queued'),
  transport: text('transport').notNull(),
  providerMessageId: text('provider_message_id'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  sentAt: ts('sent_at'),
}, t => [index('email_user_idx').on(t.userId, t.createdAt)])

/** Per-user preferences: notification channels, analytics opt-out, and the unsubscribe token. */
export const userPreference = pgTable('user_preference', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  notifications: jsonb('notifications').$type<Record<string, { email: boolean; inApp: boolean }>>().notNull().default({}),
  analyticsOptOut: boolean('analytics_opt_out').notNull().default(false),
  unsubscribeTokenHash: text('unsubscribe_token_hash'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

/** In-app notification history. Titles never contain stakeholder details beyond what the recipient can already see. */
export const notification = pgTable('notification', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: tenant(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  href: text('href'),
  dedupeKey: text('dedupe_key'),
  readAt: ts('read_at'),
  emailed: boolean('emailed').notNull().default(false),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('notification_user_idx').on(t.userId, t.createdAt), uniqueIndex('notification_dedupe_uq').on(t.userId, t.dedupeKey)])

/** First-party product analytics. Allow-listed properties only; no stakeholder content. */
export const analyticsEvent = pgTable('analytics_event', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id'),
  workspaceId: uuid('workspace_id'),
  props: jsonb('props').$type<Record<string, string | number | boolean>>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('analytics_name_idx').on(t.name, t.createdAt), index('analytics_ws_idx').on(t.workspaceId, t.name)])

/** Export, deletion and closure requests, with their lifecycle. Exports are stored briefly, then purged. */
export const dataRequest = pgTable('data_request', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: ['workspace_export', 'user_export', 'workspace_deletion', 'account_closure'] }).notNull(),
  workspaceId: uuid('workspace_id').references(() => workspace.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['requested', 'scheduled', 'processing', 'ready', 'completed', 'canceled', 'failed'] }).notNull().default('requested'),
  /** What the request is about (e.g. the workspace name), kept after the workspace itself is deleted. */
  label: text('label'),
  requestedBy: text('requested_by'),
  /** Deletions run after a cooling-off period and can be canceled until then. */
  scheduledFor: ts('scheduled_for'),
  file: text('file'),
  fileExpiresAt: ts('file_expires_at'),
  error: text('error'),
  createdAt: ts('created_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
}, t => [index('data_request_ws_idx').on(t.workspaceId), index('data_request_user_idx').on(t.userId)])
