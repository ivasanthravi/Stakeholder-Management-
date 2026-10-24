# Deployment Runbook

**Status:**
- **Nothing is deployed.** No public URL exists, and no paid service has been activated.
- The production artifact, a staging-like deployment, smoke tests and a rollback were verified **locally** by `scripts/deploy-drill.ts`:
  - a runtime-only install plus build
  - `NODE_ENV=production`
  - real PostgreSQL
  - evidence in `evidence/deploy-rollback-drill-2026-10-24.json`
- The Dockerfile and the GitHub Actions workflow are written but **have not been executed**: no container runtime here, and no git remote.

## Environments
| Env | Purpose | Data | Billing | Email | AI |
|---|---|---|---|---|---|
| development | local work | PGlite + synthetic sample | simulator | log (dev mailbox) | rules engine |
| CI | release gate | in-memory PGlite and embedded PostgreSQL | simulator | log | rules engine |
| staging | pre-release verification, sandbox billing | synthetic only, **never customer data** | provider **sandbox** | Postmark (sandbox server or test stream) | rules engine (or model with synthetic data only) |
| production | customers | real | provider **live** (needs `BILLING_LIVE_APPROVED=true` and explicit approval) | Postmark | rules engine until the model path is approved |

## Hosting options and costs
Prices from official pages, accessed 2026-10-24 (USD per month, before tax; details and sources in `cost-research-2026-10-24.md`).

| Option | App (≈1 vCPU / 2 GB) | Postgres with PITR | Notes |
|---|---|---|---|
| **Render** (US/EU/SG) | $25 | $19 (1 GB) / $40 (1 CPU/2 GB) + $0.30/GB; PITR 3 days (Hobby) / 7 days (Pro) | Zero-downtime deploys gated by health check; one-click rollback. **CREATE ROLE support not documented: test the migration first** |
| **Fly.io** | $6.70 (1 GB shared) / $33 (2 GB performance) | Managed Postgres from $38 | Rolling, canary and bluegreen deploys. PITR window and role privileges not documented |
| **AWS** (ECS Fargate + RDS) | ≈ $36 compute (load balancer and NAT not included) | RDS db.t4g.small ≈ $23 (US) / ≈ $31 (Mumbai) + gp3 storage | Master user can CREATE ROLE (`rds_superuser`). India region available |
| **Google Cloud Run** | ≈ $53 always-on (1 vCPU / 2 GiB) | separate (Cloud SQL, not priced) | Mumbai is Tier 1 |
| Supabase (DB only) | — | Pro $25 + Small $15 + 7-day PITR ≈ $100 → ≈ $130 | India (Mumbai) available |
| Neon (DB only) | — | $0.106/CU-hour (≈ $77 always-on) | Roles allowed; no India region |

**Example totals** (Render-based, US): **lean ≈ $75/month** (production + staging), **comfortable ≈ $214/month**:
- 2 app instances
- 7-day PITR
- Sentry Team $29
- Better Stack $34
- Postmark Pro $16.50

**India data residency** points to AWS (ECS + RDS Mumbai) or Supabase Mumbai plus Cloud Run Mumbai.

**Decision required:** hosting provider and region. This depends on the legal entity, customer location and data-residency needs.

**Operational dependencies:**
- hosting + managed Postgres
- Postmark
- payment provider (Stripe or Paddle)
- error tracking (Sentry or GlitchTip)
- uptime and status page (Better Stack)
- object storage for exports (R2 or S3; required before multiple instances)
- optional: Anthropic

## Configuration and secrets
- **Store secrets in the platform's secret manager**, never in the image or repository. `.env` is development only.
- **Required in production:** `DATABASE_URL`, `AUTH_SECRET` (≥ 32 random bytes), `APP_URL`, `MAIL_TRANSPORT=postmark`, `POSTMARK_SERVER_TOKEN`, `MAIL_FROM`.
- **Per platform** (security finding S2): `CLIENT_IP_HEADER` (e.g. `x-real-ip` / `fly-client-ip`) **or** `TRUSTED_PROXY_HOPS` / `TRUSTED_PROXIES`. **Verify with a request from a known IP that the logged client IP is correct.**
- **Billing:** `BILLING_PROVIDER`, provider keys, `BILLING_PRICE_*`, webhook secret. Live mode also needs `BILLING_LIVE_APPROVED=true`, which **requires explicit business approval**.
- **Operations:** `METRICS_TOKEN`, `OPERATOR_EMAILS`, `SALES_EMAIL`, `EXPORT_DIR` (persistent, private), and `JOBS_ENABLED=false` on web-only replicas.
- **Rotation:**
  - `AUTH_SECRET` rotation signs everyone out.
  - Webhook secrets: rotate in the provider dashboard and app config together.

