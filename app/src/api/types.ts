// Response shapes returned by the API (see server/modules/*). Dates arrive as ISO strings.
import type { Role } from '../../shared/permissions'

export type Stance = 'champion' | 'supporter' | 'neutral' | 'concerned' | 'opposed' | 'unknown'
export type Level = 1 | 2 | 3 | 4
export type DecisionStatus = 'proposed' | 'under_review' | 'approved' | 'rejected' | 'deferred'
export type CommitmentStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface Me {
  user: { id: string; name: string; email: string; emailVerified: boolean }
  workspaces: { id: string; name: string; slug: string; role: Role }[]
  invitations: { id: string; workspaceName: string; role: Role; expiresAt: string }[]
}
export interface WorkspaceInfo { id: string; name: string; slug: string; role: Role; settings: { vocabulary?: { initiative?: string; stakeholder?: string; organization?: string }; sample?: boolean } }

export interface Lookups {
  members: { id: string; name: string; email: string; role: Role }[]
  initiatives: { id: string; code: string; name: string; status: string }[]
  organizations: { id: string; name: string; shortName: string | null; type: string }[]
}

export interface StakeholderRow {
  id: string; name: string; title: string | null; email: string | null; stance: Stance; influence: Level | null; interest: Level | null
  engagementStatus: string; tags: string[]; ownerId: string | null; ownerName: string | null; restricted: boolean; version: number
  updatedAt: string; primaryOrg: { id: string; name: string; shortName: string | null } | null; lastEngagedAt: string | null
  openCommitments: number; series: number[]
}
export interface Page<T> { items: T[]; total: number }

export interface Association { id: string; organizationId: string; name: string; shortName: string | null; type: string; role: string | null; isPrimary: boolean; validFrom: string | null; validTo: string | null }
export interface StakeholderDetail {
  id: string; name: string; title: string | null; email: string | null; phone: string | null; location: string | null
  stakeholderType: string; influence: Level | null; interest: Level | null; stance: Stance; engagementStatus: string
  tags: string[]; notes: string | null; ownerId: string | null; customFields: Record<string, unknown>; restricted: boolean
  archivedAt: string | null; version: number; createdAt: string; updatedAt: string
  owner: { id: string; name: string; email: string } | null
  organizations: Association[]
  initiatives: { id: string; code: string; name: string; role: string | null }[]
  access: { userId: string; name: string | null }[]
}
export interface EngagementBrief { id: string; key: string; kind: string; title: string; occurredAt: string; summary: string | null; initiativeId: string | null }
export interface CommitmentBrief { id: string; key: string; title: string; status: CommitmentStatus; dueDate: string | null; direction?: 'ours' | 'theirs'; ownerId?: string | null; ownerName?: string | null; version?: number; sourceEngagementId?: string | null; stakeholderId?: string | null }
export interface DecisionBrief { id: string; key: string; title: string; status: DecisionStatus; dueDate: string | null; role?: string; initiativeId?: string | null }
export interface RelationshipView {
  id: string; type: string; directed: boolean; strength: number | null; status: 'confirmed' | 'inferred'; description: string | null; version: number
  direction: 'out' | 'in'; otherKind: 'stakeholder' | 'organization'
  other: { id: string; name: string; stance?: Stance; influence?: Level | null; title?: string | null; shortName?: string | null }
}
export interface Briefing {
  sentences: { kind: 'fact' | 'inference'; text: string; cites: number[] }[]
  sources: { id: string; kind: string; label: string; at?: string | null }[]
  basis: string
  method: 'rules'
}
export interface Overview {
  stakeholder: StakeholderDetail
  engagements: EngagementBrief[]
  engagementTotal: number
  commitments: CommitmentBrief[]
  decisions: DecisionBrief[]
  relationships: RelationshipView[]
  series: number[]
  briefing: Briefing
}

export interface ActivityEvent { id: number; entityType?: string; entityId?: string; verb: string; summary: string; changes: Record<string, { from: unknown; to: unknown }> | null; createdAt: string; actor: string | null }

export interface Signal {
  id: string; kind: 'overdue' | 'due-soon' | 'decision-waiting' | 'cooling' | 'unowned' | 'stance-shift' | 'unassigned' | 'repeated-delay'; severity: 1 | 2 | 3
  title: string; reason: string; rule: string
  stakeholder?: { id: string; name: string; title: string | null; stance: Stance } | null
  commitmentId?: string; commitmentVersion?: number; decisionId?: string; ownerId?: string | null; ownerName?: string | null; initiativeCode?: string | null
  evidence: { id: string; key: string; title: string; occurredAt: string }[]
  /** Deterministic next step from the rule that raised the signal. */
  next?: { text: string; action: 'follow_up_commitment' | 'log_engagement' | 'review_decision' | 'assign_owner' | 'open_record' } | null
}
export interface Dashboard {
  generatedAt: string; me: string
  signals: Signal[]
  horizon: { id: string; key: string; title: string; dueDate: string; stakeholderId: string | null; stakeholderName: string | null; ownerId: string | null }[]
  decisions: { id: string; key: string; title: string; status: DecisionStatus; dueDate: string | null; createdAt: string; ownerName: string | null; initiativeCode: string | null; approvers: number }[]
  recentEngagements: { id: string; key: string; kind: string; title: string; occurredAt: string; initiativeCode: string | null; participants: number }[]
  initiatives: { id: string; code: string; name: string; status: string; keyTotal: number; keyEngaged: number; engagements30: number; openCommitments: number; pendingDecisions: number }[]
  stakeholders: { total: number; byStance: Partial<Record<Stance, number>> }
}

export interface Graph {
  nodes: { id: string; name: string; title: string | null; stance: Stance; influence: Level | null; interest: Level | null; ownerId: string | null; orgId: string | null; lastEngagedAt: string | null; gap: boolean }[]
  orgs: { id: string; name: string; shortName: string | null; type: string }[]
  edges: { id: string; source: string; target: string; sourceKind: 'stakeholder' | 'organization'; targetKind: 'stakeholder' | 'organization'; type: string; directed: boolean; strength: number | null; status: 'confirmed' | 'inferred' }[]
}

export interface SearchResults {
  stakeholders: { id: string; name: string; title: string | null; stance: Stance; org: string | null }[]
  organizations: { id: string; name: string; shortName: string | null; type: string }[]
  initiatives: { id: string; code: string; name: string; status: string }[]
  commitments: { id: string; key: string; title: string; status: string; stakeholderId: string | null }[]
  decisions: { id: string; key: string; title: string; status: string }[]
  engagements: { id: string; key: string; title: string; kind: string; occurredAt: string }[]
}
