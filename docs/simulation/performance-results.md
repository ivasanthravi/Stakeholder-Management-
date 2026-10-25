# Performance and Load Results (Phase 7)

## Environment (as reported in every evidence file)
| Component | Setup |
|---|---|
| Machine | Apple M4, 10 cores, 16 GB |
| Database | PostgreSQL 18.4 (embedded-postgres), `ANALYZE` after load |
| API | One Node process (`tsx server/index.ts`, development mode, pool of 10), background jobs off |
| Load generator | Same machine |

**Read these numbers as a local baseline, not production capacity.**
- The API, database and load generator compete for the same CPU.
- The API is a single process; production would run several.
- The API's rate limit was raised for the run, because every virtual user comes from one IP. Authorisation was **not** changed: every request uses a real session and row-level security.

**Harness:** `app/scripts/sim-scale.ts --profile C|D|E`.
- Construction industry, seed 7.
- Load mix: 85% reads (Command Center, Directory, profiles, registers, search, map) and 15% writes (engagements, commitments).
- 20 s per step at 1, 10, 25, 50 and 100 virtual users. Each user waits for each response before sending the next request (closed loop, no think time).
- Saturation guard: stop if errors exceed 5% or p95 exceeds 10 s. **It never triggered.**

**Evidence:**
- `evidence/scale-{C,D,E}.json`: final runs, after all fixes.
- `evidence/scale-{C,D}-before.json`: before the Phase 7 fixes.

## Datasets
| Profile | Workspaces | Users | Stakeholders | Relationships | Activity records | Database size |
|---|---|---|---|---|---|---|
| C | 1 | 25 | 1,001 | 5,000 | 9,904 | 22 MB |
| D | 1 | 100 | 5,001 | 25,000 | 49,450 | 67 MB |
| E | 50 | 150 | 10,050 | 50,000 | 99,471 | 125 MB |

## Truth at volume (the numbers users see equal the database)
| Check | C | D | E (main tenant) |
|---|---|---|---|
| Overdue commitments: database / register total / Command Center count | 387 / 387 / 387 | 1,987 / 1,987 / 1,987 | 84 / 84 / 84 |
| Overdue items listed on the Command Center | 59 | 60 | 57 |
| Older overdue items, counted outside the ±30-day horizon (team) | 359 | 1,813 | 73 |
| Long engagement history: database / returned / stated total | 142 / 142 / 142 | 310 / 200 / **310** | 34 / 34 / 34 |

**Before Phase 7** at D:
- the Command Center listed **0** overdue commitments (1,987 in the database), and gave no true count;
- the long history showed 200 with no total.

## Endpoint latency (warm, sequential; p50/p95)
| Endpoint | D before | **D after** | C after | E after (one tenant) |
|---|---|---|---|---|
| Command Center (dashboard) | 269/304 ms, 1,057 KB | **162/168 ms, 624 KB** | 62/65 ms, 239 KB | 37/37 ms, 112 KB |
| Directory, first page | 156/180 ms | **11/12 ms** | 16/28 ms | 5/6 ms |
| Directory, sorted by name | 173/246 ms | **11/13 ms** | 15/17 ms | 5/7 ms |
| Directory, deep page | 168/289 ms | **12/13 ms** | 13/18 ms | 4/6 ms |
| Directory, stance filter | 29/30 ms | 11/14 ms | 13/18 ms | 3/3 ms |
| Global search | 14/19 ms | 15/17 ms | 12/19 ms | 3/3 ms |
| Profile overview (long history) | 7/7 ms | 7/7 ms | 17/40 ms | 4/6 ms |
| Engagements, first page | 34/34 ms | 33/38 ms | 15/17 ms | 3/3 ms |
| Overdue commitments | 16/17 ms | 15/15 ms | 12/14 ms | 2/2 ms |
| Organisations | 59/71 ms | 23/26 ms | 33/44 ms | 6/7 ms |
| Relationship map, whole workspace | 102/121 ms, 1.9 MB | 105/120 ms, 1.9 MB | 66/70 ms, 1.5 MB | 9/11 ms, 0.3 MB |

