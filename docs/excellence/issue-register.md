# Issue Register (Phase 6)

**Severity:**
- **P0:** security, cross-tenant exposure, data loss, broken critical workflow, severe accessibility barrier.
- **P1:** major friction, broken interaction, serious performance problem, important responsive defect.
- **P2:** minor friction or polish.
- **P3:** refinement.

**Rule followed:** OBSERVE → REPRODUCE → DIAGNOSE → FIX → VERIFY → REGRESSION TEST. An issue is "Fixed" only with a verification listed.

**P0:** none found.
- **Isolation:** no cross-tenant regression (isolation suite re-run).
- **Data:** no data loss.
- **Workflows:** no critical workflow broken.

## Fixed
| # | Sev | Issue | Root cause | Fix | Verification |
|---|---|---|---|---|---|
| E1 | P1 | **Commitments more than 60 days overdue vanished from the Command Center** (and its overdue count) | Signal query window `due_date between current_date - 60 and +30` | Lower bound removed. The horizon counts all overdue and pins older dots at its edge, labelled "older" | `tests/dashboard.test.ts` (200 days overdue appears); E2E `excellence.spec` (a nine-month-old commitment shows on Home) |
| E2 | P1 | **One record, two numbers:** copilot "7 days overdue" vs "8" elsewhere | Each server surface rounded a time difference its own way | `shared/dates.ts` calendar-day helper used by signals, briefings and copilot | Unit test at 4 times of day; copilot capture reads 8 |
| E3 | P1 | **Universe unusable to pan and zoom at 2,000 people** on a slow CPU (13 / 10 fps) | Full canvas redraw per frame; per-element style transitions | Large-map mode above 800 people (texture + hidden edges while moving, no transitions) | Re-measured: 38 / 46 fps, p95 frame 17 ms (`performance-report.md`) |
| E4 | P1 | **Silent, arbitrary 2,000-person cap** on the map | `LIMIT 2000` with no `ORDER BY`, no total | Most influential 2,000, deterministic; `total` returned; disclosed in the count line | Query reviewed; isolation and tenancy suites pass; measured |
| E5 | P1 | **Route change showed the next screen fading out, then in** | Exiting container's `<Outlet/>` resolves to the new route | No exit animation; fade-in only | Frame trace: 1 container, no fade-out |
| E6 | P1 | **Command Center first screen led with narrative, not action** | Repeated per-item labels and method rows | Compact briefing; attention list above the fold | Captures desktop and phone; height 370 → 187 px |
| E7 | P1 | **Commitments table clipped at ~1024 px** (Initiative cut, no scroll) | Column minimums exceeded width between 1100 and 1024 | 1100 px step drops the Initiative column | Responsive audit: 0 clipped |
| E8 | P1 | **Toolbars clipped controls between 641 and 1280 px** | Toolbar scrolled only below 640 px | Scrolls at ≤1280; search shrinks first; counts never wrap | Responsive audit 40 checks |
| E9 | P1 (a11y) | **Relationship names announced as table cells, not links** | `<button role="cell">` overrides the button role | Link inside the cell | E2E workflow B opens the related profile by role |
| E10 | P1 (a11y) | **Sortable headers not announced as buttons** (Directory, Organizations) | `<button role="columnheader">` | Role and `aria-sort` on a wrapper; native button inside | axe sweep; typecheck |
| E11 | P1 (a11y) | Organization people rows were links with `role="row"`; initiative people link had `role="cell"` | Role overrides | Real rows and cells; stretched link keeps whole-row click | axe sweep; capture |
| E12 | P1 (a11y) | **Reduced motion leaked:** height, width, SVG and staggered animations still moved | `MotionConfig reducedMotion` only covers transform and layout | `MotionGlobalConfig.instantAnimations` follows the preference; canvas transitions 0; spinner exempt | New scripted check passes (0/40 animating) and **fails without the fix** (40/40) |
| E13 | P1 | Map could silently drop people after rapid filter toggles | Uncancelled 150 ms removal timer | Removes only still-unwanted nodes | Code path review |
| E14 | P1 | Influence grid and group layouts framed the old positions | Fit computed before nodes moved | Fit from the layout's `stop` | Capture |
| E15 | P2 | Universe overview: 86 overlapping 6 px labels | Uniform label size | Labels by influence; key people named at overview; selection, neighbours and matches always labelled | Capture; constant-label A/B shows no performance cost |
| E16 | P2 | Load errors said "Your changes have not been saved yet" | One network message for reads and writes | Separate read and write messages | Capture of error state |
| E17 | P2 | "26  Archived" read as 26 archived | Unlabelled count beside toggle | "26 organizations · Show archived" (workspace vocabulary) | E2E `excellence.spec` |
| E18 | P2 | Copilot listed 18 sources, hiding the answer | No limit | First 5 + "Show all" | Capture |
| E19 | P2 | Phone breadcrumbs "Stakeholders / We / B" | Full trail truncated | Nearest parent as back link | 8 screens checked |
| E20 | P2 | Dangling "·" separator on phone profile | Wrapped flex row | Stacked lines on phones | Capture |
| E21 | P2 | Home briefing's engine disclosure hidden on phones | Unscoped rule in `profile.css` | Scoped to `.prof` | Capture |
| E22 | P2 | Camera animations queued behind keyboard traversal | Cytoscape queues by default | `cy.stop(true)` + token durations | Typecheck |
| E23 | P2 | Table↔map toggle 320 ms with a delay | `t.slow` + 40 ms | `t.fast` / `t.exit` | Capture |
| E24 | P2 | Ego-graph hover dimming lagged up to 240 ms | Entrance stagger applied to hover | Separate transitions | Capture |
| E25 | P2 | Directory search widened on focus, moving filters under the pointer | Width transition | Fixed width | Capture |
| E26 | P2 | **Regression introduced in this phase:** Directory count and toggle wrapped at 1024 px after labels got longer | Longer labels | `nowrap` | Responsive audit |
| E27 | P2 | Map count read "1 relationships" | Hard-coded plurals | Singular and plural forms | E2E workflow B asserts "2 people · 1 relationship" |
| E28 | P2 | Following a signal's stakeholder left the Command Center | Full navigation only | Peek panel on Home (Esc closes; "Open profile" still navigates) | E2E `excellence.spec` |
| E29 | P3 | Closing scrims blocked clicks for 140 ms | Exit kept pointer events | `pointerEvents: none` on exit | Typecheck |
| E30 | P3 | Coverage bars animated `width` | Layout property | `scaleX` | Capture |
| E31 | P3 | Two "more" controls aligned differently in the copilot | Flex stretch | Aligned to start | Capture |

