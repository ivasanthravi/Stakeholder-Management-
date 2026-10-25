# Infrastructure Plan (Phase 5)

**Status: PREPARED, NOT PROVISIONED.**
- The hosting provider is undecided by choice ("decide later", 2026-10-24).
- No paid service, domain, DNS record or cloud account has been created.
- Everything below is provider-neutral. Each component lists the requirement a provider must meet.
- Prices: `cost-research-2026-10-24.md`.

## 1. Architecture (unchanged from Phases 1–4; no platform migration)
```
                ┌────────────── platform edge (managed TLS, HTTP→HTTPS, 1 proxy hop) ──────────────┐
 browser ──────▶│  app.<domain>  →  Meridian container (Node 24, Hono)                             │
                │                    · serves the SPA (marketing pages + app) and /api/* — one origin │
                │                    · background worker + schedules in-process (JOBS_ENABLED)        │
                └──────────────┬───────────────────────────────────────────────────────────────────┘
                               │ TLS, private network where offered
                    managed PostgreSQL ≥ 15 (PITR) ── provider backups
 outbound only: Postmark (email) · Stripe or Paddle (billing) · Anthropic (optional) · error tracker
```
- **One process type, one origin.** Cookies are first-party and host-only. No CORS. The same artifact runs in staging and production; only configuration differs.
- **Single instance at launch.** Two changes are required before scaling out (both P1):
  - **Exports** are written to `EXPORT_DIR` on local disk. They need a persistent volume now, and object storage before a second instance.
  - **Rate limits** are kept in memory per process. They need a shared store before a second instance.

## 2. Environments
| | Development | Staging | Production |
|---|---|---|---|
| Purpose | Local work | Pre-release verification | Customers |
| `NODE_ENV` / `DEPLOY_ENV` | development | production / **staging** | production / **production** |
| Data | PGlite + synthetic sample | **Synthetic only**. Never customer data, never a production copy | Customer data |
| Database | PGlite | Managed Postgres, *separate instance or project* | Managed Postgres with PITR |
| Email | Log transport (dev outbox) | Log transport, or a Postmark *test* server stream to test recipients | Postmark (live stream) |
| Billing | Simulator | Provider **sandbox** (staging refuses live keys: enforced in code) | Provider **live**, only with `BILLING_LIVE_APPROVED=true` after explicit approval |
| AI | Rules engine | Rules engine, or the model with synthetic data only | Rules engine until the model path is approved |
| Access | Local | Team only (platform auth or IP allow-list recommended) | Public |

**Guards in code (Phase 5, tested in `security.test.ts`):**
- Production refuses to start without:
  - `AUTH_SECRET` and `DATABASE_URL`
  - an **https** `APP_URL`
  - an explicit `MAIL_TRANSPORT=postmark` with a token
- Production refuses the billing simulator.
- Staging refuses `BILLING_LIVE_APPROVED`.
- `/api/health` reports `environment` (`staging` | `production`). Smoke tests assert it with `SMOKE_EXPECT_ENV`, so the wrong environment can't be verified by mistake.

## 3. Components and provider requirements
| Component | Requirement | Prepared | Open |
|---|---|---|---|
| App hosting | Container (or Node buildpack). Health-checked rolling or zero-downtime deploys gated on `GET /api/ready`. One-click rollback to the previous image. Managed TLS. Platform secret store. Persistent disk for `EXPORT_DIR` | `app/Dockerfile` (multi-stage, non-root, HEALTHCHECK). Runtime artifact proven by the deploy and staging rehearsals | Provider choice; image never built here (no container runtime) |
| PostgreSQL | ≥ 15, TLS, PITR ≥ 7 days, an owner role with **CREATEROLE** (for `app_user`), no superuser needed, private networking where offered | Rehearsed: the app ran as a non-superuser, non-BYPASSRLS owner with only CREATEROLE (staging rehearsal) | Provider choice; PITR drill (B5) |
| Connection pooling | App pool of 10 per instance (`pg`). With ≤ 2 instances no external pooler is needed. If a transaction-mode pooler is added later, `withTenant` uses `SET LOCAL` inside transactions, which is compatible | — | Size against the provider's connection limit |
| Background jobs | In-process durable queue (Postgres `SKIP LOCKED`), so no separate service. With several web replicas, keep `JOBS_ENABLED=true` on one process, or on all (jobs are claimed safely) | `/api/ready` reports queue lag; metrics `meridian_jobs_*` | — |
| Object storage | Before a 2nd instance: S3-compatible bucket for exports (R2 or S3), private, lifecycle 7 days | — | **Not implemented** (P1) |
| Email | Postmark server, verified sending domain with DKIM, custom Return-Path, DMARC | Adapter, templates, retries with backoff. Permanent rejections are recorded as failed and **not retried**: invalid address (300) and inactive recipient (406). Postmark itself suppresses hard bounces and spam complaints, which is what produces the 406. Tested with a stubbed API in `email.test.ts`. DNS records in §5 | Account, domain, token. **No bounce/spam webhook is implemented**: bounces that happen after acceptance are visible only in Postmark (P2) |
| Error tracking | Any provider reachable from `setErrorReporter(r)` in `server/log.ts` | The hook and structured error logs exist | **No SDK wired**; needs a DSN (Sentry or GlitchTip) |
| Uptime / alerting | External check on `https://app.<domain>/api/ready` every minute; alert routing to a named person | Alert thresholds: `incident-response.md` | Account, on-call names (B6) |
| Metrics | Prometheus scrape of `/api/metrics` (Bearer `METRICS_TOKEN`), e.g. Grafana Cloud or Better Stack | Endpoint tested | Scraper account |
| CI/CD | `.github/workflows/ci.yml` runs the release gate, then E2E | Workflow written | **No git remote**: the URL is needed (B10) |

