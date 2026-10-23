# Product Strategy

> **Every relationship. Every decision. One intelligent workspace.**

Working name in these docs: **Meridian** (placeholder — not cleared for trademark).

Status: Foundation draft · 2026-10-22 · Companion docs: [competitive intelligence](../research/competitive-intelligence.md), [domain model](../architecture/domain-model.md), [information architecture](information-architecture.md), [AI layer](../architecture/ai-intelligence-layer.md).

---

## 1. Product vision

Organizations that depend on many people outside their direct control — regulators, sponsors, communities, clients, boards, partners, unions, funders — make their most consequential moves on *relationships and agreements* that live in inboxes, meeting notes, spreadsheets and individual memory. When a person leaves, a meeting goes unrecorded, or a promise slips, the organization loses context it cannot rebuild.

Meridian is the **system of record for stakeholder context**: who matters, how they are connected, what was discussed, what was decided, what was promised, and what needs attention next. Its intelligence layer reads that record and surfaces evidence-backed signals. It never invents insight.

**Three-year vision:** a team lead opens Meridian on Monday and, in under two minutes, knows which relationships are cooling, which commitments are at risk, which approvals block their initiative, and who to talk to first, with a link to the evidence behind each item.

### What Meridian is not

| Not | Why the distinction matters |
|---|---|
| A sales CRM | No pipeline, deal stages or revenue forecasting. Stakeholders are not leads; engagement is not selling. |
| A project manager | Tasks exist only as follow-through on commitments and decisions. No Gantt charts, sprints or resourcing. |
| A survey or consultation-response tool | We record engagement outcomes; we do not run public consultations at volume (integrate instead). |
| A chatbot over your data | AI is embedded in workflows (briefings, extraction, signals) and always cites records. |

---

## 2. Target market segments

We start horizontal at the core and vertical at the edges: one domain model, configured by **industry templates**.

| Segment | Stakeholder reality | Why they buy | Beachhead priority |
|---|---|---|---|
| **Consulting & professional services** | Client stakeholders across many engagements; partner relationships are the firm's asset | Account continuity, partner handover, executive briefings | **P1** |
| **Infrastructure & construction** | Landowners, councils, regulators, communities, utilities; consent and permitting critical | Commitment registers (often contractual/regulatory), audit trail | **P1** |
| **Enterprise transformation / PMO** | Internal sponsors, business units, change networks | Sponsor alignment, decision logs, approval tracking | **P1** |
| **Government & public sector** | Ministers, agencies, citizens, industry bodies | Accountability, FOI-ready history, data residency | P2 (procurement-heavy; needs certifications) |
| **Software & technology** | Enterprise customers' buying committees, partners, design partners | Champion mapping, exec-sponsor programmes | P2 (overlaps CRM; position as complement) |
| **Nonprofits & NGOs** | Funders, partners, beneficiaries, government | Funder relationships, grant commitments | P2 (price-sensitive; nonprofit tier) |
| **Healthcare** | Clinicians, boards, payers, patient groups | Change programmes, governance | P3 (PHI risk; keep PHI out of scope) |
| **Education & research** | Funders, industry partners, faculty, government | Partnership commitments, grant obligations | P3 |

**Beachhead:** mid-market and enterprise teams (50–5,000 employees) running **multi-stakeholder initiatives with formal commitments**. Infrastructure consultancies and enterprise PMOs are the sharpest wedge: they already keep commitment and stakeholder registers in Excel, they feel audit pain, and their budgets cover a $20–60k ACV.

---

## 3. Ideal customer profiles

**ICP-1: Infrastructure project delivery team**
- 5–40 people engaging 200–3,000 external stakeholders on one or more major projects.
- Current tooling: Excel registers, SharePoint, Outlook, sometimes a legacy consultation database.
- Trigger: a new major project, a regulator audit finding, or a missed commitment that became a public issue.
- Buyer: Head of Stakeholder & Community Engagement. Economic sponsor: Project Director.

**ICP-2: Consulting firm account leadership**
- 20–500 consultants, each client account touching 30–300 client stakeholders.
- Current tooling: Salesforce/HubSpot for pipeline (poorly fitted to delivery relationships), plus personal notes.
- Trigger: a key partner leaving, a client escalation, or a new account-planning methodology.
- Buyer: COO / Head of Client Excellence.

**ICP-3: Enterprise transformation office**
- A PMO running a 1–3 year programme that touches 10+ business units.
- Current tooling: Jira/Asana for delivery, PowerPoint for stakeholder maps, Excel RAID logs.
- Trigger: a programme reset or a steering committee demanding visibility on decisions and sponsor alignment.
- Buyer: Transformation Director / Chief of Staff.

**Disqualifiers:** solo users; pure sales teams; organizations wanting mass consultation-response analysis as their primary job; teams unwilling to record engagement at all. Meridian lowers capture effort but cannot remove it.

---

## 4. Personas

### Primary

