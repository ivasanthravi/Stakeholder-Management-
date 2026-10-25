# Incident Response & Escalation (Phase 5)

**Status: procedure defined; NOT operational.**
- No alerting destination, uptime monitor, error tracker or on-call person exists yet (blocker B6).
- **Operational readiness must not be claimed until a test alert has reached a named person** and been acknowledged.
- **Related documents:**
  - Detection signals, thresholds and per-situation playbooks: `incident-runbook.md` (Phase 4).
  - Customer message templates: `docs/support/incident-communication-templates.md` (drafts; data-incident notices need legal review).

## Who receives alerts (to be named before launch)
| Role | Responsibility | Name / contact |
|---|---|---|
| Primary on-call (Incident Lead) | Receives every SEV1/SEV2 page, acknowledges within the agreed time, leads mitigation | **[TBD]** |
| Secondary on-call | Paged if the primary doesn't acknowledge within 15 minutes | **[TBD]** |
| Communications Lead | Customer and status-page updates | **[TBD]** |
| Executive owner | Decisions on rollout pause, refunds, public statements | **[TBD]** |
| Legal counsel | Any suspected personal-data exposure or cross-tenant access | **[TBD]** |

**Response targets:** to be set by the business. **None is promised to customers.** No SLA exists, and none should be implied.

## Alert routing
| Source | Signal | Route |
|---|---|---|
| Uptime monitor | `/api/ready` fails twice (1-minute interval) | Page primary on-call (SEV1) |
| Metrics scraper | `meridian_db_up == 0`; 5xx > 1% for 5 min; `meridian_jobs_dead` increase; queue lag > 900 s; unprocessed billing events > 0; email failures > 5/24 h | Page (SEV1/2) |
| Metrics scraper | p95 > 2 s for 10 min; AI error rate > 20%; AI cost > 2× trailing average; past-due spike | Notify channel (SEV3) |
| Error tracker | New error type in production | Notify channel; triage next business hour |
| Payment provider | Disputes, payout failures | Email to the executive owner and finance |
| Support inbox | Customer reports of data in the wrong place, or login failures en masse | Support lead escalates to primary on-call immediately |

## Escalation ladder
1. **Detect.** Alert, error tracker or customer report.
2. **Acknowledge** (primary on-call). If there's no acknowledgement within 15 minutes, page the secondary. After 30 minutes, page the executive owner.
3. **Classify** severity (incident-runbook §Severity). **Any suspected cross-tenant exposure or personal-data breach is SEV1.** Engage legal immediately, because notification duties may run on statutory clocks (counsel confirms per jurisdiction).
4. **Pause the rollout** for any SEV1/SEV2:
   - no new invitations to design partners;
   - no plan changes to pricing;
   - signup can be closed by restricting access at the edge.
5. **Mitigate.** Prefer reversible actions:
   - roll back (`rollback-plan.md`);
   - disable a feature through configuration: `AI_ENGINE=local`, workspace AI off, `BILLING_PROVIDER` unchanged;
   - or block a route with a hotfix.
6. **Communicate.** Within 30 minutes for SEV1/2, using the templates. Never speculate about data exposure.
7. **Recover and verify:**
   - `scripts/smoke.ts` with `SMOKE_EXPECT_ENV=production`
   - `npm run db:check`
   - watch the metrics for 30 minutes
8. **Review.** Blameless post-incident review within 5 business days for SEV1/2. Record it in `docs/launch/incidents/`.

## Before launch: prove it works
- [ ] Uptime monitor created; a synthetic failure (wrong path) pages the primary, who acknowledges.
- [ ] Error tracker wired through `setErrorReporter`; a test error appears with a request id and **no record content**.
- [ ] Metrics scraper receiving `/api/metrics`; each alert rule fired once in staging (e.g. stop the worker to trip queue lag).
- [ ] Tabletop exercise: "a customer reports seeing another company's stakeholder". Walk the ladder end to end.
