export type Stance = 'champion' | 'supporter' | 'neutral' | 'concerned' | 'opposed' | 'unknown'
export type Level = 1 | 2 | 3 | 4

export interface User {
  id: string
  name: string
  initials: string
  role: string
}

export interface Initiative {
  id: string
  code: string
  name: string
  phase: string
  ownerId: string
}

export interface Organization {
  id: string
  name: string
  type: 'Local authority' | 'Agency' | 'Regulator' | 'Community group' | 'Utility' | 'Landowner' | 'Business' | 'Advocacy' | 'Education'
  short: string
}

export interface Affiliation {
  orgId: string
  title: string
  from: string
  to?: string
}

export interface ClassificationChange {
  field: 'stance' | 'influence' | 'interest'
  value: string
  at: string
  by: string
  rationale?: string
  evidenceId?: string
}

export interface Person {
  id: string
  name: string
  title: string
  orgId: string
  affiliations: Affiliation[]
  email: string
  phone: string
  location: string
  influence: Level
  interest: Level
  stance: Stance
  ownerId?: string
  initiatives: { initiativeId: string; role: string }[]
  groups: string[]
  history: ClassificationChange[]
  doNotContact?: boolean
}

export type RelationshipType = 'reports-to' | 'advises' | 'influences' | 'allied' | 'opposes' | 'colleague'

export interface Relationship {
  id: string
  source: string
  target: string
  type: RelationshipType
  strength: 1 | 2 | 3
  since: string
  evidenceIds: string[]
}

export type EngagementKind = 'meeting' | 'call' | 'email' | 'site visit' | 'workshop' | 'note'

export interface Engagement {
  id: string
  key: string
  kind: EngagementKind
  title: string
  at: string
  initiativeId: string
  participantIds: string[]
  internalIds: string[]
  summary: string
  notes?: string
}

export type ApprovalState = 'pending' | 'approved' | 'conditions' | 'rejected'

export interface Decision {
  id: string
  key: string
  title: string
  initiativeId: string
  status: 'open' | 'awaiting' | 'decided'
  ownerId: string
  neededBy: string
  approvals: { personId: string; state: ApprovalState; requestedAt: string; at?: string }[]
  stakeholderIds: string[]
  sourceEngagementId?: string
}

export type CommitmentStatus = 'open' | 'in progress' | 'fulfilled' | 'missed'

export interface Commitment {
  id: string
  key: string
  statement: string
  direction: 'ours' | 'theirs'
  ownerId: string
  counterpartyId: string
  due: string
  status: CommitmentStatus
  initiativeId: string
  sourceEngagementId: string
  createdAt: string
}

export interface Risk {
  id: string
  key: string
  title: string
  initiativeId: string
  likelihood: Level
  impact: Level
  stakeholderIds: string[]
  ownerId: string
  evidenceIds: string[]
}

export interface Suggestion {
  id: string
  kind: 'commitment' | 'decision' | 'action' | 'stance'
  text: string
  quote: string
  ownerId?: string
  counterpartyId?: string
  due?: string
  confidence: 'high' | 'medium' | 'low'
  inferred: boolean
  status: 'pending' | 'accepted' | 'rejected'
  createdKey?: string
  /** For stance suggestions: the proposed stance, and the value it replaced once accepted. */
  stance?: Stance
  prevStance?: Stance
}

export interface Workspace {
  name: string
  today: string
  users: User[]
  me: string
  initiatives: Initiative[]
  orgs: Organization[]
  people: Person[]
  relationships: Relationship[]
  engagements: Engagement[]
  decisions: Decision[]
  commitments: Commitment[]
  risks: Risk[]
  suggestions: Record<string, Suggestion[]>
}
