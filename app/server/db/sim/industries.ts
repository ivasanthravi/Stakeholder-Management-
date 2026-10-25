// Ten industry scenarios as DATA ONLY. The generator and the application have no industry-specific code: each pack
// supplies fictional organisations, roles, initiatives and the language of its decisions and commitments.
// Every name, place and organisation is invented. Emails use example.com sub-domains.
import type { ORG_TYPES, STAKEHOLDER_TYPES } from '../../../shared/schemas'

type OrgType = typeof ORG_TYPES[number]
type StakeholderType = typeof STAKEHOLDER_TYPES[number]
/** Relative weights for champion, supporter, neutral, concerned, opposed. */
type StanceBias = [number, number, number, number, number]

export interface OrgKind {
  type: OrgType
  /** `{place}` is replaced with a fictional place. */
  names: string[]
  roles: string[]
  stance: StanceBias
  personType: StakeholderType
  /** Share of external organisations of this kind. */
  weight: number
  /** Relationship this kind tends to have toward the client organisation's people. */
  link?: 'regulates' | 'funds' | 'advises' | 'partner_of'
}

export interface IndustryPack {
  id: string
  label: string
  /** Workspace template (vocabulary and defaults). Industries without their own template use a general one. */
  template: string
  client: { name: string; short: string }
  places: string[]
  /** Internal departments of the client organisation (child organisations of type `department`). */
  departments: string[]
  internalRoles: string[]
  orgKinds: OrgKind[]
  initiatives: { code: string; name: string; objective: string }[]
  decisions: string[]
  /** Commitments we owe; `{org}` → counterparty short name, `{place}` → place. */
  ours: string[]
  /** Commitments the stakeholder owes us. */
  theirs: string[]
  topics: string[]
}

