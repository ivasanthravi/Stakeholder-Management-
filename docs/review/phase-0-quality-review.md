# Phase 0 Quality Review: Creative Director Pass

> Superseded by the measured audit in [`../audit/phase-0-audit.md`](../audit/phase-0-audit.md), which found defects this self-review missed (map selection fading, phantom decision records, invisible nav highlight).

Date: 2026-10-22 · Prototype: `app/` (Vite, React 19, Motion 14, Cytoscape 3.34)

## Screens built

1. **Home: Intelligence Command Center.** Attention ledger driven by rules over records, with expandable "why this is here" evidence, a ±30-day commitment horizon with a "today" line, approvals in flight, key-stakeholder coverage against an 80% target, and recent stance changes.
2. **Stakeholders directory.** Virtualised keyboard grid (J/K, X, Space, Enter, S), filter chips, stable sort, inline stance editing with undo, bulk bar, and a peek panel that follows focus.
3. **Stakeholder Universe.** Cytoscape map scoped by initiative, organisation clusters, influence-grid lens, hover neighbourhood highlighting, gaps lens, search-to-fit, arrow-key traversal between connected people, an accessible list view, and a shared side panel.
4. **Stakeholder profile.** Identity and affiliations, "needs attention" actions, a cited briefing with fact/inference marking, a 52-week activity strip, timeline, ego network, commitments (fulfil with undo), decisions with approval state, risks, and history.
5. **Meeting review.** Source notes with highlighted spans and AI suggestions side by side. Accept, edit or reject with keyboard, confidence bands, inferred tags, and an embedded prompt-injection line detected and shown as inert text.

Global: command palette (⌘K, multi-word fuzzy search, record keys, scoped prefixes, recents), G-sequences, toasts with ⌘Z undo, live region, and a bottom nav under 900 px.

## Measured evidence

| Check | Result | Method |
|---|---|---|
| Initial JS | 196.6 kB gzip (map chunk loaded lazily: 266 kB gzip) | `vite build` |
| Directory keypress (J) at 5,000 rows | **1–7 ms** (was 44 ms before row memoisation) | Production build, timer around dispatch |
| Directory text filter at 5,000 rows | **6.7 ms** (was 104 ms; now `useDeferredValue`) | Same |
| Directory 3,000 px scroll jump | 14–27 ms (remounts ~50 rows) | Same |
| Map re-layout, fcose, 184 nodes | **323 ms** (was 1,154 ms) | Production build |
| Map cluster layout, 184 nodes | 202 ms including re-parenting | Production build |
| Map stress, 2,000 nodes / 3,771 edges | Interactive ~1.6 s after navigation start | `?n=2000` |
| Accessibility (axe-core 4.10, WCAG 2.0–2.2 A/AA) | **0 violations** on all 5 screens, all profile tabs and the palette | Injected axe run |
| Responsive | Checked at 1440×900, 1024×768 and 375×812 | Viewport emulation and screenshots |

**Not verified:** frame-by-frame 60 fps. The browser pane was hidden during testing, so requestAnimationFrame was throttled to about one frame per 450 ms. Timing numbers come from timers around state changes, not from rendered frames.

## Ten most significant issues found, and what happened

| # | Issue | Status |
|---|---|---|
| 1 | Organisation groups overlapped into a "box hairball" under fcose compound layout | **Fixed.** Deterministic two-level layout: sunflower-packed clusters plus an organisation force simulation with collision removal |
| 2 | Influence grid unreadable: every edge drawn, people stacked in cells | **Fixed.** Per-cell packing; edges hidden except for the focused node's neighbourhood |
| 3 | Directory re-rendered every row on each keypress (44 ms at 5k rows) | **Fixed.** Memoised rows with a stable action bag; deferred filtering |
| 4 | fcose re-layout blocked the main thread for 1.15 s | **Fixed.** Default quality and fewer iterations: 323 ms |
| 5 | Stalled approvals listed once per approver, inflating the ledger | **Fixed.** One signal per decision ("Waiting on X and 2 others · 31 days") |
| 6 | Axe: muted-text contrast, nested interactive rows, invalid grid ARIA, unlabelled indicators | **Fixed.** `--text-3` darkened, ledger toggle made a real button, grid owns `aria-activedescendant`, `role="img"` labels |
| 7 | Screen shortcuts fired behind the open palette | **Fixed.** Hotkeys ignore events outside an open `aria-modal` |
| 8 | "Show in map" from a profile could open a scope that excluded the person | **Fixed.** Map opens in the focused person's initiative |
| 9 | Under 900 px there was no navigation; ledger titles collapsed to zero width | **Fixed.** Bottom nav; ledger, profile header and directory columns adapt |
| 10 | Accepting a suggestion squashed the card text during the layout animation | **Fixed.** Position-only layout plus a cross-fade into a compact resolved row |

## Unresolved limitations

- **Motion smoothness is unmeasured** (see above). Profile it in a visible browser with the Performance panel before Phase 1.
- **The peek-to-profile shared avatar** (`layoutId`) is implemented but not visually confirmed.
- **Graph layout runs on the main thread.** The architecture doc specified a Web Worker. fcose re-layout costs ~320 ms at 184 nodes.
- **The briefing is assembled by rules, not an LLM.** It follows the citation contract and says so on screen. "Ask" in the palette is labelled as not connected.
- **Dark-mode tokens exist** but there is no theme toggle, and dark mode has not been reviewed.
- **Organisation labels** in the map are hard to read below ~50% zoom.
- **Out of scope:** Initiatives, Decisions, Commitments and Reports are honest placeholders, and "Log engagement", "Assign owner" and "New stakeholder" are disabled.
- **No automated tests.** Playwright and Vitest are not installed.
- **No manual screen-reader pass** (VoiceOver/NVDA). Axe is necessary but not sufficient.
- Sample data is generated from a fixed seed and labelled as fictional in the sidebar.

## Scorecard (internal targets, not proof)

| Dimension | Self-assessment | Basis |
|---|---|---|
| Visual craftsmanship | 8.5 | Consistent tokens, type and density; map org labels and some empty states still need refinement |
| Information architecture | 8.5 | 7-item nav, map as a lens, evidence one click away |
| Interaction quality | 8.5 | Full keyboard paths, undo everywhere, peek/focus continuity |
| Motion quality | 7.5 | Tokenised and restrained, but frame rate unverified |
| Usability | 8 | Untested with real users |
| Accessibility | Axe 0 violations | No manual assistive-technology testing yet |
| Responsive quality | 7.5 | Phone layouts usable; the map on phones is still a desktop experience |
| Performance | Meets budgets where measured | See the table above |
| Design consistency | 8.5 | One table, one panel, one filter model |

The 9.5 target is not met. The gaps are listed above rather than hidden.
