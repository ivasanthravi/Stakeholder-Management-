# Performance Report (Phase 6)

## Conditions (be careful when generalising)
- **Hardware:** Apple M4, single machine (browser, API and database together).
- **Browser:** Chrome via Playwright 1.64, 1440×900. CDP CPU throttling at 1× and 4× (4× approximates a mid-range laptop). Medians of 3 cold runs.
- **Builds:**
  - **Universe numbers:** production builds (`vite build`), served by `vite preview`, each with its own API on **PGlite** (WASM Postgres).
  - **Dev-stack checks:** the Vite dev server (route transitions, interaction traces).
- **Data:** synthetic seed data at 73, 100, 1,000 and 5,000 stakeholders. The generator's minimum is 73, so "~10" was measured as 73.
- **Not measured:** real infrastructure, real network, native PostgreSQL for the map query, low-end phones.
- **Raw data:** `app/scratch/universe-perf/results/*.json`. Method: `measure.mjs`, `profile.mjs` (CPU profiles mapped through sourcemaps), `summarize.mjs`. Baseline files are named by size; after the change, `after2-*`; label A/B, `constlabel-*`.

## 1. Stakeholder Universe at scale
**Default view.** The map opens on the first active initiative (`/stakeholders?view=map`). At 5,000 seeded, 2,000 people are drawn (the cap).

**Baseline (before Phase 6 changes):**

| Seeded | Drawn (people / orgs / edges) | API | Ready 1× / 4× | Pan 1× / 4× (fps) | Wheel zoom 1× / 4× (fps) | Click → highlight 1× / 4× | Heap |
|---|---|---|---|---|---|---|---|
| 73 | 37 / 19 / 27 | 22 ms | 219 / 697 ms | 60 / 60 | 60 / 60 | 15 / 41 ms | 9 MB |
| 100 | 47 / 21 / 44 | 35 ms | 243 / 752 ms | 60 / 60 | 60 / 60 | 16 / 46 ms | 9 MB |
| 1,000 | 513 / 26 / 580 | 84 ms | 432 / 1,345 ms | 60 / 37 | 59 / 31 | 33 / 234 ms | 14 MB |
| 5,000 | 2,000 / 26 / 1,683 | 381 ms | 1,084 / 3,079 ms | 38 / **13** (p95 frame 233 ms) | 31 / **10** (p95 250 ms) | 95 / 404 ms | 27 MB |

**Bottlenecks found (CPU profile, 5,000 seeded, 1×):**
1. **Every pan and zoom frame redraws the whole canvas.** `drawCachedElements` took 1,190 ms of a 2 s pan.
2. **Class changes animate on about 3,700 elements.** Style transitions cost 171 ms on select and 122 ms during zoom.
3. **The initial `cy.fit`** costs about 320 ms (bounding boxes, including compound parents).
4. **API:**
   - two lateral subqueries per person;
   - every relationship row is loaded, then filtered in JavaScript;
   - **1 MB of uncompressed JSON.**
5. **The cap was arbitrary and silent.** `LIMIT 2000` with no `ORDER BY`, and no message to the user.
6. **The list view isn't virtualized:** 2,000 rows, 16.7k DOM nodes.

**Changes:**
- **Large-map mode** above 800 people:
  - while the viewport moves, Cytoscape draws a cached texture and hides edges (`textureOnViewport`, `hideEdgesOnViewport`, set on the renderer at runtime);
  - style transitions are off.
- **Small maps keep full fidelity.**
- **The cap is deterministic and disclosed:**
  - the most influential 2,000, ordered by influence, then name, then id;
  - the response carries `total` and `limit`;
  - the map says "showing the 2,000 most influential of 5,000 — filter by initiative to see the rest".
- **Query restructured:** people are picked first on the table alone, then the per-person laterals run for those only. The first version of the ordered query computed laterals for all 5,000 rows: API 1,191 ms. That regression was caught by re-measuring and fixed.

**After (`after2-*`):**

| Seeded | API | Ready 1× / 4× | Pan 1× / 4× (fps, p95 frame) | Wheel zoom 1× / 4× (fps, p95 frame) | Click → highlight 1× / 4× |
|---|---|---|---|---|---|
| 1,000 (513 drawn, below the threshold) | 109 ms | 529 / 1,805 ms | 60 / 32 | 59 / 24 | 45 / 327 ms |
| 5,000 (2,000 drawn) | 525 ms | 1,348 / 3,843 ms | **45 / 38 (17 ms)** | **56 / 46 (17 ms)** | 113 / 604 ms |
| 5,000, whole workspace | 550 ms (was 712) | 1,632 / 4,740 ms | 49 / 39 | 56 / 30 | 131 / 541 ms |

**Reading the results honestly:**
- **Pan and zoom at 2,000 people improved 3–4.5× on a throttled CPU** (13 → 38 fps, 10 → 46 fps; p95 frame 233–250 → 17 ms). This was the measured usability failure, and it is fixed.
- **Load got slower:**
  - ready +24% at 1× (1,084 → 1,348 ms);
  - API +144 ms (381 → 525 ms), the cost of a deterministic order plus a true count, measured on PGlite (WASM). Native PostgreSQL wasn't measured for this endpoint.
- **Click → highlight at 4× did not improve** (404 → 604 ms; run-to-run variance is about ±20%).
  - **Labels are not the cause.** An A/B with constant label sizes (`constlabel-*`) gave ready 1,379 ms and select 509 ms at 4×, the same within noise.
  - **The remaining cost** is `applyVisual` walking every element on hover and select (`Universe.tsx` hover and selection handlers). **Open P2.**
- **1,000 seeded (513 drawn):** ready 432 → 529 ms at 1×, within run-to-run noise plus the query change. Pan and zoom unchanged (below the large-map threshold).

**Still open (P2):**
- The API response is uncompressed: 1 MB for 2,000 people. Enable compression at the edge, or in the app with SSE excluded.
- The list view isn't virtualized at 2,000 rows.
- The hover and select restyle walks every element.
- The initial `cy.fit` costs about 320 ms.

**At 5,000 people in one view, the product deliberately draws the 2,000 most influential.** It says so, and initiative filters keep views small. Rendering all 5,000 at once wasn't attempted: it would be slower and unreadable.

## 2. Route transitions
| Measure | Before | After |
|---|---|---|
| Containers mounted per section change | 2 (the next screen rendered inside the exiting container, faded out, then mounted again) | 1 |
| Frames where the new screen was visibly fading **out** | about 6 (≈100 ms) | 0 |

Method: a frame-by-frame trace of `main .page` identity and opacity during navigation (`app/scratch/p5/route.mjs`).

## 3. Command Center
- **First screen reorganised:** briefing 370 → 187 px tall. "Needs attention" starts at y=355 instead of 535 on desktop.
- **On a phone:** 6 actionable rows visible without scrolling, instead of 1½.
- **Data:** no API or bundle change. The old-overdue fix adds rows only for commitments more than 60 days overdue.

## 4. From earlier phases (not re-measured in Phase 6)
- **API under load:** 63 req/s, 0 errors at 2,000 stakeholders (Phase 4).
- **Cold load:** Home ledger visible in 262 ms at 4× CPU (Phase 4).
- **Production budgets:** LCP ≤ 2.5 s, CLS ≤ 0.1, met in Phase 3/4 measurements.
- **Bundle sizes:** see `functional-test-results.md` §Gate (release-gate build).