export const INDUSTRIES: IndustryPack[] = [
  {
    id: 'technology', label: 'Technology', template: 'technology',
    client: { name: 'Northwind Cloud Systems', short: 'NCS' },
    places: ['Brightwater', 'Fenmore', 'Calder Bay', 'Ostrova', 'Pellham'],
    departments: ['Product', 'Engineering', 'Security & Compliance', 'Customer Success', 'Finance'],
    internalRoles: ['VP Product', 'Engineering Manager', 'Staff Engineer', 'Product Manager', 'Compliance Lead', 'Customer Success Manager', 'Finance Partner', 'Head of Platform'],
    orgKinds: [
      { type: 'company', names: ['{place} Logistics Group', '{place} Retail Holdings', '{place} Health Network', 'Arcturus {place}'], roles: ['CIO', 'Head of IT Procurement', 'Platform Architect', 'Security Officer', 'Operations Director'], stance: [2, 4, 4, 2, 1], personType: 'individual', weight: 5 },
      { type: 'company', names: ['Halcyon Ventures', 'Meridian Peak Capital', '{place} Growth Partners'], roles: ['Partner', 'Board Observer', 'Principal'], stance: [3, 4, 2, 2, 0], personType: 'individual', weight: 1, link: 'funds' },
      { type: 'company', names: ['Corvid Integrations', '{place} Data Services', 'Lumen Systems Integrators'], roles: ['Alliance Manager', 'Solutions Architect', 'Partner Director'], stance: [2, 4, 3, 1, 0], personType: 'representative', weight: 2, link: 'partner_of' },
      { type: 'regulator', names: ['Data Protection Authority of {place}', 'Office of Digital Standards'], roles: ['Supervising Officer', 'Policy Adviser'], stance: [0, 1, 5, 3, 1], personType: 'official', weight: 1, link: 'regulates' },
    ],
    initiatives: [
      { code: 'ENT', name: 'Enterprise Edition Launch', objective: 'Ship the enterprise tier to five reference customers' },
      { code: 'SOC', name: 'Assurance Programme', objective: 'Complete the third-party security assessment' },
      { code: 'EU1', name: 'Regional Data Residency', objective: 'Host customer data in-region' },
      { code: 'PRT', name: 'Partner Ecosystem', objective: 'Certify integration partners' },
      { code: 'MIG', name: 'Legacy Customer Migration', objective: 'Move legacy tenants to the new platform' },
    ],
    decisions: ['Launch date for the enterprise tier', 'Pricing for seats above 500', 'Data residency region choice', 'Sunset date for the legacy API', 'Partner certification criteria', 'Single sign-on scope for launch', 'Support tier for reference customers', 'Penetration test vendor', 'Contract terms for audit rights', 'Roadmap priority: reporting vs integrations'],
    ours: ['Send the security questionnaire responses to {org}', 'Share the migration runbook with {org}', 'Provide a sandbox tenant for {org}', 'Confirm the uptime commitment for {org}', 'Deliver the integration guide to {org}', 'Schedule the architecture review with {org}'],
    theirs: ['{org} to confirm pilot user list', '{org} to sign the data processing terms', '{org} to provide test credentials for their identity provider', '{org} to approve the rollout window', '{org} to share their procurement checklist'],
    topics: ['Pilot readiness', 'Security review', 'Pricing discussion', 'Roadmap briefing', 'Integration workshop', 'Escalation call', 'Quarterly business review'],
  },
  {
    id: 'construction', label: 'Construction', template: 'construction',
    client: { name: 'Kestrel Civil Partners', short: 'KCP' },
    places: ['Harrowby', 'Wexmoor', 'Dunholt', 'Saltcombe', 'Tarnley'],
    departments: ['Project Delivery', 'Engineering', 'Commercial', 'Health & Safety', 'Community Relations'],
    internalRoles: ['Project Director', 'Package Manager', 'Lead Engineer', 'Commercial Manager', 'Community Liaison Manager', 'Safety Manager', 'Planning Manager'],
    orgKinds: [
      { type: 'company', names: ['{place} Groundworks', 'Ironbridge Structures', '{place} Aggregates Supply'], roles: ['Site Manager', 'Contracts Manager', 'Supply Lead', 'Director'], stance: [1, 4, 3, 2, 1], personType: 'individual', weight: 3, link: 'partner_of' },
      { type: 'government', names: ['{place} District Council', '{place} Highways Authority'], roles: ['Planning Officer', 'Highways Engineer', 'Councillor', 'Head of Planning'], stance: [1, 2, 4, 3, 1], personType: 'official', weight: 2, link: 'regulates' },
      { type: 'regulator', names: ['Environmental Standards Agency', 'Heritage Review Board'], roles: ['Area Inspector', 'Case Officer'], stance: [0, 1, 4, 4, 1], personType: 'official', weight: 1, link: 'regulates' },
      { type: 'community', names: ['{place} Residents Association', '{place} Parish Forum'], roles: ['Chair', 'Secretary', 'Resident Representative'], stance: [0, 1, 3, 5, 3], personType: 'community_member', weight: 2 },
      { type: 'landowner', names: ['{place} Estates', '{place} Farm Partnership'], roles: ['Owner', 'Land Agent'], stance: [0, 1, 3, 4, 2], personType: 'individual', weight: 1 },
    ],
    initiatives: [
      { code: 'BRG', name: 'River Crossing Bridge', objective: 'Deliver the crossing with no unplanned closures' },
      { code: 'DEP', name: 'Maintenance Depot Relocation', objective: 'Relocate the depot by spring' },
      { code: 'FLD', name: 'Flood Defence Upgrade', objective: 'Raise the defence line along the estuary' },
      { code: 'RDW', name: 'Ring Road Widening', objective: 'Widen the ring road with minimal disruption' },
    ],
    decisions: ['Night working on the river section', 'Haul route through the village', 'Pile design change for soft ground', 'Temporary closure dates', 'Compensation approach for landowners', 'Noise monitoring locations', 'Supplier substitution for steel', 'Programme recovery plan after flooding', 'Permit variation submission', 'Community fund allocation'],
    ours: ['Send the revised traffic management plan to {org}', 'Share noise survey results with {org}', 'Confirm the closure dates with {org}', 'Provide the updated drainage drawings to {org}', 'Arrange a site walk for {org}', 'Publish the {place} construction newsletter'],
    theirs: ['{org} to return the permit conditions', '{org} to confirm access to their land', '{org} to supply the delivery schedule', '{org} to sign off the method statement', '{org} to provide comments on the design'],
    topics: ['Permit review', 'Site walk', 'Programme update', 'Community drop-in', 'Commercial negotiation', 'Design coordination', 'Delay review'],
  },
  {
    id: 'government', label: 'Government', template: 'government',
    client: { name: 'Department for Regional Services', short: 'DRS' },
    places: ['Calderwick', 'Ashfold', 'Morwen', 'Eastcliff', 'Thornbury Vale'],
    departments: ['Policy', 'Digital Services', 'Finance & Commercial', 'Communications', 'Legal'],
    internalRoles: ['Programme Director', 'Policy Lead', 'Service Owner', 'Commercial Lead', 'Legal Adviser', 'Head of Communications'],
    orgKinds: [
      { type: 'government', names: ['{place} County Council', 'Agency for Benefits Delivery', 'Office for Local Data'], roles: ['Director of Services', 'Head of Policy', 'Deputy Chief Executive', 'Data Protection Officer'], stance: [1, 3, 4, 2, 1], personType: 'official', weight: 3 },
      { type: 'community', names: ['{place} Citizens Panel', '{place} Disability Forum', '{place} Tenants Federation'], roles: ['Chair', 'Representative', 'Coordinator'], stance: [0, 2, 3, 4, 2], personType: 'representative', weight: 2 },
      { type: 'company', names: ['Bramble Digital', 'Civic Systems {place}', 'Hartwell Consulting'], roles: ['Account Director', 'Delivery Manager', 'Lead Architect'], stance: [2, 4, 3, 1, 0], personType: 'individual', weight: 2, link: 'advises' },
      { type: 'regulator', names: ['Public Accounts Scrutiny Office', 'Information Standards Board'], roles: ['Auditor', 'Scrutiny Officer'], stance: [0, 1, 5, 3, 1], personType: 'official', weight: 1, link: 'regulates' },
    ],
    initiatives: [
      { code: 'SRV', name: 'Single Front Door Service', objective: 'One online entry point for regional services' },
      { code: 'POL', name: 'Policy Consultation 2026', objective: 'Consult on eligibility rules' },
      { code: 'DAT', name: 'Shared Data Platform', objective: 'Share records between agencies lawfully' },
      { code: 'ACC', name: 'Accessibility Uplift', objective: 'Meet accessibility standards across services' },
    ],
    decisions: ['Eligibility rule change for the pilot', 'Consultation period length', 'Data sharing agreement scope', 'Supplier selection for the platform', 'Go-live date for the front door', 'Funding allocation between agencies', 'Response to the scrutiny recommendations', 'Assisted digital channel model', 'Retention period for case records'],
    ours: ['Publish the consultation response for {org}', 'Send the draft data sharing agreement to {org}', 'Arrange an accessibility review with {org}', 'Confirm funding letters for {org}', 'Share the user research findings with {org}'],
    theirs: ['{org} to return consultation comments', '{org} to confirm their data controller', '{org} to nominate a representative', '{org} to approve the privacy notice', '{org} to provide case volumes'],
    topics: ['Consultation session', 'Policy review', 'Steering board', 'Scrutiny hearing', 'Supplier check-in', 'Community workshop'],
  },
  {
    id: 'healthcare', label: 'Healthcare administration', template: 'enterprise',
    client: { name: 'Riverside General Hospital Trust', short: 'RGH' },
    places: ['Lanford', 'Mersey Cross', 'Hollin', 'Ebbsworth', 'Kinsale Park'],
    departments: ['Operations', 'Estates', 'Clinical Governance', 'Procurement', 'Information Technology'],
    internalRoles: ['Chief Operating Officer', 'Operations Manager', 'Head of Estates', 'Governance Lead', 'Procurement Manager', 'Department Manager', 'Transformation Lead'],
    orgKinds: [
      { type: 'company', names: ['Medisupply {place}', 'Clearwave Scheduling', 'Northgate Facilities'], roles: ['Account Manager', 'Implementation Lead', 'Service Director'], stance: [1, 4, 3, 2, 0], personType: 'individual', weight: 3, link: 'partner_of' },
      { type: 'regulator', names: ['Care Standards Inspectorate', 'Health Information Authority'], roles: ['Inspector', 'Relationship Manager'], stance: [0, 1, 5, 3, 1], personType: 'official', weight: 1, link: 'regulates' },
      { type: 'government', names: ['{place} Health Board', 'Regional Commissioning Office'], roles: ['Commissioning Lead', 'Finance Director'], stance: [1, 3, 4, 2, 0], personType: 'official', weight: 2, link: 'funds' },
      { type: 'community', names: ['{place} Patient Forum', 'Friends of Riverside'], roles: ['Chair', 'Volunteer Lead'], stance: [1, 3, 3, 3, 1], personType: 'representative', weight: 1 },
    ],
    initiatives: [
      { code: 'THR', name: 'Theatre Scheduling Improvement', objective: 'Reduce cancelled theatre sessions' },
      { code: 'EPR', name: 'Records System Replacement', objective: 'Replace the administrative records system' },
      { code: 'EST', name: 'Estates Energy Programme', objective: 'Cut energy use across the estate' },
      { code: 'PRC', name: 'Procurement Consolidation', objective: 'Consolidate supply contracts' },
    ],
    decisions: ['Scheduling system vendor', 'Phased rollout by department', 'Out-of-hours support model', 'Theatre session allocation rules', 'Energy contract renewal', 'Supplier consolidation shortlist', 'Inspection action plan sign-off', 'Downtime window for the records system'],
    ours: ['Send the rollout plan to {org}', 'Share the inspection action plan with {org}', 'Confirm the training schedule with {org}', 'Provide downtime notices to {org}', 'Return the supplier evaluation to {org}'],
    theirs: ['{org} to confirm delivery lead times', '{org} to provide the integration specification', '{org} to approve the funding release', '{org} to nominate department champions', '{org} to share inspection findings'],
    topics: ['Operations review', 'Vendor check-in', 'Governance committee', 'Department walkthrough', 'Inspection preparation', 'Patient forum update'],
  },
  {
    id: 'education', label: 'Education', template: 'education',
    client: { name: 'University of Westerfield', short: 'UoW' },
    places: ['Westerfield', 'Abbotsley', 'Corrin', 'Haldane Green', 'Mossburn'],
    departments: ['Academic Registry', 'Digital Services', 'Estates', 'Research Office', 'Student Experience'],
    internalRoles: ['Pro Vice-Chancellor', 'Head of Digital', 'Registrar', 'Dean of Faculty', 'Research Director', 'Student Experience Manager'],
    orgKinds: [
      { type: 'education', names: ['Faculty of Engineering', 'Faculty of Arts', 'School of Medicine'], roles: ['Professor', 'Senior Lecturer', 'Head of Department', 'Faculty Administrator'], stance: [1, 3, 3, 3, 2], personType: 'internal', weight: 3 },
      { type: 'community', names: ['Westerfield Students Union', 'Postgraduate Council'], roles: ['President', 'Education Officer', 'Representative'], stance: [1, 2, 3, 4, 2], personType: 'representative', weight: 1 },
      { type: 'company', names: ['Learnwell Platforms', 'Campus Network Services', '{place} Research Labs'], roles: ['Account Executive', 'Implementation Consultant', 'Partnership Lead'], stance: [2, 4, 3, 1, 0], personType: 'individual', weight: 2, link: 'partner_of' },
      { type: 'government', names: ['Higher Education Funding Office', 'Research Councils Board'], roles: ['Programme Officer', 'Grants Manager'], stance: [1, 3, 4, 2, 0], personType: 'official', weight: 1, link: 'funds' },
    ],
    initiatives: [
      { code: 'VLE', name: 'Learning Platform Modernisation', objective: 'Move all modules to the new learning platform' },
      { code: 'CMP', name: 'Campus Masterplan', objective: 'Approve the ten-year campus plan' },
      { code: 'RSH', name: 'Research Partnership Hub', objective: 'Launch three industry research partnerships' },
      { code: 'TIM', name: 'Timetabling Reform', objective: 'Centralise timetabling' },
    ],
    decisions: ['Learning platform vendor', 'Module migration order', 'Senate approval of the masterplan', 'Research partnership terms', 'Timetabling policy change', 'Lecture capture opt-out rules', 'Student representation on the board', 'Budget for teaching space'],
    ours: ['Send the migration schedule to {org}', 'Share the masterplan consultation pack with {org}', 'Confirm training sessions for {org}', 'Provide the partnership agreement draft to {org}'],
    theirs: ['{org} to confirm module leads', '{org} to return committee comments', '{org} to sign the collaboration agreement', '{org} to nominate student representatives'],
    topics: ['Senate briefing', 'Faculty committee', 'Student forum', 'Vendor workshop', 'Partnership meeting', 'Estates review'],
  },
  {
    id: 'consulting', label: 'Consulting', template: 'consulting',
    client: { name: 'Larkspur Advisory', short: 'LKA' },
    places: ['Ravensholm', 'Bexford', 'Quarry Bank', 'Linton', 'Southmere'],
    departments: ['Transformation Practice', 'Finance Practice', 'Delivery Assurance', 'Partnerships'],
    internalRoles: ['Engagement Partner', 'Engagement Manager', 'Senior Consultant', 'Practice Lead', 'Delivery Assurance Lead'],
    orgKinds: [
      { type: 'company', names: ['Altamira Foods', 'Blue Harbour Shipping', '{place} Mutual', 'Cobalt Manufacturing'], roles: ['Executive Sponsor', 'Programme Director', 'Chief Financial Officer', 'Head of Change', 'Operations Director'], stance: [2, 4, 3, 2, 1], personType: 'individual', weight: 5 },
      { type: 'company', names: ['Signal Analytics', 'Tidewater Software'], roles: ['Alliance Lead', 'Solution Architect'], stance: [1, 4, 3, 1, 0], personType: 'representative', weight: 1, link: 'partner_of' },
    ],
    initiatives: [
      { code: 'ALT', name: 'Altamira Operating Model', objective: 'Redesign the client operating model' },
      { code: 'BHS', name: 'Blue Harbour Finance Transformation', objective: 'Shorten the month-end close' },
      { code: 'MUT', name: 'Mutual Digital Channels', objective: 'Launch digital self-service' },
      { code: 'COB', name: 'Cobalt Cost Programme', objective: 'Deliver the agreed savings target' },
    ],
    decisions: ['Scope change request for phase two', 'Steering group cadence', 'Benefits tracking method', 'Resourcing for the client team', 'Go/no-go for the pilot site', 'Change of executive sponsor', 'Extension of the statement of work', 'Target operating model option'],
    ours: ['Send the steering pack to {org}', 'Share the benefits tracker with {org}', 'Provide the phase two proposal to {org}', 'Deliver the current-state report to {org}', 'Confirm the team plan with {org}'],
    theirs: ['{org} to confirm the executive sponsor', '{org} to provide finance data extracts', '{org} to approve the change request', '{org} to release the pilot site team'],
    topics: ['Steering group', 'Sponsor check-in', 'Workshop', 'Status review', 'Escalation call', 'Proposal discussion'],
  },
  {
    id: 'financial-services', label: 'Financial services', template: 'enterprise',
    client: { name: 'Granite Bay Building Society', short: 'GBB' },
    places: ['Ellesmere', 'Port Carrick', 'Highfold', 'Wrenham', 'Easton Lea'],
    departments: ['Digital', 'Risk', 'Compliance', 'Operations', 'Finance'],
    internalRoles: ['Chief Digital Officer', 'Head of Risk', 'Compliance Manager', 'Product Owner', 'Operations Lead', 'Finance Business Partner'],
    orgKinds: [
      { type: 'regulator', names: ['Prudential Conduct Authority', 'Payments Oversight Board'], roles: ['Supervisor', 'Policy Lead', 'Case Manager'], stance: [0, 1, 5, 3, 1], personType: 'official', weight: 1, link: 'regulates' },
      { type: 'company', names: ['Paycore Systems', '{place} Identity Services', 'Ledgerline Cloud'], roles: ['Account Director', 'Implementation Manager', 'Security Lead'], stance: [2, 4, 3, 1, 0], personType: 'individual', weight: 3, link: 'partner_of' },
      { type: 'company', names: ['{place} Business Association', 'Members Panel'], roles: ['Chair', 'Member Representative'], stance: [1, 3, 3, 3, 1], personType: 'representative', weight: 1 },
      { type: 'company', names: ['Assurance Partners {place}'], roles: ['Audit Partner', 'Risk Consultant'], stance: [0, 2, 5, 2, 0], personType: 'individual', weight: 1, link: 'advises' },
    ],
    initiatives: [
      { code: 'APP', name: 'Mobile Savings App', objective: 'Launch the savings app to members' },
      { code: 'KYC', name: 'Onboarding Controls Review', objective: 'Strengthen identity checks' },
      { code: 'RES', name: 'Operational Resilience', objective: 'Meet resilience tolerances' },
      { code: 'VND', name: 'Vendor Consolidation', objective: 'Reduce critical suppliers' },
    ],
    decisions: ['Risk acceptance for the launch', 'Identity verification supplier', 'Launch to staff before members', 'Outsourcing notification to the regulator', 'Impact tolerance for payments', 'Fraud rule thresholds', 'Exit plan for the core supplier', 'Marketing approval for the launch'],
    ours: ['Submit the outsourcing notification to {org}', 'Send the resilience self-assessment to {org}', 'Share the penetration test summary with {org}', 'Confirm launch readiness with {org}', 'Provide the exit plan to {org}'],
    theirs: ['{org} to confirm the service levels', '{org} to provide their assurance report', '{org} to respond to the notification', '{org} to complete the security questionnaire'],
    topics: ['Risk committee', 'Regulatory meeting', 'Vendor due diligence', 'Launch readiness review', 'Compliance check-in', 'Member panel'],
  },
  {
    id: 'nonprofit', label: 'Nonprofit', template: 'nonprofit',
    client: { name: 'Hearthstone Community Trust', short: 'HCT' },
    places: ['Millbrook', 'Glenarrow', 'Sedgefield Moor', 'Ashwater', 'Copse End'],
    departments: ['Programmes', 'Fundraising', 'Volunteering', 'Finance & Governance'],
    internalRoles: ['Chief Executive', 'Programme Manager', 'Fundraising Manager', 'Volunteer Coordinator', 'Trustee', 'Finance Officer'],
    orgKinds: [
      { type: 'ngo', names: ['Lantern Foundation', '{place} Charitable Fund', 'Northern Giving Trust'], roles: ['Grants Officer', 'Programme Director', 'Trustee'], stance: [2, 4, 3, 1, 0], personType: 'individual', weight: 2, link: 'funds' },
      { type: 'community', names: ['{place} Food Network', '{place} Youth Club', '{place} Tenants Group'], roles: ['Coordinator', 'Chair', 'Volunteer Lead'], stance: [2, 4, 3, 2, 0], personType: 'community_member', weight: 3, link: 'partner_of' },
      { type: 'government', names: ['{place} Borough Council', 'Regional Health Partnership'], roles: ['Community Development Officer', 'Commissioner'], stance: [1, 3, 4, 2, 1], personType: 'official', weight: 1 },
      { type: 'company', names: ['{place} Building Supplies', 'Greenline Grocers'], roles: ['Community Lead', 'Store Manager'], stance: [1, 3, 4, 1, 0], personType: 'individual', weight: 1 },
    ],
    initiatives: [
      { code: 'FDP', name: 'Regional Food Programme', objective: 'Reach 4,000 households' },
      { code: 'VOL', name: 'Volunteer Growth', objective: 'Recruit and retain 300 volunteers' },
      { code: 'HUB', name: 'Community Hubs', objective: 'Open three community hubs' },
    ],
    decisions: ['Grant application priorities', 'Hub location shortlist', 'Volunteer expenses policy', 'Partner selection for food distribution', 'Reserves policy', 'Second-year funding bid'],
    ours: ['Send the impact report to {org}', 'Submit the grant application to {org}', 'Share the volunteer handbook with {org}', 'Confirm hub opening hours with {org}'],
    theirs: ['{org} to confirm the grant decision', '{org} to provide volunteer numbers', '{org} to sign the partnership agreement', '{org} to share distribution data'],
    topics: ['Funder meeting', 'Partner check-in', 'Volunteer forum', 'Trustee board', 'Community visit'],
  },
  {
    id: 'energy', label: 'Energy & utilities', template: 'other',
    client: { name: 'Solway Grid Networks', short: 'SGN' },
    places: ['Carnford', 'Breckle', 'Ottermouth', 'Fallowfield', 'Kirkhaven'],
    departments: ['Network Planning', 'Engineering', 'Environment', 'Stakeholder Engagement', 'Regulatory Affairs'],
    internalRoles: ['Programme Director', 'Network Planner', 'Lead Engineer', 'Environmental Manager', 'Regulatory Manager', 'Engagement Lead'],
    orgKinds: [
      { type: 'regulator', names: ['Energy Markets Regulator', 'Environmental Permitting Office'], roles: ['Licensing Manager', 'Environmental Officer'], stance: [0, 1, 5, 3, 1], personType: 'official', weight: 1, link: 'regulates' },
      { type: 'utility', names: ['{place} Water Services', 'Coastal Gas Distribution'], roles: ['Asset Manager', 'Network Coordinator'], stance: [1, 3, 4, 2, 0], personType: 'individual', weight: 1, link: 'partner_of' },
      { type: 'company', names: ['Voltaic Transformers', '{place} Cable Supply', 'Turbine Services {place}'], roles: ['Contracts Manager', 'Supply Chain Lead'], stance: [1, 4, 3, 2, 0], personType: 'individual', weight: 2, link: 'partner_of' },
      { type: 'community', names: ['{place} Community Council', '{place} Wildlife Group'], roles: ['Chair', 'Ecologist', 'Resident'], stance: [0, 1, 3, 4, 3], personType: 'community_member', weight: 2 },
      { type: 'landowner', names: ['{place} Estate'], roles: ['Owner', 'Agent'], stance: [0, 1, 3, 4, 2], personType: 'individual', weight: 1 },
    ],
    initiatives: [
      { code: 'SUB', name: 'Substation Expansion', objective: 'Add capacity for new connections' },
      { code: 'OHL', name: 'Overhead Line Upgrade', objective: 'Replace ageing lines along the coast' },
      { code: 'ENV', name: 'Environmental Mitigation', objective: 'Deliver biodiversity net gain' },
      { code: 'CON', name: 'Connections Queue Reform', objective: 'Shorten connection waiting times' },
    ],
    decisions: ['Route option for the line upgrade', 'Environmental survey scope', 'Outage window for works', 'Supplier for transformers', 'Compensation for landowners', 'Mitigation site selection', 'Connection offer methodology'],
    ours: ['Send the route options report to {org}', 'Share the outage plan with {org}', 'Provide the environmental survey to {org}', 'Confirm compensation terms with {org}'],
    theirs: ['{org} to approve the outage window', '{org} to grant survey access', '{org} to confirm transformer delivery', '{org} to issue the permit decision'],
    topics: ['Regulatory meeting', 'Community consultation', 'Engineering review', 'Supplier progress call', 'Environmental walkover'],
  },
  {
    id: 'retail', label: 'Retail & commerce', template: 'other',
    client: { name: 'Marigold & Finch Retail', short: 'MFR' },
    places: ['Lisbury', 'Port Alder', 'Venholm', 'Crestwick', 'Daleford'],
    departments: ['Expansion', 'Supply Chain', 'Store Operations', 'Technology', 'Franchise Development'],
    internalRoles: ['Expansion Director', 'Supply Chain Manager', 'Store Operations Lead', 'Head of Technology', 'Franchise Manager', 'Category Manager'],
    orgKinds: [
      { type: 'company', names: ['{place} Freight', 'Northbound Logistics', 'Quayside Warehousing'], roles: ['Account Manager', 'Operations Director', 'Fleet Manager'], stance: [1, 4, 3, 2, 0], personType: 'individual', weight: 2, link: 'partner_of' },
      { type: 'company', names: ['{place} Produce Co', 'Harbor Textiles', 'Fernhill Home Goods'], roles: ['Sales Director', 'Supplier Relations Lead'], stance: [1, 3, 4, 2, 1], personType: 'individual', weight: 3, link: 'partner_of' },
      { type: 'company', names: ['{place} Franchise Group', 'Bayside Retail Partners'], roles: ['Franchisee', 'Area Developer'], stance: [2, 3, 3, 3, 1], personType: 'representative', weight: 2 },
      { type: 'company', names: ['Pointline POS', 'Stockwise Systems'], roles: ['Implementation Lead', 'Customer Success Manager'], stance: [1, 4, 3, 1, 0], personType: 'individual', weight: 1, link: 'partner_of' },
      { type: 'government', names: ['{place} Trading Standards'], roles: ['Officer'], stance: [0, 1, 5, 2, 0], personType: 'official', weight: 1, link: 'regulates' },
    ],
    initiatives: [
      { code: 'MKT', name: 'New Market Entry', objective: 'Open twenty stores in the new region' },
      { code: 'DCX', name: 'Distribution Centre Expansion', objective: 'Add a regional distribution centre' },
      { code: 'POS', name: 'Point of Sale Replacement', objective: 'Replace tills across the estate' },
      { code: 'FRN', name: 'Franchise Model Pilot', objective: 'Pilot franchised stores' },
    ],
    decisions: ['Store opening sequence', 'Distribution partner selection', 'Franchise fee structure', 'Point of sale vendor', 'Range for launch stores', 'Peak trading freeze dates', 'Pricing in the new region'],
    ours: ['Send the opening plan to {org}', 'Share the forecast volumes with {org}', 'Provide the franchise operations manual to {org}', 'Confirm the rollout calendar with {org}'],
    theirs: ['{org} to confirm warehouse capacity', '{org} to sign the supply agreement', '{org} to provide store-level data', '{org} to approve the shelf plans'],
    topics: ['Supplier review', 'Franchise meeting', 'Logistics planning', 'Store visit', 'Technology workshop'],
  },
]

