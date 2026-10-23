// Industry starter templates. A template is only configuration on the one shared product: vocabulary, which
// organization types and engagement kinds to offer (in order), and onboarding suggestions. No per-industry code paths.
import type { ENGAGEMENT_KINDS, ORG_TYPES } from './schemas'

type OrgType = typeof ORG_TYPES[number]
type EngagementKind = typeof ENGAGEMENT_KINDS[number]

export interface IndustryTemplate {
  id: string
  label: string
  description: string
  vocabulary: { initiative: string; stakeholder: string; organization: string }
  organizationTypes: OrgType[]
  engagementKinds: EngagementKind[]
  /** Placeholders and examples used during onboarding. */
  examples: { initiative: string; initiativeCode: string; stakeholderTitles: string[]; organizations: string[] }
}

export const TEMPLATES: IndustryTemplate[] = [
  { id: 'technology', label: 'Technology', description: 'Product launches, enterprise accounts, partners and platform changes.',
    vocabulary: { initiative: 'Program', stakeholder: 'Stakeholder', organization: 'Account' },
    organizationTypes: ['company', 'regulator', 'education', 'other'], engagementKinds: ['meeting', 'call', 'email', 'workshop', 'note', 'other'],
    examples: { initiative: 'EU data residency rollout', initiativeCode: 'EDR', stakeholderTitles: ['CIO', 'Head of Procurement', 'Data Protection Officer'], organizations: ['Northwind Logistics', 'Contoso Health'] } },
  { id: 'consulting', label: 'Consulting', description: 'Client engagements with sponsors, steering groups and change networks.',
    vocabulary: { initiative: 'Engagement', stakeholder: 'Stakeholder', organization: 'Client' },
    organizationTypes: ['company', 'government', 'department', 'ngo', 'other'], engagementKinds: ['meeting', 'workshop', 'call', 'email', 'note', 'other'],
    examples: { initiative: 'Operating model redesign', initiativeCode: 'OMR', stakeholderTitles: ['Executive sponsor', 'Programme director', 'HR business partner'], organizations: ['Fabrikam Group'] } },
  { id: 'enterprise', label: 'Enterprise', description: 'Cross-functional programmes with internal and external stakeholders.',
    vocabulary: { initiative: 'Initiative', stakeholder: 'Stakeholder', organization: 'Organization' },
    organizationTypes: ['company', 'department', 'regulator', 'government', 'other'], engagementKinds: ['meeting', 'call', 'email', 'workshop', 'consultation', 'note', 'other'],
    examples: { initiative: 'ERP consolidation', initiativeCode: 'ERP', stakeholderTitles: ['CFO', 'Finance operations lead', 'Works council chair'], organizations: ['Finance', 'Works council'] } },
  { id: 'government', label: 'Government', description: 'Policy, consultation and public engagement across agencies and communities.',
    vocabulary: { initiative: 'Programme', stakeholder: 'Stakeholder', organization: 'Organization' },
    organizationTypes: ['government', 'department', 'regulator', 'community', 'ngo', 'education', 'company', 'other'], engagementKinds: ['consultation', 'meeting', 'workshop', 'call', 'email', 'note', 'other'],
    examples: { initiative: 'Clean air zone consultation', initiativeCode: 'CAZ', stakeholderTitles: ['Cabinet member', 'Head of Transport', 'Residents’ association chair'], organizations: ['County council', 'Chamber of commerce'] } },
  { id: 'construction', label: 'Construction & infrastructure', description: 'Major projects with landowners, councils, utilities and communities.',
    vocabulary: { initiative: 'Project', stakeholder: 'Stakeholder', organization: 'Organization' },
    organizationTypes: ['government', 'landowner', 'utility', 'community', 'regulator', 'company', 'other'], engagementKinds: ['meeting', 'site_visit', 'consultation', 'call', 'email', 'workshop', 'note', 'other'],
    examples: { initiative: 'Northern Rail Link', initiativeCode: 'NRL', stakeholderTitles: ['Head of Highways', 'Parish clerk', 'Landowner'], organizations: ['County council', 'Water utility'] } },
  { id: 'nonprofit', label: 'Nonprofit', description: 'Funders, partners, beneficiaries and policy influence.',
    vocabulary: { initiative: 'Programme', stakeholder: 'Stakeholder', organization: 'Partner' },
    organizationTypes: ['ngo', 'government', 'company', 'community', 'education', 'other'], engagementKinds: ['meeting', 'call', 'email', 'site_visit', 'workshop', 'note', 'other'],
    examples: { initiative: 'Clean water programme', initiativeCode: 'CWP', stakeholderTitles: ['Programme officer', 'Field director', 'Community leader'], organizations: ['Foundation', 'District health office'] } },
  { id: 'education', label: 'Education', description: 'Institutional partnerships, governance and campus change.',
    vocabulary: { initiative: 'Initiative', stakeholder: 'Stakeholder', organization: 'Organization' },
    organizationTypes: ['education', 'government', 'community', 'company', 'ngo', 'other'], engagementKinds: ['meeting', 'consultation', 'workshop', 'call', 'email', 'note', 'other'],
    examples: { initiative: 'Student accommodation partnership', initiativeCode: 'SAP', stakeholderTitles: ['Pro-Vice-Chancellor', 'Student Union president', 'Estates director'], organizations: ['Students’ union', 'City council'] } },
  { id: 'other', label: 'Something else', description: 'General defaults you can adjust later in Settings.',
    vocabulary: { initiative: 'Initiative', stakeholder: 'Stakeholder', organization: 'Organization' },
    organizationTypes: ['company', 'government', 'department', 'regulator', 'ngo', 'education', 'community', 'utility', 'landowner', 'other'], engagementKinds: ['meeting', 'call', 'email', 'workshop', 'consultation', 'site_visit', 'note', 'other'],
    examples: { initiative: 'Your first initiative', initiativeCode: 'INI', stakeholderTitles: ['Sponsor', 'Decision maker', 'Advisor'], organizations: ['Partner organization'] } },
]

export const templateById = (id: string | null | undefined) => TEMPLATES.find(t => t.id === id) ?? null

/** Workspace settings a template writes (merged into workspace.settings). */
export function templateSettings(t: IndustryTemplate) {
  return { template: t.id, vocabulary: t.vocabulary, organizationTypes: t.organizationTypes, engagementKinds: t.engagementKinds }
}
