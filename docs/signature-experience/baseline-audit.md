# Phase 8 Baseline Audit

**Date:** 2026-10-25.

**Method:**
- The running app was inspected, not just the code: the Vite dev server on `:5173` and the API on `:8787`, using the sample workspace (184 stakeholders, 3 initiatives, signed in as the owner).
- Captures were scripted with `app/scripts/sig-capture.mjs` (three screens × six widths) and `app/scripts/sig-interact.mjs` (13 interaction steps).
- Screenshots: `screenshots/before/`.
- Scale evidence comes from Phase 7 (`docs/simulation/`).

## Stack (verified, unchanged)
| Area | Facts |
|---|---|
| **Client** | React 19 + Vite 8 SPA, React Router 7, TanStack Query, Motion 14 (`motion/react`), Cytoscape 3.34 (fcose + a cluster layout), lucide icons |
| **Server** | Hono API, Drizzle, PostgreSQL (PGlite in development), row-level security per tenant |
| **Design system** | `src/styles/tokens.css`: Inter / Newsreader / JetBrains Mono; 4 px spacing; slate neutrals with teal accent; amber and red for attention; violet reserved for AI; light mode only |
| **Motion system** | `src/lib/motion.ts` presets (`t.fast`, `t.base`, `t.slow`, `t.indicator`, `t.exit`). CSS durations 80–400 ms; easing `cubic-bezier(.2,0,0,1)`. Reduced motion makes every Motion animation instant |
| **Tests** | 17 Vitest files (201 tests, on PGlite and PostgreSQL), 31 Playwright E2E, AI gate |
| **Skills and MCPs used this phase** | `motion` skill (Motion guidance), the in-app browser, Playwright with Chrome |

## Load to settle (dev server, sample workspace, 1×, no throttling)
| Screen | 1440 | 1024 | 390 | Horizontal overflow |
|---|---|---|---|---|
| Command Center | 893 ms | 854 ms | 875 ms | none at any width |
| Stakeholder Universe | 1,225 ms | 1,181 ms | 1,198 ms (list) | none |
| Stakeholder Profile | 591 ms | 628 ms | 573 ms | none |

**Interactions:**
- expand a signal: 117 ms;
- Universe search, then Enter to select: 40 ms;
- switch a profile tab: 160–310 ms.

**Errors:** one 401 in the console, from the sign-in page's session probe before signing in. It is expected.

## Findings: the problems that matter most
### Command Center
| # | Finding | Evidence | Impact |
|---|---|---|---|
| B-CC1 | **The workspace briefing repeats the headline.** With the rules engine its four "metrics" restate the sentence above them. It takes about 190 px at the top of the page, and most of the first screen on a phone | `command-center-1440.png`, `command-center-390.png` | Pushes "Needs attention" down; says everything twice |
| B-CC2 | **Nothing answers "What changed recently?"** (stance shifts, decisions made, commitments completed, people added). Core question #2 has no home; only "Recent engagements" exists | `i-01-cc-full-page.png` | A user can't see what moved since they last looked |
| B-CC3 | **Attention-row titles truncate at 1440 px.** Space for the hidden hover actions is reserved on every row, next to two avatars and a code | `command-center-1440.png` ("C-176 Revise working hours proposal to exclude Sunda…") | The most important text is the one that's cut |
| B-CC4 | **The expanded row repeats its own reason line** ("13 days overdue · promised to Daria Zielinski" twice) | `i-02-cc-select-first-commitment.png` | Noise in the panel that should add context |
| B-CC5 | **Filter tabs are clipped on phones** (Decisions and Relationships off-screen) | `command-center-390.png` | Hidden filters |

### Stakeholder Universe
| # | Finding | Evidence | Impact |
|---|---|---|---|
| B-U1 | **Names render at about 7 px at the overview zoom; organisation codes at about 5 px.** Above about 150 people, no names show at device pixel ratio 1 (Phase 7 R4b, Phase 6 O4) | `universe-1440.png`; `docs/simulation/evidence/graph/shot-sim-C-default.png` | The map can't be read without zooming. It fails the purpose "understand who matters" |
| B-U2 | **Selecting from search changes the zoom** (61% → 90%) and can push neighbours off-screen. Callum Carver, an "Allied with" neighbour, is outside the view | `i-06-universe-select-result.png` | Loses context; the focus doesn't show the neighbourhood |
| B-U3 | **The focus panel has no shared initiatives or related decisions** | Same | Relationship exploration stops at direct ties |
| B-U4 | **The highlight walks every element** on select and hover: 0.5–0.6 s at 2,000 people on a 4× slower CPU (Phase 6 O1); 1.3 s in Phase 7 at Profile D | `docs/simulation/graph-stress-results.md` | Slow focus at scale |
| B-U5 | **The list alternative is not virtualized** (Phase 6 O3) | — | Fine at 184 people; 2,000 rows at scale |

### Stakeholder Profile
| # | Finding | Evidence | Impact |
|---|---|---|---|
| B-P1 | **"History" says "No history yet" for a person with 18 engagements.** It only lists edits to the stakeholder record. There is no single chronological timeline across engagements, commitments, decisions and changes | `i-13-profile-tab-history.png` | Core question "what has happened" is split across three tabs, and the one called History looks empty |
| B-P2 | **The "Record" card's description list renders as browser defaults** (each value indented under its label) | `i-13-profile-tab-history.png` | An unfinished detail on a flagship screen |
| B-P3 | **The briefing's opening sentence restates the header** (role, organisation, stance, influence) | `profile-1440.png` | Weaker first line of intelligence |

## What is already strong (keep)
- **Signals expand in place** with a reason, the rule, evidence, a deterministic next step and actions (complete with undo, hide, preview the stakeholder without leaving Home, ask AI).
- **Keyboard shortcuts** throughout: J/K, Enter, D, E and O on Home; M, E and L on the profile; ←/→ on the map. Every shortcut has a visible control.
- **Honest AI labelling:** "Built-in rules engine · no AI interpretation", "Rule-based", "Recorded fact / Inference", cited sources, and "How?" methods.
- **The Universe focus panel** shows stance, influence, owner, engagement, commitments and relationships, with ←/→ to the nearest neighbour. The list view is the accessible alternative, and phones open the list by default.
- **No horizontal overflow** at 320–1440 px on any flagship screen.

## Phase 8 plan, in order of value
1. **Command Center:**
   - fold the briefing into the intro when it only restates counts (B-CC1);
   - add "What changed · 7 days" (B-CC2);
   - stop reserving action space on rows (B-CC3);
   - remove the duplicate line (B-CC4);
   - make the filter tabs scroll on phones (B-CC5).
2. **Universe:**
   - readable overview labels, zoom-compensated, for the key people only (B-U1);
   - focus keeps the user's zoom and frames the neighbourhood only when it doesn't fit (B-U2);
   - shared initiatives in the panel (B-U3);
   - an incremental highlight (B-U4).
3. **Profile:**
   - the History tab becomes a real **Timeline** (engagements, commitments, decisions and changes, filterable, grouped by month, paged, every item linked to its source) (B-P1);
   - fix the Record card (B-P2);
   - sharpen the briefing's first line (B-P3).
4. **Journey:** a scripted Command Center → Profile → Universe → Profile → update → Command Center run, checking data consistency.
5. **Verification:** responsive, accessibility (axe plus keyboard), performance before and after, and the release gate.
