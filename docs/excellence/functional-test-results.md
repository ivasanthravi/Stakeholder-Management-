# Functional Test Results (Phase 6)

**Method:**
- **Real end-to-end workflows** in Chrome (Playwright) against an isolated stack: its own API and database per run, fresh accounts.
- **Server suites** on PGlite and PostgreSQL 18.4.
- **Mock vs production:**
  - **Billing:** the development simulator is **not** a payment provider. Real provider integration is BLOCKED (Phase 5: no sandbox credentials).
  - **AI:** every AI surface ran on the built-in rules engine. The Claude model engine was never run (no key).

## Workflows (Phase 6 §10)
| # | Workflow | Test | Result |
|---|---|---|---|
| A | Create workspace → add organization → add stakeholder → assign initiative | `core-flow` 1–2 (sign up, verify, create workspace), 3–8 (organization, stakeholder with organization, initiative, engagement) | **Pass** |
| B | Create relationship → inspect graph → open related profile | `excellence.spec` "B: add a relationship on a profile → see it on the map → open the related profile" (**new**) | **Pass**, after fixing E9 (the related name wasn't exposed as a link) and E27 (map count grammar) |
| C | Record engagement → decision → commitment → dashboard updates | `core-flow` 3–8, 9–10, 11 ("dashboard reflects real records"); `journeys` D | **Pass** |
| D | Submit meeting notes → AI extraction → approve → persistence | `ai-flow` "meeting notes to an accepted, cited commitment" | **Pass** (rules engine) |
| E | Search → filter → edit → save → reload → persistence | `excellence.spec` "E: search → filter → open → edit → save → reload" (**new**) | **Pass** |
| F | Invite teammate → assign role → permissions | `commercial-flow` (invitation accepted as a new user), `journeys` B (role change takes effect immediately, then access revoked) | **Pass** |
| G | Sandbox subscription → entitlement changes | `commercial-flow` "owner buys a plan through hosted checkout; access follows the webhook" | **Simulator only: pass.** **Real provider sandbox: UNVERIFIED (blocked)** |

## Additional journeys added or exercised in Phase 6
- **Command Center keeps context** (`excellence.spec`):
  - a commitment nine months overdue appears;
  - its signal expands;
  - the stakeholder opens in a peek without leaving Home;
  - Esc closes it.
  This test **found** E1 (old overdue commitments hidden) and E28.
- **Register toolbars name their counts** (`excellence.spec`).
- **Recovery journeys** (Phase 5, `recovery.spec`), re-run:
  - workspace switching
  - network failure and Retry
  - AI service unavailable
  - expired session
  - sign-out
  - password recovery
  - closed signup

## Server-side regression tests added in Phase 6
- `tests/dashboard.test.ts`: overdue commitments 200 days old raise a signal; the horizon includes old overdue but not commitments beyond 30 days.
- `tests/unit.test.ts`: calendar-day arithmetic at 00:00:01, 07:53, 12:00 and 23:59:59 UTC.

## Security regressions checked
- **Tenant isolation** suite (`isolation.test.ts`, including the RLS backstop and the audit-trail policy) passes on both databases. The map query was restructured in Phase 6, and the isolation and tenancy suites were re-run after the change.
- **Environment guards, invite-only signup, CSRF, session expiry:** `security.test.ts` passes.
- **No new endpoint:** the graph endpoint gained `total` and `limit` fields only (scoped under RLS as before).

## Release gate: final run, 2026-10-24 (local; `./scripts/release-gate.sh` exit 0)
| Step | Result |
|---|---|
| `npm audit` (high/critical) | 0 high or critical; 4 moderate (dev-tool esbuild advisory, accepted in Phase 4) |
| Typecheck | Pass |
| ESLint | 0 errors, 10 warnings |
| Vitest, PGlite | **164/164** (15 files) |
| Vitest, PostgreSQL 18.4 | **164/164** (15 files) |
| AI evaluation + safety/grounding gate | PASS |
| Backup/restore drill | Pass |
| Production build | Pass |
| Playwright E2E | **30/30** |

**The first gate run failed one E2E test.** It asserted the old map wording "1 people", which Phase 6 corrected to "1 person". The assertion was updated, and the gate re-run green from scratch.

**Production bundle** (largest JS chunks, raw / gzip):

| Chunk | Raw | Gzip |
|---|---|---|
| Universe (map, Cytoscape; lazy-loaded) | 955 KB | 260 KB |
| index (app shell) | 493 KB | 146 KB |
| motion | 300 KB | 98 KB |
| pages (marketing, lazy) | 115 KB | 31 KB |
| Settings (lazy) | 99 KB | 26 KB |

All JS: 643 KB gzip.
