# Visual QA (Phase 8)

**Method:** every change was inspected in rendered output, not assumed from code.
- **Capture:** `app/scripts/sig-capture.mjs` (3 screens × 6 widths) and `app/scripts/sig-interact.mjs` (14 interaction states).
- **Setup:** Chrome at device pixel ratio 1 on the sample workspace. The in-app browser was used for spot checks.
- **Screenshots:** `screenshots/before/` and `screenshots/after/`. Scale screenshots come from the map stress run, in `evidence/graph/`.

## Comparison sheet
| Screen / state | Before | After | Verdict |
|---|---|---|---|
| Command Center 1440 | `before/command-center-1440.png`: 190 px of repeated counts above the list; titles cut | `after/command-center-1440.png`: one-line briefing bar; 13 rows above the fold, all titles whole | Clearer priority; nothing lost (the briefing is one click away) |
| Command Center, row hover | — | `after/i-02-cc-hover-first-commitment.png`: actions over the metadata on a matched backdrop | Clean; no layout shift |
| Command Center, row expanded | `before/i-02…`: reason repeated | `after/i-03…`: rule, person, evidence, next step, actions | Every line adds something |
| Command Center 390 | `before/command-center-390.png`: briefing filled most of the screen; two filters hidden | `after/command-center-390.png`: folded briefing; the tab strip scrolls | Usable on a phone |
| Universe overview 1440 | `before/universe-1440.png`: about 7 px names | `after/i-05-universe-open.png`: 8 key people named at 11.5 px (86 people in scope → 8 by the rule); the rest still scale with zoom | The map now says who matters at a glance |
| Universe focus | `before/i-06…`: zoomed in 61 → 90%; a neighbour off-screen | `after/i-07…`: the whole neighbourhood framed at 68%; neighbours and the edge labels readable; the panel lists initiatives | Focus shows the relationships, not just the person |
| Universe, Profile C (981 people) | `docs/simulation/evidence/graph/shot-sim-C-all.png`: no names | `evidence/graph/shot-sim-C-all.png` (Phase 8 run) | See `stakeholder-universe-review.md` |
| Profile, Timeline tab | `before/i-13-profile-tab-history.png`: "No history yet"; unstyled Record card | `after/i-14-profile-tab-history.png`: filters, month groups, kind · key · initiative, linked lines; label/value Record card | The tab now answers "what happened" |
| Profile briefing | `before/profile-1440.png`: "…is Connections Lead at Westshire Water, recorded as concerned…" | `after/profile-390.png`: "Jakob is recorded on one initiative: EDR Eastgate Depot Renewal (partner)" | New information in the first line |
| All three screens, 320–1440 px | No horizontal overflow | No horizontal overflow | Pass (`screenshots/after.json`) |

## Refinement passes per experience
Three or more focused passes each, every one with a stated purpose. The pass tables are in the three review documents.
- **Command Center: 4 passes**
  1. hierarchy;
  2. "what changed";
  3. row craft and phones;
  4. a regression fix (the focused row covered its avatar).
- **Universe: 4 passes**
  1. labels;
  2. focus framing;
  3. neighbour and edge labels;
  4. small-graph overlap.
- **Profile: 4 passes**
  1. timeline;
  2. briefing context;
  3. the Record card;
  4. a correctness fix found by the test.

## Regressions found by inspection and fixed
1. **Command Center:** the default-focused first row always showed its quick actions, which covered its owner avatar. Fixed: shown on focus only after J/K.
2. **What changed:** "184 added" (a seeded bulk import) filled the feed, and four stat labels truncated. Fixed: bulk additions collapse to one line; the stats wrap inline; lines use a title and detail layout.
3. **Universe:** in focus mode the neighbours' names were still about 7 px. Fixed: the focused person, their neighbours, small match sets and highlighted edge labels use readable sizes.
4. **Universe:** two people in a small group overlapped. Fixed: minimum first-ring distance.
5. **Phones:** "Show 4 items" wrapped onto its own line above the engine note. Fixed: a folded briefing hides its time on phones.
6. **Universe:** a performance change (stylesheet classes for every readable label) made neighbour names render **huge and clipped** ("um Ca", "o Ashd"), because Cytoscape reused element textures cached while those labels were hidden. Caught in the screenshot (`scratch` probe). Fixed with per-element sizes for the focus set; key people keep classes. Re-inspected: `after/i-07-universe-select-result.png`.

## Known visual limits (not fixed)
- At 2,000 people (Profile D, whole workspace) the map is a dense overview even with key names. The default initiative scope and the list are the working tools.
- The panel cross-fade briefly overlaps old and new content (about 80 ms) when moving between people. It is visible only in a frozen frame.
