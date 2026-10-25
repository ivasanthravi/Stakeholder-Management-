# Production Deployment Plan & Approval Report

**Status: NOT DEPLOYED. Approval is NOT requested yet.** The prerequisites in §12 are incomplete, so asking for production approval now would be premature. This report tells the approvers what they would be approving and what must be true first.

## 1. Target hosting provider
**Undecided** (owner decision, 2026-10-24: "decide later"). Requirements a provider must meet are in `infrastructure-plan.md` §3:
- health-gated deploys and one-click rollback
- managed TLS
- a secret store
- Postgres ≥ 15 with PITR and `CREATEROLE`
- a persistent volume for exports

Ranked shortlist from cost research:
- **Render:** simplest. No India region; `CREATE ROLE` untested.
- **AWS ECS + RDS:** India region, full control, more operations work.
- **Fly.io + managed Postgres:** cheap; PITR and roles undocumented.

## 2. Domain
**None.** Placeholder plan: single app origin `app.example.com`, apex and www redirect to it, and a Postmark sending domain with DKIM, Return-Path and DMARC (`infrastructure-plan.md` §5). **No domain will be purchased and no DNS changed without approval.**

## 3. Infrastructure cost estimate
**≈ $75–214 per month** (production + staging), plus payment fees, tax and optional AI usage. See `cost-research-2026-10-24.md`; verify prices before purchase.

## 4. Deployment architecture
- **One container image:** Node 24, non-root, health check on `/api/ready`. It serves the SPA and API from one origin and runs the durable job worker in-process.
- **Managed PostgreSQL** with RLS. The app connects as a non-superuser owner with `CREATEROLE`; per-request work runs as `app_user` under RLS.
- **Single instance at launch.** Object storage for exports and a shared rate-limit store are needed before scaling out.
- **Pipeline:** GitHub Actions release gate → build image → deploy to staging → staging smoke and rehearsal checks → **manual approval** → production rolling deploy gated on `/api/ready` → production smoke with `SMOKE_EXPECT_ENV=production`.

## 5. Database readiness
| Item | Status |
|---|---|
| Migrations reviewed | 8 migrations (0000–0007). **No destructive operations** (no DROP, TRUNCATE, DELETE, RENAME or type change), no extensions. 0007 adds RLS on `audit_event` (additive, rollback-compatible) |
| Privileges | Verified in rehearsal: works as a non-superuser, non-BYPASSRLS owner with only `CREATEROLE` |
| Idempotent re-run | Verified (restart after migrations) |
| Backup and restore | Local cold-backup restore verified (Phase 4). **Provider PITR drill not done (B5)** |
| Indexes and performance | Phase 4 query fixes; budgets met at 2,000 stakeholders locally |
| Connection pooling | App pool of 10 per instance; no external pooler needed at ≤ 2 instances |
| Monitoring | `meridian_db_up`, readiness DB round trip; provider metrics once chosen |

## 6. Security findings
- **Phase 4:** S1–S8 fixed.
- **Phase 5 additions** (all tested):
  - production refuses unsafe defaults (http `APP_URL`, log mail transport);
  - the model engine can't be switched on by a key alone;
  - staging refuses live payments;
  - RLS on the audit trail;
  - an invite-only signup gate (production default);
  - permanent email rejections are no longer retried;
  - deep-link and expired-session sign-in returns to the right page;
  - a dead "Forgot password?" click is fixed.
- **Open:** no independent penetration test (B8), no MFA (P1), per-process rate limits (single instance only).

## 7. Test results (2026-10-24)
See `final-prelaunch-audit.md` and `staging-verification.md`. Summary:
- 162/162 automated tests on PGlite and on PostgreSQL 18.4
- E2E (dev stack and staging rehearsal)
- AI gate PASS
- axe and scripted accessibility checks
- restore drill and deploy/rollback drill

## 8. Billing status
**BLOCKED.** No sandbox credentials. **Billing is not production-ready**, and no live payment processing will be activated. The launch scope below excludes paid plans until Stage A–C are complete (`billing-activation.md`).

## 9. AI status
- **Rules engine:** verified.
- **Claude model engine:** blocked (no key), and locked off in production by code until `AI_MODEL_APPROVED=true` (`ai-production-verification.md`).

## 10. Monitoring readiness
- **Built and tested:** structured logs, request ids, Prometheus metrics, readiness checks.
- **Not configured:** alert destinations, uptime monitor, error tracker and on-call (B6). **Not operational.**

## 11. Rollback procedure
`rollback-plan.md`: application rollback without a database restore (verified locally), PITR for data damage, and feature switches.

## 12. Known limitations and remaining risks
See `final-go-no-go.md` §Blockers. The P0 prerequisites for this approval:
- hosting provider and region decided
- git remote set up and CI green
- staging deployed and verified on real infrastructure
- PITR drill done
- monitoring and on-call live
- legal documents reviewed
- support owner named
- penetration test, or an explicitly accepted risk for an invite-only pilot

## Approvals required (each separately, in writing; none is granted by this document)
| # | Action | Approver | Status |
|---|---|---|---|
| A1 | Create paid staging and production infrastructure (provider, region, monthly budget) | Business owner | **Not requested** |
| A2 | Purchase a domain, or modify production DNS | Business owner | **Not requested** |
| A3 | Deploy publicly (production URL reachable) | Business owner + engineering lead | **Not requested** |
| A4 | Activate live payment processing (`BILLING_LIVE_APPROVED=true`) | Business owner (+ finance) | **Not requested.** Blocked by Stage A |
| A5 | Send customer communications (invitations to design partners, announcements) | Business owner | **Not requested** |
| A6 | Import real customer data | Business owner + legal (after DPA) | **Not requested** |
| A7 | Enable the Claude model engine (`AI_MODEL_APPROVED=true`) | Business owner + legal | **Not requested** |
| A8 | Open signup beyond invite-only (`SIGNUP_MODE=open`) | Business owner | **Not requested** |

## Controlled rollout (after A1–A3 and A5)
| Stage | Who | Entry criteria | Controls |
|---|---|---|---|
| 1. Internal | Team addresses via `SIGNUP_ALLOWLIST=@<company-domain>` | Launch-day checklist passed | Invite-only signup; rules-engine AI; no billing |
| 2. Design partners | 3–5 organizations, allow-listed domains or invitations | 7 days internal with no SEV1/2; support owner live; DPA signed with each partner | Allow-list per partner; weekly feedback; data export available |
| 3. Paid pilot | Design partners who opt in | Billing Stages A–C complete; A4 approved | Live billing for approved prices only |
| 4. Public | `SIGNUP_MODE=open` (A8) | Pentest done; MFA; agreed release criteria met for 30 days | Uptime and incident process proven |

**Monitor at every stage** (`30-day-operations.md`):
- activation
- errors
- performance
- AI cost
- support requests
- billing failures
- feedback

**Do not expand while a critical incident is unresolved.**
