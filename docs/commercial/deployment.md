# Deployment & Operations

**No production deployment exists yet, and no URL has been issued.** This runbook describes what a deployment needs. None of it has been executed against real infrastructure.

## Processes
One Node process serves the API and the built client (`npm run build && npm start`). The same image can run in two roles:

| Role | Env | Notes |
|---|---|---|
| web | `JOBS_ENABLED=false` | Scale horizontally behind a TLS proxy |
| worker | `JOBS_ENABLED=true` | Runs the job worker and schedules. At least one; several are safe (`SKIP LOCKED`, deduplicated schedules) |

A single small deployment can run one process with jobs enabled (the default).

## Required configuration (production refuses to start without the first three)
| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres 15+. The migration role must be able to create the `app_user` role and grants (see app/README) |
| `AUTH_SECRET` | 32+ random characters |
| `APP_URL` | Public HTTPS origin; also used in emails and webhook return URLs |
| `MAIL_TRANSPORT=postmark`, `POSTMARK_SERVER_TOKEN`, `MAIL_FROM` | Verified sender domain (SPF, DKIM, Return-Path) |
| `BILLING_PROVIDER` + provider keys + `BILLING_PRICE_*` | See billing-architecture.md. Live keys also need `BILLING_LIVE_APPROVED=true` |
| `EXPORT_DIR` | Persistent, private, shared volume. A multi-instance deployment needs shared or object storage (not implemented) |
| `SALES_EMAIL`, `OPERATOR_EMAILS` | Optional |
| `ANTHROPIC_API_KEY` | Optional. Review the provider's data terms first (docs/ai/security-and-privacy.md) |

## Webhook endpoints to register
- `https://<APP_URL>/api/billing/webhooks/stripe` or `/paddle`

## Migrations
- Migrations run on start. They're forward-only, idempotent and tracked in `drizzle.__drizzle_migrations`.
- Phase 3 adds `0004_commercial`, `0005_commercial_rls` and `0006_data_requests`.
- `0005` backfills a 14-day trial for every existing workspace, so nobody loses access when entitlements start being enforced.

## Backups & recovery
- **Use managed Postgres with point-in-time recovery (PITR).** Target RPO ≤ 5 minutes, RTO ≤ 4 hours (targets, not measured).
- **Daily logical backup** (`pg_dump -Fc`) to separate storage, kept for 30 days. Restore-test monthly into a scratch database and run `npm test` against it.
- **Restore procedure:**
  1. Restore to a new instance with PITR.
  2. Point `DATABASE_URL` at it.
  3. Start one worker. It runs `billing.reconcile` on its next schedule, re-syncing every subscription from the provider so billing state catches up with anything missed.
  4. Re-run failed jobs: `UPDATE job SET status='queued', attempts=0 WHERE status='dead' AND kind IN (...)`.
- **Export files** are disposable (regenerable). Don't back them up.
- **None of this has been rehearsed yet.** That's a launch blocker.

## Monitoring & error reporting
**Exists:**
- `/api/health`.
- Structured warnings for:
  - job failures (`[job:kind#id]`)
  - rejected webhooks (no payloads)
  - mail retries
  - analytics failures
- Audit log.
- `job` table (`status='dead'`).
- `billing_event` (`status='failed'`).

**Not yet integrated:**
- An error-tracking service (e.g. Sentry).
- Metrics and alerting.

**Minimum alerts to add:**
- Any `dead` job.
- Webhook 400s above baseline.
- `email_message.status='failed'` after retries.
- 5xx rate.
- A job queue older than 15 minutes.

## Dependency security
`npm audit --omit=dev`, 2026-10-23: 4 moderate, 0 high, 0 critical. All are in `drizzle-kit → @esbuild-kit/* → esbuild`, the migration tooling used at build time and not in the request path. Run `npm audit` in CI and block on high or critical.

## Scaling notes
- The rate limiter is in-memory per process. Use a shared store such as Redis for multi-instance deployments.
- PGlite is for development only.