## Open
| # | Sev | Issue | Why not fixed now |
|---|---|---|---|
| O1 | P2 | Universe hover and select restyle walks every element (click → highlight 0.5–0.6 s at 2,000 people, 4× CPU) | Needs an incremental highlight (diff of neighbourhoods); not a safe late change |
| O2 | P2 | Graph API sends about 1 MB uncompressed at 2,000 people | Compression must exclude SSE (copilot stream); better at the edge once hosting is chosen |
| O3 | P2 | Universe list view not virtualized (2,000 rows) | Moderate refactor; the list is the accessible alternative and still works (92 ms at 1×) |
| O4 | P2 | Named labels still render ~7 px at overview zoom | Zoom-compensated labels need a restyle per zoom step (cost measured above) |
| O5 | P2 | Server "today" is the UTC date; the browser uses local time, so near midnight a due date can read one day apart between server text and table | Needs per-user time zones |
| O6 | P2 | fcose re-layout and fit chain about 820 ms in the ungrouped network view | First-run behaviour needs care |
| O7 | P3 | Organizations "Classifications" column empty in sample data | Product decision |
| O8 | P3 | Meeting Intelligence meta line wraps mid-name | Copy and layout tweak |
| O9 | P3 | Settings tab strip shows the "Workspace" group label inline on phones | Minor |
| O10 | P3 | Closed-signup message has no contact link | Copy |
