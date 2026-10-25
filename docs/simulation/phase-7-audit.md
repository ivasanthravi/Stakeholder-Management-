# Phase 7 Audit: What Exists, What Doesn't, Simulation Constraints

**Date:** 2026-10-25.

**Method:**
- The repository, the Phase 0–6 documents, the schema, the permission matrix and the RLS migrations were re-read.
- Every capability the simulation relies on was **exercised**, not assumed:
  - the generator writes through the product's own auth and RLS layers;
  - the validation suite calls the HTTP API.

## Stack and environment (verified)
| Area | Facts |
|---|---|
| **Application** | React 19 + Vite 8 SPA; Hono API; Drizzle; Better Auth; TanStack Query; Motion 14; Cytoscape 3.34 |
| **Databases** | PGlite (dev/tests) and real PostgreSQL 18.4 (embedded-postgres) for scale runs |
| **Tenancy** | RLS on 36 of 41 tables via `withTenant` (`SET LOCAL ROLE app_user`); same-tenant composite foreign keys. Of the 5 tables without RLS, four grant the tenant role nothing; `user` grants read access to `id, name, email, image` only. Asserted in `isolation.test.ts` |
| **Browser automation** | Playwright 1.64 + Chrome; the in-app browser pane |
| **Skills and MCPs** | Same as Phase 6 (`docs/excellence/environment-audit.md`). Motion+ (MotionScore) still not authenticated; `morluto/rea` not installed |
| **External services** | None configured: no billing sandbox, Anthropic key, Postmark token or hosting (Phase 5) |
| **Machine** | Apple M4, 10 cores, 16 GB. API, database and load generator share it |

## Domain model vs the simulation's needs
| Need | Supported? | How / gap |
|---|---|---|
| Organisations, departments | ✓ | `organization` with `parent_id` (departments are child organisations of type `department`) |
| Teams of users | ✗ **Gap G3** | Workspaces have memberships and roles only; no user teams. Simulated "teams" are departments of stakeholders |
| Stakeholder changes organisation | ✓ | `stakeholder_organization` with `valid_from` / `valid_to`; ending keeps history |
| Multiple organisations | ✓ | Several affiliations, one primary |
| Initiatives (paused) | ✓ | Status `planned / active / on_hold / completed` |
| Relationships, inactive relationships | ✓ (archive) / ✗ end dates | Ending a relationship = archive + history entry. **Gap G2:** `relationship.valid_from` / `valid_to` exist in the schema but no API or screen reads or writes them |
| Duplicate relationship attempts | ✓ | Unique active index + mirror and allied/opposed guards in the API (tested) |
| Engagements, participants, attendance | ✓ | Kinds: meeting, call, email, workshop, consultation, site visit, note, other |
| Decisions: pending, rejected, deferred, reopened | ✓ | `proposed / under_review / approved / rejected / deferred`. Reopening = back to `under_review` (`decided_at` cleared) |
| Decision blocked by missing information | ✗ **Gap G1b** | No "blocked" state; expressed through a linked overdue commitment (text) or as `under_review` |
| Decision participants | ✓ | Roles: approver, consulted, informed, affected |
| Commitments: open, completed, overdue, reassigned, cancelled, reopened | ✓ | Statuses plus owner change; reopen clears `completed_at` |
| Commitment linked to a decision | ✗ **Gap G1** | A commitment links to a stakeholder, initiative and source engagement, not a decision. "An overdue commitment affects a pending decision" can only be recorded in text |
| Duplicate stakeholders | ✓ data / ✗ detection | No duplicate warning or merge (**finding F-DUP**) |
| Audit and history | ✓ | `activity_event` (user-facing) and `audit_event` (security). Simulated history uses the product's own verbs |
| Archive with history retained | ✓ | Archived organisations' decided decisions stay readable (tested) |

## Proposed safe extensions (documented, not implemented)
| Gap | Proposal | Why it's safe |
|---|---|---|
| G1 | `commitment.decision_id uuid null` with a same-tenant foreign key; decision panel lists "Depends on"; a Command Center rule "decision at risk: dependent commitment overdue" | Additive (expand-only) migration; nullable; no change to existing rows |
| G1b | Do **not** add a "blocked" status. Derive "blocked" from G1 (pending decision + open dependent commitment) | Avoids a status nobody maintains |
| G2 | Either expose relationship end dates (timeline of relationships) or drop the unused columns in a later contract migration | Today they're dormant: no data is written to them |
| G3 | User teams only if customers ask; roles and memberships suffice for the tested scenarios | Not needed for any failing workflow |

## Unverified functionality (and why)
- **Real billing provider:** no sandbox credentials. The simulator only.
- **Claude model engine:** no key. Every AI result here is the rules engine, labelled as such.
- **Email delivery:** log transport only.
- **Human usability:** persona workflows are scripted automation (labelled "simulated workflow findings"), not user research.
- **Production-like infrastructure:** single machine, single API process.

## Simulation constraints
- **Throughput ceiling:** performance numbers come from one machine running API, database and load generator together, so they are a relative baseline, not capacity. The API is one Node process (about 110–135% CPU at saturation).
- **Profile E** is 50 workspaces of 200 people. Load runs drive 10 of the tenants concurrently.
- **Dates** are relative to the anchor (today) unless `--anchor` is given. Tests that compare against "today" use the database's `current_date`.
- **Generation bias:** the generator only produces states the API allows. It does not test corrupt data (that is `db:check`'s job).