**Priya, Stakeholder Engagement Lead** (infrastructure / public programmes)
- Owns the stakeholder register and commitment log. Prepares for community meetings and regulator sessions.
- Pain: records scattered across 6 spreadsheets; can't prove a commitment was closed; spends Fridays compiling reports.
- Success: one register, meeting notes become commitments in minutes, a report she trusts in one click.

**Marcus, Engagement or Account Director** (consulting / enterprise)
- Manages relationships with 40–80 senior client stakeholders across initiatives.
- Pain: walks into meetings without context; doesn't know a colleague met the same CFO last week.
- Success: a 60-second briefing before every meeting; visibility of who else on the team holds the relationship.

**Aisha, Programme or PMO Lead** (transformation)
- Runs the decision log and approval flow; reports to a steering committee.
- Pain: decisions get re-litigated; approvals stall silently; no link from decision to who agreed.
- Success: decisions with approvers, rationale and evidence; outstanding approvals visible at a glance.

### Secondary

| Persona | Need | Primary surfaces |
|---|---|---|
| **Executive sponsor** (reads, rarely writes) | "What do I need to know or do?" | Overview, initiative summaries, mobile briefings |
| **Contributor** (engineer, field officer, consultant) | Log an interaction in < 30 s | Quick capture, email/calendar integration |
| **Workspace admin / IT** | SSO, permissions, data residency, audit | Admin console |
| **Compliance / legal reviewer** | Evidence of due process | Audit log, exports, read-only reviewer role |

---

## 5. Jobs to be done

| # | When… | I want to… | So I can… |
|---|---|---|---|
| J1 | I'm about to meet someone | see their context, history, open items and connections | walk in prepared and not repeat mistakes |
| J2 | a meeting ends | turn notes into decisions, commitments and follow-ups with owners | make sure nothing said is lost |
| J3 | I start or rescope an initiative | identify who matters, their influence and stance, and the gaps | plan engagement deliberately |
| J4 | a decision needs agreement | know who must approve, chase the right people, record the outcome | move forward with legitimacy |
| J5 | I review my week | see what's overdue, cooling or at risk | prioritise my effort |
| J6 | leadership or regulators ask | produce an accurate, evidence-linked summary | answer with confidence, quickly |
| J7 | a colleague leaves or hands over | transfer relationship context intact | protect continuity |
| J8 | an issue escalates | trace who said what, when, and what we committed | respond credibly and defend our record |

---

## 6. Core problems

1. **Fragmented context.** Relationship knowledge sits in email, calendars, notes, spreadsheets and heads, so no shared picture exists.
2. **Lost commitments.** Promises made in meetings are rarely recorded as obligations with owners and due dates. This is the largest source of reputational damage in public-facing sectors.
3. **Invisible decisions.** Decision rationale and approvals go unrecorded, so decisions get re-litigated and nobody can account for them.
4. **Static maps.** Influence/interest grids are drawn once in PowerPoint and never updated, and they show no change over time.
5. **Capture burden.** Existing stakeholder tools fail because recording takes longer than the value it returns.
6. **Reporting toil.** Status reports are compiled by hand, are already stale when sent, and cite no evidence.

---

## 7. Differentiation

Our edge comes from the **shape of the record** and **how trustworthy the intelligence is**, not from feature breadth.

| Pillar | What it means | Why competitors don't do it |
|---|---|---|
| **1. Decisions, approvals & commitments are first-class** | Not notes or tasks: typed objects with lifecycle, parties, evidence, and links to the engagements where they arose. | CRMs model deals; PM tools model tasks; stakeholder tools model registers. Few model *obligations between parties*. |
| **2. Evidence-linked intelligence** | Every AI statement cites source records; facts and inferences are visually distinct; nothing consequential is written without human confirmation. | "AI summaries" elsewhere are generic and uncited, so regulated buyers can't trust them. |
| **3. Temporal truth** | Relationships, roles, influence and stance are time-bounded. "Show me the map as of March." "What changed since the last steering committee?" | Most tools overwrite fields, so history is lost. |
| **4. Graph as a lens, not a destination** | The Relationship Map is a focused, filterable view into the same records, alongside excellent tables. It is never a hairball of 3,000 nodes. | Kumu-style tools are graph-first and hard to operate daily; CRMs have no graph. |
| **5. Capture at the speed of thought** | Keyboard-first quick capture, meeting-note extraction, calendar/email ingestion with review queues. | Stakeholder tools are form-heavy and slow. |
| **6. Universal core, industry templates** | One schema with configurable vocabularies, fields, classifications, and report packs per industry. | Vertical tools are rigid; horizontal tools need heavy configuration. |
| **7. Governance built in** | Record-level permissions, sensitive-stakeholder handling, full audit trail, data residency, AI usage controls. | Bolt-on in most modern tools; absent in spreadsheets. |

---

## 8. Business model hypotheses

