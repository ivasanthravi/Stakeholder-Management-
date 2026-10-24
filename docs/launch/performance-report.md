# Performance & Load Report (Phase 4)

**Conditions (be careful when generalising):**
- **Hardware:** Apple M4 (10 cores, 16 GB). The server, database and load generator all run on the same machine.
- **Database:** PostgreSQL 18.4 via `embedded-postgres`, which is an **x86_64 build running under Rosetta**. Absolute database timings are therefore pessimistic. Use them as a before/after baseline, **not as capacity numbers**.
- **No staging environment exists.** Nothing here was measured against real infrastructure or real network latency.

**Dataset:** the synthetic sample workspace scaled to **2,000 stakeholders**: 32,628 engagements, 130,147 engagement participants, 2,401 organization links, 3 initiatives.

**Scripts:**
- `app/scripts/profile-endpoints.ts` (sequential latency plus `pg_stat_statements`)
- `app/scripts/load-test.ts`
- `app/audit/perf.mjs` (browser interaction frames)

**Raw results:** `docs/launch/evidence/*.json`.

## Budgets
| Area | Budget | Status |
|---|---|---|
| API reads, single user (p50) | ≤ 300 ms at 2,000 stakeholders | Met after fixes (all ≤ 195 ms) |
| API under 25 concurrent users, no think time (p95) | ≤ 1 s | Met after fixes (≤ 781 ms) |
| Error rate under load | 0% | Met |
| Public pages LCP (local, production build) | ≤ 2.5 s | Met (1.1 s desktop, 1.3 s mobile with 4× CPU throttle: Phase 3 measurement) |
| CLS | ≤ 0.1 | Met (≤ 0.002) |
| Interaction frames | p95 ≤ 33 ms on 4× CPU | Met except table wheel-scroll and map arrow keys (see P2) |

## Critical finding: quadratic queries (fixed)
**The problem:** at 2,000 stakeholders, the first load test managed **8 req/s, with dashboard p50 7.6 s and graph p50 7.4 s**. Profiling showed:

1. **Graph and directory:** the queries joined workspace-wide aggregate CTEs (`last` engagement and primary org) to each stakeholder using a join *filter*. The planner nested-looped about 1,000 × 1,000 rows twice: "Rows Removed by Join Filter: 994,903", plus an external sort spilling to disk.
   - **Fix:** per-stakeholder `LATERAL` lookups that use the existing `ep_stakeholder_idx`, `so_stakeholder_idx` and `commitment_stakeholder_idx` indexes. Results are identical.
2. **Stale statistics after bulk load:** a cold directory query took **72 s** and the dashboard initiative summary took 1.05 s before autovacuum analysed the new tables. With statistics in place the same summary runs in 8 ms.
   - **Fix:** the seed (and any bulk import) runs `ANALYZE`. The runbook adds `ANALYZE` after restores and imports.

**Sequential latency (median of 7, at 2,000 stakeholders):**

| Endpoint | Before | After |
|---|---|---|
| Graph (initiative) | 3,206 ms | **91 ms** |
| Dashboard | 1,579 ms | **195 ms** |
| Directory page (100 rows, sorted) | 319 ms | **191 ms** |
| Directory filter | 198 ms | **31 ms** |
| Profile overview | 94 ms | **4 ms** |
| Engagements | 138 ms | 29 ms |
| Search | 12 ms | 9 ms |
| Commitments (overdue), decisions, lookups, activity | ≤ 13 ms | ≤ 3 ms |
| Auth + tenant gate + entitlements (empty route) | 3 ms | 1 ms |

## Load test (25 virtual users, no think time, 20 s, mixed 85% reads / 15% writes)
| | Before fixes | After fixes |
|---|---|---|
| Throughput | 8 req/s | **63 req/s** |
| Errors | 0 | **0** |
| Dashboard p50 / p95 | 7,630 / 10,064 ms | 602 / 758 ms |
| Directory page p50 / p95 | 2,214 / 4,527 ms | 625 / 781 ms |
| Graph p50 / p95 | 7,364 / 7,905 ms | 398 / 549 ms |
| Search p50 / p95 | 1,528 / 4,067 ms | 251 / 374 ms |
| Writes (engagement / commitment create) p95 | 5,369 / 3,085 ms | 446 / 411 ms |
| Peak DB connections | 11 (pool 10) | 11 (pool 10) |
| Server RSS | 52–71 MB | 94 MB, stable |

**Interpretation:**
- **Bottleneck:** under concurrency, latency is now dominated by queueing on the 10-connection pool.
- **Scale:** 25 zero-think-time virtual users is roughly equivalent to several hundred active users. That's comfortably above the launch assumption of 10–50 workspaces.
- **Not tested:** behaviour beyond 25 virtual users and on production hardware.

**Other scenarios (after fixes):**

| Scenario | Result |
|---|---|
| 50 concurrent sign-ups + workspace creation | 0 errors. Sign-up p95 584 ms, CPU-bound password hashing. Workspace create p95 50 ms |
| AI burst (40 concurrent briefings and copilot answers, rules engine) | 0 errors. p95 74–80 ms. The per-user AI limit (20/min) applies by design |
| Billing webhook burst (240 signed deliveries, 40 of them redeliveries) | 0 errors, p95 44 ms. **200 events stored (duplicates dropped)**. Sync jobs collapsed to 20 (one per subscription). The burst deliberately referenced unknown subscriptions, so syncs fail and retry with backoff. This measured ingestion and dedupe, not successful sync throughput |

## Front-end interaction performance (production build, 184-person sample, 4× CPU throttle, median of 3)
- **Cold load:** Home ledger visible in **262 ms** (FCP 220 ms at 1×).
- **Smooth (p95 ≤ 16.8 ms, ≤ 3% dropped frames):**
  - table keyboard navigation
  - peek panel
  - command palette
  - profile tabs
  - map hover, zoom and pan
  - lens transitions
  - Home interactions
  - engagements timeline
- **P2 issues:**
  - table wheel-scroll at 4× CPU drops **27.7%** of frames (0.8% at 1×)
  - map arrow-key selection p95 49.9 ms with a 91 ms long task
  - map grouping (fcose) re-layout has a **245 ms long task** (58 ms at 1×)
- **Remedies (planned, not done):**
  - move fcose layout to a Web Worker
  - reduce row paint cost during wheel scroll

## Bundle
- Initial app JS is about 152 kB gzip.
- Marketing pages add 32 kB gzip, lazy-loaded.
- Settings: 27 kB gzip.
- Map (Universe chunk, cytoscape): 269 kB gzip, lazy-loaded on first map visit.

## Not measured (P1 before GA)
- Production-like hardware and network.
- More than 25 concurrent users, and sustained soak tests (memory over hours).
- The connection-pool size best suited to the real database.
- Live AI model latency and cost.
- Core Web Vitals field data (no deployment).