## Database migrations
- **Forward-only and idempotent.** Migrations run automatically on start (`migrate()`), tracked in `drizzle.__drizzle_migrations`.
- **Expand/contract policy**, required for safe rollback:
  - A release may only add tables, columns, indexes or policies that the **previous** release ignores.
  - Destructive changes (drop or rename) ship in a later release, after no running version reads the old shape.
- **Before production migrations:**
  1. Take a PITR marker or snapshot.
  2. Run on staging with a production-sized synthetic dataset.
  3. Time the migration.
- **The role-creating migration (`0001`)** needs `CREATEROLE`. On providers without it, a DBA pre-creates `app_user NOLOGIN` and grants it to the app's role.
- **After a bulk import or restore:** run `ANALYZE` (performance finding: stale statistics turned 8 ms into seconds).

## Release process
**Versioning:** semver `MAJOR.MINOR.PATCH` with tags `vX.Y.Z`. Database schema changes are at least MINOR. `CHANGELOG.md` is kept per release.

**Release checklist:**
1. `./scripts/release-gate.sh` passes (CI equivalent):
   - audit
   - typecheck
   - lint
   - tests on PGlite **and** PostgreSQL
   - AI gate
   - restore drill
   - build
   - E2E
2. Changelog updated. Migration reviewed against the expand/contract policy.
3. Deploy to **staging**. Smoke test: `BASE_URL=… SMOKE_EMAIL=… SMOKE_PASSWORD=… npx tsx scripts/smoke.ts` (smoke account in a dedicated workspace). Manual check of the release's changed flows.
4. **Approval:** a named approver signs off in the release ticket. Production deploys need approval; billing changes also need business approval.
5. Deploy to production as a rolling or zero-downtime deploy gated on `/api/ready`.
6. Production smoke test. Watch the metrics for 30 minutes (5xx, p95, dead jobs, webhooks, email).
7. Tag the release.

**Feature flags:** none needed today. Risky capabilities are already gated by configuration (billing provider and live approval, AI engine, workspace AI settings, `JOBS_ENABLED`). Add flags only for user-facing changes that need staged rollout.

## Rollback
1. Redeploy the previous release's artifact (platform rollback or previous image tag). **Don't roll back the database** unless data is corrupted. The schema stays forward-compatible by the expand/contract policy.
2. Smoke test. Use `SMOKE_LEGACY=1` when the previous release predates `/api/ready`.
3. If a migration itself caused harm, restore by PITR to just before it on a new instance, repoint, `ANALYZE`, then reconcile billing.

**Verified locally (deploy drill):**

| Step | Start | Smoke |
|---|---|---|
| Release N | 1.8 s | 14/14 |
| Rollback to release N-1 (Phase 3 commit), same database | 1.5 s | 14/14 |
| Roll forward | 0.8 s | 14/14 |

## Health checks
- `GET /api/health`: liveness.
- `GET /api/ready`: readiness (DB round trip and job-queue lag). Returns 503 if the DB is down or the oldest ready job is older than 15 minutes.
- `GET /api/metrics`: Prometheus format, Bearer `METRICS_TOKEN`.

## Backups and recovery
**Objectives** (proposed; the business must confirm against contracts):
- **RPO ≤ 5 minutes** (managed PITR).
- **RTO ≤ 4 hours** (restore + repoint + verify).

**Restore drill:**
- **Performed 2026-10-24** on real PostgreSQL 18.4. It was a **cold physical backup** (`pg_dump` was unavailable here), not a PITR restore.
- Result: 41 tables, 10,312 rows, every table's content hash identical after restore. Consistency checks pass. Application smoke passes (sign-in, 184 stakeholders).
- Backup copy 0.45 s for 72 MB; restore start 25 ms; migrations on restore 25 ms.
- Evidence: `evidence/restore-drill-2026-10-24.json`.
- **Still required (P0):** a PITR restore drill on the chosen managed provider.

**Ongoing:**
- `npm run db:drill` in CI.
- Monthly provider-level restore test.
- Daily `npm run db:check`.
