# Final Pre-Launch Audit (Phase 5)

**Date:** 2026-10-24. **Commit base:** `a16325c` (Phase 4) plus the Phase 5 changes in this report.

**Method.** Nothing from earlier phases was assumed.
- **Repository and reports:** the repository, the Phase 0–4 reports and the Phase 4 blocker list were re-read.
- **Service configuration:** which external services are configured was checked directly. Every capability was re-verified by:
  - the full automated suite on two databases;
  - a new **local staging rehearsal**: the production artifact on real PostgreSQL behind HTTPS, with `DEPLOY_ENV=staging`;
  - the E2E suite run against that rehearsal and against the dev stack;
  - targeted browser inspection.

**Legend:**
- **VERIFIED:** proven by evidence produced here.
- **VERIFIED WITH LIMITATIONS:** proven, but only locally or with stated gaps.
- **NOT VERIFIED:** no evidence possible yet.
- **BLOCKED:** cannot proceed without a decision, credential or account.
- **FAILED:** found broken (and whether it was fixed).

## External services actually configured
| Service | Configured? | Evidence |
|---|---|---|
| Hosting (staging or production) | **No** | No platform CLI, account or config. Owner chose "decide later" |
| Domain / DNS | **No** | None supplied |
| Git remote / CI | **No** | `git remote -v` is empty. Owner has a remote, but no URL was given |
| Managed PostgreSQL | **No** | Local embedded PostgreSQL 18.4 only |
| Postmark | **No** | No token |
| Stripe / Paddle | **No** | No keys, sandbox or live |
| Anthropic | **No** | No key for the app. The shell's `ANTHROPIC_BASE_URL` belongs to the development tool and was deliberately not used |
| Error tracking / uptime / metrics scraper | **No** | — |

## Capability classification
| # | Capability | Classification | Evidence |
|---|---|---|---|
| 1 | Sign-up, email verification, sign-in, sign-out | **VERIFIED** | E2E core-flow, journeys, recovery (sign-out → API 401). Staging rehearsal: smoke sign-in over HTTPS |
| 2 | Password recovery | **VERIFIED** | recovery.spec: email link → new password works, old refused, link single-use. security.test: reset revokes all sessions |
| 3 | Session expiry | **VERIFIED** | security.test: an expired or deleted server session is refused (no cookie caching). recovery.spec: an expired session returns to sign-in, then to the same page |
| 4 | Workspace creation and switching | **VERIFIED** | E2E commercial and recovery: switching shows only that workspace's records and lands on its Home |
| 5 | Invitations, role changes, member removal | **VERIFIED** | E2E journeys B, tenancy.test, isolation.test (demotion and removal take effect immediately) |
| 6 | **Tenant isolation**: DB queries, API, search, AI retrieval, exports, jobs, billing, audit | **VERIFIED** | isolation.test attack matrix on PGlite and PostgreSQL; **0 exposures**. New: a DB backstop test (every table either has RLS or grants the tenant role nothing), and RLS on the audit trail (`0007`) with a forged cross-tenant write refused |
| 7 | Database migrations | **VERIFIED WITH LIMITATIONS** | 8 migrations, no destructive operations. Run as a non-superuser `CREATEROLE` owner in the rehearsal; idempotent on restart. *Limitation: not yet run on a managed provider* |
| 8 | Backup and restore | **VERIFIED WITH LIMITATIONS** | Phase 4 cold-backup restore drill (hashes identical). *Limitation: provider PITR not drilled* |
| 9 | HTTPS, cookies, headers, CORS, CSRF, canonical origin | **VERIFIED WITH LIMITATIONS** | Rehearsal: TLS valid (local CA), HTTP→HTTPS 301, `__Secure-` cookie with Secure, HttpOnly, SameSite=Lax; HSTS and CSP; no CORS; CSRF 403; foreign callback refused. *Limitation: no public certificate or domain* |
| 10 | Production configuration safety | **VERIFIED** (new) | Production refuses http `APP_URL`, the log mail transport, the simulator, and the model engine without approval. Staging refuses live payments. security.test |
| 11 | Controlled rollout (invite-only signup) | **VERIFIED** (new) | security.test: strangers 403 with no account created; allow-list and invitations work; revoked invitations don't. Production default is invite-only. E2E: the UI explains the closed signup |
| 12 | Billing (simulator and contract tests) | **VERIFIED WITH LIMITATIONS** | billing, providers and provider-flow tests. *Not a provider integration* |
| 13 | **Billing (provider sandbox and live)** | **BLOCKED** | No credentials. Paddle checkout page missing (only if Paddle is chosen). `billing-activation.md` |
| 14 | AI: rules engine | **VERIFIED** | Eval gate PASS; ai and ai-failures tests; E2E ai-flow; recovery.spec (AI service 503 → visible error, app keeps working) |
| 15 | **AI: Claude model engine** | **BLOCKED** | No key. Locked off in production by code. `ai-production-verification.md` |
| 16 | Email delivery (Postmark) | **NOT VERIFIED** (live) / **VERIFIED** (contract) | email.test: Postmark API contract; permanent rejections (300/406) not retried; temporary failures retried. *No real send, no SPF/DKIM/DMARC* |
| 17 | Monitoring, alerting, on-call | **NOT VERIFIED** | Metrics, logs and readiness tested (rehearsal: metrics token-gated, no errors or secrets in logs). **No alert destination or on-call (B6)** |
| 18 | Deployment pipeline | **VERIFIED WITH LIMITATIONS** | Local deploy/rollback drill (Phase 4) and staging rehearsal (Phase 5). *CI never executed; no image built* |
| 19 | E2E customer journeys 1–10 | **VERIFIED WITH LIMITATIONS** | See `staging-verification.md` §Journeys. *Journey 8 (sandbox checkout) BLOCKED* |
| 20 | Performance | **VERIFIED WITH LIMITATIONS** | Phase 4 budgets met at 2,000 stakeholders (local). *No real infrastructure* |
| 21 | Accessibility | **VERIFIED WITH LIMITATIONS** | axe 98/98 on dev and 98/98 on the production build (rehearsal); scripted checks 26/26 on the production build; no CSP violations on 14 pages. *No screen-reader session* |
| 22 | Visual and interaction quality | **VERIFIED WITH LIMITATIONS** | Phase 4: two passes, 22 fixes. Phase 5: targeted pass on changed surfaces (sign-in, sign-up closed state, reset) on desktop and phone. *Dark mode not reviewed* |
| 23 | Privacy, legal and trust documents | **BLOCKED** | Drafts only (`docs/legal`), unreviewed by counsel |
| 24 | Support operations | **BLOCKED** | Drafts. No support owner or channel named |
| 25 | Independent security test | **NOT VERIFIED** | No penetration test |

