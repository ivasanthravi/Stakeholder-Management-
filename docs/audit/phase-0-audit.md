# Phase 0 Product Quality Audit

Date: 2026-10-22 · Scope: the five Phase 0 screens in `app/` · Supersedes the self-review in [`../review/phase-0-quality-review.md`](../review/phase-0-quality-review.md)

> **Bottom line.** The prototype is a convincing, fast, keyboard-complete **front-end demonstration running on generated sample data**. It has **no backend, persistence, authentication, authorisation, tenancy, audit log or AI service**. Nothing here is production-ready. This audit confirmed and fixed **3 P0 and 11 P1/P2 defects**. Every fix is covered by a scripted test (52/52 passing, 0 console errors). One P1 performance issue remains open on throttled hardware.

## 1. Method

| What | How | Evidence |
|---|---|---|
| Launched the real app | Vite dev server (`localhost:5173`) for interaction tests; production build (`vite preview`, `localhost:4173`) for performance | — |
| Screenshots | Headless Google Chrome via `playwright-core` (no browser download; uses the installed Chrome), 1440×900 desktop and 390×844 @2x mobile, 22 states each | [`screenshots/`](screenshots/), `app/audit/capture.mjs` |
| Interactions | 52 scripted tests driving real keyboard and pointer input with DOM assertions, plus a reduced-motion context | [`interaction-results.json`](interaction-results.json), `app/audit/interactions.mjs` |
| Motion and performance | Every rendered frame sampled with rAF deltas and Long Tasks API during 23 scenarios; CPU at 1× and 4× (median of 3 runs) via CDP | [`perf-results.json`](perf-results.json), `app/audit/perf.mjs` |
| Accessibility | axe-core 4.10 (WCAG 2.0–2.2 A/AA) on every screen, run in Phase 0 and spot-checked again | — |

**Tooling notes.**
- The in-app browser pane was hidden for this session, which pauses rAF. Profiling therefore ran in headless Chrome, which renders at a real 60 Hz.
- `morluto/rea` is **not installed** in this environment, so this audit did not use it, contrary to the brief's wording. Nothing was reverse-engineered.
- One dev dependency was added: `playwright-core` (no bundled browser). The audit scripts are re-runnable: `node audit/interactions.mjs`, `node audit/capture.mjs`, `node audit/perf.mjs`.

## 2. Visual audit

Screenshots are taken after fixes. Paths are relative to this file.

| Screen | Desktop | Mobile |
|---|---|---|
| Command Center | [home](screenshots/desktop-home.png) · [evidence expanded](screenshots/desktop-home-expanded.png) | [home](screenshots/mobile-home.png) |
| Directory | [table](screenshots/desktop-directory.png) · [peek + multi-select](screenshots/desktop-directory-peek-select.png) · [stance menu](screenshots/desktop-directory-stance-menu.png) · [empty](screenshots/desktop-directory-empty.png) | [table](screenshots/mobile-directory.png) · [peek](screenshots/mobile-directory-peek-select.png) |
| Relationship map | [network](screenshots/desktop-map-network.png) · [selected](screenshots/desktop-map-selected.png) · [influence grid](screenshots/desktop-map-influence.png) · [gaps](screenshots/desktop-map-gaps.png) · [list](screenshots/desktop-map-list.png) | [list default](screenshots/mobile-map-network.png) · [selected](screenshots/mobile-map-selected.png) |
| Profile | [overview](screenshots/desktop-profile.png) · [citation](screenshots/desktop-profile-citation.png) · [relationships](screenshots/desktop-profile-relationships.png) · [commitments](screenshots/desktop-profile-commitments.png) | [overview](screenshots/mobile-profile.png) |
| Meeting review | [initial](screenshots/desktop-meeting.png) · [in progress / edit](screenshots/desktop-meeting-progress.png) | [initial](screenshots/mobile-meeting.png) |
| Global | [palette](screenshots/desktop-palette.png) · [shortcuts](screenshots/desktop-palette-shortcuts.png) · [placeholder](screenshots/desktop-placeholder-section.png) · [not found](screenshots/desktop-not-found-person.png) | [palette](screenshots/mobile-palette.png) |

