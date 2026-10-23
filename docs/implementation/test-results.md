# Test Results (Phase 1)

Run on 2026-10-23 on macOS (Apple silicon), Node 24, headless Google Chrome. Every result below was produced by actually running the command. Nothing is estimated.

| Suite | Command | Result |
|---|---|---|
| Typecheck (client + server, strict) | `npm run typecheck` | ✅ clean |
| Unit: permissions, validation, domain helpers, briefing | `npx vitest run tests/unit.test.ts` | ✅ 10 / 10 |
| Integration: auth smoke | `tests/smoke.test.ts` | ✅ 1 / 1 |
| Integration: **tenant isolation & authorization** (release-blocking) | `tests/tenancy.test.ts` | ✅ 18 / 18 |
| Integration: CRUD workflows, history, idempotency, concurrency | `tests/workflow.test.ts` | ✅ 15 / 15 |
| **All Vitest** | `npm test` | ✅ **44 / 44** |
| E2E (Playwright, real UI, isolated stack and fresh DB) | `npm run test:e2e` | ✅ **6 / 6** |
| Accessibility + console + overflow sweep, 22 desktop and 22 mobile views | `node audit/phase1-qa.mjs` | ✅ **44 / 44 clean** (axe 4.10, WCAG 2.0–2.2 A/AA) |

Vitest runs each file against a fresh in-memory PostgreSQL (PGlite) with the real migrations, RLS policies and Better Auth. Sign-up uses the emailed verification link from the dev outbox; nothing is mocked.

## Release-blocking tenant-isolation tests (`tests/tenancy.test.ts`)

| Requirement | Test |
|---|---|
| Tenant A cannot access Tenant B data | B gets 404 for A's workspace on 8 endpoints (root, lists, record, dashboard, graph, members, search). B can't read A's stakeholder, org or initiative by id through B's own workspace. B's lists, search, graph and lookups contain none of A's data |
| Tenant A cannot modify Tenant B records | B's update, archive and add-to-initiative calls on A's ids return 404. Linking B's records to A's org, stakeholder or user id is rejected (same-tenant foreign keys). A's record is unchanged. A raw `UPDATE … WHERE workspace_id = A` run inside B's RLS context changes 0 rows |
| Unauthorized users can't access settings | Viewer and contributor get 403 on settings, invitations and audit; owner gets 200 |
| Removed members lose access | A removed manager gets 404 on their next request and the workspace disappears from `/api/me` |
| Role restrictions enforced server-side | Viewer can't create, update or archive. Contributor can create stakeholders and propose decisions, but can't create initiatives, archive or approve. Nobody can grant above their own role. The last owner can't be demoted or removed |
| Record-level restriction | A restricted stakeholder is hidden from contributor and viewer in record, list, search, graph and activity history. An access-list grant restores access for that user only |
| Invitations | Only the invited address can accept, and only once. Unverified users can't sign in |
| Audit | Workspace created, member invited/joined/removed, restriction and access changes are all recorded |

## E2E (`e2e/core-flow.spec.ts`)
1. Sign up → open the emailed verification link → signed in.
2. Create a workspace.
3. Create an organization (`C O`).
4–6. Create an initiative (`C I`), then a stakeholder with its organization association and initiative membership (`C P`). The profile shows both.
7. *Adding to an initiative from the initiative page* was verified by the screen agent's scripted run (`scratch/rg-interact.mjs`), not by this spec. In this spec, initiative membership is set at stakeholder creation.
8. Log an engagement from the profile (`L`) with the participant prefilled.
9. Record a decision with the stakeholder as approver (`C D`).
10. Create a commitment from the profile and complete it with the checkbox.
11. Dashboard shows 1 stakeholder, the engagement, the decision and the initiative.
12. The map shows the authorized stakeholder (canvas count and list view).
13. **Second tenant:** a new account can't open Tenant A's stakeholder URL (not found), search returns nothing, and `/api/me` lists only its own workspace.

## Bugs found by these tests and fixed
- **Partial updates wiped data.** PATCH bodies parsed with `.partial()` schemas re-applied create defaults: they cleared descriptions, unlinked decision stakeholders, flipped commitment direction and dropped engagement participants. Fixed at the API boundary (`patchBody` applies only keys the client sent), with regression tests.
- **Restricted-record leak.** The activity feed returned a restricted person's history. Decision counts also included restricted people. Both fixed, and the activity case is tested.
- **Public pages redirected.** An anonymous `/api/me` 401 sent sign-up, reset and invitation pages to sign-in. Fixed.
- **Email normalisation.** Pasted emails with spaces failed validation. Fixed.
- **Upsert with empty set.** Adding someone to an initiative without a role returned 500. Fixed.

## Performance (production client build; API on PGlite)

| Measure | Result |
|---|---|
| Initial JS (gzip) | ≈255 kB (`index` 113, shared `schemas` 130, Home 12). Routes split; map chunk 267 kB loaded on demand |
| API median, 184-person sample | dashboard 68 ms · stakeholder page (100) 37 ms · graph 17 ms · profile 11 ms · search 7 ms |
| Frames at 1× CPU | 60 fps in 25 / 25 scenarios. The only frames over budget are the map's lazy load and an fcose re-layout (79 ms) |
| Frames at 4× CPU | ≤3 % dropped in 21 / 25 scenarios. Table wheel scroll drops 26.5 % (open, carried over from Phase 0). Map arrow traversal 7.5 %. First visit to the directory 10 %. fcose re-layout blocks for 218 ms |

Raw data: `docs/implementation/perf-results.json`, `docs/implementation/screenshots/qa-results.json`.

## Not covered by automated tests
- **Load, concurrency and soak** testing on real Postgres.
- **Manual screen-reader testing:** axe alone is not sufficient.
- **Cross-browser:** Chrome only. Safari and Firefox were not run.
- **Session expiry in the UI:** the server-side lifetime is configured, and the client redirects with `?expired=1` on a 401, but no test fast-forwards a real expiry.
- **Email delivery:** there is no transport.
