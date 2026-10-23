// Single source of truth for role capabilities. The server enforces these (and RLS backs them);
// the client only uses them to hide controls the user cannot use.

export const ROLES = ['owner', 'admin', 'manager', 'contributor', 'viewer'] as const
export type Role = typeof ROLES[number]

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', admin: 'Administrator', manager: 'Manager', contributor: 'Contributor', viewer: 'Viewer',
}

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Full control, including billing and deleting the workspace.',
  admin: 'Manage members, roles and settings, and see restricted records.',
  manager: 'Run initiatives and decisions; archive records.',
  contributor: 'Add and update stakeholders, engagements and commitments.',
  viewer: 'Read-only access to non-restricted records.',
}

const RANK: Record<Role, number> = { viewer: 0, contributor: 1, manager: 2, admin: 3, owner: 4 }
export const atLeast = (role: Role, min: Role) => RANK[role] >= RANK[min]

/** Action → minimum role. */
export const PERMISSIONS = {
  'workspace.read': 'viewer',
  'workspace.update': 'admin',
  'workspace.delete': 'owner',
  'members.read': 'viewer',
  'members.invite': 'admin',
  'members.updateRole': 'admin',
  'members.remove': 'admin',
  'audit.read': 'admin',
  'billing.read': 'admin',
  'billing.manage': 'owner',
  'data.export': 'admin',
  'workspace.deleteRequest': 'owner',
  'record.read': 'viewer',
  'stakeholder.create': 'contributor',
  'stakeholder.update': 'contributor',
  'stakeholder.archive': 'manager',
  'stakeholder.restrict': 'admin',
  'organization.create': 'contributor',
  'organization.update': 'contributor',
  'organization.archive': 'manager',
  'initiative.create': 'manager',
  'initiative.update': 'manager',
  'initiative.archive': 'manager',
  'initiative.members': 'manager',
  'relationship.create': 'contributor',
  'relationship.update': 'contributor',
  'relationship.archive': 'manager',
  'engagement.create': 'contributor',
  'engagement.update': 'contributor',
  'engagement.archive': 'manager',
  'decision.create': 'contributor',
  'decision.update': 'manager',
  'decision.archive': 'manager',
  'commitment.create': 'contributor',
  'commitment.update': 'contributor',
  'commitment.archive': 'manager',
} as const satisfies Record<string, Role>

export type Action = keyof typeof PERMISSIONS

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false
  return atLeast(role, PERMISSIONS[action])
}

/**
 * Role-change rules beyond the matrix: nobody can grant a role above their own,
 * only owners manage owners, and the last owner can never be demoted or removed.
 */
export function canChangeRole(actor: Role, target: Role, next: Role): boolean {
  if (!can(actor, 'members.updateRole')) return false
  if (target === 'owner' || next === 'owner') return actor === 'owner'
  return RANK[next] <= RANK[actor]
}
