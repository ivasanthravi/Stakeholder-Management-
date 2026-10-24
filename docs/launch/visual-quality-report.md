# Visual & Interaction Quality Report (Phase 4)

## Method
Two full passes of **build → run → inspect → critique → refine → retest**:
- **Widths:** 1440 (desktop), 834 (tablet) and 390 (phone), plus spot widths from 1025 to 1401 for the directory grid.
- **States captured:**
  - scrolled views
  - hover and keyboard focus
  - loading skeletons (API delayed by 5 s)
  - empty workspaces
  - validation errors
  - reduced motion

**Constraint followed:** existing design decisions were kept. There were no redesigns, and no sophisticated interactions were swapped for generic components. Fixes are CSS or markup corrections against the existing design system.

**Working material:** `app/scratch/vq/`. Screenshots are in `p1/` and `p2/`, retests in `r1/` and `r2/`, the fix log in `LOG.txt`, plus the capture scripts. This folder is scratch material and is not shipped.

**Retest results:**
- axe sweep `audit/phase1-qa.mjs`: **98/98 views clean** after pass 1 and again after the final change.
- Additional axe run for phone widths and an empty workspace: **12/12 clean**, after fixing items 20–22.
- Release gate re-run after all changes: see `launch-checklist.md` §Gate run.
- Spot-checked independently by the lead reviewer: tablet directory headers and phone profile header (`r2/`).

## Defects fixed (22)
| # | Experience | Defect | Fix | Priority |
|---|---|---|---|---|
| 1 | Pricing | Comparison table: header and group rows painted over the side border, so the frame looked broken | Real border | P1 |
| 2 | Directory (tablet) | "Last engaged" header clipped, sort arrow overflowed | Column widths | P1 |
| 3 | Directory (desktop) | Hidden hover actions reserved width, so owner names were cut to "Rh…" | Actions overlay the cell end | P1 |
| 4 | Peek panel (phone) | 92% panel left a sliver of cut-off rows | Full width up to 640 px | P1 |
| 5 | Registers toolbars (tablet) | Record count clipped ("4…") | Visually hidden between 641 and 1100 px, kept as a live region | P1 |
| 6 | Map, list mode | Graph zoom toolbar floated over list rows | Not rendered in list mode | P1 |
| 7 | Copilot | Placeholder cut mid-phrase | Shorter copy | P2 |
| 8 | Onboarding | "A initiative" | Article matches the workspace term | P2 |
| 9 | Home, empty workspace | "Nothing is slipping across 0 initiatives." | "Nothing is slipping yet." | P2 |
| 10 | Directory, empty | Pink "??" avatar looked like a broken record | Neutral Users icon (spec §7.9) | P1 |
| 11 | Map, empty | Title and sentence about 400 px apart | Centred column with action | P1 |
| 12 | List empty states (phone) | Text ran to the screen edge | 16 px gutters, centred | P1 |
| 13 | Sign-in / sign-up | Headline broke into five lines with a lone "Every" | Wider measure, balanced wrapping | P2 |
| 14 | Meeting Intelligence | Orphaned "yesterday" | `text-wrap: pretty` | P2 |
| 15 | Home briefing | Cross-file `.brief` rule removed the bottom padding | Home-scoped rule | P1 |
| 16 | Directory 1025–1367 px | Column minimums exceeded the grid (910 px rows in a 790 px grid), so Owner and "Open" were clipped | Breakpoints aligned to the column minimums. Verified at 9 widths | P1 |
| 17 | Profile, Organizations card | Unstyled rows: icon touched the name, × wrapped | Aligned rows | P1 |
| 18 | Profile timeline (phone) | Key and relative time wrapped ("2d/ago") | No-wrap; key hidden ≤ 640 px | P1 |
| 19 | Map list, new workspace | "No stakeholders match these filters" with no filters set | Real empty state shown | P1 |
| 20 | Phone header, onboarding, map | Icon-only buttons hid their labels with `display:none`, so they had **no accessible name** | Visually hidden labels instead | P1 (accessibility) |
| 21 | Directory / Initiatives empty states | Invalid grid structure (axe) | Wrapped in row and cell | P1 (accessibility) |
| 22 | Phone page header | Action buttons shrank to 15–19 px wide (< 24 px target) | No shrink below 900 px. Trade-off: the breadcrumb truncates sooner | P1 (accessibility) |

## Left deliberately (P2, or would change design or copy)
- Phone profile: a dangling "·" separator before a line break (needs header restructuring).
- Tablet billing meters stack in one column.
- Phone billing: the "Export workspace" button sits beside its description.
- Empty map still shows its keyboard hint.
- The Meeting Intelligence button label changes from "Analyse notes" to "Re-analyse" after loading.
- The Owner picker truncates the email without an ellipsis.
- Initiatives empty state uses a "NEW" code chip (consistent with the register style).
- Peek and Copilot panels overlay the table's right-hand columns, **by design** (overlay, no reflow).
- Map labels overlap in dense clusters; this is inherent to the graph layout.

## Not covered (follow-up)
- **Dark mode** (P2).
- The onboarding steps after "initiative": stakeholders, invite team and ready. These are covered functionally by E2E commercial-flow, but not visually reviewed.
- Invitation acceptance screens.
- Tablet Settings › Members and Data.
- Visual review on Safari and Firefox. All captures used Chrome.
- 3G full-page loads couldn't be captured, because the dev bundle doesn't finish over 3G. Skeletons were captured with delayed API responses instead. A production-build 3G check is a P2 follow-up.