### Premium design assessment (against Linear, Raycast, Vercel)

| Dimension | Holds up | Falls short |
|---|---|---|
| Typography | Inter/Newsreader split is distinctive; tabular numerals; restrained scale | Map labels below ~50% zoom are illegible; mono org labels in the map are too faint |
| Spacing and density | 36 px rows and 4 px rhythm; Home ledger reads like a working tool | Profile hero leaves a lot of air beside short content at 1440 px |
| Hierarchy | One accent; red/amber rationed for overdue/attention; violet only for AI | Home ledger shows 3–4 small badges per row (two avatars, initiative code, kind) without labels. Owner vs counterparty is only distinguishable by avatar outline |
| Consistency | One table, one panel, one menu, one filter-chip model across screens | Map toolbar chips are slightly different components from directory chips |
| Feedback | Optimistic updates with undo everywhere; toasts only for undoable actions | Toasts stack (up to 3) bottom-left over content |
| Restraint | No gradients, glass or decorative motion; no fake KPI cards | — |
| Honesty | Sample data labelled; rule-based briefing labelled; inert controls now say "not built" | Greeting time and "today" are fixed (`2026-10-22`, afternoon) |

**Our assessment:** visual craft is at a strong-prototype level, roughly comparable to an early Linear-style internal tool. It is not yet at Linear's polish. The gaps are map legibility, Home row clarity and mobile depth, not the overall direction.

## 3. Issues by priority

Status: ✅ fixed in this audit (with regression test) · 🟡 improved, still open · ⬜ open.

### P0: broken signature behaviour or misrepresented functionality

| # | Issue | Evidence | Status |
|---|---|---|---|
| P0-1 | **Selecting a node on the relationship map faded the node and its neighbours to 13% opacity.** The org container was being faded, and Cytoscape multiplies a parent's opacity into its children. The flagship interaction looked broken. | Probe: `effectiveOpacity` 0.13 for selection and all neighbours | ✅ Org containers use a separate dim style; test asserts selection and neighbours at opacity 1 |
| P0-2 | **Meeting review claimed records it didn't create.** Accepting a decision toasted "Created D-111" but no decision existed. Accepting a stance change changed nothing. | Store inspection | ✅ Accept now creates a real decision record (linked to E-1000) and updates stance with history and evidence; undo reverses both |
| P0-3 | **The active-navigation highlight never rendered on any screen.** A CSS rule meant for labels also matched the highlight `<span>`, making it inline and pushing the label 10 px right. | Desktop screenshots, all screens | ✅ Test asserts a 200×30 px active surface |

### P1: significant quality, usability or robustness issues

