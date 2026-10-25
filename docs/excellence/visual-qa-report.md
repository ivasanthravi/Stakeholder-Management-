# Visual QA Report (Phase 6)

**Archives** (all real captures, none edited; `docs/excellence/screenshots/`):

| Folder | Contents |
|---|---|
| `baseline/` | 58 captures before any change: 16 screens + states × desktop 1440 / mobile 390, plus `capture-log.json` (page errors, overflow, load timing) |
| `cycle1/` | Retests after each fix (Command Center, Profile, Universe, Copilot, Directory, Organization, Initiative) |
| `cycle2/` | Full after-state archive (same script, same screens, same states), plus the corrected no-results state |
| `responsive/` | 10 screens × 1280 / 1024 / 768 / 320 px, plus `responsive.json` |

**Tools:**
- **Capture:** `app/audit/excellence-capture.mjs <pass> [filter]`.
- **Responsive audit:** `app/audit/responsive.mjs`, which records document overflow and controls clipped (not merely scrolled) at each width.

## Method: BUILD → RUN → INSPECT → CRITIQUE → REFINE → RETEST
**Each flagship had three focused cycles**, each aimed at measured problems:

| Flagship | Cycle 1 | Cycle 2 | Cycle 3 |
|---|---|---|---|
| **Command Center** | Hierarchy: compact briefing, attention list above the fold | Retest found the phone engine disclosure hidden by a leaked CSS rule → scoped | Signature interaction: signal → peek without leaving Home; test found old overdue commitments missing → query and horizon fixed |
| **Universe** | Bugs: node removal race, preset framing, camera queue | Legibility: influence-scaled labels. Retest found threshold semantics (texture levels) → recalibrated | Scale: large-map mode measured. Regression found (API ordering) → query restructured → re-measured; label A/B to rule out the label change |
| **Profile** | Phone header: breadcrumb back link, stacked identity | Ego-graph hover lag | Workflow B found relationship names exposed as cells, not links → real links; retest by role |

## Before → after (desktop 1440 and phone 390)
| Area | Before | After | Evidence |
|---|---|---|---|
| Command Center first screen | Briefing 370 px; four repeated "Metric / How this is counted" blocks; attention list starts at 535 px. Phone: 1½ actionable rows above the tab bar | Briefing 187 px with "Today · metrics" and inline "How?"; attention list at 355 px. Phone: 6 actionable rows | `baseline/*-01-command-center.png` → `cycle2/*-01-command-center.png` |
| Universe overview | 86 overlapping ~6 px labels | ~30 influential people named; others on zoom or selection | `baseline/desktop-04-universe.png` → `cycle2/desktop-04-universe.png` |
| Copilot answer | 18 sources pushed the answer out of view | 5 sources + "Show all 18 sources"; C-137 reads 8 days (matches the register) | `baseline/desktop-10-copilot.png` → `cycle2/desktop-10-copilot.png` |
| Load error | "Your changes have not been saved yet" on a read | "Couldn’t reach Meridian. Check your connection, then try again." | `baseline/desktop-state-error-directory.png` → `cycle2/…` |
| Register toolbars | "184  Archived", "26  Archived" | "184 stakeholders · Show archived" | `baseline/desktop-02-directory.png` → `cycle2/desktop-02-directory.png` |
| Phone profile header | "Stakeholders / We / B"; "Head of Highways ·" dangling | "‹ Westshire County Council"; role, organization and location stacked | `baseline/mobile-03-profile.png` → `cycle2/mobile-03-profile.png` |
| Phone map header | "Stakeholders / Eastgate Depot R…" | "Eastgate Depot Renewal" | `baseline/mobile-04-universe.png` → `cycle2/mobile-04-universe.png` |
| Commitments at 1024 px | Initiative column and filter clipped at the edge | Columns fit; toolbar scrolls | `responsive/1024-commitments.png` |

## Consistency checks across neighbouring screens
- **Shared rules re-verified on every screen using them:**
  - **Breadcrumbs:** 8 screens checked at 390 px.
  - **Toolbars:** Directory, Organizations, Initiatives, Engagements, Decisions and Commitments checked at 4 widths.
  - **Peek panel:** Directory, map and Home.
- **Tokens:** no new arbitrary colours or durations were introduced. New CSS uses existing tokens (`--accent`, `--focus`, `--bg-hover`, `--amber-700`, `--dur-*`, `--ease-*`).
- **Regressions caught by retests:**
  - a leaked profile rule hiding Home's engine disclosure;
  - the Directory count wrapping after longer labels;
  - the capture script mis-staging the no-results state.
  All three were corrected and re-captured.

## Not visually reviewed
- Dark mode.
- Safari and Firefox rendering.
- Real devices.
- Below-the-fold content of inner-scrolling screens: reviewed through the DOM and scroll captures, not full-page shots.