## FAILED items found in Phase 5 (all fixed and retested)
| Defect | Impact | Fix | Evidence |
|---|---|---|---|
| **"Forgot password?" click did nothing** on a fresh sign-in page (mouse users). The autofocused empty email field showed "Required" on blur, shifting the link under the pointer mid-click | Users locked out could not reach recovery by mouse | Untouched fields are no longer flagged on blur (still validated on submit) | Browser check; recovery.spec password recovery |
| **Deep links lost after sign-in.** After an expired session or a shared link, sign-in landed on Home | Broken return-to-work flow | The public-route guard honours a safe `next` | recovery.spec expired session |
| **Production booted with development defaults** (log mail transport, localhost `APP_URL`) | Verification and reset emails would silently never send | Hard failure at start | security.test |
| **Model engine switched on by a key alone** | Customer data to a third party without review | `AI_MODEL_APPROVED` gate | security.test |
| **Audit trail writable across tenants** by the tenant role (no RLS) | A server bug could misfile audit events | RLS insert policy (`0007`) | isolation.test |
| **Permanent email rejections retried** 5× into dead jobs | False SEV2 alerts | Not retried; recorded as failed | email.test |
| **Signup funnel unmeasurable** (`signup_started`/`completed` never emitted) | Launch metric missing | Emitted at creation and verification | commercial.test |
| **No rollout control:** anyone could sign up the moment production is reachable | Controlled rollout impossible | Invite-only signup (production default) | security.test, recovery.spec |

## Phase 4 P0 blockers: status now
| # | Blocker | Status |
|---|---|---|
| B1 | Entity, billing provider, prices | **Open** (business) |
| B2 | Billing sandbox | **Open** (no credentials) |
| B3 | Paddle checkout page | **Open** (only if Paddle) |
| B4 | No deployed environment | **Open.** Mitigated by the local staging rehearsal; a real staging is still required |
| B5 | Provider PITR drill | **Open** |
| B6 | Alerting and on-call | **Open** |
| B7 | Legal review | **Open** |
| B8 | Penetration test | **Open** |
| B9 | Support owner | **Open** |
| B10 | CI executed | **Open.** Remote exists per owner; URL not provided |

**Conclusion:** P0 blockers remain, so **no public launch** and no production deployment approval request. See `final-go-no-go.md`.
