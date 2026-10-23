# Information Architecture

Status: Foundation draft · 2026-10-22

## 1. Critique of the proposed navigation

Proposed: Overview · Stakeholders · Organizations · Relationship Map · Initiatives · Engagements · Decisions · Commitments · Intelligence · Reports (10 items).

| Item | Verdict | Reasoning |
|---|---|---|
| Overview | **Keep → rename "Home"** | The personal starting point. "Home" says "my stuff"; "Overview" reads like an analytics dashboard, which we don't want it to become. |
| Stakeholders | **Keep (merge Organizations in)** | People and organizations are both *stakeholders*. One section with a **People / Organizations** toggle avoids a near-duplicate nav item. Attio and Kumu both treat them as peers within one record space. |
| Organizations | **Merge into Stakeholders** | See above. Organizations stay a first-class *object*; they don't need a first-class *nav slot*. |
| Relationship Map | **Demote to a view** | The map is a lens on stakeholders, scoped to an initiative or a person. As a top-level destination it invites an unscoped, unreadable whole-workspace graph. It becomes a view mode (Table · Map · Grid) in Stakeholders and Initiatives, reachable with `G M` and from the command palette. |
| Initiatives | **Keep** | The primary unit of scope for most customers. Vocabulary varies by template (Project, Programme, Account, Campaign, Grant). |
| Engagements | **Keep → rename "Activity"?** No: **keep "Engagements"** | "Engagement" is the standard term across our sectors. Holds meetings, calls, emails, notes. |
| Decisions | **Merge with Commitments into "Follow-through"?** Rejected | They have different lifecycles and owners. Decisions **include approvals**, so no separate Approvals item is needed. |
| Commitments | **Keep** | The highest-value register for regulated sectors. Tasks/actions live inside it as a filter ("Actions": internal follow-ups without a counterparty). |
| Intelligence | **Remove as a section** | AI belongs where the work happens: briefings on profiles, signals in Home, extraction in Engagements, summaries in Reports, Q&A in the command palette (`Ask`). A separate "AI tab" is the decorative-chatbot pattern we reject. A **Review queue** for AI suggestions lives in Home. |
| Reports | **Keep** | Saved reports, exports, scheduled summaries. |

**Result: 7 primary items** (down from 10), plus utilities.

## 2. Final navigation

```
┌──────────────────────────────┐
│ ◇ Workspace ▾        ⌘K  🔔  │  workspace switcher · command palette · inbox
├──────────────────────────────┤
│ Home                    G H  │  needs attention, my items, review queue, recent
│ Stakeholders            G S  │  People | Organizations | Groups  (Table · Map · Grid)
│ Initiatives             G I  │  list → initiative workspace
│ Engagements             G E  │  timeline / table of meetings, calls, notes
│ Decisions               G D  │  decisions + approvals
│ Commitments             G C  │  commitments + actions
│ Reports                 G R  │  saved reports, exports
├──────────────────────────────┤
│ FAVORITES                    │  pinned records & saved views (user-defined)
│  ★ Northern Rail Link        │
│  ★ Overdue — my team         │
├──────────────────────────────┤
│ Settings · Help              │
└──────────────────────────────┘
```

Section labels for Stakeholders, Initiatives and Engagements follow the template vocabulary. The *keys* (G S, G I) never change.

## 3. Site map

```
Home
  ├─ Needs attention (default)
  ├─ My commitments / My approvals
  ├─ Review queue (AI suggestions, import conflicts)
  └─ Recently viewed
Stakeholders
  ├─ People ─ [view: Table | Map | Grid(influence×interest)] ─ saved views
  ├─ Organizations ─ [Table | Map]
  ├─ Groups (segments, e.g. "Landowners – Section 3")
  └─ Record page: Person / Organization
        ├─ Overview (briefing, key facts, classifications)
        ├─ Activity (engagement timeline)
        ├─ Relationships (list + mini-map)
        ├─ Initiatives (roles per initiative)
        ├─ Decisions & Commitments
        ├─ Documents
        └─ History (field-level audit)
Initiatives
  ├─ List / board by status
  └─ Initiative workspace
        ├─ Summary (AI summary w/ citations, health signals)
        ├─ Stakeholders [Table | Map | Grid]
        ├─ Engagements
        ├─ Decisions
        ├─ Commitments
        ├─ Risks
        ├─ Documents
        └─ Settings (members, access)
Engagements
  ├─ Timeline / Table / Calendar
  └─ Engagement page (notes, participants, extracted items, attachments)
Decisions
  ├─ Table / Board (by status)
  └─ Decision page (context, options, approvers, outcome, evidence)
Commitments
  ├─ Register (Table) · Board · By counterparty
  └─ Commitment page (terms, owner, counterparty, due, evidence, history)
Reports
  ├─ Initiative report · Commitment register · Engagement log · Stakeholder register
  └─ Saved & scheduled reports
Settings
  ├─ Personal: profile, notifications, keyboard, appearance
  └─ Workspace admin: members & roles, teams, templates & vocabulary,
     fields & classifications, integrations, AI controls, data & retention,
     security (SSO/SCIM), audit log, billing
```