| # | Issue | Status |
|---|---|---|
| P1-1 | Reopening ⌘K within ~100 ms lost the first keystrokes: the closing instance restored focus and stole it from the new one | ✅ |
| P1-2 | React "setState during render" error when moving focus with the peek panel open | ✅ (0 console errors across the suite) |
| P1-3 | Marking a commitment fulfilled on the profile made it vanish instantly, so the completion animation and undo context were lost | ✅ Stays visible, struck through, until you leave |
| P1-4 | All three sidebar initiative links rendered as "current" on any Stakeholders URL | ✅ |
| P1-5 | Mobile meeting review overflowed horizontally (notes and cards clipped) | ✅ |
| P1-6 | Mobile map opened at 24% zoom with unreadable nodes; legend overflowed | ✅ List view is the default on phones, and the canvas is opt-in |
| P1-7 | Unknown routes and records were dead ends (bare text; unknown URLs claimed "not part of prototype") | ✅ Shared not-found state with Back and Search |
| P1-8 | Map hover at 4× CPU: 23% dropped frames, 14 long tasks up to 135 ms (whole screen re-rendered per pointer move) | 🟡 Now 8.8% dropped and 3 long tasks (imperative hover, diff-based restyle, 40 ms dwell) |
| P1-9 | Inert controls looked live (workspace switcher, inbox with a fake "3 unread" dot, Settings, "Log engagement") | ✅ Disabled or say "not built"; fake unread dot removed |
| P1-10 | Directory table wheel scroll at 4× CPU: 18.6% dropped frames (median). Row mount cost (avatars, icons, meters) | 🟡 Sparklines reduced from 26 SVG nodes to 2 per row; still open |
| P1-11 | Map arrow-key traversal at 4× CPU: 18.6% dropped frames (median). Panel content swap plus camera move per step | 🟡 URL sync debounced; within noise of before, still open |
| P1-12 | fcose re-layout ("Group" off) blocks the main thread for 289 ms at 4× | ⬜ Needs a Web Worker (architectural; see §7) |
| P1-13 | Side panel lists all of a person's relationships (e.g. 8) while the scoped map shows only in-scope ones (e.g. 3), with no explanation | ⬜ |
| P1-14 | "Approval stalled" items can't open the decision; there is no Decisions screen. The ledger's most important item type is a dead end | ⬜ Needs the Decisions record page (Phase 1) |
| P1-15 | Dark-mode tokens exist but there is no toggle and dark mode was never verified | ⬜ |

### P2: polish

| # | Issue | Status |
|---|---|---|
| P2-1 | "Last engaged" column header clipped to "ast engaged" | ✅ |
| P2-2 | Sidebar search label wrapped onto two lines | ✅ |
| P2-3 | Missing favicon (404 on every load) | ✅ |
| P2-4 | Profile ego network had no labels; "Open in map" clipped | ✅ |
| P2-5 | Featured meeting attendee wasn't a member of the meeting's initiative (sample-data inconsistency) | ✅ |
| P2-6 | Ledger silently caps at 40 items | ⬜ |
| P2-7 | Map edge labels overlap node labels on dense selections | ⬜ |
| P2-8 | Owner column truncates first names ("Da…") at 1440 px | ⬜ |
| P2-9 | Mobile meeting header's "Accept high-confidence" is cut off | ⬜ |
| P2-10 | Sample data repeats commitment wording across stakeholders | ⬜ |
| P2-11 | Engagement timeline rows other than the featured meeting look clickable but have no detail page | ⬜ |
| P2-12 | Toasts stack over content bottom-left | ⬜ |

## 4. Functional readiness matrix

**Legend**
- **Works:** real logic over in-memory client data.
- **Simulated:** behaves plausibly but is backed by fixtures or rules.
- **Missing:** required for production and absent.

No row persists anything: a reload resets everything.