export const industryById = (id: string) => INDUSTRIES.find(i => i.id === id)

/** Fictional given and family names (a wide mix so 10,000 people stay plausible). */
export const GIVEN = ['Aaliyah', 'Abel', 'Ada', 'Adaeze', 'Aditi', 'Adrian', 'Agnes', 'Aiko', 'Alba', 'Alejandro', 'Amara', 'Amir', 'Anika', 'Anton', 'Arjun', 'Astrid', 'Aurelio', 'Ayesha', 'Beatrix', 'Benedikt', 'Bianca', 'Bilal', 'Bryn', 'Caius', 'Camille', 'Carmen', 'Cato', 'Chidi', 'Clara', 'Dalia', 'Damian', 'Dara', 'Darius', 'Delphine', 'Dmitri', 'Eamon', 'Edith', 'Efua', 'Eitan', 'Elif', 'Elio', 'Emeka', 'Esther', 'Ezra', 'Farah', 'Felipe', 'Freya', 'Gael', 'Gemma', 'Goran', 'Hadley', 'Hamza', 'Hana', 'Hector', 'Helga', 'Idris', 'Ilse', 'Imani', 'Ingrid', 'Isaac', 'Ivana', 'Jamal', 'Jana', 'Jasper', 'Jun', 'Kai', 'Kalinda', 'Kasimir', 'Keira', 'Kenji', 'Kwame', 'Lara', 'Leila', 'Leon', 'Lior', 'Lucia', 'Luka', 'Mads', 'Malik', 'Mara', 'Mateo', 'Mei', 'Mila', 'Moana', 'Nadia', 'Naveen', 'Nell', 'Nikhil', 'Noor', 'Odette', 'Oisin', 'Olu', 'Omar', 'Orla', 'Pablo', 'Pia', 'Priya', 'Quentin', 'Rafael', 'Rania', 'Ravi', 'Rhea', 'Rohan', 'Ruth', 'Saanvi', 'Sami', 'Sana', 'Selin', 'Silas', 'Sinead', 'Soren', 'Tahmina', 'Tariq', 'Thea', 'Tobias', 'Uma', 'Valentin', 'Vesna', 'Wanjiru', 'Wren', 'Xavier', 'Yara', 'Yusuf', 'Zainab', 'Zoltan']
export const FAMILY = ['Abara', 'Achterberg', 'Adeyemi', 'Albescu', 'Almeida', 'Andersen', 'Aranda', 'Ashworth', 'Bakshi', 'Balogun', 'Barrow', 'Bekele', 'Bergstrom', 'Bianchi', 'Blackthorne', 'Bramwell', 'Calloway', 'Castellano', 'Chaudhry', 'Clement', 'Coelho', 'Costa', 'Dalgaard', 'Darroch', 'Delgado', 'Dimitrov', 'Doherty', 'Dubois', 'Eklund', 'Elkins', 'Esposito', 'Farrant', 'Ferreira', 'Fitzgerald', 'Fonseca', 'Galloway', 'Garcia', 'Gaspard', 'Grieve', 'Gunawardena', 'Haddad', 'Halloran', 'Hargreaves', 'Hashemi', 'Hendricks', 'Holm', 'Iwu', 'Jablonski', 'Jaramillo', 'Jensen', 'Juarez', 'Kapoor', 'Karimi', 'Kaur', 'Kaminski', 'Keane', 'Kimura', 'Kovac', 'Laine', 'Larkin', 'Lefevre', 'Lindgren', 'Lombardi', 'Lundqvist', 'Macarthur', 'Mahlangu', 'Marchetti', 'Mbeki', 'Mendes', 'Moreau', 'Mwangi', 'Nakagawa', 'Navarro', 'Ndlovu', 'Nielsen', 'Novotny', 'Nwosu', 'Obi', 'Oduya', 'Okonkwo', 'Olsen', 'Ortega', 'Osterberg', 'Papadakis', 'Petrov', 'Pillai', 'Quarshie', 'Quinlan', 'Rasmussen', 'Reyes', 'Rinaldi', 'Rojas', 'Rosenberg', 'Saito', 'Salazar', 'Santos', 'Schofield', 'Sekou', 'Sharma', 'Silva', 'Sokolova', 'Strand', 'Suleiman', 'Szabo', 'Takahashi', 'Tembo', 'Thorsen', 'Torres', 'Udeh', 'Vance', 'Varga', 'Vasquez', 'Vidal', 'Volkov', 'Wallace', 'Wexler', 'Whitcombe', 'Wojcik', 'Yamamoto', 'Yilmaz', 'Zamora', 'Zhou', 'Zwart']
