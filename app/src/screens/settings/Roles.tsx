// Read-only role matrix generated from shared/permissions — the same table the server enforces.
import { Check, Minus } from 'lucide-react'
import { useSession } from '../../session/session'
import { useVocabulary } from '../../lib/vocabulary'
import { can, ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type Action, type Role } from '../../../shared/permissions'
import { PageTitle, SectionHead } from './common'

type Row = { label: string; action: Action }

export function RolesTab() {
  const { role: mine } = useSession()
  const v = useVocabulary()
  const groups: { title: string; rows: Row[] }[] = [
    { title: 'Workspace', rows: [
      { label: 'View the workspace', action: 'workspace.read' },
      { label: 'Change name, vocabulary and AI settings', action: 'workspace.update' },
      { label: 'View the audit log', action: 'audit.read' },
      { label: 'Schedule workspace deletion', action: 'workspace.deleteRequest' },
    ] },
    { title: 'People', rows: [
      { label: 'See who’s in the workspace', action: 'members.read' },
      { label: 'Invite people', action: 'members.invite' },
      { label: 'Change roles', action: 'members.updateRole' },
      { label: 'Remove members', action: 'members.remove' },
    ] },
    { title: 'Billing and data', rows: [
      { label: 'See plan, usage and invoices', action: 'billing.read' },
      { label: 'Buy, change or cancel the plan', action: 'billing.manage' },
      { label: 'Export workspace data', action: 'data.export' },
    ] },
    { title: 'Records', rows: [
      { label: 'View records (not restricted)', action: 'record.read' },
      { label: `Add and edit ${v.lower('stakeholder', true)}`, action: 'stakeholder.create' },
      { label: `Archive ${v.lower('stakeholder', true)}`, action: 'stakeholder.archive' },
      { label: `Restrict sensitive ${v.lower('stakeholder', true)}`, action: 'stakeholder.restrict' },
      { label: `Add and edit ${v.lower('organization', true)}`, action: 'organization.create' },
      { label: `Create and run ${v.lower('initiative', true)}`, action: 'initiative.create' },
      { label: 'Record engagements, relationships and commitments', action: 'engagement.create' },
      { label: 'Propose decisions', action: 'decision.create' },
      { label: 'Update decision outcomes', action: 'decision.update' },
      { label: 'Archive engagements, decisions and commitments', action: 'engagement.archive' },
    ] },
  ]
  return (
    <>
      <PageTitle title="Roles & permissions" sub="What each role can do. Roles are assigned in Members; the server enforces the same rules." />
      <section className="set-section" aria-labelledby="roles-sum">
        <SectionHead title="Roles" id="roles-sum" />
        <dl className="set-card legend-list">
          {ROLES.map(r => (
            <div key={r} className="legend-row" data-mine={r === mine || undefined}>
              <dt className="t-strong">{ROLE_LABEL[r]}{r === mine && <span className="set-you">You</span>}</dt>
              <dd className="t-small c2">{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="set-section" aria-labelledby="roles-matrix">
        <SectionHead title="Permissions" id="roles-matrix" sub="Each role includes everything the roles to its right can do." />
        <div className="set-card perm-wrap" tabIndex={0} role="region" aria-label="Permissions by role">
          <table className="perm">
            <thead>
              <tr>
                <th scope="col" className="perm-what"><span className="sr-only">Permission</span></th>
                {ROLES.map(r => <th key={r} scope="col" data-mine={r === mine || undefined}><span className="perm-role">{ROLE_LABEL[r]}</span></th>)}
              </tr>
            </thead>
            {groups.map(g => (
              <tbody key={g.title}>
                <tr className="perm-group"><th scope="rowgroup" colSpan={ROLES.length + 1}>{g.title}</th></tr>
                {g.rows.map(row => (
                  <tr key={row.action}>
                    <th scope="row" className="perm-what">{row.label}</th>
                    {ROLES.map((r: Role) => {
                      const ok = can(r, row.action)
                      return (
                        <td key={r} data-mine={r === mine || undefined} data-ok={ok || undefined}>
                          {ok ? <Check size={14} aria-hidden /> : <Minus size={12} aria-hidden className="perm-no" />}
                          <span className="sr-only">{ok ? 'Allowed' : 'Not allowed'}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="t-small c3">Restricted {v.lower('stakeholder', true)} are visible only to administrators, owners and the people they’re shared with.</p>
      </section>
    </>
  )
}
