# Rollback Plan (Phase 5)

**Principle:** roll back the **application**, not the database.
- Migrations are forward-only and expand/contract. A release may only add what the previous release ignores, so release N-1 runs on release N's schema.
- **Proven locally** (deploy drill: N → N-1 → N on one database, 14/14 smoke checks at each step).
- **Phase 5 migration `0007_audit_rls`** is additive: it adds a policy that only restricts writes the previous release never makes. It is rollback-compatible.

## Triggers (any one)
- `/api/ready` failing after deploy.
- 5xx > 1% for 5 minutes.
- Smoke test failure.
- Sign-in or workspace creation broken.
- Any suspected data exposure.
- Billing webhooks failing after deploy.

**When unsure, roll back first and investigate after.**

## Application rollback (target: under 10 minutes)
1. Announce in the incident channel and pause the rollout.
2. Redeploy the previous release's artifact (platform "rollback" or the previous image tag). **Do not run a database restore.**
3. Smoke: `BASE_URL=https://app.<domain> SMOKE_EXPECT_ENV=production SMOKE_EMAIL=… SMOKE_PASSWORD=… npx tsx scripts/smoke.ts`. Add `SMOKE_LEGACY=1` only for releases before Phase 4.
4. Watch the metrics for 30 minutes. Keep the bad release's logs and request ids for the review.

## Database recovery (only when data is damaged)
1. **Decide** with the executive owner. Restoring loses writes after the restore point.
2. **Restore** by PITR to just before the damaging event, **as a new instance**. Never overwrite the original, which is kept for forensics.
3. **Point the app at the restored instance:**
   1. Repoint `DATABASE_URL`.
   2. Run `ANALYZE` (stale statistics turned 8 ms queries into seconds in Phase 4).
   3. Run `npm run db:check`.
4. **Reconcile billing.** Enqueue `billing.reconcile`, so subscriptions are re-fetched from the provider, which is the source of truth.
5. **Communicate** what was lost (time window) to affected customers, using the templates (legal reviews it if personal data is involved).

## Feature-level rollback (no deploy)
| Problem | Switch |
|---|---|
| AI provider misbehaving or costly | `AI_ENGINE=local` (restart), or AI off per workspace in Settings › AI |
| Billing provider incident | Leave the provider configured. Webhooks retry for days; run `billing.reconcile` after it recovers. **Don't** switch providers mid-incident |
| Email provider incident | Retries are automatic; requeue dead `email.retry` jobs afterwards |
| Background jobs causing harm | `JOBS_ENABLED=false` on all processes (queued jobs wait safely) |

## Verified / not verified
| Item | Status |
|---|---|
| App rollback on the same database (production artifact, real PostgreSQL) | VERIFIED locally (Phase 4 deploy drill) |
| Restore from backup, migrations on restore, consistency checks | VERIFIED locally (cold physical backup) |
| Platform rollback button and timing | NOT VERIFIED (no platform) |
| Provider PITR restore and timing | NOT VERIFIED (B5) |
