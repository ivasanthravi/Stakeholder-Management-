# Production Readiness Audit (Phase 4)

**Date:** 2026-10-24.

**Method:**
- The repository was audited directly: code, schema, tests and scripts.
- Each claim below links to evidence that was **run in this phase**. Earlier phases were not assumed complete. Every capability was re-tested here, either by automated suites (PGlite **and** real PostgreSQL 18.4), E2E journeys in Chrome, scripted drills, or measurements.
- This document gives **no overall readiness percentage**. The verdict comes from the gates in `launch-checklist.md`.

**Verdict: launch is BLOCKED.** The P0 items are listed in `remaining-blockers.md`.

## 1. Feature classification
**Legend:**
- **Verified:** fully implemented and verified.
- **Under-tested:** implemented but insufficiently tested.
- **Partial:** partially implemented.
- **Simulated:** works only against a simulator or fake.
- **Missing.**
- **Broken.**

| Capability | Classification | Evidence / gap |
|---|---|---|
| Sign-up, email verification, sign-in, sign-out, password reset | **Verified** | security.test.ts (reset revokes sessions, unverified users blocked, cookies, rate limit), E2E core-flow / journeys A. Email delivered by the log transport only; **Postmark never exercised with a real token** |
| Workspaces, roles (owner/admin/member/viewer), invitations, member removal | **Verified** | tenancy.test.ts, isolation.test.ts (demotion and removal take effect immediately), E2E journey B |
| Multi-tenant isolation (RLS + app checks + composite FKs) | **Verified** | isolation.test.ts attack matrix on PGlite and PostgreSQL. **0 cross-tenant exposures found** |
| Stakeholder directory, profile, organizations, initiatives | **Verified** | workflow.test.ts, E2E core-flow, axe 98/98, performance at 2,000 stakeholders |
| Engagements, commitments, decisions (with status workflow) | **Verified** | workflow.test.ts, E2E journey D |
| Relationship map (Cytoscape) plus accessible list alternative | **Verified**, with P2 performance issues | a11y-manual (tree alternative), interaction-perf evidence (fcose 245 ms long task on 4× CPU) |
| Search, command palette | **Verified** | security.test.ts (metacharacters), isolation (search), a11y-manual |
| Meeting intelligence (extraction → human review → accept) | **Verified** on the rules engine | extract.test.ts, ai.test.ts, E2E ai-flow, evaluation report |
| Copilot (grounded Q&A, read-only tools) | **Verified** on the rules engine | ai.test.ts, ai-failures.test.ts, eval (0/10 leaks) |
| Briefings and signals | **Verified** on the rules engine | ai.test.ts, eval (100% valid citations) |
| Claude model engine (`AI_ENGINE=anthropic`) | **Under-tested** | Safety verified with scripted engines only. **Never run against the live API.** No accuracy, latency or cost data |
| Entitlements, trials, seat limits, AI allowance | **Verified** | billing.test.ts, commercial.test.ts (concurrent reservation race) |
| Billing via simulator (checkout, webhooks, lifecycle) | **Simulated** | billing.test.ts, E2E commercial-flow |
| Stripe adapter | **Under-tested** (contract only) | provider-flow.test.ts uses the real SDK against a fake API, with Stripe-signed webhooks. **Sandbox BLOCKED** (no keys) |
| Paddle adapter | **Partial** | Server adapter contract-tested. **The Paddle.js checkout page doesn't exist** (P0 if Paddle is chosen) |
| Webhook verification, idempotency, reconciliation | **Verified** | billing.test.ts, provider-flow.test.ts, load test (240-delivery burst, dedupe exact) |
| Email (verification, reset, invitations, digests, billing notices) | **Under-tested** | Templates and retry are tested via the log transport. Postmark adapter never run against Postmark |
| Notifications and digests, one-click unsubscribe | **Verified** | commercial.test.ts, isolation (digests scoped) |
| Data export (JSON) | **Verified** on a single instance | E2E journey I (downloaded and parsed), isolation (exports scoped). **Exports are on local disk: P1 to move to object storage before running multiple instances** |
| Workspace deletion (scheduled, cancellable, purge job) | **Verified** | commercial.test.ts, E2E journey I (schedule and cancel) |
| Account deletion | **Verified** | commercial.test.ts |
| Audit log | **Verified** | workflow / commercial tests |
| Product analytics (first-party, opt-out) | **Verified** | commercial.test.ts |
| Marketing site, pricing, contact form, legal pages | **Verified** (UI) | axe, 320 px reflow. **Legal text is draft and unreviewed** (see `docs/legal/`) |
| Onboarding | **Verified** | E2E commercial-flow |
| Health, readiness, metrics, structured logs | **Verified** locally | security.test.ts, deploy drill. **No alerting destination connected** |
| Backup and restore | **Verified** (cold physical copy on local PostgreSQL) | restore drill. **PITR on a managed provider not done** |
| Deploy and rollback | **Verified** locally (production artifact, N → N-1 → N) | deploy drill 14/14 smoke at each step. **No real environment exists** |
| CI pipeline, Docker image | **Under-tested** | Written. Never executed (no git remote, no container runtime here) |
| Two-step verification (MFA) | **Missing** | UI shows "Planned" |
| SSO / SAML | **Missing** | Listed on Enterprise as "Planned"; not sellable |
| Shared rate-limit store (multi-instance) | **Missing** | In-memory per process |
| **Broken** items | **None open.** Found and fixed this phase: Paddle `checkout.url` misuse, seeded workspace without subscription (500s), keyboard trap on sign-in, 320 px overflow, quadratic queries, foreign conversation delete returning 200 | See the security, performance and accessibility reports |

