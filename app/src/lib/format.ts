import type { Stance } from '../api/types'

export const STANCE_LABEL: Record<Stance, string> = {
  champion: 'Champion', supporter: 'Supporter', neutral: 'Neutral', concerned: 'Concerned', opposed: 'Opposed', unknown: 'Unknown',
}
export const LEVEL_LABEL = ['', 'Low', 'Medium', 'High', 'Very high']
export const DECISION_STATUS_LABEL: Record<string, string> = { proposed: 'Proposed', under_review: 'Under review', approved: 'Approved', rejected: 'Rejected', deferred: 'Deferred' }
export const COMMITMENT_STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' }
export const INITIATIVE_STATUS_LABEL: Record<string, string> = { planned: 'Planned', active: 'Active', on_hold: 'On hold', completed: 'Completed' }
export const ENGAGEMENT_KIND_LABEL: Record<string, string> = { meeting: 'Meeting', call: 'Call', email: 'Email summary', workshop: 'Workshop', consultation: 'Consultation', site_visit: 'Site visit', note: 'Internal note', other: 'Other' }
export const ORG_TYPE_LABEL: Record<string, string> = { company: 'Company', government: 'Government body', department: 'Department', regulator: 'Regulator', ngo: 'NGO / non-profit', education: 'Education & research', community: 'Community group', utility: 'Utility', landowner: 'Landowner', other: 'Other' }
export const RELATIONSHIP_LABEL: Record<string, [string, string]> = {
  reports_to: ['Reports to', 'Manages'], colleague: ['Colleague of', 'Colleague of'], advises: ['Advises', 'Advised by'],
  influences: ['Influences', 'Influenced by'], allied: ['Allied with', 'Allied with'], opposes: ['Opposes', 'Opposed by'],
  member_of: ['Member of', 'Has member'], partner_of: ['Partner of', 'Partner of'], funds: ['Funds', 'Funded by'], regulates: ['Regulates', 'Regulated by'], other: ['Related to', 'Related to'],
}

const DAY = 86_400_000

/** Calendar-day difference (local), positive = in the future. */
export function daysFromToday(iso: string) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  const a = new Date(); a.setHours(0, 0, 0, 0)
  const b = new Date(d); b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / DAY)
}

export function fmtRelative(iso: string | number | null | undefined, now = Date.now()) {
  if (iso == null) return '—'
  const ms = typeof iso === 'number' ? iso : Date.parse(iso)
  const d = Math.round((now - ms) / DAY)
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 60) return `${Math.round(d / 7)}w ago`
  if (d < 365) return `${Math.round(d / 30)}mo ago`
  return `${Math.round(d / 365)}y ago`
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  if (!iso) return '—'
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-GB', opts)
}

/** "Due today" / "Due in 3 days" / "4 days overdue" for an ISO date. */
export function dueLabel(iso: string | null | undefined) {
  if (!iso) return 'No due date'
  const d = daysFromToday(iso)
  if (d === 0) return 'Due today'
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`
  if (d <= 7) return `Due in ${d} day${d === 1 ? '' : 's'}`
  return `Due ${fmtDate(iso)}`
}

export const isOpenStatus = (s: string) => s === 'open' || s === 'in_progress'
export const isoToday = (offset = 0) => { const d = new Date(Date.now() + offset * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