| Capability | Command Center | Directory | Relationship map | Profile | Meeting review |
|---|---|---|---|---|---|
| Rendering of records | Works | Works | Works | Works | Works |
| Data source | Simulated: deterministic seeded generator (184 people, fixed "today") | Simulated | Simulated | Simulated | Simulated: one hand-written meeting |
| Signals / intelligence | **Works** (rules over records: overdue, due soon, stalled approvals, cooling, unowned, stance shift) | — | Works (gaps lens = rule) | **Simulated:** briefing assembled by templates, not an LLM (labelled on screen) | **Simulated:** 7 suggestions are fixtures; nothing extracts text. Injection banner is a regex |
| Edit actions | Works: mark fulfilled, snooze (snooze is session-only) | Works: stance (single/bulk) with undo | — | Works: fulfil/reopen commitment | Works: accept/edit/reject creates commitment, decision and stance records |
| Undo | Works (⌘Z, toast) | Works | — | Works | Works |
| Search / filter / sort | Works (tabs, scope) | Works (text, stance, influence, initiative, cold; stable sort) | Works (initiative, stance, relationship type, search) | — | — |
| Keyboard coverage | Full | Full | Full (arrows, [ ], Enter, Esc, + − 0, L, G) | Full | Full |
| Accessibility | axe 0 | axe 0; grid ARIA | axe 0; list alternative; live announcements | axe 0 | axe 0 |
| Persistence | Missing | Missing | Missing (positions, saved views) | Missing | Missing |
| Create records | Missing | Missing (New stakeholder, import) | Missing (add relationship) | Missing (log engagement, edit fields) | Partial: only via suggestions |
| Validation | Missing (no schema validation anywhere) | Missing | Missing | Missing | Missing (edited text unchecked) |
| AuthN / AuthZ / restricted records | Missing | Missing | Missing | Missing | Missing |
| Multi-tenancy | Missing (single hard-coded workspace) | Missing | Missing | Missing | Missing |
| Audit log | Missing (stance history is the only trail, in memory) | Missing | Missing | Missing | Missing |
| API boundary | Missing: components read a client store directly | Missing | Missing | Missing | Missing |
| Integrations (email, calendar, SSO, import) | Missing | Missing | Missing | Missing | Missing |

## 5. Motion and performance assessment

Production build, headless Chrome, 1440×900. "Dropped" means frames longer than 25 ms (1.5× the 60 Hz budget). 4× values are the median of 3 runs.

| Scenario | 1× p95 / dropped | 4× p95 / dropped | 4× long tasks | Verdict |
|---|---|---|---|---|
| Cold load → ledger visible | 160 ms | 586 ms (FCP 484 ms) | — | Good |
| Page transition Home → Stakeholders | 16.8 ms / 2.9% | 100 ms / 9.7% | 2 (≤107 ms) | 1× smooth; first mount computes rows (cached afterwards) |
| Sidebar indicator transition | 16.8 / 0% | 33 / 5.1% | 0 | Good |
| Table hold J (40 repeats) | 16.8 / 0% | 16.7 / 0% | 0 | Excellent |
| Table select ×10 + bulk bar | 16.7 / 0% | 16.7 / 0% | 0 | Excellent |
| Table wheel scroll | 16.7 / 0.8% | 33.4 / **18.6%** | 0 | **P1-10 open** |
| Peek open / follow J / close | 16.8 / 0% | 16.8 / ≤3% | ≤1 | Good |
| Palette open + typing | 16.7 / 0% | 16.8 / 2% | 0 | Good |
| Table → Map (lazy load + layout) | 289 ms to interactive | 704 ms | 2 (≤235 ms) | Acceptable for a view switch; chunk now preloaded while idle |
| Map hover sweep | 16.7 / 0% | 33.4 / 8.8% | 3 (≤98 ms) | Improved from 22.8% |
| Map wheel zoom / drag pan | 16.8 / 0% | 16.8 / 0% | 0 | Excellent |
| Map arrow-key selection + camera | 16.7 / 0% | 50 / **18.6%** | 1 (68 ms) | **P1-11 open** |
| Map stance filter (animated re-layout) | 16.8 / 0% | 16.8 / 2.7% | 0 | Good |
| Influence-grid lens transition | 16.8 / 0% | 16.8 / 3.4% | 0 | Good |
| Toggle grouping (fcose) | 16.7 / 1.3% | — / 1.3% | 1 (**289 ms**) | **P1-12 open** |
| Profile tab switching | 16.8 / 0% | 16.8 / ≤1% | 0 | Excellent |
| Home evidence expand / snooze | 16.8 / 0% | 16.8 / ≤2.5% | 0 | Good |
| Meeting accept ×3 | 16.8 / 0% | 16.8 / 1% | 0 | Good |