## 4. Secrets and configuration
- **Where secrets live:** only in the platform's secret store, per environment. They never go in the image, the repo, CI logs, screenshots or chat. `.env` is for development only and is git-ignored.
- **Staging vs production keys:** staging and production never share keys. Sandbox and live billing keys, and Postmark test and live streams, are kept apart.
- **Required in production:**
  - `DATABASE_URL`
  - `AUTH_SECRET` (≥ 48 random bytes)
  - `APP_URL=https://app.<domain>`
  - `MAIL_TRANSPORT=postmark`, `POSTMARK_SERVER_TOKEN`, `MAIL_FROM`
  - `CLIENT_IP_HEADER` or `TRUSTED_PROXY_HOPS` plus `TRUSTED_PROXIES` (verify per platform)
  - `METRICS_TOKEN`
  - `OPERATOR_EMAILS`, `SALES_EMAIL`, `EXPORT_DIR`
- **Billing (production):** `BILLING_PROVIDER`, the provider keys, `BILLING_PRICE_*`, and the webhook secret. `BILLING_LIVE_APPROVED=true` only after explicit approval.
- **AI (optional):** `ANTHROPIC_API_KEY`, `AI_ENGINE`.
- **Rotation:**

  | Secret | Effect of rotating | How |
  |---|---|---|
  | `AUTH_SECRET` | Signs everyone out | Rotate in the platform secret store |
  | Provider keys | — | Roll in the provider dashboard and the secret store together |
  | `METRICS_TOKEN` | — | Update the app and the scraper together |

## 5. Domain, DNS and HTTPS (placeholders; nothing purchased or changed)
**Strategy: a single application origin.** The marketing pages are part of the same app, so one origin serves everything and keeps cookies first-party.

| Name | Purpose | Record (placeholder) |
|---|---|---|
| `app.example.com` | The app, marketing pages, API, auth callbacks, webhooks | CNAME → platform hostname, with a managed certificate |
| `example.com` (apex) | Canonical marketing entry | Platform ALIAS/ANAME to the same app, **or** a 301 to `https://app.example.com`. Choose one and make the other redirect (canonical URL) |
| `www.example.com` | — | 301 → the canonical host |
| Sending domain `example.com` | Postmark | DKIM TXT (Postmark-issued selector); Return-Path CNAME `pm-bounces.example.com` → `pm.mtasv.net`; SPF via the Return-Path domain; `_dmarc` TXT `v=DMARC1; p=none; rua=mailto:dmarc@example.com`, tightened to `quarantine` after 2–4 weeks of clean reports |
| `CAA` | Restrict issuance to the platform's CA | Per provider |

- **Verified in the staging rehearsal (local CA):**
  - HTTP→HTTPS 301 preserving path and query (emulating the edge)
  - certificate valid for the hostname
  - HSTS and CSP sent
  - `__Secure-` session cookie with `Secure; HttpOnly; SameSite=Lax`
  - no CORS headers for foreign origins
  - CSRF refusal
  - foreign auth callback refused
- **Not verifiable until a domain exists:** public certificate validity, DNS propagation, DKIM/SPF/DMARC alignment, HSTS preload eligibility (don't preload at launch).

## 6. Backups and recovery
- **Provider PITR:** ≥ 7 days, plus daily snapshots retained 30 days. The retention period is a business decision; see legal drafts item 5.
- **Proposed objectives:** RPO ≤ 5 min, RTO ≤ 4 h. **These are not yet approved.**
- **Proven:**
  - local cold-backup restore (Phase 4)
  - migration replay on restore
  - `db:check`
- **Required:** a PITR restore drill on the chosen provider, timed, against staging (B5).

## 7. Monthly cost (from `cost-research-2026-10-24.md`; verify before purchase)
| Profile | Estimate | Includes |
|---|---|---|
| Lean | ≈ **$75 / month** | Production and staging on a Render-class platform, 1 GB Postgres with 3-day PITR, Postmark Basic, free tiers for monitoring |
| Comfortable | ≈ **$214 / month** | 2 app instances, 7-day PITR, Sentry Team, Better Stack Responder, Postmark Pro |
| India data residency | Add ≈ $30–130 / month | RDS Mumbai or Supabase Mumbai |

**Variable costs on top:**
- Anthropic usage (if enabled; capped per plan by the allowance)
- payment-provider fees
- tax
