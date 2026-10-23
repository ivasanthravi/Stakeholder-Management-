# Motion System

Status: Phase 0 · 2026-10-22 · Implemented in `app/src/lib/motion.ts` (Motion for React) and `app/src/styles/tokens.css` (CSS).

## Principle

Motion explains **what changed, where it went, and what happens next**. It never signals "this is interactive" on its own, never loops, and never delays input. Every animation can be interrupted by the next input.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--dur-instant` / `dur.instant` | 80 ms, linear | Hover and press colour changes |
| `--dur-fast` / `t.fast` | 140 ms, `cubic-bezier(.2,0,0,1)` | Menus, palette, tooltips, chips, page cross-fade |
| `--dur-base` / `t.base` | 200 ms, standard | Panels, row expand, toasts, height reveals |
| `--dur-slow` / `t.slow` | 280 ms, `cubic-bezier(.3,0,0,1)` | View-mode change, progress, strike-through |
| `--dur-graph` | 400–420 ms, ease-in-out-cubic | Graph re-layout, camera moves |
| `t.exit` | 140 ms, `cubic-bezier(.4,0,1,1)` | Exits are faster than entrances |
| `t.indicator` | spring 520 / 42 / 0.9 | Active nav, tab underline, segmented controls (no visible overshoot) |
| `t.panel` | spring 420 / 40 / 0.9 | Peek panel, shared avatar |
| `stagger(i)` | 25 ms × i, capped at 8 | First reveal of small sets only, never on re-render |

Press feedback: buttons scale to 0.975 in 60 ms, CSS only.

## Patterns in the prototype

| Moment | Motion | Communicates |
|---|---|---|
| Sidebar active item | Shared `layoutId` surface with a 2 px teal "meridian" line that slides between items | Where you are |
| Page change | 140 ms cross-fade of the content area; the shell never moves | Context stays put |
| Table to map | 280 ms cross-fade; URL keeps selection | Same data, different lens |
| Peek panel | Spring slide of 24 px plus fade; content cross-fades on J/K | Same place, next record |
| Tabs | Underline glides; panel fades with a 4 px rise | Position within the record |
| Briefing citation | Source drawer expands under the text; cited sentence tints violet | Where a claim came from |
| Commitment fulfilled | Circle fills, check draws (stroke-dashoffset), text strikes through over 280 ms; undo toast | Completed, and reversible |
| Ledger snooze | Row slides 24 px right and fades; siblings close the gap | Removed from view, not deleted |
| Ledger counts | Number rolls vertically | A live value changed |
| Graph hover | Neighbourhood stays, others fade to 13% over 140 ms | Who is connected |
| Graph filter | Leaving nodes fade, survivors animate to new positions, camera refits | What was removed and what moved |
| Graph select | Camera eases only if the node sits outside the central 60% | Avoids needless jumps |
| AI suggestion accepted | Card cross-fades into a compact "Created C-412" row; list closes up by position only | The record now exists |

## Reduced motion

`MotionConfig reducedMotion="user"` disables transforms in Motion. A global CSS rule clamps transitions and animations to 1 ms. Graph layouts and camera moves jump-cut, and the skeleton shimmer is off. Every state remains reachable and visible.

## Rules

1. No animation over 420 ms, and no motion on idle screens.
2. Animate `transform` and `opacity`. Height reveals use Motion's measured `height: auto`; nothing animates width on large tables.
3. Overlays (peek, bulk bar, menus) sit above the content and do not reflow it.
4. Use CSS for state colour changes and Motion for enter/exit and shared layout. Cytoscape's own animation handles canvas work.
5. No WebGL or Three.js. Nothing in Phase 0 needs it.
