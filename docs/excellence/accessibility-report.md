# Accessibility Report (Phase 6)

**Target:** WCAG 2.2 AA.

**This report does not claim conformance.** Automated and scripted checks pass. **No screen-reader session with a human tester has been done**, and that remains required before claiming compliance.

## Evidence (after all Phase 6 changes)
| Method | Scope | Result |
|---|---|---|
| axe-core 4.10, WCAG 2.0/2.1/2.2 A+AA rules (`audit/phase1-qa.mjs`) | 98 views, desktop 1440 and mobile 390 | **98/98 clean** |
| axe on the production build (staging rehearsal, Phase 5) | 98 views | 98/98 clean |
| Scripted keyboard, focus, dialog, reflow, target-size and reduced-motion checks (`audit/a11y-manual.mjs`) | 27 checks (26 from Phase 4 + 1 new) | **27/27 pass** |
| **New:** reduced motion for Motion (JS) animations | Command Center horizon dots on first frame | Passes (0/40 animating). **Negative control:** with the fix removed, the same check fails (40/40 animating), so it detects the defect |
| Responsive reflow (`audit/responsive.mjs`) | 10 screens × 1280/1024/768/320 px | No document overflow. No clipped controls after fixes. One intended text truncation (ellipsis) |
| E2E through the accessibility tree (role and name queries) | 30 journeys | Pass. The new workflow B **found** a link exposed as a table cell (E9) |

## Barriers found and fixed in Phase 6
| Issue | WCAG | Fix |
|---|---|---|
| Relationship names were `<button role="cell">`: announced as cells, not links | 4.1.2 Name, Role, Value | Real link inside the cell |
| Sortable column headers were `<button role="columnheader">`: sortability not announced as pressable | 4.1.2 | Role and `aria-sort` on the cell; native button inside (Directory, Organizations) |
| Organization people rows were links with `role="row"`; initiative people links had `role="cell"` | 1.3.1, 4.1.2 | Real rows and cells; a stretched link keeps whole-row click; focus ring shown on the row |
| Reduced motion: Motion animations of height, width, SVG and staggered delays still ran; the map canvas ignored the preference | 2.3.3 (AAA, best practice) and user preference | Instant Motion animations under `prefers-reduced-motion`; map transitions 0; the busy spinner still turns (essential status) |
| Phone breadcrumbs truncated to fragments | 2.4.8 (AAA), usability | Nearest parent as back link |
| Toolbars clipped their last controls between 641 and 1280 px (unreachable by pointer) | 1.4.10 Reflow (intent) | Toolbars scroll; controls reachable |
| Command Center briefing disclosure ("no AI interpretation") hidden on phones by a leaked rule | Transparency (not a WCAG criterion) | Shown on its own line |

## Keyboard and focus (re-verified by the scripted checks)
- **Sign-in:** keyboard-only sign-in; autofocus on email.
- **Focus visible:** 12 consecutive shell tab stops.
- **Palette:** command palette fully operable by keyboard.
- **Drawers and dialogs:**
  - drawers trap focus (40 Tab presses) and close on Esc;
  - destructive dialogs move focus in, Esc cancels, and focus returns to the trigger.
- **Map:** the Universe list alternative opens with `L` (`role="tree"`, grouped by organization).
- **New in Phase 6:** the Home peek closes on Esc (E2E).

## Known gaps (not claimed)
| Gap | Priority |
|---|---|
| Screen-reader sessions (VoiceOver + Safari, NVDA + Firefox) on flagship flows | **P1** |
| 200% text-only zoom (browser text size) | P2 |
| Dark mode accessibility | P2 (not reviewed) |
| Universe list view at 2,000 people is long and unvirtualized (usable, slow on low-end devices) | P2 |
| Marketing mobile menu has no focus trap | P2 (from Phase 4) |
| Real-device touch testing | P2 (emulation only) |