**Notes:**
- **The harness's "default initiative" map row was mislabelled.** It sent no initiative parameter, which means the whole workspace, so it duplicates the last row and is omitted here. The label is now corrected. The real default view is measured in the browser (`graph-stress-results.md`).
- **C after vs C before:** small endpoints are 3–8 ms slower and the Directory 28 ms faster. The changes are run-to-run noise on a shared machine. The C run before the fixes had no truth regressions to fix.

## Load
| Users | C before | **C after** | D before | **D after** | E before | **E after** (10 tenants) |
|---|---|---|---|---|---|---|
| 1 | 42 req/s · p95 53 ms | **86 · 34 ms** | 11 · 277 ms | **22 · 162 ms** | 90 · 43 ms | **120 · 36 ms** |
| 10 | 151 · 140 ms | **357 · 69 ms** | 46 · 616 ms | **71 · 455 ms** | 363 · 83 ms | **523 · 65 ms** |
| 25 | 119 · 391 ms | **281 · 166 ms** | 43 · 1,118 ms | **45 · 1,096 ms** | 362 · 146 ms | **547 · 98 ms** |
| 50 | 140 · 516 ms | **309 · 262 ms** | 41 · 1,864 ms | **66 · 1,392 ms** | 281 · 446 ms | **500 · 165 ms** |
| 100 | 127 · 1,233 ms | **277 · 526 ms** | 43 · 3,499 ms | **107 · 1,303 ms** | 272 · 674 ms | **520 · 271 ms** |
| Errors | 0% | 0% | 0% | 0% | 0% | 0% |

**Reading the load results:**
- **No errors at any step, and the saturation guard never fired.**
- **Profile D is CPU-bound in one Node process.**
  - Throughput is 45–107 req/s from 10 users upward; server CPU is 138–158% (one event loop plus PostgreSQL).
  - At 100 users the p95 is 1.3 s.
  - The Command Center (about 160 ms of CPU per request at 5,000 stakeholders) and the map (about 100 ms) dominate.
  - The 25-user step (45 req/s) is below the 10- and 50-user steps. That is a dip, not a trend; it was not reproduced.
- **What D means in practice.**
  - 100 people actively clicking at once is far above normal use for a 100-user workspace.
  - Even so, the p95 stays under 1.5 s with no errors.
  - Scaling out (more API processes) is the production lever. This was not tested.
- **Isolation under load:** 8,812 Directory responses checked across 10 tenants, **0 foreign records**.

## What was improved in Phase 7 (by measurement, not by guess)
| Change | Effect at D |
|---|---|
| Directory two-phase query (pick the page's ids first, then join) | 156 → 11 ms |
| Command Center: per-kind caps, bounded horizon, cooling evidence only for cooling people, rewritten initiative coverage | 269 → 162 ms; 1,057 → 624 KB; and correct |
| Graph: pick ids first, then lateral joins (fixing a regression introduced earlier in Phase 7: 381 → 1,191 → 525 ms in-process) | Map query bounded |
| `ANALYZE` after simulation loads | PGlite map 117 s → 0.21 s (tooling) |

## Open performance items
- R1: the Command Center horizon is still about 820 items (624 KB) at D.
- R2: no response compression.
- R3: per-person engagement aggregation costs about 90 ms.
- R4: the map at 2,000 people on a slow CPU is not smooth.

All four are in `remaining-issues.md`.

## Run it yourself
```bash
cd app
npx tsx scripts/sim-scale.ts --profile C               # about 3 minutes
npx tsx scripts/sim-scale.ts --profile D --vus 1,10,50  # shorter run
./scripts/sim-graph.sh                                  # map stress, profiles A–E (about 20 minutes)
```