| Hypothesis | Initial assumption | How we test it |
|---|---|---|
| **H1. Seat-based pricing with role tiers** | Full seats (create/edit) $40–70/user/mo; Contributor seats (capture-only) at ~25%; Viewers free. | Pricing-page experiments; 10 design-partner interviews on willingness to pay. |
| **H2. Plans** | **Team** (self-serve, ≤25 seats), **Business** (SSO, templates, advanced permissions), **Enterprise** (residency, audit export, SCIM, custom retention, AI controls, SLA). | Proportion of inbound requiring Enterprise features. |
| **H3. AI included with fair-use limits** | Core AI (briefings, extraction) included; high-volume document ingestion metered. | Model-cost per active seat stays < 12% of seat revenue. |
| **H4. Industry templates drive conversion** | Template-started workspaces activate 2× faster than blank ones. | A/B test of onboarding paths. |
| **H5. Land-and-expand by initiative** | Land on one project/initiative, expand across the portfolio. | Net revenue retention > 120% by month 18. |
| **H6. Nonprofit/public discount** | 30–50% discount without devaluing the core. | Nonprofit share of logos vs. revenue. |

Services: paid migration from spreadsheets and implementation for Enterprise. Revenue target: < 15% of total from services.

---

## 9. Success metrics

**North-star metric:** **Weekly Evidenced Actions (WEA)**, the number of decisions, commitments, approvals and engagements recorded *and linked to at least one stakeholder* per active workspace per week. This measures that the record is alive and connected, not just visited.

| Layer | Metric | MVP target |
|---|---|---|
| Activation | Workspace reaches *≥20 stakeholders, ≥1 initiative, ≥3 engagements* within 7 days | 40% of new workspaces |
| Capture | Median time to log an engagement (quick capture) | < 30 s |
| Capture | % of meeting-extracted items accepted (with or without edit) | > 60% |
| Value | Weekly active users / seats | > 55% |
| Value | Commitments closed on or before due date | Trend ↑ per workspace |
| Trust | AI insights with ≥1 valid citation | 100% (hard requirement) |
| Trust | AI suggestion rejection rate flagged "wrong/unsupported" | < 10% |
| Retention | Logo retention at 12 months | > 85% |
| Performance | p75 route transition | < 150 ms |
| Performance | Command palette open-to-results | < 50 ms |

---

## 10. MVP scope

The MVP proves one loop: **capture → structure → see what needs attention → report with evidence.**

### In scope

| Area | MVP capability |
|---|---|
| Workspace | Multi-tenant workspaces, invites, roles (Owner, Admin, Member, Contributor, Viewer), Google/Microsoft SSO (OIDC) |
| Templates | 4 industry templates: Infrastructure, Consulting, Enterprise Transformation, General |
| Stakeholders | People and Organizations, multi-affiliation over time, groups/segments, influence/interest/stance classifications with history, custom fields |
| Initiatives | Create, link stakeholders with initiative-specific roles and classifications |
| Engagements | Meetings, calls, emails, notes, site visits; participants; quick capture |
| Meeting intelligence | Paste/upload notes or transcripts → AI extracts proposed decisions, commitments, actions → review queue → accept |
| Decisions & approvals | Decision records, required approvers, approval states, outcome, rationale |
| Commitments | Commitment register with owner, counterparty, due date, status, evidence, source engagement |
| Relationship Map | Focused graph per initiative or stakeholder (≤ 300 visible nodes), filters, side panel, accessible list alternative |
| Overview | Personal "Needs attention" queue: overdue commitments, pending approvals, cooling relationships, unreviewed AI suggestions |
| Intelligence | Stakeholder briefing, initiative summary with citations, engagement signals |
| Search | Global search + command palette (keyboard-first) |
| Reports | Initiative report (web + PDF export), commitment register export (CSV/XLSX) |
| Governance | Audit log, record-level visibility (restricted stakeholders), AI on/off per workspace |
| Import | CSV/XLSX import with column mapping and duplicate detection |

### Explicit exclusions (MVP)

| Excluded | Rationale | Revisit |
|---|---|---|
| Native email/calendar sync | Heavy integration and security review; CSV + forwarding address covers the MVP | v1.1 (Google, Microsoft 365) |
| Mobile native apps | Responsive web covers field capture initially | v2 |
| Public consultation / mass submission analysis | Different job, different buyer | Partner/integrate |
| Custom objects (user-defined entity types) | Custom fields + templates cover 80% | v2, once demand patterns are clear |
| Workflow automation builder | Risk of becoming Zapier; fixed rules first | v1.5 |
| Geospatial maps (parcels, sites) | Valuable for infrastructure but a large build | v1.5, infrastructure template |
| Sentiment scoring of individuals | Ethical and accuracy risk; we record *stance* as a human judgement | Possibly never |
| Autonomous agent sending communications | Violates the human-confirmation safeguard | Never without explicit approval |
| On-prem deployment | Ops burden | Enterprise single-tenant cloud in v2 |
| Real-time co-editing of rich documents | Not core; notes are single-author with comments | v2 |

### MVP risks

1. **Capture burden.** Mitigated by quick capture, meeting extraction, imports, and later integrations.
2. **AI trust.** Mitigated by citations, a review queue, and the fact/inference distinction.
3. **Template rigidity across industries.** Mitigated by a vocabulary layer, so labels change without schema forks.
4. **Graph hairball.** Mitigated by a focused-by-default map and progressive expansion.