**Interpretation**
- On a fast machine (1×), every interaction holds 60 fps. The only frames over budget are lazy-loading the map and an fcose layout.
- On a 4×-throttled CPU, standing in for a mid-range business laptop, three interactions drop 10–19% of frames: wheel scrolling the table, keyboard traversal on the map, and the first visit to the directory.
- These are mostly smoothness problems, not latency problems: p50 frame times stay at 16.7 ms. Input latency stays low, at 1–7 ms per keypress on 5,000 rows (Phase 0 measurement).

**Before → after this audit (4× CPU)**
- Map hover: 22.8% → 8.8% dropped frames; long tasks 14 → 3.
- Wheel scroll: 21.9% (single run) → 18.6% (median).
- Arrow traversal: unchanged within run-to-run noise.

**Reduced motion: verified.** CSS transitions clamp to ≤1 ms, the peek panel appears without a slide, and graph camera moves jump-cut (code path). Skeleton shimmer was not exercised: no screen currently shows a loading skeleton long enough, because all data is local.

**Loading, error and empty states actually exercised**
- **Exercised:** directory empty filter, not-found records, unknown routes, placeholder sections, map "Laying out…" state.
- **Not exercisable:** network errors, slow loading and permission-denied states. There is no network layer, so these have **no designs in code yet**.

## 6. Product experience audit

### Intelligence Command Center: *does it help decide?* Mostly yes.
- **Works:** one prioritised list with a reason on every row, evidence one keypress away, done/snooze/open in place. The commitment horizon answers "what's about to slip" at a glance.
- **Gaps:**
  - The top items (stalled approvals) can't open the decision (P1-14).
  - There is no "since you last looked" diff, which the strategy calls a core question.
  - Coverage bars aren't actionable: no "who's uncovered" list.
  - Two unlabelled avatars per row make ownership ambiguous.
- **Low-complexity opportunities:**
  - Label owner vs counterparty on hover and in the evidence pane.
  - Make coverage rows open the map's Gaps lens for that initiative.
  - Add a "Changed since Monday" filter tab based on activity timestamps.

### Relationship map: *useful for structure questions, still effortful.*
- **Works:**
  - Organisation clusters make the map readable at ~100 people.
  - The influence grid is a true influence/interest matrix (Mendelow-style).
  - Gaps lens, search-to-fit, arrow traversal and the list alternative are genuinely useful.
- **Gaps:**
  - No answer yet to "how are we connected to X?": the path finder is specified but not built.
  - There are no internal colleagues on the map, so "who on our team knows them" is unanswerable.
  - Edge meaning relies on a legend.
  - The side panel's relationship count disagrees with the map (P1-13).
  - The default "network" view still asks the user to interpret structure.
- **Opportunities:**
  - **Path finder** between two people (Cytoscape has the algorithm built in).
  - **"Our connections" lens** (relationship owners as nodes).
  - Selection summary in the panel: "3 of 8 relationships shown in this initiative".
  - Open the map in a question-led state ("Who influences D-104?") instead of a whole-initiative overview.

### Stakeholder profile: *strongest screen.*
- **Works:** the briefing with citations and fact/inference marking is the clearest expression of the product's trust thesis. "Needs attention", timeline, network and commitments answer "what do I need before I meet them?".
- **Gaps:**
  - The briefing is rule-assembled.
  - No meeting-prep mode (calendar).
  - No inline field editing.
  - The network preview is first-degree only, without relationship types on hover.
  - "Log engagement" (the most frequent job) isn't built.
- **Opportunities:**
  - Quick-capture engagement from the profile (one form, one keypress).
  - "Prepare for meeting" view: briefing, open items and talking points only.

### Directory and meeting review
- **Directory:** a fast, keyboard-complete register. It lacks saved views, column choice, import and export, which are table stakes for buyers migrating from Excel.
- **Meeting review:** the human-in-the-loop flow is right (source spans, confidence, inferred tags, undo). Its weakness is that it reviews **fixtures**: real extraction is the main Phase 1 AI dependency.

## 7. Phase 1 roadmap

### A. Essential SaaS infrastructure (must exist before any customer data)