## 2. Launch readiness scorecard (20 areas)
**Priority:** P0 blocks any launch with real customers. P1 must be done before general availability. P2 is improvement.

| # | Area | Status | Evidence | Severity of gaps | Corrective action | Module | Verification method |
|---|---|---|---|---|---|---|---|
| 1 | Authentication and sessions | Good, with gaps | security.test.ts, E2E | P1: no MFA. P2: sign-up enumeration | Implement TOTP (Better Auth plugin) | `server/auth.ts` | Unit, E2E, pentest |
| 2 | Authorization and roles | Good | tenancy, isolation, workflow tests | — | — | `server/context.ts`, modules | Automated matrix |
| 3 | **Tenant isolation** | **Pass** (release-blocking gate) | isolation.test.ts on PGlite + PostgreSQL. 0 exposures | — | Re-run on every release (in the gate) | RLS migrations, `withTenant` | Attack matrix, pentest |
| 4 | Application security (OWASP) | Good, 8 findings fixed | security-report.md | **P0: no independent pentest.** P1: production secrets manager | Commission a pentest; choose platform secrets | `server/app.ts`, `http.ts`, `log.ts` | Automated tests; pentest |
| 5 | Data integrity | Good | `db:check` (15 checks) on seed, after restore and after load | P2: schedule daily | Daily cron on `db:check` | `server/db/check.ts` | Script |
| 6 | **Backup and recovery** | **Partial** | Local restore drill: 10,312 rows, hashes identical | **P0: PITR drill on the chosen provider; RPO/RTO approval** | Run the provider PITR drill on staging | hosting | Drill with timing |
| 7 | **Billing** | **BLOCKED** | Simulator and contract tests | **P0: sandbox checkout; entity/provider/prices decision; Paddle checkout page (if Paddle)** | Obtain sandbox keys; run the sandbox runbook | `server/billing/*` | Sandbox scenarios |
| 8 | AI (rules engine) | Good | eval + gate PASS; ai-failures.test.ts | P2: recall varies with phrasing | Expand extraction patterns | `server/intelligence/*` | Eval sets |
| 9 | AI (model path) | Not verified | Scripted-engine safety tests only | P0 *only if enabled*: live eval, data terms | Keep disabled at launch | `server/ai/*` | `npm run eval` with a key |
| 10 | E2E customer journeys | Good | 16/16 Playwright (success and failure) | P2: journeys on Safari/Firefox | Add WebKit/Firefox projects | `e2e/` | Playwright |
| 11 | Performance | Good locally | performance-report.md (budgets met at 2,000 stakeholders) | P1: measure on real infrastructure. P2: map/table frame drops | Staging measurement; Web Worker for layout | `insights.ts`, `stakeholders.ts`, universe | Load and profile scripts |
| 12 | Load and reliability | Good locally | 63 req/s, 0 errors; burst scenarios | P1: soak test, > 25 VUs, production DB | Staging soak | — | `scripts/load-test.ts` |
| 13 | Accessibility | Good automated / scripted | axe 98/98, manual 26/26 | **P1: screen-reader session** | VoiceOver and NVDA sessions | `src/` | Human AT test |
| 14 | Visual and interaction quality | See `visual-quality-report.md` | Two-pass audit | Per report | Per report | `src/` | Screenshot passes |
| 15 | **Observability and alerting** | **Partial** | metrics, logs, readiness built and tested | **P0: alerting destinations, uptime monitor, error tracker, on-call** | Connect Better Stack / Sentry; name on-call | `metrics.ts`, `log.ts` | Fire a test alert |
| 16 | **Deployment and infrastructure** | **Not started** (drill only) | deploy drill | **P0: choose host/region; staging; run CI; container build; IP header config** | See deployment runbook | infra | Staging deploy + smoke |
| 17 | Release engineering | Good | release-gate.sh, CHANGELOG, semver policy, CI file | P1: CI never executed | Push to remote; run CI | `scripts/`, `.github/` | CI run |
| 18 | **Privacy and legal** | **Drafts only** | `docs/legal/` drafts (unreviewed) | **P0: counsel review of Terms, Privacy, DPA, subprocessors; entity decision** | Engage counsel | marketing legal pages | Signed-off documents |
| 19 | Support and operations | Drafts | `docs/support/`, incident runbook | **P0: name support owner and contact channel.** No SLA is offered (none invented) | Assign owners | docs | Tabletop exercise |
| 20 | Cost control | Understood | cost-research (≈ $75–214/month infra); AI allowance enforced | P1: budget alerts on the provider | Configure billing alerts | — | Provider console |

