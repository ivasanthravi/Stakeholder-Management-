# Industry Scenarios (Phase 7)

**What this proves:** the ten industries run on **one product with no code forks**.

- **What differs per industry:**
  - the workspace template (vocabulary, stance labels, suggested organisation types);
  - the data pack in `app/server/db/sim/industries.ts`, which is data only.
- **What is identical:** the code path, permissions, row-level security and API for every industry.

All organisations, people and places are invented. Emails are on `example.com` sub-domains.

## The ten scenarios
| Industry | Template used | Fictional client | Typical counterpart organisations | Initiatives (examples) | Decisions (examples) |
|---|---|---|---|---|---|
| Technology | `technology` | Northwind Cloud Systems | Enterprise customers, investors, integration partners, data-protection regulator | Enterprise Edition Launch; Assurance Programme; Regional Data Residency | Launch date for the enterprise tier; pricing above 500 seats |
| Construction | `construction` | Kestrel Civil Partners | Contractors, district council, highways authority, environmental and heritage bodies, residents, landowners | River Crossing Bridge; Depot Relocation; Flood Defence Upgrade | Night working on the river section; haul route through the village |
| Government | `government` | Department for Regional Services | County councils, delivery agencies, citizens' and disability panels, suppliers, scrutiny bodies | Single Front Door Service; Policy Consultation 2026; Shared Data Platform | Eligibility rule change; consultation period length |
| Healthcare administration | `enterprise` | Riverside General Hospital Trust | Suppliers, scheduling vendor, inspectorate, health board, patient forum | Theatre Scheduling; Records System Replacement; Estates Energy | Scheduling vendor; phased rollout by department |
| Education | `education` | University of Westerfield | Faculties, students' union, platform vendors, funding bodies | Learning Platform Modernisation; Campus Masterplan; Research Partnership Hub | Platform vendor; module migration order |
| Consulting | `consulting` | Larkspur Advisory | Client companies and their sponsors, analytics partners | Altamira Operating Model; Finance Transformation; Digital Channels | Phase-two scope change; steering cadence |
| Financial services | `enterprise` | Granite Bay Building Society | Conduct and payments regulators, payment and identity suppliers, member panel, assurance firm | Mobile Savings App; Onboarding Controls Review; Operational Resilience | Launch risk acceptance; identity-verification supplier |
| Nonprofit | `nonprofit` | Hearthstone Community Trust | Funders, community networks, council and health partners, local suppliers | Regional Food Programme; Volunteer Growth; Community Hubs | Grant priorities; hub shortlist |
| Energy & utilities | `other` | Solway Grid Networks | Energy and permitting regulators, other utilities, equipment suppliers, community councils, landowners | Substation Expansion; Overhead Line Upgrade; Environmental Mitigation | Route option; survey scope |
| Retail & commerce | `other` | Marigold & Finch Retail | Freight and logistics, suppliers, franchisees, till vendors, trading standards | New Market Entry; Distribution Centre Expansion; POS Replacement | Store opening sequence; distribution partner |

**Sensitive-sector data:**
- **Healthcare:** administration only (scheduling, records-system procurement, estates). There is no patient or clinical data.
- **Financial services:** governance and suppliers only. There are no account numbers or customer financial data.

## What was run per industry (automated: `tests/simulation.test.ts`)
Each industry was loaded at **Profile A** (25 stakeholders, 50 relationships, 100 activity records) into its own workspace. Two industries were also loaded at **Profile B** (250 stakeholders, 1,000 relationships, 2,000 activity records): construction and consulting, the two with the richest complications.

For every industry:
1. **Register counts.** The API's stakeholder, organisation, initiative, decision and commitment counts match direct SQL.
2. **Command Center truth:**
   - `signalCounts` (overdue, due soon, unassigned, delayed, cooling) match SQL computed independently;
   - listed items = min(true count, 40) per kind.
3. **Same code path.** The only differences between workspaces are the template settings and the data.

**Result: 10 of 10 industries pass.** No industry needed a code change or a special case.

## Industry-specific findings
| Finding | Industries | Severity | Status |
|---|---|---|---|
| Energy & utilities and retail have no dedicated template, so they use the generic `other` template: "Initiative" rather than "Project"/"Programme", and general example titles. The `other` template already includes the utility, landowner and regulator organisation types, so no data was lost | Energy, retail | P3 | Open: a template is data-only work (`shared/templates.ts`) and needs no code change |
| Healthcare and financial services share the `enterprise` template. Its vocabulary fits both | Healthcare, financial services | — | Acceptable |
| Permit- and regulator-heavy industries (construction, energy, government) carry the most overdue commitments to regulators. Before Phase 7, the Command Center listed **none** of them at Profile D (top-200 cut), because older and team-wide items crowded them out | Construction, energy, government | **P1** | **Fixed:** per-kind caps plus true counts (see `workflow-results.md`) |
| Consulting relies on "sponsor left" and reassignment. Commitments of departed owners were not flagged | Consulting (and all) | P1 | **Fixed:** departed owners count as "unassigned" with the reason "Owner left the workspace" |
| Meeting-note extraction for each industry's typical meeting | All 10 | — | See `ai-evaluation.md`: one meeting per industry, 100% decision and obligation recall after the extraction fixes |

## Running a single industry yourself
```bash
cd app
npm run sim -- --profile B --industry government
PGLITE_DIR=.data/sim npm run dev   # sign in with an email from .data/sim/manifest-B.json
```

The password `simulation-2026` is a test-only credential for local simulation data (see `data-generation.md`).
