# Remaining Blockers (2026-10-24)

**Launch classification: BLOCKED.**
- Each item below has an owner placeholder and the evidence needed to close it.
- The rule: **"any critical gate incomplete → BLOCKED"**.
- **Tenant isolation is not a blocker.** The attack matrix found 0 cross-tenant exposures, on both PGlite and PostgreSQL.

## P0: must close before any customer uses the product with real data
| # | Blocker | Why it blocks | Needs a decision or credentials from | Closes when |
|---|---|---|---|---|
| B1 | **Legal entity, billing provider (Stripe vs Paddle) and prices not decided** | Billing, Terms, tax and the subprocessor list all depend on it | Business owner | Decision recorded. `BILLING_PRICE_*` created in the provider |
| B2 | **Billing sandbox verification BLOCKED** (no test keys) | Real checkout, portal, renewal and failure paths unproven; contract tests use fake APIs | Business owner (sandbox account) | `billing-verification.md` sandbox runbook executed and recorded with event ids |
| B3 | **Paddle checkout page missing** (only if Paddle is chosen) | Paddle checkout can't complete without a Paddle.js page | Engineering | Page built, CSP updated, sandbox checkout passes |
| B4 | **No deployed environment** (staging or production); hosting and region not chosen | Nothing verified on real infrastructure: TLS, HSTS, proxy IP headers (S2), managed DB roles (`CREATE ROLE`), real network latency | Business owner (provider and region, spend approval) | Staging deployed from CI; smoke passes on https with sign-in; IP header verified |
| B5 | **PITR restore drill on the managed provider** | Recovery readiness can't be claimed from a local cold-copy drill alone. RPO 5 min / RTO 4 h are proposals | Engineering + business approval of RPO/RTO | Drill on staging timed; RPO/RTO approved |
| B6 | **Alerting, uptime monitoring, error tracking and on-call not connected** | Incidents would go unnoticed (incident runbook signals have no destination) | Engineering + named people | Test alert reaches a named person; error tracker receives a test error |
| B7 | **Legal documents are unreviewed drafts** (Terms, Privacy, DPA, subprocessors, AI disclosure, cookies) | The product processes personal data about third parties (stakeholders). Publishing unreviewed terms is prohibited | Counsel | Counsel-approved versions replace the drafts on the marketing site |
| B8 | **No independent penetration test** | Automated security tests aren't a pentest | Business owner (vendor and budget) | Report received; criticals and highs fixed and retested |
| B9 | **Support owner and contact channel not named** | Customers would have no route for account recovery, billing or security reports | Business owner | `docs/support` placeholders filled; security contact published |
| B10 | **CI pipeline and container build never executed** | The release gate has only run locally | Engineering (git remote, CI runner) | Green CI run on the remote; image built and the health check passes |

## P1: before general availability (acceptable for a closed pilot if disclosed)
| # | Item |
|---|---|
| G1 | MFA (TOTP) for all users; enforce for owners and admins |
| G2 | Screen-reader sessions (VoiceOver + Safari, NVDA + Firefox) on flagship flows |
| G3 | Staging performance, soak test (hours) and > 25 virtual users; pool sizing |
| G4 | Shared rate-limit store and object storage for exports, before running more than one instance |
| G5 | Production secrets manager and a rotation procedure exercised |
| G6 | Account closure residue: email-log recipient, analytics user id and audit IP/UA are kept after deletion. Define retention and purge (found during the legal drafting) |
| G7 | ~~Clear the command palette's recent list on sign-out~~. **Done in Phase 4:** cleared on sign-out, account closure and account switch. Verified by typecheck and the E2E suite only; there is no dedicated test |
| G8 | Postmark live sending verified (domain DKIM/SPF, bounces, the verification and reset emails) |
| G9 | Cost alerts at the hosting and AI providers |

## P0 only if the Claude model engine is enabled
- Provider data-terms review.
- A live evaluation on the synthetic sets (accuracy, latency, cost recorded).
- Acceptance thresholds agreed.
- Injection and leak suites re-run live.

**Recommendation:** launch on the rules engine with the model engine disabled.

## P2 (tracked, not blocking)
- Map layout long task (move fcose to a Web Worker).
- Table wheel-scroll frame drops on slow CPUs.
- Sign-up account enumeration.
- Marketing mobile menu focus trap.
- Dark-mode accessibility pass.
- Rules-engine recall on "ACTION:"-style minutes.
- WebKit and Firefox E2E projects.
- Unused marketing analytics events (`marketing_cta_clicked`, `pricing_viewed`) are defined but never sent.
- Daily `db:check` cron.
