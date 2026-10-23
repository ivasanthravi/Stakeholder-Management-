# Phase 2 Report: The Intelligence Engine

## Summary
Meridian now has an AI layer inside the existing app. It runs behind the same tenant gate, row-level security, permissions, audit and design system.

**What's in it:**
- A universal copilot
- Meeting intelligence with human review
- Stakeholder, decision and workspace briefings
- Deterministic signals with next steps
- Relationship paths
- Settings for limits, retention and thresholds
- An evaluation framework

**How it was verified:** every feature was built and checked on the **built-in rules engine**, because no model credentials were available. The Claude engine is implemented and typechecked, and its guard path is tested with a scripted double. It has **not** been run against the live API, and no model quality numbers are claimed.

## Milestones
| Milestone | Delivered | Evidence |
|---|---|---|
| M1 Foundation | `AIEngine` (claude/local), guards (fencing, injection flags, verbatim quotes, citation validation), usage metering with no content, rate limits, budgets, retention, migrations `0002`/`0003` with RLS | `tests/ai.test.ts` |
| M2 Meeting intelligence | Notes or transcript upload → extraction → proposals with evidence and review flags → accept, edit, reject or merge in a split view with source highlighting. Records are created only on acceptance, through domain functions, with activity and audit. | Tests, E2E `e2e/ai-flow.spec.ts`, visual QA |
| M3 Briefings | Stakeholder (brief, detailed, prep), decision and workspace briefings. Facts, metrics with method, cited interpretation (model only) and rule/AI-tagged recommendations. Copy, export `.md`, print. | Tests, eval, visual QA |
| M4 Copilot | Streaming SSE panel (⌘J, palette, contextual "Ask AI"): citation chips, cards, follow-ups, stop and retry, history with retention, delete | Tests, eval, E2E, visual QA |
| M5 Command Center & relationships | Thresholds are configurable. New signals: unassigned, repeated delay. Signal detail shows why it matters, the rule, evidence, a next step, actions and Ask AI. The Home briefing card. Map "Find path" over recorded relationships. | Visual QA |
| M6 Evaluation, QA, docs | `npm run eval` with development and held-out sets, an axe sweep of 60 views, E2E, and the docs in this folder | See below |

## Verification (all run on 2026-10-23)
| Check | Result |
|---|---|
| `npm run typecheck` (client and server) | Clean |
| `npm test` (Vitest) | **71 passed**: 20 AI security and behaviour tests, 7 extractor regressions, plus Phase 1 |
| `npm run test:e2e` (Playwright, Chrome) | **7 passed**: 6 Phase 1, 1 AI flow. The AI flow ran 3 times in a row, all passing. |
| Axe sweep plus console and overflow checks (`audit/phase1-qa.mjs`, desktop and mobile) | **60/60 views clean**, including 8 AI views. Screenshots are in `docs/ai/screenshots/`. |
| `npm run build` | OK. Initial JS ≈ 249 kB gzip, with the copilot included; Phase 1 was ≈ 255 kB. |
| `npm run eval` (local engine) | Held-out: precision 100%, decision recall 50%, obligation recall 66.7%. 0 forbidden items shown. Copilot and briefing citations 100% valid. 0 leaks. Details in `evaluation-results.md`. |

**Visual verification** was done in the built-in browser (Chrome) on the seeded dev workspace:
- Home briefing and signal detail
- Copilot (desktop and mobile)
- The meeting intelligence workspace, including analysis, the injection notice, accepting a proposal (C-523 created) and mobile layout
- The briefing prep view
- Settings › AI
- The map path finder

## Defects found and fixed during this phase
- **Found by the eval runs:**
  - A refusal ("I can't promise a date") was proposed as an obligation.
  - `I'll` and transcript speakers were missed.
  - Group subjects were missed.
  - "Agreed that the fund will be…" was misread as a promise.
  - Cancellations weren't treated as decisions.
  - Three copilot intent-routing gaps: "due soon", "haven't **we** engaged", and two-name path questions.
- **Found by visual QA:**
  - **First-name matching:** names were matched by first name across the whole workspace, so "Bea" listed five different stakeholders. Bare first names now match only meeting attendees.
  - **"Ask AI about this"** didn't send its question, because a queued send lived in a ref that never re-rendered.
  - **Palette empty state:** the copilot row hid "No matches", which the Phase 1 tenant-isolation E2E caught.
  - **Map path finder:** its picker lists were clipped.
  - **Settings › AI:** the usage table wasn't keyboard-scrollable (axe).
- **Found by review:** the client was guessing whether a recommendation came from a rule or the AI by matching its text. The server now tags `origin`.
- Each code fix has a test or E2E assertion where practical.

## Constraint compliance
| Constraint | How it's met |
|---|---|
| Probabilistic output never presented as fact | Items are typed. Interpretation is labelled "AI interpretation" and styled as tentative, and the rules engine produces none. |
| No personality or psychological profiles; no opaque trust or loyalty scores | `SYSTEM_RULES` forbids them. The only scores shown are user-recorded influence and stance. Metrics show their method. |
| Consequential actions need approval; no automatic email, commitment changes or task creation | The model has no write tools. Every write is a proposal a person accepts, and signal and briefing actions only navigate or open forms. |
| Imported content untrusted; retrieval can't override instructions or policy | Fencing, injection flags, verbatim quotes, RLS-only retrieval and permission re-checks on accept |
| No secrets in logs; no unrelated tenant data sent to the model | Usage and audit hold counts only. Retrieval is RLS-scoped to the requesting user, and the canary leak tests pass. |
| AI actions can't bypass permissions | `acceptProposal` re-checks `can()` and the decision-status rule. Tests cover viewer and contributor denial and stale or double accept. |
| Review provider terms before real data | Stated in `.env.example`, the README and `security-and-privacy.md`. Not yet done: no key is configured. |
| No invented results or URLs | No model scores are reported, and no deployment URL exists. |

## Not done / next
1. Run `npm run eval` with an API key, on synthetic data only, after the data-terms review. Record the results in `evaluation-results.md`, then choose per-feature models.
2. Route deterministic copilot intents to the rules engine even when a key is set, to cut cost.
3. Improve rules-engine recall on the held-out misses, then write a *new* held-out set before measuring again.
4. Merge proposals into existing records. Add PDF/DOCX/email import.
5. Production items carried over from Phase 1 (mail transport, real Postgres, deployment, security review), plus a shared rate-limit store.

## Documents
- `phase-2-audit.md`
- `architecture.md`
- `model-strategy.md`
- `security-and-privacy.md`
- `evaluation-results.md`
- `cost-model.md`
- `known-limitations.md`
- Updated:
  - `docs/architecture/api.md`
  - `docs/design/design-system.md` §7.12
  - `docs/implementation/known-limitations.md`
  - `app/README.md`
  - `app/.env.example`
