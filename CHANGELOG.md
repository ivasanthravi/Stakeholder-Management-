# Changelog

All notable changes are listed here, per release. Versions follow semver.
- **Releases before Phase 4** were not tagged. Their commits are listed below for reference.
- **Database changes:** a release that changes the database schema is at least a MINOR version, and its migrations follow the expand/contract policy in `docs/launch/deployment-runbook.md`.

## [Unreleased] — Phase 7: real-world simulation lab
### Added
- **Synthetic data universe** (`npm run sim`). Deterministic and seeded; ten industries, profiles A–E (up to 5,000 stakeholders in one workspace, or 50 tenants), and named real-world complications. It writes through the product's own auth and row-level security. Local only: it refuses production and remote databases.
- **Simulation harnesses:**
  - `scripts/sim-scale.ts`: truth checks, endpoint latency, load at 1–100 users, isolation under load;
  - `scripts/sim-graph.sh`: relationship-map stress;
  - `scripts/sim-serve.ts` with `scripts/sim-personas.mjs`: simulated persona runs.
- **Duplicate hint.** Creating a stakeholder whose name matches an existing record shows a non-blocking hint that links to that record.
- **Copilot:**
  - answers "what changed recently" (read-only `recent_changes` tool);
  - lists who is connected to an initiative or organisation.
### Fixed
- **Command Center at scale.** Overdue commitments could vanish from the list when other signals were numerous (0 of 1,987 shown at 5,000 stakeholders). Counts are now true totals per kind, every kind keeps places in the list, and older items are counted instead of dropped.
- **Workspace briefing** states the same totals as the Command Center headline. It counted the capped list ("60 overdue" under "1,987 overdue").
- **"Due this week"** is filtered on the server. At scale it read 0, because it narrowed the first 200 open commitments, all of them overdue.
- **Departed owners.** Open commitments owned by someone who left the workspace are flagged as needing an owner.
- **Totals, not page lengths.** Summary sentences, tab counts and Copilot answers ("10 decisions pending") now use true totals.
- **Long histories** say "Showing the latest 200 of N".
- **Meeting notes:**
  - labelled decisions ("Decision: …") and decisions by a board or committee are recognised;
  - repeated actions are proposed once.
- **Billing provider outages** return a clear "nothing was changed, try again" (503) instead of a generic error. Webhooks received during the outage sync afterwards.
- **Simulation loads run `ANALYZE`.** Without planner statistics, the relationship map took 117 s from the server on PGlite at 5,000 stakeholders; it now takes 0.21 s.
- **Speed at 5,000 stakeholders:**
  - Directory sort 156 → 11 ms;
  - Command Center 269 → 162 ms (1 MB → 622 KB);
  - single-user throughput doubled.

## [Unreleased] — Phase 6: product excellence
### Fixed: data and trust
- **Old overdue commitments.** Commitments more than 60 days overdue disappeared from the Command Center; they now always appear, and the horizon counts every overdue commitment.
- **Consistent overdue counts.** Copilot, briefings and signals count overdue days the same way (one record read "7 days" in one place and "8" in another).
- **Disclosed map cap.** The relationship map's 2,000-person cap was arbitrary and silent. It now keeps the most influential people and says how many matched.
### Command Center
- **Action first.** The briefing is compact, and "Needs attention" sits above the fold on desktop and phones.
- **Keeps your place.** A signal's stakeholder opens in a peek without leaving Home; Esc closes it.
### Stakeholder Universe
- **Smooth at scale.** Large maps (over 800 people) pan and zoom smoothly: at 2,000 people on a slow CPU, 13 → 38 fps.
- **Readable overview.** Labels scale with influence, so the overview names key people; selection, neighbours and matches are always labelled.
- **Correctness fixes:**
  - quick filter toggles no longer drop people;
  - layouts frame where nodes land;
  - camera moves don't queue up.
### Interaction and motion
- **Route changes.** No more flash of the next screen fading out and back in.
- **Reduced motion.** Respected by every animation, including canvas and JS height and width animations.
- **Quicker interactions:**
  - the table/map toggle is faster;
  - ego-graph hover responds immediately;
  - the search field no longer resizes on focus;
  - closing overlays don't swallow clicks.
### Accessibility
- **Real buttons and links.** Relationship names, sortable headers and people rows were exposed with the wrong roles; they're now real links and buttons inside cells.
### Responsive and copy
- **No clipping.** Toolbars scroll instead of clipping between 641 and 1,280 px, and Commitments fits at 1,024 px.
- **Phone headers.** Phones show a back link (or the current scope) instead of truncated breadcrumbs, and the profile identity stacks.
- **Clearer labels:**
  - counts say what they count ("184 stakeholders · Show archived");
  - load errors no longer say changes weren't saved;
  - the map count is grammatical ("1 person").
- **Copilot.** Shows 5 sources with "Show all".
### Tooling
- **Audit scripts:** `audit/excellence-capture.mjs` (screenshot archive) and `audit/responsive.mjs` (clipping audit).
- **New check:** a reduced-motion check for JS animations.
- **New tests:** E2E `excellence.spec.ts` (Command Center context, workflows B and E), `tests/dashboard.test.ts`, and date unit tests.

## [Unreleased] — Phase 5: launch preparation
### Security and safe configuration
- **Production refuses development defaults.** A production server (`DEPLOY_ENV=production`, the default when `NODE_ENV=production`) won't start with an http `APP_URL`, without `MAIL_TRANSPORT=postmark`, or with the billing simulator. Staging (`DEPLOY_ENV=staging`) refuses live payments.
- **The Claude model engine is locked off in production** until `AI_MODEL_APPROVED=true`. An API key alone no longer switches it on.
- **Audit trail.** Row-level security on the audit trail (migration `0007`): writes inside a tenant transaction must belong to that tenant.
- **Configurable sign-in limit.** `AUTH_RATE_LIMIT_PER_10S` sets the sign-in/sign-up limit per IP per 10 s (default 3, unchanged).
### Controlled rollout
- **Invite-only signup** (`SIGNUP_MODE`, `SIGNUP_ALLOWLIST`), the default in production. People outside the pilot see a clear message instead of waiting for an email that never comes.
- **`/api/health` reports the environment**, and `scripts/smoke.ts` can assert it (`SMOKE_EXPECT_ENV`).
### Fixes
- **"Forgot password?" works on the first click.** Before, leaving an untouched field showed an error that shifted the layout mid-click.
- **Sign-in returns you to where you were going** after an expired session or a deep link.
- **Undeliverable emails aren't retried.** Permanently undeliverable addresses (Postmark 300/406) were retried into dead jobs; they're now recorded once.
- **Signup funnel events.** `signup_started` and `signup_completed` are now recorded, and the operator funnel reports `signupCompletionRate`.
### Tooling and tests
- **Staging rehearsal.** `scripts/staging-rehearsal.ts` runs the production artifact on real PostgreSQL behind HTTPS, as a non-superuser database owner. It covers smoke, edge and security checks, full E2E, axe and keyboard checks, `db:check` and a restart.
- **New tests:**
  - E2E `recovery.spec.ts`: sign-out, password recovery, expired session, workspace switching, network failure and retry, AI unavailable, closed signup
  - `email.test.ts`
  - environment, session-expiry and invite-only tests
  - RLS backstop tests
- **E2E against a deployment.** `E2E_BASE_URL` / `E2E_DB_URL` run the suite against a deployment.

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
