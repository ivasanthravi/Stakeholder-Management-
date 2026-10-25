# Staging Verification (Phase 5)

**No hosted staging environment exists.** No hosting provider has been chosen and no account has been created, so nothing here was verified on real infrastructure, a public domain or a public certificate.

**What was run instead.** A **local staging rehearsal** (`app/scripts/staging-rehearsal.ts`), built to resemble the intended production setup as closely as one machine allows. Evidence: `evidence/staging-rehearsal-2026-10-24.json`.

## Rehearsal setup
| Layer | Rehearsal | Intended staging | Difference |
|---|---|---|---|
| Artifact | Clean copy, `npm ci`, production build, then runtime-only install | Same, built in CI into a container image | No container (no runtime here) |
| App config | `NODE_ENV=production`, `DEPLOY_ENV=staging`, rules-engine AI, JSON logs, metrics token, trusted-proxy hop | Same | — |
| Database | PostgreSQL 18.4. The app connects as **`meridian_owner`: LOGIN, CREATEROLE, NOSUPERUSER, NOBYPASSRLS**. The database is owned by that role | Managed PostgreSQL, owner role with CREATEROLE | Not a managed service; no PITR |
| Edge | HTTPS reverse proxy (TLS termination, one `X-Forwarded-For` hop) plus an HTTP→HTTPS 301 listener | Platform load balancer with a managed certificate | Locally generated certificate trusted via a local CA |
| Email | Log transport; journeys read the outbox from the database (no dev routes in production builds) | Postmark test stream or log transport | Nothing actually sent |
| Billing | No provider | Provider **sandbox** | Sandbox BLOCKED; checkout journey skipped |
| Data | Synthetic sample (184 people) plus journey data | Synthetic only | — |
| Rate limits | Sign-in limit raised to 60 per 10 s, because every test browser shares one IP | Production default (3) | Recorded in the evidence (`deviationsFromProduction`) |

## Results: final run **22/22 steps passed** (`STAGING REHEARSAL PASSED (local)`)
| Check | Result |
|---|---|
| TLS certificate valid for the hostname (local CA); HTTP→HTTPS 301 preserving path and query | Pass |
| Smoke over HTTPS: health, readiness, pages, headers, HSTS/CSP, request id, plans, dev routes absent, sign-in, environment = staging | 18/18 |
| Session cookie `__Secure-…; Secure; HttpOnly; SameSite=Lax` | Pass |
| No CORS for foreign origins; cross-site state change refused (CSRF); foreign auth callback refused | Pass |
| Metrics refused without token, served with it; dev routes absent | Pass |
| Forged left-most `X-Forwarded-For` never recorded as the client IP | Pass |
| App runs as non-superuser, non-BYPASSRLS owner; migrations created `app_user`; RLS on 36 of 41 tables. Of the other 5, four grant the tenant role nothing; `user` grants read access to `id, name, email, image` only, so member names render. Asserted in `isolation.test.ts` | Pass |
| **Full E2E suite against staging** (24 journeys) | 23 passed, 1 skipped (simulator checkout: needs a provider sandbox) |
| **No Content Security Policy violations** on 14 public and signed-in pages under the production CSP | Pass |
| **axe** on 98 views (production build) | **98/98 clean** after the fix. The previous run found 1 issue: the Meeting Intelligence source panel wasn't keyboard-focusable |
| Scripted keyboard, focus, reflow, target-size and reduced-motion checks | 26/26 |
| `db:check` after all journeys | Pass |
| Restart: migrations idempotent; readiness OK, 0 dead jobs | Pass |
| No error-level logs; no secrets or sample passwords in logs; no tokens in evidence | Pass |

## Customer journeys (Phase 5 §13)
| # | Journey | Covered by | Result |
|---|---|---|---|
| 1 | Discovery: marketing site, product, pricing | commercial-flow "visitor lands…"; smoke (pages, plans); CSP check | Pass |
| 2 | Signup and identity verification | core-flow 1–2, commercial-flow, recovery setup | Pass |
| 3 | Workspace with industry template | commercial-flow "picks a template, completes setup" | Pass |
| 4 | Activation: stakeholders, organizations, initiatives | core-flow 3–8 | Pass |
| 5 | Collaboration: invite, permissions, revoke | commercial-flow teammate; journeys B | Pass |
| 6 | Intelligence: engagement, evidence-backed briefing | ai-flow (notes → cited proposal → accepted); core-flow engagements | Pass |
| 7 | Decisions and commitments | core-flow 9–10; journeys D | Pass |
| 8 | Subscription: sandbox checkout → entitlements | Simulator only, in the dev stack. **BLOCKED for a real provider** | **BLOCKED** |
| 9 | Account management: billing view, notifications, team, export | journeys I (export download, deletion and cancel), B (team); journeys failure path (viewer has no billing controls) | Pass (billing management against the simulator only) |
| 10 | Failure recovery: network error, failed payment, expired session, AI unavailable, invalid invitation | recovery.spec (network + retry, expired session, AI 503, sign-out, reset); journeys (wrong password, unusable invitation); failed payment in `billing.test.ts` and `provider-flow.test.ts` (not in a browser) | Pass, except failed payment in the browser (needs a sandbox) |

## Fixed during staging verification
- The audit tooling could not run against a production build (self-signed TLS, CSP blocking axe injection, stale sessions). It now runs with a separate real-CSP violation check, so the bypass hides nothing.
- **Accessibility (real defect):** the Meeting Intelligence source-notes panel scrolled but couldn't be reached by keyboard.

## Still required on real staging (B4)
1. Deploy the container image from CI to the chosen platform. Use a managed certificate and a staging subdomain.
2. Run `scripts/smoke.ts` with `SMOKE_EXPECT_ENV=staging`, then run E2E with `E2E_BASE_URL`. **`E2E_DB_URL`:** use a read-only connection to the outbox, or run journeys with a Postmark test stream and read messages through its API.
3. Run the billing sandbox scenarios (`billing-activation.md` Stage A).
4. Run a PITR drill.
5. Measure performance on real infrastructure and network.
6. Fire a test alert.
