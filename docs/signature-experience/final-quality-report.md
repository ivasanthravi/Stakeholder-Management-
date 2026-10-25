# Final Quality Report: Phase 8 Signature Experience

**Date:** 2026-10-25.

**Scope:** the Command Center, the Stakeholder Universe and the Stakeholder Profile, and the journey between them, refined on the existing architecture:
- React 19 / Vite / Hono / PostgreSQL / Cytoscape / Motion;
- no new dependencies, no schema change, no route removed;
- the approved design system unchanged.

## Release gate (final code)
`app/scripts/release-gate.sh`: **passed.**

| Check | Result |
|---|---|
| Dependency audit | No high or critical issues (4 moderate in dev tooling, unchanged) |
| Typecheck (client + server), lint | Pass |
| Vitest, PGlite | **203 / 203** (17 files) |
| Vitest, real PostgreSQL | **203 / 203** |
| AI evaluation and safety gate | PASS |
| Backup and restore drill | Pass |
| Production build | Pass |
| Playwright E2E | **33 / 33**, including the new `signature.spec.ts` journey |

**New tests this phase:**
- `signature.spec.ts`: the 11-step cross-experience journey;
- `simulation.test.ts`, "What changed": counts equal SQL;
- `simulation.test.ts`, timeline: complete paging, ordering, filters, restricted and foreign 404s.

## Quality gates (requirement 16)
| Gate | Verdict | Evidence |
|---|---|---|
| **Command Center:** actionable, readable, fast, grounded | **Met** | Needs attention on the first screen; full titles; "What changed" answers the missing core question from records; dashboard 157 ms at 5,000 stakeholders (unchanged); counts equal SQL |
| **Universe:** understandable, performant, navigable, accessible | **Met, with one recorded trade-off** | Key people named at every zoom; focus frames the neighbourhood without zooming in; in-map traversal from the panel; axe clean; list alternative. **Selection on maps of 1,000+ people is 50–100 ms slower than Phase 7**; load, pan and zoom are equal or better |
| **Profile:** context, clear actions, efficient workflows | **Met** | A real Timeline (server-paged, filterable, sourced); the briefing opens with initiative context; Record card fixed |
| **Cross-experience journey** | **Met** | 11 steps automated, end to end, with data consistency checked |
| **Design consistency** | **Met** | Existing tokens, type styles and row patterns only (`design-principles.md`) |
| **Motion** | **Met** | No new animation types; reduced motion honoured; the camera never zooms in or queues (`motion-system.md`) |
| **Engineering** | **Met** | Release gate passed |
| **Security** | **Met** | The new timeline endpoint goes through row-level security and visibility checks (restricted and foreign → 404, tested); "What changed" reads through each record's own table (RLS); no permission changes |

## What changed, by experience
- **Command Center** (`command-center-review.md`):
  - folded briefing;
  - What changed · 7 days;
  - row actions overlaid on the row;
  - rule-first expanded rows;
  - phone tab scrolling;
  - rail ordered by action.
- **Universe** (`stakeholder-universe-review.md`):
  - readable key, focus and edge labels;
  - neighbourhood framing;
  - in-map traversal;
  - initiatives and decisions in the panel;
  - relationship definitions;
  - small-group spacing;
  - measured performance work.
- **Profile** (`stakeholder-profile-review.md`):
  - unified Timeline (new `GET /stakeholders/:id/timeline`);
  - context-first briefing;
  - Record card.
- **Shared:** `server/modules/changes.ts` serves both the Command Center and the Copilot.

## Defects found during Phase 8 (all fixed unless listed below)
| Defect | How found | Fix |
|---|---|---|
| Timeline "Decisions" filter returned 500 | New Vitest test | Aliased union columns |
| The focused first row's actions covered its owner avatar | Screenshot inspection | Actions on focus only after keyboard use |
| Bulk "184 added" crowded "What changed"; stat labels truncated | Screenshot inspection | Grouped additions; two-line feed |
| Two people overlapped in small groups | E2E failure screenshot | Minimum first-ring distance |
| Zoom fps halved at about 1,000 people (label sizing per frame) | Graph harness | Debounced resizing |
| +400 ms map load at 963 people (sort comparator walked the graph) | Alternated A/B against Phase 7 | Precomputed scores |
| Neighbour labels rendered huge and clipped | Screenshot after an optimisation | Hybrid sizing (key people via classes, focus via per-element styles) |

## Open items
| # | Item | Severity | Options |
|---|---|---|---|
| S1 | Selection on maps of about 1,000+ people is 50–100 ms slower at 1× (+60–70% on 4× CPU) because names are drawn | P2 | Cluster or aggregate very large maps; draw names on a separate HTML/canvas overlay; or offer a "fewer names" setting. Each changes the map's behaviour and deserves a design decision |
| S2 | The 2,000-person map on a slow CPU remains slow (Phase 7 R4) | P2 | As above |
| S3 | The timeline is not virtualized | P3 | Needed only past about 1,000 loaded rows; it pages 40 at a time |
| S4 | The Overview tab's engagement list and the Timeline overlap | P3 | Merge them if users prefer; the Overview layout is approved, so it was kept |
| S5 | No screen-reader walkthrough of Timeline or "What changed"; no forced-colours check | P2 (evidence gap) | A manual VoiceOver/NVDA session |
| S6 | Phase 7 open items R1–R11 (horizon length, compression, aggregation cost, duplicate merge, …) | P2–P3 | Unchanged; see `docs/simulation/remaining-issues.md` |

**There are no open P0 or P1 defects in the three flagship experiences.**

## Honest readiness assessment
- **Ready for pilot users.** The three flagship screens are coherent, truthful at scale, keyboard-accessible, free of axe violations in every audited state, and connected by a tested journey. They answer the core questions:
  - what needs attention;
  - what changed;
  - who matters and how they connect;
  - what happened with this person.
- **Not proven:**
  - **Human usability:** every journey here is scripted, and no one outside the team has used these screens.
  - **Very large maps on slow hardware:** S1 and S2.
  - **AI quality:** the model engine is still unverified; the rules engine was used throughout.
- **Measurement caveat.** This phase's performance numbers came from a machine under outside load. They were made trustworthy by alternating Phase 7 and Phase 8 on identical data rather than comparing separate runs. Treat absolute values as a local baseline.

## Deliverables
| Document | Contents |
|---|---|
| `baseline-audit.md` | Stack, baseline measurements, findings |
| `design-principles.md` | The seven principles and shared patterns |
| `command-center-review.md`, `stakeholder-universe-review.md`, `stakeholder-profile-review.md` | Passes, before/after, files, tests |
| `motion-system.md` | The motion language and its rules |
| `cross-experience-journeys.md` | The 11-step journey and what it preserves |
| `performance-results.md` | Phase 7 vs Phase 8, alternating, with the regression investigation |
| `accessibility-results.md` | axe across 19 states, keyboard checks, gaps |
| `visual-qa.md` | Before/after sheet, refinement passes, regressions caught |
| `screenshots/before`, `screenshots/after` | 3 screens × 6 widths, plus 14 interaction states |
| `evidence/` | `graph/` (final), `graph-pass1/`, `graph-pre-final/`, `ab/` (alternated runs), `a11y.json`, `scale-D-phase8.json` |

**Scripts:**
- `app/scripts/sig-capture.mjs`;
- `app/scripts/sig-interact.mjs`;
- `app/audit/sig-a11y.mjs`;
- `app/scripts/sim-graph.sh` (an `OUT` override was added).
