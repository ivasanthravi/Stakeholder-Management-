# Motion Audit (Phase 6)

**Method:**
- **Code audit:** every Motion (`motion/react`) and CSS animation in `app/src` was reviewed (read-only agent pass), and each finding was **re-verified** in code and, where possible, in the browser before changing anything.
- **No MotionScore grades:** those need the Motion+ MCP, which is not authenticated in this session (`environment-audit.md`).

## Verdict before changes
The motion system was mostly disciplined:
- **Tokens:** shared tokens (`lib/motion.ts` = `tokens.css`) are used in about 95% of CSS transitions.
- **No fake waits:** no fake loading delays; every `setTimeout` is a debounce, poll or focus helper.
- **No bounce:** springs are close to critically damped.

The real problems clustered in **the route transition**, **the Cytoscape map** and **reduced-motion leaks**.

## Classification (summary of about 45 distinct animations)
| Class | Count | Examples |
|---|---|---|
| Essential | ~8 | Dialog scale-in, popovers, toasts, spinner, hover and press feedback |
| Useful | ~22 | Sliding tab and segment indicators (`layoutId`), peek and drawer slides, peek→profile avatar morph, ledger row dismissal, bulk bar, briefing reveal |
| Decorative | ~7 | Horizon dot stagger, coverage bars, profile activity bars, marketing hero (acceptable on marketing pages) |
| Distracting | 2 | Table↔map toggle (320 ms with a delay); search field widening on focus |
| Performance-intensive | 4 | fcose layout and fit chain, offline banner `height`, layout-property transitions, skeleton `background-position` shimmer |
| **Broken** | 4 | Route transition, preset layout framing, map node removal race, ego-graph hover lag |

## Fixed (reproduced → fixed → verified)
| # | Issue | Evidence before | Change | Verification |
|---|---|---|---|---|
| M1 | **Route transition showed the next screen fading out, then in.** With `AnimatePresence mode="wait"`, the exiting container's `<Outlet/>` already renders the new route | Frame trace Decisions→Commitments: old container shows **Commitments** at opacity 0.87→0 over about 6 frames, then a second container mounts Commitments again | Removed the exit animation and `wait`. The new section replaces the old at once and fades in (`t.fast`); no fade on first load (`Shell.tsx`) | Same trace: one container per navigation, opacity 0→1 only; about 100 ms of flicker removed |
| M2 | **Influence grid and group layouts framed the old positions.** `done()` (which animates the fit) ran straight after `.run()` | Code: `cy.animate({fit})` computes its target when created | Fit now runs from the layout's `stop` callback (`Universe.tsx`) | Typecheck; map E2E; visual capture |
| M3 | **Map could silently drop people.** The node removal timer (150 ms) was never cancelled; toggling a filter off and on within 150 ms deleted re-added nodes | Code path traced: the second sync keeps the node, then the first sync's timer removes it | The timer removes only nodes that are still unwanted (`wantIdsRef`) | Typecheck; reasoning against both orders of events |
| M4 | **Camera animations queued behind keyboard traversal and zoom presses** | Cytoscape queues `cy.animate` by default | `cy.stop(true)` before each user-driven camera move; durations on tokens (`dur.slow` 280 ms for centre and search fit, `dur.fast` for zoom; previously 360/400/200 ms literals) | Typecheck |
| M5 | **Reduced motion leaked:** `MotionConfig reducedMotion="user"` only drops transform and layout animation, so height expanders, width bars, SVG `cy`/`pathLength` and staggered delays still moved; canvas transitions ignored CSS | Code review | `MotionGlobalConfig.instantAnimations` follows `prefers-reduced-motion` (live). Cytoscape transitions are 0 under reduced motion. The spinner keeps turning (essential status) | a11y scripted check rerun: see `accessibility-report.md` |
| M6 | Table↔map toggle 320 ms + 40 ms delay on a frequent action (V T / V M), plus a 240 ms canvas fade | — | `t.fast` in, `t.exit` out; canvas reveal `t.base` | Capture |
| M7 | Ego-graph hover dimming inherited the entrance stagger (80–236 ms late, rippling) | Code | Separate transitions: `scale` staggered, `opacity` `t.fast` | Capture |
| M8 | Directory search widened 260→300 px on focus, shifting the filter chips under the pointer | CSS | Width no longer changes; focus ring kept | Capture |
| M9 | Coverage bar animated `width` (layout) over 0.5 s with a literal | Code | `scaleX` from 0 with `transformOrigin: left`, `t.slow` | Capture |
| M10 | Closing scrims still blocked clicks during their exit fade | Code | `pointerEvents: 'none'` on scrim exit (palette, drawer, dialogs) | Typecheck |
| M11 | **Large maps:** class changes animated on about 3,700 elements (measured 171 ms on select at 2,000 people) | Profiler (`performance-report.md`) | Above 800 people, style transitions are instant; texture and edge hiding while the viewport moves | Re-measured: `performance-report.md` |

## Not changed (with reason)
| Item | Reason |
|---|---|
| fcose re-layout followed by a separate fit (about 820 ms total) | Only in the ungrouped network view; combining them needs care with first-run behaviour. **P2** |
| Skeleton shimmer animates `background-position` | Cheap at current placeholder counts. **P3** |
| Bulk bar `left`, map controls `right` transitions | Small elements, infrequent. **P3** |
| Offline banner animates `height` | Rare event. **P3** |
| Hand-rolled literal timings in the peek body, profile tab swap, palette selection spring and inbox exit | Equivalent to tokens within ±20 ms. Consolidation is cosmetic. **P3** |
| Panel slide distances differ (peek 24, drawer 32, copilot 16 px) | Each panel has a different width; visually consistent in captures. **P3** |

## Preserved deliberately
- `layoutId` indicators across about 12 segmented controls and tab strips.
- `popLayout` on peek and register panels, so content swaps never block.
- The peek→profile avatar morph.
- Ledger row exit (a dismissed signal visibly leaves).
- Debounces: palette 120 ms, picker 160 ms, map search 180 ms.
- No animation on the first map layout.
- `AnimatePresence initial={false}` on lists.

## Shared-element continuity
- **Peek → profile:** already continuous (avatar `layoutId`).
- **Table row → peek:** deliberately **not** shared. The row stays mounted, so a duplicate `layoutId` would make the row's avatar jump; the row tint (`data-peek`) is the continuity cue.
- **Command Center signal → detail:** expands in place (no route change), which keeps context. No shared element is needed.