## 4. Global utilities

| Utility | Behaviour |
|---|---|
| **Command palette (⌘K)** | Single entry for navigation, creation, actions on the current selection, and **Ask** (natural-language Q&A with citations). Fuzzy search over records, views, commands and settings. Context-aware: on a stakeholder page, "Log engagement with Jane…" is first. |
| **Global search (/)** | Full results page with type facets, filters, and saved searches. ⌘K handles jump-to; `/` handles find-and-filter. |
| **Quick capture (C)** | Floating composer: type `Met @Jane Doe re #Northern Rail — agreed to share noise survey by Fri`. It parses into an engagement plus a proposed commitment, and asks for confirmation. |
| **Inbox (🔔)** | Notifications: assignments, approval requests, mentions, due-date reminders, AI review items. Supports triage keys (E to archive, S to snooze). |
| **Workspace switcher** | Top-left. Lists workspaces with tenant region badge. ⌘⇧1–9 to switch. |
| **Detail panel** | Right-side peek panel opens any record from any list without leaving context (Space or click). Expand to full page with ⌘↵. |
| **Breadcrumbs** | Initiative → Stakeholder → Engagement; reflect scope, not click history. |

## 5. Object model as the user sees it

| User-facing concept | Underlying entity | Lives in nav |
|---|---|---|
| Person | Stakeholder (kind=person) | Stakeholders |
| Organization | Organization (a stakeholder-capable entity) | Stakeholders |
| Group | Stakeholder Group | Stakeholders |
| Initiative (Project/Programme/Account…) | Initiative | Initiatives |
| Engagement (Meeting/Call/Email/Note/Visit) | Engagement (+ Interaction participants) | Engagements |
| Decision / Approval | Decision, Approval | Decisions |
| Commitment / Action | Commitment, Task | Commitments |
| Risk / Issue | Risk | Initiative workspace (and Home signals) |
| Document | Document | Contextual tabs only |

Risks are deliberately **not** top-level. In our sectors they are almost always initiative-scoped, and RAID tooling already exists elsewhere. They appear in initiative workspaces, on stakeholder profiles, and in Home signals.

## 6. Views & saved views

Every collection (Stakeholders, Engagements, Decisions, Commitments) supports:
- **View modes:** Table (default), Board (status), Map (where relational), Grid (influence × interest; stakeholders only), Timeline (engagements).
- **Filters** composed as chips (`Initiative is Northern Rail` · `Influence ≥ High` · `Last engaged > 60d`).
- **Group by** and **sort**, visible columns, density (comfortable/compact).
- **Saved views**: personal or shared to a team, pinnable to Favorites.
- **URL-addressable state**: every view state is in the URL, so it can be shared.

## 7. Permissions in the IA

| Role | Sees nav | Can create | Admin |
|---|---|---|---|
| Owner / Admin | All | All | Yes |
| Member | All | All records within permitted initiatives | No |
| Contributor | Home, Stakeholders, Engagements, Commitments (own) | Engagements, notes, proposed commitments | No |
| Viewer | All (read-only) | — | No |
| External reviewer (v2) | Reports shared to them | — | No |

Restricted stakeholders (e.g. vulnerable individuals, confidential sources) are hidden from search, maps, AI retrieval and counts for users without access. Aggregates must never reveal their existence.

## 8. Responsive behaviour

- ≥ 1280px: sidebar + content + optional detail panel (three columns).
- 768–1279px: collapsible sidebar; detail panel overlays.
- < 768px: bottom bar with Home · Search · Capture · Inbox; a read-and-capture subset. Maps fall back to the list view by default.
