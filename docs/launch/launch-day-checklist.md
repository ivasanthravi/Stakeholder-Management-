# Launch-Day Checklist

**Use only after `final-go-no-go.md` says GO, and every approval in `production-deployment-plan.md` §Approvals is recorded.**
- If any **stop** item fails, pause the rollout and follow `rollback-plan.md` / `incident-response.md`.
- Record the time and the initials of whoever checked each item.

## T-24 h
- [ ] Release gate green on CI for the exact commit being deployed; version tagged; CHANGELOG entry.
- [ ] Staging runs the same artifact; `scripts/staging-rehearsal.ts` (or the staging equivalent) passed for it.
- [ ] Production PITR is enabled and the latest backup is younger than 24 h.
- [ ] On-call primary and secondary confirmed. A test page was acknowledged today.
- [ ] Support owner available for the launch window. Support inbox and templates ready.
- [ ] Previous release artifact identified for rollback.

## Deploy (T-0)
| # | Check | How | Stop if |
|---|---|---|---|
| 1 | Deployment healthy | Platform shows the new release; `GET /api/ready` returns 200 | Not ready within 5 min |
| 2 | Right environment | `curl https://app.<domain>/api/health` reports `"environment":"production"` | Anything else |
| 3 | Smoke | `BASE_URL=https://app.<domain> SMOKE_EXPECT_ENV=production SMOKE_EMAIL=… SMOKE_PASSWORD=… npx tsx scripts/smoke.ts` | Any FAIL |
| 4 | Domain and TLS | Valid public certificate; `http://` → 301 `https://`; apex/www → canonical host | Certificate error or redirect loop |
| 5 | Authentication | New test account (team address): sign up → verification email arrives → sign in → sign out → password reset email arrives | No email within 5 min; any error |
| 6 | Workspace creation | Create a workspace with a template; add one stakeholder; delete the workspace afterwards (cooling-off) | Error |
| 7 | Database | `meridian_db_up 1`; `npm run db:check` (read-only) passes | Any FAIL |
| 8 | AI | Workspace briefing shows "Built-in rules engine" (model off) | Model label appears without approval |
| 9 | Billing | Plans page shows only approved prices. If live billing is approved: Stage C verification done. If not: checkout isn't offered | Unapproved price or provider mode |
| 10 | Email | Postmark activity shows delivered verify and reset messages; DKIM and Return-Path verified | Bounces or spam placement |
| 11 | Monitoring | Uptime monitor green; error tracker receiving; metrics scraped in the last 5 min | Any blind spot |
| 12 | Error rate | 5xx < 0.5%, p95 < 2 s over the first 30 min | Thresholds breached |
| 13 | Support | Support contact on the site works (test message received) | Not received |
| 14 | Rollback readiness | Previous artifact still deployable; rollback steps open in a tab | — |

## First 4 hours
- [ ] Watch errors, latency, job queue, webhooks and email every 30 min.
- [ ] Invite only the approved cohort (`production-deployment-plan.md` §Rollout). No public announcement unless the public-launch stage is approved.
- [ ] Log every customer-visible issue in the incident channel, even small ones.

## End of day
- [ ] Summary posted: deploy time, issues, metrics, decisions.
- [ ] Next day's on-call confirmed.
