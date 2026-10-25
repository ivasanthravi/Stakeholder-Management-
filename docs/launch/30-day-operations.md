# First 30 Days: Operations Plan

**Applies from the first production deployment. Not started: there is no production.**
- **Principle:** reliability and customer evidence before new features.
- **Expansion rule:** no rollout stage widens while a SEV1/SEV2 is open or unexplained.

## Where the numbers come from (all first-party; no third-party analytics)
| Metric | Source | Event / query |
|---|---|---|
| Signup completion | `GET /api/operator/metrics` (`OPERATOR_EMAILS` only) → `signupCompletionRate` | `signup_started` (account created) → `signup_completed` (email verified). **Wired in Phase 5** |
| Workspace activation | operator metrics → `activationRate` | `workspace_created` → `first_engagement_recorded` |
| First stakeholder | operator metrics `events` | `first_stakeholder_added` |
| First AI briefing | operator metrics `events` | `first_ai_briefing_generated` (`engine` prop) |
| Time to first value | operator metrics → `medianSecondsToFirstValue` | workspace created → first stakeholder, engagement or briefing |
| Team invitations | operator metrics `events` | `teammate_invited`, `invitation_accepted` |
| Trial → paid | operator metrics → `trialConversion` | `trial_started`, `subscription_activated`, `trial_expired` |
| Retention | SQL on `analytics_event` / `audit_event` | Weekly active workspaces (any write in 7 days), cohort by `workspace_created` week |
| Support issues | Support inbox (`docs/support/contact-workflow.md`) | Tag by: login, billing, data, AI, bug, request |
| AI usage cost | Prometheus `meridian_ai_cost_micros_24h`, `meridian_ai_calls_1h`, `meridian_ai_errors_1h` | Zero while on the rules engine |
| Reliability | Uptime monitor; Prometheus `meridian_http_*`, `meridian_jobs_*`, `meridian_billing_*`, `meridian_email_failed_24h` | Thresholds in `incident-response.md` |

**Known gaps:**
- `upgrade_prompt_shown`, `marketing_cta_clicked` and `pricing_viewed` are defined but **not emitted** (P2), so marketing-to-signup conversion isn't measured.
- Users who opt out of analytics are excluded by design.

## Cadence
| When | Who | What |
|---|---|---|
| Daily, days 1–7 | On-call + product | Error tracker triage; metrics review; `npm run db:check`; support inbox to zero; check dead jobs and unprocessed billing events are 0 |
| Twice weekly, days 8–30 | Same | Same review, lighter |
| Weekly | Product + engineering + support | Funnel review (operator metrics, 7-day window); top 5 support themes; incidents and near-misses; decide **one** reliability or usability fix to ship |
| Day 14 | Leads | Rollout decision: widen the design-partner cohort or hold |
| Day 30 | Leads | Retrospective: launch criteria met? Paid pilot go/no-go (needs billing Stage B/C) |

## Initial targets (hypotheses to validate, not commitments)
These are for internal steering only. The business sets them before launch, and none is promised to customers.
- **Signup completion:** above [__]%. Investigate email deliverability first if it's low.
- **Activation** (first engagement within 7 days of workspace creation): above [__]%.
- **Median time to first value:** under [__] minutes.
- **Reliability:** zero SEV1, and 5xx below 0.5% weekly.

## Improvement intake
- **Candidates already known** (from Phases 4–5):
  - map layout off the main thread
  - wheel-scroll paint cost
  - MFA
  - object storage for exports
  - shared rate-limit store
  - bounce webhook
  - marketing events
- **Rule:** new features need evidence from at least two customers (support tags or interviews), and none ships in the first 14 days unless it fixes an incident.
- **Feedback:** collected per `docs/support/feedback.md`, tagged, and reviewed weekly.
