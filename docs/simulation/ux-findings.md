# Large-Data UX Findings (Phase 7)

> **Source:** screenshots and measurements from scripted runs on simulated data (Profiles A–E). These are an engineer's observations of what the screens show at volume, **not user research**. "Simulated finding" means it came from automation and an inspection of the result.

The approved UI was not redesigned. Every change below is the smallest one that makes a screen tell the truth, or that removes a trap at scale. No animations were added.

## Findings and changes
| # | Screen | What the simulation showed | Severity | Change | Evidence |
|---|---|---|---|---|---|
| U1 | Command Center | At 5,000 stakeholders, **no overdue commitment was listed** (0 of 1,987) and the summary counted the page | P1 | True per-kind counts, places for every kind, "+N older" on the horizon. Summary and tabs use totals | `scale-D-before.json` vs `scale-D.json`; `personas/D-executive-1.png` |
| U2 | Command Center briefing | "60 commitments are overdue" sat directly under "1987 overdue commitments" | P1 | The briefing uses the same totals | `personas/before/D-executive-1.png` vs `personas/D-executive-1.png` |
| U3 | Commitments, "Due this week" | 0, with an empty list, when 199 were due | P1 | Server filter; true count and paging | `personas/before/D-operations-lead-2.png` vs `personas/D-operations-lead-2.png` |
| U4 | Command Center, "needs an owner" | A departed member's open commitments looked owned | P1 | Flagged with the reason "Owner left the workspace (name)" | `simulation.test.ts` |
| U5 | Profile, engagements | 310 engagements, 200 shown, no hint that more exist | P2 | "Showing the latest 200 of 310" | `scale-D.json` (`overviewTotal`) |
| U6 | Relationship map count line | "1 people"; the 2,000 cap was not stated in the count line | P3 | Singular and plural; "showing the 2,000 most influential …" | `graph/shot-sim-D-all.png` |
| U7 | New stakeholder form | Typing an existing person's name gave no hint, so duplicates are easy to create | P2 | A non-blocking hint under the Name field links to the existing record; saving is never blocked | E2E `core-flow.spec.ts` |
| U8 | Billing settings | A provider outage produced "Something went wrong on our side" | P2 | "We couldn't reach the billing provider. Nothing was changed. Please try again in a few minutes." | `failure.test.ts` |

## Observed and left open
| # | Screen | Observation | Severity | Tracked |
|---|---|---|---|---|
| O1 | Relationship map | On standard-density screens, maps over about 150 people show no names at fit zoom | P2 | R4b |
| O2 | Relationship map | Whole-workspace maps of 1,000 or more people are dense overviews. 2,000 people on a slow CPU pans at 15 fps | P2 | R4 |
| O3 | Command Center horizon | About 820 dots at Profile D: readable as a density chart, not as individual items | P2 | R1 |
| O4 | Command Center | "237 decisions waiting" (needing attention) sits next to "Decisions in progress 636" (all open). Both are correct, but the two numbers invite a double take. The "How?" disclosure explains the first | P3 | — |
| O5 | Sidebar, projects | At C and D the generator creates initiatives whose names start the same (BRG and BRG2 both begin "River Crossing Bridge"). Truncation hides the difference, but the codes still tell them apart | P3 | — (data-driven; real workspaces rarely do this) |
| O6 | Needs attention | Tab counts (All 2,828) are honest. The list shows the most severe 40 per kind, and the rest are one click away in the registers | — | Acceptable |

## Responsiveness at Profile D (simulated persona runs; production build, 1× CPU)
- **Registers and settings settle in about 0.4 s.** Most of that is the 300 ms quiet window the harness waits for.
- **Profiles and the Directory settle in about 0.1 s.**
- **The relationship map** (963 people, the default initiative) is ready in about 1.6 s.

Full table: `workflow-results.md`, section 4.

## Not covered
- Real people. No moderated sessions were run.
- Screen readers at volume. Accessibility was audited in Phase 6 on sample data, not re-audited at Profile D.
- Mobile layouts at Profile D. The Phase 6 mobile checks used sample data.
