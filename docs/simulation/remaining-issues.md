# Remaining Issues After Phase 7

**Severity scale:**
- **P0:** data loss, security or cross-tenant exposure, wrong totals shown as fact.
- **P1:** a core workflow fails or misleads at realistic volume.
- **P2:** degraded but usable; a clear workaround exists.
- **P3:** polish or a gap with no current user impact.

**There are no open P0 or P1 issues.** Every P0/P1 found by the simulation was reproduced, fixed, re-run and covered by a regression test (see "Fixed in Phase 7" below).

## Open
| # | Issue | Severity | Evidence | Proposed fix |
|---|---|---|---|---|
| R1 | **The Command Center horizon lists about 820 items at Profile D.** It is bounded to ±30 days, but it is still long and the payload is about 600 KB | P2 | `evidence/scale-D.json` (dashboard bytes) | Paginate the horizon per week, or cap per day with "+N more" |
| R2 | **Relationship-map JSON is uncompressed** (about 1.9 MB at Profile D). No `Content-Encoding` in the API | P2 | Graph evidence (`graph-stress-results.md`) | Enable gzip/br at the reverse proxy (deployment) or in Hono `compress()` |
| R3 | **Per-person engagement aggregation is about 90 ms at Profile D** (Directory "last engaged" and Command Center cooling) | P2 | In-process profile, Profile D | Maintain `last_engaged_at` on the stakeholder (trigger or write path) |
| R4 | **The map at its 2,000-person cap is not smooth on a slow CPU.** At D · whole workspace with 4× CPU slow-down: pan 15 fps, selection 1.3 s, a 5.8 s main-thread block during layout. The default scope (963 people) stays at 49 fps | P2 | `graph-stress-results.md` | Restrict neighbourhood styling to the visible viewport; batch class changes |
| R4b | **The map overview names nobody on standard-density screens above about 150 people.** At fit zoom (0.37 for 192 people), the influence-scaled labels fall under Cytoscape's minimum rendered size at device pixel ratio 1. On 2× displays the texture rule rounds up to full size, so key people should stay labelled (inferred from the rule in `graphStyle.ts`, not measured) | P2 | `evidence/graph/shot-sim-C-default.png` (DPR 1) vs `shot-sim-B-default.png` | Always label the top ~12 people by influence at fit, sized for the screen, not the model |
| R5 | **Conflicting dates in meeting notes.** The rules engine keeps the first date ("Friday") when a later sentence gives a more realistic explicit one | P2 | `ai-evaluation.md` (construction case) | Prefer the latest explicit date for the same action; flag "conflicting dates" for review |
| R6 | **Duplicate stakeholders are only hinted.** The new-stakeholder form now warns about an exact name match, but there is no merge and no fuzzy matching ("Bea Elwood") | P2 | `simulation.test.ts` duplicate test; finding F-DUP | Merge tool (move engagements, relationships, commitments; keep history); fuzzy matching on name + organisation |
| R7 | **No bulk reassignment for a departed owner's commitments.** They are now flagged as needing an owner, but each one is reassigned individually | P2 | `sponsor_left` complication | "Reassign all from …" action on the member removal dialog and on the signal |
| R8 | **Commitment → decision link is missing (gap G1).** "This overdue commitment blocks that decision" can only be written in text | P3 | `phase-7-audit.md` | Additive nullable `commitment.decision_id` (proposal in the audit) |
| R9 | **Dormant relationship end dates (gap G2).** `relationship.valid_from/valid_to` exist but nothing reads or writes them | P3 | `phase-7-audit.md` | Expose them, or drop them in a contract migration |
| R10 | **No dedicated templates for energy & utilities or retail.** They use the generic template | P3 | `industry-scenarios.md` | Two data-only templates |
| R11 | **The rules engine's held-out decision recall is 50%** (unchanged by Phase 7) | P2 | `ai-evaluation.md` | The model engine, when a key is approved; until then, the review step catches misses |

## Not verified (blocked, not failing)
| Item | Why | What would verify it |
|---|---|---|
| Real billing provider (Stripe or Paddle sandbox) | No sandbox credentials | `docs/launch/billing-verification.md` checklist with sandbox keys |
| Claude model engine on simulated data | No API key | Run `evals/run.ts --engine claude` once approved; compare with the rules engine |
| Production-like capacity | One machine runs API, database and load generator | Load test on the target hosting with a separate load generator |
| Human usability | Persona runs are scripted automation | Moderated sessions with 5 or more real users per persona |

## Fixed in Phase 7 (for reference)
| Finding | Severity before | Regression test |
|---|---|---|
| Command Center showed **0 overdue** at Profile D (1,987 in the database): a global top-200 cut was crowded out by other kinds | P1 | `simulation.test.ts`: "Command Center stays true when one kind dominates"; `dashboard.test.ts` |
| Summary and tab counts were page lengths, not totals | P1 | Same |
| Workspace briefing said "60 commitments are overdue" under a headline of 1,987 (it counted the capped list) | P1 | `simulation.test.ts` (verified to fail on the old code) |
| "Due this week" read **0** with 2,835 open commitments (narrowed from the first 200 in the browser) | P1 | `simulation.test.ts`: `dueWithinDays` total equals SQL |
| Commitments owned by people who **left the workspace** were not flagged | P1 | `simulation.test.ts`: departed-owner signals |
| Copilot reported "10 decisions pending" (page size) instead of the total | P1 | `simulation.test.ts`: Copilot block |
| Copilot could not answer "who is connected to this initiative" or "what changed last month" | P2 | Same |
| Meeting extraction missed labelled and body decisions, and duplicated recap actions | P1 (AI gate failed) | `evals/datasets/simulation.json` + AI gate; `extract.test.ts` |
| Long engagement histories silently showed 200 of 310 | P2 | Profile shows "Showing the latest 200 of N"; `engagementTotal` from the API |
| Relationship map read "1 people" and gave no notice of the 2,000 cap in the count line | P3 | E2E map count assertion |
| Directory sort at Profile D: 156 ms → 11 ms (two-phase query) | P2 | Scale evidence; sorting tests unchanged |
| Relationship map took 117 s from the server at Profile D on PGlite (no planner statistics after a bulk load); now 0.21 s | P1 (tooling) | Loader runs `ANALYZE`; `graph-stress-results.md` before/after |
| Ordered graph query regression (381 → 1,191 ms) introduced during Phase 7 and fixed before release (525 ms) | P2 | Scale evidence |
| Billing provider outage gave a generic 500 | P2 | `failure.test.ts` |
| No duplicate warning when creating a stakeholder with an existing name | P2 (partially fixed, see R6) | E2E `core-flow.spec.ts` |
