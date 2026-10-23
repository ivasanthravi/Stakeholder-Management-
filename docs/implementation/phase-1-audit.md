# Phase 1 Entry Audit

Date: 2026-10-22 · Repository: `~/Desktop/Stakeholder Management` · Auditor: Claude (Opus 5.5)

## 1. What exists

| Area | Location | State |
|---|---|---|
| Product docs | `docs/product/*` (strategy, IA, journeys, Stakeholder Universe) | Complete for Phase 0 |
| Architecture docs | `docs/architecture/domain-model.md`, `ai-intelligence-layer.md` | Specify Postgres + RLS, temporal model, evidence links, AI contract |
| Design system | `docs/design/*` (principles, system, interaction, motion) and `app/src/styles/tokens.css`, `app/src/lib/motion.ts` | Implemented as CSS tokens + Motion tokens |
| Phase 0 report | **`PHASE-0-REPORT.md` does not exist.** The equivalent is `docs/audit/phase-0-audit.md` (measured audit) plus the superseded `docs/review/phase-0-quality-review.md` | Gap noted; no prior decisions invented |
| Application | `app/`: Vite 8, React 19, React Router 7, Motion 14, Cytoscape 3.34 (+fcose, layout-utilities), TanStack Virtual, lucide-react | Single-page client, no server |
| Data | `app/src/data/seed.ts` (deterministic generator), `store.ts` (in-memory `useSyncExternalStore`), `selectors.ts` (signals), `briefing.ts` (rule-assembled briefing) | 100% client-side and synthetic |
| Tests | `app/audit/{interactions,capture,perf}.mjs` (headless Chrome via `playwright-core`) | 52/52 interaction tests passing at end of Phase 0 audit |
| Version control | Not a git repository | Gap: recommend `git init` before Phase 1 lands |
| Runtime verified | `npm run dev` serves the app; `npx vite build` succeeds; `tsc -b` clean | ✔ verified 2026-10-22 |
| Local infrastructure | No Postgres, Docker or Homebrew on this machine | Phase 1 dev/test uses **PGlite** (real Postgres compiled to WASM, in-process); production uses `DATABASE_URL` |
| Claude Code skills relevant here | `react-best-practices`, `how-to-write-component`, `frontend-testing`, `e2e-testing`, `security-review`, `api-design`, `backend-patterns`, `architecture-decision-records`, `accessibility` | Available |

## 2. Feature classification

Legend: **PR** production-ready · **BI** requires backend integration · **RF** requires refactoring · **PO** prototype-only · **IN** incomplete · **BR** broken.

### Shell & cross-cutting

| Feature | Class | Notes |
|---|---|---|
| App shell, sidebar, active indicator, page cross-fade | PR (UI) | Keep as-is |
| Command palette (fuzzy, multi-token, modes, recents) | BI | Searches the client store; needs a server search endpoint for tenant data |
| Hotkeys (G-sequences, modal guard) | PR | |
| Toasts with ⌘Z undo | RF | Undo restores client state; with a server it must issue compensating mutations |
| Live region announcements | PR | |
| Design tokens, motion tokens, components (`Button`, `Avatar`, `StanceBadge`, `LevelMeter`, `Pill`, `Menu`, `Sparkline`, `Cite`) | PR | Approved baseline; do not replace |
| Workspace switcher, inbox, settings | PO | Toast "not built" |
| Authentication, sessions | IN | None exist |
| Multi-tenancy, roles, permissions | IN | None exist |
| Audit log | IN | Only in-memory stance history |
| Not-found / placeholder states | PR | Reuse for 404 and forbidden |
| Bottom nav (≤900 px) | PR | |

### Screens

| Feature | Class | Notes |
|---|---|---|
| **Command Center** ledger, evidence expansion, done/snooze, horizon, approvals, coverage, stance changes | BI + RF | Signal rules are sound (`selectors.ts`) but run over the client store; move to a server query. Snooze is session-only (IN) |
| Greeting / "today" | PO | Fixed date 2026-10-22, fixed afternoon |
| **Directory** virtualised grid, keyboard, filters, sort, peek, inline stance, bulk stance | BI | UI is production-grade; data source must be the API. Bulk "assign owner/add to group" disabled (IN) |
| Create / edit / archive stakeholder | IN | Not present |
| **Profile** hero, needs-attention, tabs, timeline, ego graph, commitments toggle, decisions, risks, history | BI | |
| Rule-assembled briefing with citations | PO (labelled) | Keep rules, move server-side; must stay labelled "assembled by rules" |
| **Relationship map** (Cytoscape, org clusters, influence grid, gaps, list, search, arrow traversal, peek) | BI + RF | Layout/interaction PR; graph data must come from an authorised endpoint |
| Relationship create/edit | IN | |
| **Meeting review** (source spans, suggestions, accept/edit/reject) | PO | Suggestions are fixtures; acceptance creates client-only records. Must be labelled preview, or replaced with manual capture |
| Engagements list / create | IN | Placeholder |
| Decisions register | IN | Placeholder |
| Commitments register | IN | Placeholder |
| Organizations management | IN | Only shown via `?org=` filter |
| Initiatives management | IN | Placeholder |
| Reports | IN | Out of Phase 1 scope |

### Data & logic

| Item | Class | Notes |
|---|---|---|
| `seed.ts` synthetic generator | RF | Reuse its vocabulary for a server-side development seed |
| Signal rules (`computeSignals`) | RF | Port to server query layer; same rules |
| Briefing rules (`buildBriefing`) | RF | Port server-side |
| Stance history, `?n=` stress generator | PO | Stress generator becomes a seed option |
| Phase 0 data model (`types.ts`) | RF | Superseded by the relational schema; decisions now use Proposed / Under review / Approved / Rejected / Deferred |

### Broken

None known. All Phase 0 audit P0 defects were fixed and are covered by `app/audit/interactions.mjs`.

## 3. Mock data & simulated AI inventory

| Item | Where | Phase 1 treatment |
|---|---|---|
| 184 generated stakeholders, 26 orgs, 3 initiatives, engagements, commitments, decisions, risks | `seed.ts` | Replaced by database; dev seed is synthetic and labelled |
| Meeting suggestions (7 fixtures) | `seed.ts → featuredSuggestions` | Not AI. Removed from production paths; engagement page offers **manual** "create commitment/decision from selected notes", and AI extraction is shown as *Preview — not available* |
| Prompt-injection banner | Regex in `Meeting.tsx` | Kept as a client-side warning only; not a security control |
| "Ask" in palette | Label only | Stays labelled "not connected" |
| Briefing | Rules | Stays rules; labelled |

## 4. Dependencies review

All current, MIT/ISC/Apache licensed. Bundle: initial 196 kB gzip, map chunk 266 kB gzip (Phase 0 audit).

## 5. Decision: evolve, don't restart

The Vite SPA is sound and its UI is the quality baseline. Migrating to Next.js would rewrite routing, data loading and transitions for no user-visible gain, and the product is an authenticated application (no SEO need). **Phase 1 adds a TypeScript API server beside the existing client in the same package** (see `implementation-decisions.md`, ADR-001).
