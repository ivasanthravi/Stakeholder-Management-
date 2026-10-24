# Changelog

All notable changes are listed here, per release. Versions follow semver.
- **Releases before Phase 4** were not tagged. Their commits are listed below for reference.
- **Database changes:** a release that changes the database schema is at least a MINOR version, and its migrations follow the expand/contract policy in `docs/launch/deployment-runbook.md`.

## [Unreleased] — Phase 4: production hardening & launch readiness
### Security
- **CSRF protection.** Changes from another site (a foreign `Origin` or `Sec-Fetch-Site`) are rejected.
- **Request size limit.** API request bodies are capped at 512 KB.
- **Sign-in rate limits can't be bypassed.** Limits now use the real client IP, taken from a trusted proxy header or hop count, so a forged `X-Forwarded-For` no longer works around them.
- **Logs.** Logs are now structured, with request IDs. Database errors, tokens and secrets are removed from logs.
- **Safer redirects.** The sign-in `next` redirect only accepts paths on this site.
- **Copilot conversations.** Deleting another user's conversation now returns 404.
### Reliability and operations
- **Health and metrics.** Added a `/api/ready` readiness check (database and job queue) and Prometheus metrics at `/api/metrics` (requires `METRICS_TOKEN`).
- **Job failures.** A background job that fails permanently is now logged as an error.
- **Database tools.** `npm run db:check` checks data consistency. `npm run db:drill` runs a backup and restore drill.
- **Release tools.**
  - `scripts/smoke.ts` smoke-tests a deployment.
  - `scripts/deploy-drill.ts` rehearses a deploy and a rollback.
  - `scripts/release-gate.sh` runs every release check, and a CI workflow mirrors it.
  - A Dockerfile and ESLint are added.
- **Runtime dependency.** `tsx` is now declared as a runtime dependency (before, it was only installed indirectly).
### Performance
- **Faster at scale.** The directory and relationship-graph queries now look up each stakeholder's data directly, instead of joining large workspace-wide totals. At 2,000 stakeholders:
  - graph: 3.2 s → 91 ms
  - dashboard: 1.6 s → 195 ms
  - load-test throughput: 8 → 63 requests per second
- **Fresh data.** The seed script refreshes database statistics (`ANALYZE`) after loading data.
### Fixes
- **Sample workspace.** `npm run db:seed` now gives the sample workspace a subscription. Before, the seeded workspace answered every request with a server error.
- **Paddle checkout.** The return URL is no longer sent as Paddle's `checkout.url`.
- **Sign-in keyboard access.** The "Forgot password?" link is reachable by keyboard again.
- **Small-screen layout.** The marketing homepage no longer scrolls sideways at 320 px.
- **Touch targets.** Tap areas are at least 24 px on touch screens.
- **Visual quality.** 22 layout, copy and accessibility defects fixed across the directory, profile, map, registers, pricing, onboarding and empty states (see `docs/launch/visual-quality-report.md`). On phones, icon-only buttons now keep an accessible name.
- **Privacy.** The command palette's recent items are cleared from the browser on sign-out.
### Tests
- New suites:
  - tenant isolation attack matrix
  - HTTP security
  - Stripe and Paddle contract flows
  - AI failure modes
  - customer journeys B, D and I (end to end)
- The test suite now also runs on real PostgreSQL (`npm run test:pg`).
- A new held-out AI evaluation set, plus an AI release gate.

## Phase 3 — commercial SaaS (`c0a76a8`)
Billing, entitlements, trials, onboarding, invitations, notifications, data export and deletion, analytics, and the marketing site.

## Phase 2 — intelligence engine (`f2dd53e`)
Copilot, meeting intelligence, briefings, signals, evaluations.

## Phase 1 — production foundation (`9764ba9`, `7d3be4d`)
Multi-tenant core, authentication, row-level security, registers, relationship map.
