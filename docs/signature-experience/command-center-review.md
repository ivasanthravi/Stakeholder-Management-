# Command Center Review (Phase 8)

**Question it must answer in seconds:** what needs my attention, what changed, what's blocked or overdue, who needs follow-up, which initiatives need help, and what to do next.

## Passes
| Pass | Purpose | Result |
|---|---|---|
| **1. Hierarchy** | Put "Needs attention" on the first screen; stop saying things twice | The briefing folds when it only restates counts. The rail is reordered by actionability |
| **2. Missing question** | Answer "what changed recently?" | New **What changed · 7 days** card: exact counts and the latest six changes, each linked to its record |
| **3. Row craft and phones** | Titles not truncated; every filter reachable | Quick actions overlay instead of reserving width. The phone tab strip scrolls instead of hiding tabs. The briefing toggle stays on the title row |
| **4. Regression** | Inspect the result; fix what the change broke | The default-focused first row covered its owner avatar. Actions now show on a focused row only once the keyboard is in use |

## Changes
| # | Before | After | Files |
|---|---|---|---|
| CC1 | A 190 px briefing repeated the headline's four counts ("9 commitments are overdue…" under "9 overdue commitments…") | A one-line bar: "Workspace briefing · Built-in rules engine · no AI interpretation · Show 4 items". It starts open whenever the briefing holds interpretation or recommendations (a model engine), and the viewer's choice is remembered on the device | `Home.tsx` (WorkspaceBriefing), `home.css` |
| CC2 | No answer to "what changed?" | **What changed · 7 days:** decisions made, commitments completed, stance shifts and stakeholders added. Bulk additions (an import) collapse to one line so they can't crowd out decisions. Same definition as the Copilot's `recent_changes` tool (shared helper) | `server/modules/changes.ts` (new), `insights.ts` (`changes` on the dashboard), `copilot/tools.ts` (now uses the helper), `Home.tsx` (WhatChanged) |
| CC3 | Titles cut at 1440 px ("C-176 Revise working hours proposal to exclude Sunda…") because hidden actions reserved width | Full titles. Actions fade in over the right-hand metadata on hover or keyboard focus, with a backdrop matching the row's background | `home.css` (`.lactions`), `Home.tsx` (`data-kbd`) |
| CC4 | The expanded row repeated its own reason line | The expanded row states the **rule** ("Open commitment past its due date"), then the person, evidence, next step and actions | `Home.tsx` (LedgerRow) |
| CC5 | Phones hid the Decisions and Relationships filters | The tab strip scrolls sideways; every filter is reachable | `home.css` |
| CC6 | Rail order: stance mix first | Commitment horizon → What changed → Decisions in progress → Initiatives → Stakeholders (stance mix) → Recent engagements: most actionable first | `Home.tsx` |

**Evidence:**
- `screenshots/before/command-center-1440.png` vs `screenshots/after/command-center-1440.png`;
- `before/i-02-cc-select-first-commitment.png` vs `after/i-03-cc-select-first-commitment.png`;
- `after/i-02-cc-hover-first-commitment.png` (overlay actions);
- `before/command-center-390.png` vs `after/command-center-390.png`.

## AI and intelligence presentation (requirement 4.4)
| Requirement | How it is met |
|---|---|
| Distinguishable from facts | Engine line "Built-in rules engine · no AI interpretation". Signals labelled "Rule-based". AI items, when a model is configured, are labelled "AI interpretation · tentative" with a violet rule |
| Supporting records | Numbered citations on briefing items; evidence links on every signal; every "What changed" line opens its record |
| When updated | "Generated 12:05" on the briefing; relative times on every change and engagement |
| What's uncertain | "How?" discloses each metric's method. Interpretations are marked tentative. Unsupported AI statements are dropped and counted |
| Available action | Each signal has a deterministic next step and one-click actions (complete with undo, open, log engagement, ask AI) |
| AI unavailable | The briefing shows an error with Retry; signals, counts and "What changed" come from the database and still work |

## Tests
- `tests/simulation.test.ts`: "What changed" counts equal SQL (decided, completed, added); the latest decided list respects the cap; Copilot "what changed" still passes on the shared helper.
- E2E `signature.spec.ts`: after a commitment is completed on the profile, the Command Center drops it from Needs attention and lists it under What changed.
- Existing: `dashboard.test.ts`, `excellence.spec.ts` (peek keeps Home in view), `core-flow.spec.ts` dashboard step.

## Remaining
- **The horizon at enterprise volume** (about 820 dots at Profile D): R1 from Phase 7, unchanged.
- **"Stance shift" counts depend on recorded stance changes.** Sample data created by the seed has none, so the card shows 0 there. That is truthful, not a defect.
