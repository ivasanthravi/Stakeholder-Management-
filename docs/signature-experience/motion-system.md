# Motion System (Phase 8)

**Source of truth:**
- `app/src/lib/motion.ts` (Motion 14 presets);
- `app/src/styles/tokens.css` (CSS durations and easing);
- `docs/design/motion-system.md` (Phase 1).

Phase 6 audited every animation (`docs/excellence/motion-audit.md`). **Phase 8 added no animation library and no new animation type.** New elements reuse the existing presets.

## The language
| Interaction | Behaviour | Duration / easing | Notes |
|---|---|---|---|
| **Hover** | Background tint only | `--dur-instant` 80 ms, linear | No movement on hover |
| **Press** | `--bg-press` tint | Instant | — |
| **Selection indicator** (tabs, segmented control) | Shared-layout slide | `t.indicator` spring (stiffness 520, damping 42): critically damped, no overshoot | — |
| **Expand / collapse** (signal rows) | Height plus opacity | Open `t.base` 200 ms standard; close `t.exit` 140 ms exit easing | Exits are faster than entrances |
| **Briefing fold** (new) | Content appears or disappears; the chevron rotates 180° | Chevron `--dur-base` 200 ms; content instant | The page doesn't animate its height for a briefing, so nothing below jumps more than once |
| **Panels** (peek, map focus panel) | 16–24 px slide plus fade | `t.panel` spring in, `t.exit` out | Panel content cross-fades in 160 ms when the subject changes |
| **Map focus camera** (changed) | Pan and zoom-out only when needed | 280 ms (`dur.slow`), ease-in-out-cubic | No movement when the person and their connections are already in view; never zooms in; cancels the previous move so arrow-key traversal never queues |
| **Graph highlight** | Neighbourhood styling | Instant on large maps (more than 800 people); short style transitions on small ones | Restyles only elements whose classes change |
| **Key labels** (new) | Size stays constant on screen while zooming | None: recomputed once per animation frame | Not an animation; it keeps text readable |
| **Data updates** | Rows leave with a 24 px slide plus fade (160 ms); new rows fade in | `t.fast` | Complete → undo toast |
| **Route transitions** | Content fade only | Phase 6 setting | No flash of the old screen |
| **Loading** | Skeletons, no spinners on lists | — | No fake delays anywhere |

## Rules (checked for every Phase 8 change)
- No bounce or overshoot.
- No entrance animation longer than 280 ms.
- Nothing blocks input while animating. Map camera moves are cancelled by the next input.
- No ambient motion: no pulsing, glow or particles.
- No scroll hijacking.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, every Motion animation is instant (`MotionGlobalConfig.instantAnimations`), and the map camera jumps (`reduceMotion()` in `frameFocus`). The briefing chevron's 200 ms CSS rotation is the only new CSS transition, and it carries no information.

## Skill use
- **Motion skill:** available. Phase 6 used its guidance for the audit. Phase 8 didn't run a fresh MotionScore audit, because Motion+ is still not authenticated (see `docs/excellence/environment-audit.md`) and no new Motion animation was added.