| Priority | Workstream | Scope | Why first |
|---|---|---|---|
| A1 | **Backend and API boundary** | Typed API (REST or tRPC) with schema validation (Zod) shared with the client; replace the client store with server state (TanStack Query) and optimistic updates | Everything below depends on it |
| A2 | **Postgres schema and migrations** | Implement `docs/architecture/domain-model.md` core tables: parties, affiliations, relationships, engagements, decisions/approvals, commitments, classifications (temporal), evidence links | Persistence |
| A3 | **AuthN** | OIDC (Google/Microsoft), sessions, invite flow | No real users without it |
| A4 | **Tenancy and AuthZ** | `workspace_id` everywhere with Postgres RLS; roles; initiative grants; restricted records; one `can()` policy used by API, search and exports | Data-isolation guarantee |
| A5 | **Audit log** | Append-only audit events written in the same transaction as each change; activity feed derived from it | Regulated-sector buyers require it |
| A6 | **Import** | CSV/XLSX stakeholder and commitment import with mapping and duplicate detection | Activation: customers arrive with spreadsheets |
| A7 | **Quality gates** | CI running typecheck, Vitest units (selectors, store mutations), the Playwright suites from `app/audit/`, axe and a performance budget | Protects what Phase 0 proved |
| A8 | **Ops** | Region-pinned hosting, backups, error tracking, feature flags | Operability |

### B. Product differentiation (start when A1–A4 land)

| Priority | Workstream | Scope |
|---|---|---|
| B1 | **Real meeting intelligence** | LLM extraction behind the existing review UI: citation validator, injection fencing, eval set (`docs/architecture/ai-intelligence-layer.md` §5–6) |
| B2 | **Decision record and approvals** | Decisions screen, approval capture, supersession. Unblocks P1-14 and the top ledger items |
| B3 | **Quick capture and log engagement** | The highest-frequency job; feeds every signal |
| B4 | **LLM briefings** | Same UI and contract; server-side, permission-aware retrieval |
| B5 | **Map: path finder and "Our connections" lens** | Answers "how do we reach X?" and "who owns this relationship?" |
| B6 | **Since-last-visit diff** | Home tab and profile "what changed" |
| B7 | **Saved views and export** | Directory and ledger |

### C. Carry-over quality items (Phase 1 sprint 1)
- P1-10, P1-11 and P1-12 (performance at 4×).
- P1-13 (panel/map count mismatch).
- P1-15 (verify dark mode or remove its tokens).
- The P2 list.

## 8. Needs your approval (not done in this audit)

1. **Move graph layout into a Web Worker** (fixes P1-12; touches the map's layout pipeline).
2. **Choose the backend stack** for A1–A2. I recommend TypeScript end-to-end (Fastify or Hono, plus Drizzle on Postgres) to keep the shared schema with the client.
3. **Reduce per-row DOM in the directory** (fixes P1-10). This means a lighter row design: owner initials without avatar chrome, and action icons rendered only on the focused row. It is a visible design change.
4. **Map default view.** Open in a question-led state, or keep the overview.

## 9. Self-assessment (evidence-based, not aspirational)

| Dimension | Score | Evidence |
|---|---|---|
| Visual craft | 8/10 | Screenshots; consistent tokens. Map legibility and Home row clarity still weak |
| Interaction quality | 8.5/10 | 52/52 scripted interactions; full keyboard coverage; undo everywhere |
| Motion | 8/10 | 60 fps at 1× in all but two load/layout events; 3 scenarios drop 10–19% at 4× |
| Accessibility | axe 0 violations | No manual screen-reader pass yet |
| Responsive | 7/10 | All screens usable at 390 px; the map and directory are reduced, not redesigned, for phones |
| Production readiness | **1/10** | No persistence, auth, tenancy, audit, validation or API |

These scores are below the 9.5 target. The gap is concentrated in throttled-hardware smoothness, mobile depth, and above all in the absence of any real platform underneath the interface.
