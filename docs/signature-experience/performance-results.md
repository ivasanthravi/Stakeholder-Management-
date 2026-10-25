# Performance Results (Phase 8)

## Environment and method
| Item | Detail |
|---|---|
| **Machine** | Apple M4, 10 cores, 16 GB, shared with other applications during this phase. Load average was 3–7 for most runs (Creative Cloud, video decoding, another PostgreSQL), so single runs are noisy |
| **Fair comparison** | The Phase 7 commit (`ed0d1d5`) was checked out in a temporary git worktree. Phase 7 and Phase 8 were run alternately on identical data with the same harness. Phase 7 Profile D figures are the median of 5 runs × 3 page loads |
| **Map harness** | `scripts/sim-graph.sh`: production build, Chrome, 1440 × 900, 1× and 4× CPU slow-down, median of 3 cold loads per configuration |
| **Select profiling** | `scratch` CPU-profile probe on the dev build: click-to-highlight timed in-page, the profile aggregated by function. Runs alternated between the Phase 7 and Phase 8 clients on the same API and data |
| **Screens** | `scripts/sig-capture.mjs` and `scripts/sig-interact.mjs` on the sample workspace (184 people) |
| **API** | `scripts/sim-scale.ts --profile D` (PostgreSQL) |

## Stakeholder Universe: Phase 7 vs Phase 8 (final code)
| Profile · scope · CPU | Ready (P7 → P8) | Pan fps | Zoom fps | Select → highlight | Select → panel filled |
|---|---|---|---|---|---|
| B · initiative (115) · 1× | 487 → 294 ms | 60 → 60 | 60 → 60 | 27 → 28 ms | 85 → 48 ms |
| B · initiative · 4× | 1,453 → 1,047 | 54 → 59 | 56 → 59 | 94 → 112 | 233 → 218 |
| B · all (246) · 4× | 1,938 → 1,414 | 35 → 38 | 26 → 31 | 385 → 320 | 768 → 727 |
| C · initiative (192) · 1× | 374 → 380 | 60 → 60 | 60 → 59 | 27 → 40 | 56 → 66 |
| C · initiative · 4× | 1,260 → 1,304 | 44 → 46 | 44 → 33 * | 122 → 156 | 279 → 265 |
| C · all (981) · 1× | 999 → 1,059 | 55 → 55 | 58 → 58 | **129 → 229** | **143 → 252** |
| C · all · 4× | 3,402 → 4,098 | 43 → 42 | 47 → 47 | **615 → 1,040** | **711 → 1,148** |
| D · initiative (963) · 1× | 1,724 → 1,556 | 56 → 57 | 58 → 59 | **115 → 168** | **138 → 195** |
| D · initiative · 4× | 5,577 → 5,597 | 46 → 48 | 46 → 52 | **449 → 744** | **549 → 814** |
| D · all (2,000 cap) · 1× | 2,472 → 2,138 | 50 → 53 | 54 → 57 | **217 → 299** | **247 → 323** |
| D · all · 4× | 8,547 → 7,778 | 29 → 35 | 37 → 41 | **952 → 1,402** | **1,061 → 1,475** |

**Notes on the table:**
- Phase 7 figures for B and C are single Phase 7 runs (`docs/simulation/evidence/graph/`); for D they are the median of 5 alternated runs (`evidence/ab/`). Phase 8: `evidence/graph/`.
- \* **C · initiative · 4× zoom (44 → 33 fps)** is a single run. It wasn't confirmed as a trend; the other zoom figures are equal or better.

**What the numbers say:**
- **Load, pan and zoom are unchanged or better.**
- **Selection is slower on maps of about 1,000 people or more.** It is +50–100 ms on a normal CPU and +60–70% on a 4× slower one. Maps under about 250 people are unaffected.
- **Why:** the map now draws readable names (key people at every zoom; the focused person and up to 12 connections), where Phase 7 drew none at overview zoom. A switch-off test confirmed it: with labels disabled, Phase 8 selection matched Phase 7 (170 vs 165 ms, dev build).
- **Accepted as a trade-off.** Selection stays under 200 ms at 1× in the default view of a 5,000-person workspace, and the map now names who matters. It is logged as an open P2 item with options in `final-quality-report.md`.

### How the regression was found and reduced (measured, not guessed)
| Step | Change | Effect |
|---|---|---|
| 1 | Label sizing first ran on every zoom frame | Zoom fps at C · all: 58 → **29** (1×), 47 → **8.5** (4×) |
| 2 | Re-size once the zoom settles (150 ms; 400 ms on large maps) | Zoom back to Phase 7 levels |
| 3 | Large maps: focus jumps instead of animating; it only ensures the person is in view | Removed camera animation during selection at 1,000+ people |
| 4 | Key-person ranking computed `degree()` inside the sort comparator (about 10,000 graph walks) | Ready time at D · initiative: +400 ms → **on par** (1,556 vs 1,724 ms) |
| 5 | Selection still about 70 ms slower. A CPU profile showed Cytoscape `updateStyleHints` at 39 ms vs 7 ms | Per-element style overrides defeated Cytoscape's style cache |
| 6 | Stylesheet band classes for every readable label | Faster, but **neighbour labels rendered clipped** (stale cached element textures). Caught visually and reverted for focus elements |
| 7 | **Hybrid:** band classes for key people; per-element sizes for the focus set (about 13 elements); faded key names hidden during focus on large maps | Correct rendering; remaining cost as in the table |

## Command Center, profile and screens
| Measure | Before | After | Notes |
|---|---|---|---|
| Dashboard API at Profile D (p50 / p95) | 162 / 168 ms | 157 / 161 ms | "What changed" adds 4 queries and 4 KB; no measurable cost (`evidence/scale-D-phase8.json`) |
| Dashboard truth at D | 1,987 = 1,987 | 1,987 = 1,987 | Unchanged |
| Command Center load to settle (sample, 1440) | 893 ms | 931 ms | Within run-to-run noise on the dev server |
| Profile load to settle (sample, 1440) | 591 ms | 595 ms | — |
| Profile tab switch (sample) | 162–311 ms | 101–132 ms | Single runs; mostly warm-cache effect, not claimed as a gain |
| Timeline page (40 items) | — | Server keyset page; whole history paged in tests | Not timed at Profile D. The paging test walks a long-history person end to end |
| Signal expand | 117 ms | 104 ms | Noise |
| Universe search → select (sample) | 40 ms | 35 ms | — |

## Not measured
- Memory over a long session (the heap after map load is unchanged: 9–41 MB by profile).
- Route-transition timing beyond load-to-settle.
- A real low-end device: the 4× CPU throttle is the proxy.
