# Phase 1 Report: From Prototype to Production Foundation

Date: 2026-10-23 · Code: `app/` · Related: [audit](phase-1-audit.md) · [decisions](implementation-decisions.md) · [tests](test-results.md) · [visual QA](visual-qa.md) · [limitations](known-limitations.md) · [API](../architecture/api.md)

**Summary.** Meridian is now a real multi-tenant application: real sign-up, email verification and sessions; PostgreSQL with row-level security; server-enforced roles; and every screen reading and writing authorised data.
- **Tests:** 44 / 44 integration and unit tests (18 of them release-blocking tenant-isolation tests), 6 / 6 browser end-to-end tests, and 44 / 44 views clean in the accessibility sweep.
- **Not ready for public deployment:** there is no email transport, it has not run against hosted Postgres, nothing is deployed, and there has been no independent security review.

## 1. What was built

| Milestone | Delivered |
|---|---|
| **M1 Foundation** | Hono API alongside the existing Vite client (ADR-001). Drizzle schema with 22 tables and versioned migrations. Better Auth (sign-up, verification, sign-in/out, reset, 7-day sessions). Workspaces, memberships, invitations (hashed single-use tokens, 7-day expiry), 5 roles with a single permission matrix. Membership verified per request. Postgres RLS on every tenant table, same-tenant foreign keys, restricted records |
| **M2 Core records** | Stakeholders: create/edit/archive/restore, search, filter, sort, server pagination, organization associations with history, initiatives, tags, notes, custom-field storage, restriction. Organizations (configurable types). Initiatives (status, owner, membership). Relationships (person and organization endpoints, direction, strength, duplicate and contradiction guards, inferred vs confirmed) |
| **M3 Workflows** | Engagements (8 kinds, participants, timeline, notes → manual commitment and decision capture). Decision register (Proposed / Under review / Approved / Rejected / Deferred, outcome, stakeholders by role). Commitments (owner, counterparty, direction, due, complete/reopen, overdue). Activity history and a separate append-only audit trail |
| **M4 Intelligence** | Command Center from real queries: rules with evidence, horizon, decisions in progress, initiative coverage, stance mix, recent engagements. The map is fed by an authorised `/graph`. The profile is one `/overview` round trip with a rule-assembled cited briefing |
| **M5 Quality** | Optimistic concurrency (versions, 409 with the current row), idempotent creates, offline banner, expired-session redirect, skeletons and empty/error states everywhere, route code splitting, query rewrites (graph 424 → 17 ms), accessibility sweep, two or more visual passes per flagship screen |

Three screen groups were built in parallel by sub-agents against written briefs and existing patterns: Organizations/Initiatives, Engagements/Decisions/Commitments, and Settings. Each was reviewed here by screenshot and type-checked; the server-side bugs they reported were fixed at the source (see test-results).

## 2. Production readiness checklist

| Requirement | Status | Evidence |
|---|---|---|
| Authentication works | ✅ local | E2E steps 1–2; `tests/smoke`. Email is delivered only to the dev outbox ❗ |
| Tenant isolation verified | ✅ | `tests/tenancy.test.ts` (18 tests) and the E2E second-tenant test |
| Permissions enforced server-side | ✅ | Role tests return 403/404 regardless of the UI |
| Migrations run | ✅ PGlite | Run on every test and on start. Not yet run on a hosted Postgres ❗ |
| Stakeholder / Organization / Initiative CRUD | ✅ | `tests/workflow`, E2E, agent scripts |
| Relationships persist | ✅ | Workflow test, profile drawer |
| Engagement history persists | ✅ | Workflow test, E2E step 8 |
| Decisions persist | ✅ | Workflow test, E2E step 9 |
| Commitments persist | ✅ | Workflow test, E2E step 10 |
| Dashboard uses real data | ✅ | E2E step 11; no fabricated values remain |
| Graph uses authorised data | ✅ | Restricted-record graph test, E2E step 12 |
| Audit events recorded | ✅ | Audit test, Settings › Audit log |
| Error states handled | ✅ | 401/403/404/409/422/offline/5xx retry, all designed |
| Critical tests pass | ✅ | 44 + 6 |
| No secrets committed | ✅ | `.env` gitignored; `.env.example` only; dev-only fallback secret refused in production. (Not a git repository yet) |
| No critical accessibility regressions | ✅ automated | axe clean on 44 views; no manual screen-reader pass ❗ |
| No major visual regressions | ✅ | [visual-qa.md](visual-qa.md); one deliberate removal (fixture AI suggestions) |
| No known critical security vulnerabilities | ✅ none known | Two leaks found and fixed in this phase. **Independent review still required** ❗ |

## 3. Security findings (this phase)

**Fixed**

| Severity | Finding |
|---|---|
| High | Partial updates could silently destroy data (decision stakeholders, commitment direction, engagement participants, descriptions) |
| Medium | A restricted stakeholder's history was readable through `/activity` |
| Low | Decision stakeholder counts included restricted people |
| Low | Public pages were redirected to sign-in, which broke invitation and reset flows |

**Design protections**
- Workspace ids from the browser are never trusted: membership is checked per request, and non-members get 404.
- RLS backs every tenant query, and same-tenant foreign keys block cross-tenant references even though FK checks bypass RLS.
- Invitation tokens are stored hashed and are single-use and email-bound.
- Password reset gives no account-enumeration signal.
- The audit table is append-only for the app role, and diffs omit notes and secrets.

**Open**
- No API rate limiting beyond the auth endpoints.
- No CSP or security headers configured.
- No dependency vulnerability scan (`npm audit` not run in CI; there is no CI).
- Session fixation and cookie flags are Better Auth defaults and have not been reviewed independently.

## 4. How to run
See [`app/README.md`](../../app/README.md):

```bash
npm install && npm run db:seed && npm run dev
```

Sign in as `rhea@sample.meridian.test` / `meridian-sample-2026` (sample data, development only). Tests: `npm test`, `npm run test:e2e`, `node audit/phase1-qa.mjs`.

## 5. Recommended Phase 2 roadmap

### A. Finish the production foundation (before any customer data)
1. **Email transport:** SMTP or provider API, templates, bounce handling.
2. **Hosted Postgres:** run migrations and the full suite against it, plus a load test (e.g. 50k stakeholders and 20 concurrent users).
3. **Deployment:** containerised single service, TLS, backups with PITR, error tracking, uptime checks, security headers and CSP.
4. **CI:** typecheck, Vitest, Playwright, axe sweep, `npm audit`, bundle-size budget.
5. **Independent security review** and fixes.
6. **SSO (OIDC/SAML) and MFA**, the first enterprise ask.
7. **CSV import** for stakeholders and organizations, with duplicate detection. This is the activation path for teams moving off spreadsheets.

### B. Product differentiation
1. **Real meeting intelligence:** LLM extraction into the existing review pattern (proposals only, accepted by a person, citations validated).
2. **LLM briefings** under the existing citation contract, retrieving only what the viewer is authorised to see.
3. **Map:** path finder ("how are we connected to X?"), an "our connections" lens, and layout in a Web Worker.
4. **"Since you last looked"** diffs on Home and profiles.
5. **Saved views and export**; apply workspace vocabulary to labels.
6. **Access-list UI** for restricted records; custom field definitions.

### C. Quality carry-over
- Table wheel-scroll smoothness at 4× CPU.
- Bundle size (Zod mini on the client, or lazy-loading the auth client).
- Manual screen-reader pass.
- Safari and Firefox runs.
- Dark mode verification or removal.
