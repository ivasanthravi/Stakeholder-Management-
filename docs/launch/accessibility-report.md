# Accessibility Report (Phase 4)

**Target:** WCAG 2.2 AA.

**This report does not claim full conformance.** Automated and scripted checks pass, but no assistive-technology user testing has been done. No screen-reader session (VoiceOver/NVDA/JAWS) has been completed by a human tester; that is a P1 item before general availability.

## Evidence
| Method | Scope | Result |
|---|---|---|
| axe-core 4.10 (WCAG 2.0/2.1/2.2 A and AA rules), plus console-error and horizontal-overflow checks (`app/audit/phase1-qa.mjs`) | **98 views**, desktop 1440 and mobile 390 | **98/98 clean** |
| Scripted manual checks (`app/audit/a11y-manual.mjs`), 26 checks; results in `evidence/a11y-manual-2026-10-24.json` | Keyboard, focus, dialogs, reflow, target size, reduced motion | **26/26 pass** after the fixes below |
| E2E journeys run through the accessibility tree (Playwright role and label queries) | 16 journeys | Pass. Controls are reachable by role and name |

**Scripted checks covered:**
- keyboard-only sign-in
- visible focus on 12 consecutive shell tab stops
- command palette operable by keyboard
- create drawer traps focus (40 Tab presses) and closes on Esc
- destructive confirmation: focus moves in, Esc cancels, focus returns to the trigger
- the relationship map's accessible alternative (L key opens a `role="tree"` list grouped by organization)
- **reflow at 320 CSS px** (WCAG 1.4.10, equivalent to 400% zoom) on 6 public pages
- **target size ≥ 24 px** (WCAG 2.5.8, effective hit area) on 6 app pages on a touch device
- no horizontal scroll at 390 px
- reduced motion: no CSS transitions or animations longer than 20 ms

## Barriers found and fixed in this phase
| Issue | WCAG | Fix |
|---|---|---|
| Sign-in: Tab from Password dropped focus to `<body>`. Blur validation replaced the field hint, which was the "Forgot password?" link, so keyboard users with an empty password couldn't reach it | 2.1.1, 2.4.3 | The link now sits outside the hint slot. Tab order is password → Forgot password? → Sign in |
| Marketing homepage overflowed by 40 px at 320 px: the AI tab row didn't wrap | 1.4.10 | Shrinkable grid track; the tab row wraps at ≤ 420 px |
| Touch targets of 15–18 px on phones: row checkboxes, "mark complete", filter inputs, breadcrumb and settings links | 2.5.8 | Coarse-pointer hit areas of 24 px or more, with no visual change on desktop |
| Citation chips (15 px) | 2.5.8 | **Exception applied:** they are inline in sentences (the inline exception). Documented, not changed |
| Usage table and settings scroll regions weren't keyboard-focusable (axe) | 2.1.1 | Made focusable with `role="region"` and labels (Phase 2/3/4) |
| Phone widths: icon-only header buttons, onboarding Back and the map view buttons hid their labels with `display:none`, so they had no accessible name (found by an extra axe run at 390 px and in an empty workspace) | 4.1.2 | Labels visually hidden instead of removed |
| Directory and Initiatives empty states sat directly inside the grid row group (invalid structure) | 1.3.1 | Wrapped in row and cell |
| Phone page header action buttons shrank to 15–19 px wide | 2.5.8 | No shrink below 900 px |
| **Phase 5:** Meeting Intelligence source-notes panel scrolled independently but wasn't keyboard-focusable. Found by axe on the production build in the staging rehearsal | 2.1.1 | Focusable labelled region (global focus ring) |
| **Phase 5:** "Forgot password?" missed by mouse on a fresh sign-in page (an error appearing on blur moved the link mid-click) | Usability (pointer) | Untouched fields aren't flagged on blur |
## Known gaps
| Gap | Priority |
|---|---|
| No screen-reader test session (VoiceOver + Safari, NVDA + Firefox) on flagship flows: onboarding, directory, profile, meeting intelligence review, billing | **P1** |
| No accessibility pass on dark mode for the newer commercial surfaces | P2 |
| The marketing mobile menu closes on Esc but doesn't trap focus | P2 |
| Map arrow-key navigation reaches people but long-task latency on low-end CPUs (91 ms) delays the announcement | P2 |
| No colour-blind simulation review of stance colours. Stance is also conveyed with text labels | P2 |
| No zoom test at 200% *text-only* zoom (browser text size); layout zoom is covered by the 320 px reflow test | P2 |

## Practices in place
- Semantic landmarks, and one `h1` per page.
- Skip link on the marketing site.
- Every form field has a label, and errors are linked with `aria-describedby`.
- Live regions announce streaming and status.
- Dialogs use `role="dialog"` or `alertdialog` and are labelled.
- Visible focus rings come from tokens.
- Reduced motion is honoured globally through `MotionConfig` and CSS.
- Text contrast is 4.5:1 or better (`--text-3` was chosen for this).
