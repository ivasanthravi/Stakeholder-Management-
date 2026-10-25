# Relationship Graph Stress Results (Phase 7)

**Harness:** `app/scripts/sim-graph.sh`, which drives `scripts/sim-graph-measure.mjs`.
- **Setup per profile:** construction, seed 7. Each profile is loaded into its own PGlite database and served from a **production build** (`vite preview`) with the API on the same machine.
- **Browser:** Chrome (Playwright) at 1440 × 900, device pixel ratio 1.
- **CPU:** measured at 1× and 4× slow-down (CDP throttling; 4× stands in for a mid-range laptop on battery).
- **Runs:** each figure is the median of 3 cold page loads.
- **Raw evidence:** `evidence/graph/*.json`; screenshots `evidence/graph/shot-*.png`.

**Scopes:**
- **default**: the map opens on the first initiative, as users see it;
- **all**: the whole workspace, capped at the 2,000 most influential people, with the cap stated in the count line.

## Finding fixed during this run: missing planner statistics (P1 for the tooling, P2 for development)
The first pass showed absurd server times for the map: 5.8 s at Profile C and **117 s** at Profile D, against 39 ms on PostgreSQL in `sim-scale.ts`.

- **Root cause:** the simulation loads thousands of rows at once, and PGlite has no autovacuum, so the planner had **no statistics** and chose nested loops over the relationship table. `sim-scale.ts` ran `ANALYZE` after loading and `sim-graph.sh` did not.
- **Reproduced in isolation (Profile C, whole workspace):** 6.2 s before `ANALYZE`, **0.08 s** after.
- **Fix:** the simulation loader (`server/db/sim/cli.ts`) now runs `ANALYZE` after writing. C and D were re-run; the pre-fix files are kept in `evidence/graph/before-analyze/`.
- **Production impact:** none expected. Production uses PostgreSQL, where autovacuum analyzes tables, and the product has no bulk import. A long-lived *development* PGlite database can drift the same way; `ANALYZE` fixes it.

## Results (after the fix)
| Profile · scope | People / relationships drawn | API time | Payload | Map ready (1× / 4×) | Longest task 1× / 4× | Pan fps 1× / 4× | Zoom fps 1× / 4× | Select → highlight 1× / 4× | Heap |
|---|---|---|---|---|---|---|---|---|---|
| A · default | 19 / 30 | 22 ms | 14 KB | 0.28 / 0.89 s | 0 / 142 ms | 60 / 60 | 60 / 60 | 14 / 58 ms | 9 MB |
| A · all | 25 / 44 | 13 ms | 20 KB | 0.25 / 0.88 s | 0 / 138 ms | 60 / 60 | 60 / 60 | 16 / 59 ms | 9 MB |
| B · default | 115 / 314 | 170 ms | 118 KB | 0.49 / 1.45 s | 82 / 353 ms | 60 / 54 | 60 / 56 | 27 / 94 ms | 11 MB |
| B · all | 246 / 932 | 307 ms | 316 KB | 0.71 / 1.94 s | 162 / 673 ms | 60 / 35 | 59 / 26 | 46 / 385 ms | 14 MB |
| C · default | 192 / 484 | 51 ms | 191 KB | 0.37 / 1.26 s | 127 / 518 ms | 60 / 44 | 60 / 44 | 27 / 122 ms | 12 MB |
| C · all | 981 / 4,684 | 77 ms | 1.5 MB | 1.00 / 3.40 s | 579 / 2,149 ms | 55 / 43 | 58 / 47 | 129 / 615 ms | 34 MB |
| D · default | 963 / 2,293 | 184 ms | 0.9 MB | 1.74 / 5.22 s | 1,029 / 3,905 ms | 57 / 49 | 58 / 52 | 103 / 382 ms | 25 MB |
| D · all (cap 2,000 of 5,000) | 2,000 / 4,919 | 214 ms | 1.9 MB | 1.96 / 7.82 s | 1,340 / 5,786 ms | 52 / **15** | 57 / 29 | 184 / **1,263 ms** | 40 MB |
| E · default (1 of 50 tenants) | 124 / 490 | 342 ms | 168 KB | 0.63 / 1.42 s | 87 / 354 ms | 60 / 55 | 60 / 60 | 25 / 106 ms | 12 MB |
| E · all | 197 / 912 | 513 ms | 299 KB | 0.84 / 1.78 s | 131 / 520 ms | 60 / 38 | 57 / 34 | 33 / 258 ms | 14 MB |

**Notes on the table:**
- Profiles B and E ran before the fix. Their API times include the missing-statistics penalty, so their true server times are lower.
- The "Map ready" times include the API time.

## Reading the results
- **Up to about 1,000 people** (every default scope, and C · all) the map is **usable on an ordinary machine**:
  - ready in about 1–2 s;
  - pan and zoom at 55–60 fps;
  - selection under 130 ms.
- **At 2,000 people on a slow CPU** (D · all at 4×) it is **not smooth**:
  - pan drops to 15 fps;
  - selection takes 1.3 s;
  - layout blocks the main thread for 5.8 s.

  This is the hard 2,000-person cap, reached only when a user chooses the whole workspace at enterprise scale. The default view at Profile D (963 people) stays at 49 fps even at 4×.
- **The cap is disclosed.** The count line reads "showing the 2,000 most influential …", and the list view (`shot-sim-D-all-list.png`) gives access to everyone.
- **Payloads are uncompressed** (1.9 MB at D · all). See R2 in `remaining-issues.md`.

## Structural stress cases (automated, `tests/simulation.test.ts`)
| Case | Result |
|---|---|
| Duplicate relationship, mirrored symmetric relationship, allied + opposed contradiction | Refused with 409; nothing written |
| Archived people and archived (ended) relationships | Excluded from the map; history keeps them |
| Isolated people (no relationships) | Present on the map |
| Cycles of influence | The map renders; the path finder terminates and finds a path in both directions within 5 s |
| Hubs (heavy-tailed engagement and relationships) | Rendered; no node-count-dependent errors |
| Organisation clusters (283 organisations at D) | Rendered as compound groups |

## Visual findings
| Finding | Severity | Evidence |
|---|---|---|
| On a device-pixel-ratio-1 screen, maps of more than about 150 people show **no names at fit zoom**. Labels appear at B (52% zoom) but not at C (37%) | P2 (R4b) | `shot-sim-B-default.png` vs `shot-sim-C-default.png` |
| A whole-workspace map of about 1,000 or more people is a dense overview rather than a readable network. The default initiative scope, filters, focus and list view are the working tools | P3 (by design) | `shot-sim-C-all.png`, `shot-sim-D-all.png` |

## Not measured
- Real 2× (Retina) and touch devices.
- Safari and Firefox.
- More than one browser tab.
- Throttled networks: everything ran on localhost.
