# Incident Response Runbook

**Status:** the procedures are defined, but **the alerting destinations and on-call rota are not configured yet** (P0 before launch). Roles are placeholders until the team is named.

## Severity
| Sev | Definition | Examples | Response target (to be confirmed by the business) |
|---|---|---|---|
| **SEV1** | Data exposure, cross-tenant access, data loss, total outage, payments charging incorrectly | Isolation breach; DB loss; checkout charging twice | Immediate, all hands |
| **SEV2** | Major feature down for many customers, or degraded security control | Sign-in failing; webhooks not processing; email not sending; AI calls all failing | Same business day |
| **SEV3** | Partial degradation with a workaround | Slow dashboard; map layout failing; one template broken | Next business day |
| **SEV4** | Cosmetic or single-user | Misaligned UI; typo | Backlog |

**Any suspected cross-tenant exposure or personal-data breach is SEV1.** Legal must be engaged immediately, because notification duties may run on statutory clocks; counsel confirms these per jurisdiction.

## Detection: signals and alert thresholds
| Signal (source) | Alert when | Sev |
|---|---|---|
| `/api/ready` (uptime monitor, every 1 min) | 2 consecutive failures | SEV1 (outage) |
| `meridian_db_up` (metrics) | 0 | SEV1 |
| `meridian_http_requests_total{class="5xx"}` rate | > 1% of requests over 5 min | SEV2 |
| `meridian_http_request_duration_seconds` p95 | > 2 s over 10 min | SEV3 |
| `meridian_jobs_dead` | > 0 (any increase) | SEV2: billing sync, email retry, export or deletion failed permanently |
| `meridian_jobs_oldest_queued_seconds` | > 900 | SEV2: worker stalled (`/api/ready` also returns 503) |
| `meridian_billing_events_unprocessed` | > 0 | SEV2: subscriptions may be out of date |
| `meridian_billing_events_failed_24h` / webhook 400s in logs (`billing webhook rejected`) | sustained increase | SEV2: secret mismatch or attack |
| `meridian_subscriptions_past_due` | sudden jump | SEV3: provider issue |
| `meridian_email_failed_24h` | > 5 | SEV2: verification and reset emails not arriving |
| `meridian_ai_errors_1h` / `meridian_ai_calls_1h` | > 20% | SEV3: model provider issue (product falls back to rules) |
| `meridian_ai_cost_micros_24h` | > 2× trailing average | SEV3: cost anomaly |
| Error tracker (via the `setErrorReporter` hook) | new error type in production | triage |
| `npm run db:check` (daily cron) | any FAIL | SEV2/3 by check |

## Response
1. **Declare.** Open an incident channel. Assign an Incident Lead (IL) and Communications Lead (CL), even if that's one person. Note the start time.
2. **Assess.** Severity, scope (which workspaces and features) and data impact. Use request ids (`x-request-id`) to correlate logs. Logs contain no record content.
3. **Mitigate first.** Pick the matching playbook below. Prefer reversible actions.
4. **Communicate.** CL posts within 30 minutes for SEV1/2, using the templates in `docs/support/incident-communication-templates.md`. Never speculate about data exposure; legal reviews any data-incident notice.
5. **Recover and verify.** Smoke test (`scripts/smoke.ts`), `npm run db:check`, then watch the metrics for 30 minutes.
6. **Close.** Post-incident review within 5 business days for SEV1/2: blameless, with timeline, root cause, contributing factors, actions with owners. Record it in `docs/launch/incidents/` (not yet created).

## Playbooks
| Situation | Mitigation |
|---|---|
| **Bad deploy** (errors after release) | Roll back to the previous release: deployment-runbook §Rollback. Migrations are forward-compatible by policy, so the previous app runs on the new schema (verified in the deploy drill) |
| **Database unavailable or corrupted** | Fail over or restore by PITR to just before the event, on a new instance. Point `DATABASE_URL` at it. `ANALYZE`. Run `npm run db:check`. The billing reconcile job re-syncs subscriptions from the provider |
| **Suspected cross-tenant exposure** | SEV1. Preserve logs. Identify the route and request ids. If the cause is in app code, deploy a fix or block the route (temporary 503) via a hotfix. RLS remains the backstop: check whether RLS was bypassed (owner connection) or the query ran under `withTenant`. Legal engaged |
| **Webhooks failing** (400s) | Check that the signing secret matches the provider dashboard, then rotate. While failing, the provider retries (Stripe: up to 3 days; Paddle: about 2 days). After the fix, run `billing.reconcile` (`INSERT INTO job (kind) VALUES ('billing.reconcile')`) |
| **Webhooks accepted but not applied** | Check `job` rows of kind `billing.sync` (status, last_error). Fix the cause; reset dead jobs: `UPDATE job SET status='queued', attempts=0, run_at=now() WHERE kind='billing.sync' AND status='dead'` |
| **Email not sending** | Check the Postmark status page and token. `email_message.status='failed'` rows show errors. Retries are automatic; requeue dead `email.retry` jobs after the fix |
| **AI provider outage or cost spike** | Product degrades to the rules engine automatically for briefings; analysis returns 503 with no change. To stop spend immediately, set `AI_ENGINE=local` and restart, or disable AI per workspace (Settings › AI) |
| **Credential leak** (key or secret in logs or repo) | Rotate immediately: `AUTH_SECRET` (signs everyone out), provider keys, webhook secrets, `METRICS_TOKEN`. Audit access logs |
| **Abuse** (sign-up, contact, invite spam) | Limits are per IP and per workspace. Check that `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` are correct. Block at the edge if needed |

## Contacts (placeholders)
- Incident Lead rota: [TBD]
- Communications: [TBD]
- Legal counsel: [TBD]
- Hosting provider support: [TBD]
- Payment provider support: [TBD]
- Email provider support: [TBD]