## 3. Critical issues found and fixed in this phase
- **Security (S1–S8):**
  - no CSRF defence beyond SameSite
  - spoofable rate-limit identity (sign-in lockout of everyone was possible)
  - record content in error logs
  - open redirect
  - no request body limit
  - foreign conversation delete returned 200
  - implicit runtime dependency
- **Performance:** quadratic graph/directory queries (7.4 s → 0.4 s p50 under load), plus missing `ANALYZE` after bulk load.
- **Data:** the seeded workspace had no subscription, so every request failed.
- **Billing:** Paddle `checkout.url` misuse.
- **Accessibility:** a sign-in keyboard dead end, 320 px overflow, and sub-24 px touch targets.

## 4. Verification inventory (this phase)
| Check | Command | Result |
|---|---|---|
| Release gate (all steps below) | `./scripts/release-gate.sh` | See `launch-checklist.md` §Gate run |
| Unit / integration (PGlite) | `npx vitest run` | Pass |
| Unit / integration (PostgreSQL 18.4) | `npm run test:pg` | Pass |
| AI evaluation + gate | `npm run eval && npx tsx evals/gate.ts` | PASS |
| Restore drill | `npm run db:drill` | RESTORE VERIFIED |
| Deploy and rollback drill | `npx tsx scripts/deploy-drill.ts` | 14/14 smoke × 3 |
| E2E | `npx playwright test` | 16/16 |
| Accessibility (axe) | `node audit/phase1-qa.mjs` | 98/98 |
| Accessibility (scripted manual) | `node audit/a11y-manual.mjs` | 26/26 |
| Load | `npx tsx scripts/load-test.ts` | 63 req/s, 0 errors |
