# Visual QA (Phase 1)

**Method.** Build → run → screenshot in headless Chrome (1440×900 and 390×844 @2x) → read every image → critique against the Phase 0 baseline → fix → re-capture.

- Final screenshots are in [`screenshots/`](screenshots/): 22 desktop and 22 mobile views, produced by `app/audit/phase1-qa.mjs`, which also runs axe and records console errors and overflow.
- Interim captures from the build agents are in `app/scratch/`.

## Flagship experiences
Two or more refinement passes each.

| Screen | Pass 1 findings | Fixes | Final |
|---|---|---|---|
| **Command Center** (`desktop-home.png`) | The prototype's mock data was replaced; "Approvals in flight" became "Decisions in progress", because approvals are now decision stakeholders | Added a stance overview card, Recent engagements and an empty-workspace onboarding state (4 guided steps). Signals carry rule text and evidence links to real engagement records | Matches the Phase 0 layout and density; all values come from the API |
| **Relationship map** (`desktop-map*.png`) | 1. With no initiative, "All" (184 people at 48 %) was unreadable. 2. With a single person, "fit" zoomed to 300 %. 3. The side panel showed all relationships while the map showed only those in scope (Phase 0 P1-13) | 1. Opens on the first active initiative. 2. Fit capped at 120 %. 3. The panel states "N relationships shown in this view; the full list is below". Unassessed influence and interest are placed in a labelled row in the grid lens, never guessed | Organization clusters, lenses, gaps, keyboard traversal and the list view are all preserved |
| **Stakeholder profile** (`desktop-profile*.png`) | "292 days overdue" duplicates came from a seed mapping error (Phase 0 "missed" was mapped to open) | Seed maps "missed" to cancelled and clamps sample dates to the past. Added Edit (`E`), Log engagement (`L`), Archive/Restore, restriction, organization history (end association instead of delete), add-relationship drawer, and history with field diffs | Briefing keeps citations and labels its method; the network preview uses real relationships, including organizations |

## Other screens
| Screen | Notes |
|---|---|
| Directory | Server pagination with infinite load, skeleton rows, separate "no data" and "no matches" empty states, optimistic stance change with rollback. Columns unchanged from Phase 0 |
| Organizations, Initiatives | Built by a screen agent in two refinement rounds (row icon, "N late" badge, inline property row, mobile columns) |
| Engagements, Decisions, Commitments | Built by a screen agent. Fixed an outcome box that scrolled out of view and a strike-through lost after refetch. Shorter mobile due labels |
| Settings | Built by a screen agent in three refinement rounds. Checked as owner, viewer and contributor |
| Auth | Split brand panel with "the meridian" line. Mobile panel collapsed to a compact header |
| Drawers | Fixed initial focus overriding the field marked autofocus. Owner picker reads "You" where the default is the current user |

## Accessibility fixes from the sweep
- Shortcut badges inside buttons: contrast.
- "Ask · not available" label: contrast.
- Stance legend links: raised to the 24 px target size.
- Register scroll areas: made focusable.
- Engagements grid: fixed row and cell structure.
- History list: fixed markup.

**Final:** 44 / 44 views with no axe violations, no console errors and no horizontal overflow.

## Regressions vs Phase 0
| Item | Status |
|---|---|
| Meeting review with AI suggestions | **Removed deliberately**: the suggestions were fixtures. Replaced by manual capture from selected notes plus a labelled "AI extraction · Preview" note |
| Cmd-Z undo | Still works, now via compensating server writes. Undo can fail if someone else changed the record in between; this is reported in a toast |
| Phase 0 `?n=5000` stress parameter | Removed with the client store. Use `SEED_PEOPLE=5000 npm run db:reset` |
| Initial bundle | 196 → 255 kB gzip (see known limitations) |
