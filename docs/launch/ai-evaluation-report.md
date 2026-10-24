# AI Evaluation Report (Phase 4)

**Engine evaluated: the built-in rules engine only.**
- The Claude model engine has **never run against the live API**: no credentials were available in any phase.
- **No model accuracy, latency or cost figure is claimed.**
- Model-path *safety* behaviour (dropping fabricated quotes and uncited claims, failure handling) is verified with scripted engines in automated tests.

**Run:** `AI_ENGINE=local npm run eval`, 2026-10-24 (`app/evals/results/local-2026-10-24.json`). The gate is `npx tsx evals/gate.ts`, and it **passes**.

## Datasets (all fictional)
| Set | Cases | Status |
|---|---|---|
| multi-industry | 10 | Development set: the rules were tuned on it in Phase 2 |
| adversarial | 8 | Development set |
| held-out (Phase 2) | 7 | Held out: written after tuning, run unchanged since |
| **launch held-out (Phase 4)** | 6 | **New. Written 2026-10-24 before any run, never tuned against.** Targets ambiguous notes, shared first names, owner attribution, vague or invented deadlines, reported speech, and injection inside quotes |

## Meeting extraction (what users would see: verbatim-quoted items only)
| Metric | Held-out (P2) | **Launch held-out** | Dev sets |
|---|---|---|---|
| Decisions precision / recall | 100% / 50% | **100% / 100%** | 100% / 100% |
| Obligations precision / recall | 100% / 66.7% | **100% / 100%** | 100% / 100% |
| Owner accuracy (raw text attribution) | 87.5% | **90.9%** | 100% |
| Due-date accuracy | 100% | **100%** (no invented dates: "Q1", "ASAP" and "end of the month" stay empty and flagged) | 100% |
| Verbatim quote validity (raw output) | 100% | 100% | 100% |
| Forbidden content shown (hedges, reported or past promises, injected instructions) | 0 cases | **0 cases** | 0 |
| Structured output validity | 100% | 100% | 100% |

**How to read this:**
- The rules engine is **high-precision**: everything it proposed across 4 sets was correct.
- **Recall varies with phrasing.** The Phase 2 held-out set (minutes in "ACTION:" style, owner-in-brackets bullets, "Agreed:" headers) found only 50–67%.
- **The single owner miss on the launch set was the deliberately ambiguous case.** In "Sam will circulate…" with two attendees named Sam, the raw extracted name is "Sam". The server then **refuses to resolve it to either person**: the proposal is left unassigned and flagged for review (verified in `ai-failures.test.ts`). Nobody is mis-assigned.
- **Small samples.** 31 cases in total; confidence intervals are wide.

## Grounded answers: copilot and briefings
Synthetic workspace with a restricted person and a canary record in another tenant.

| Metric | Result |
|---|---|
| Copilot answers | 10/10, including an injection request and a cross-workspace request |
| Inline citations that resolve to returned sources | 100% (14 citations) |
| Cited records the asking user can open | 100% |
| Answers leaking restricted or other-tenant data | **0/10** |
| Expected-fact recall | 100% (8 facts). This set has been a development set since Phase 2 |
| Briefing items with a citation / with valid citations | 97.8% / 100% (45 items, 5 briefings) |
| Briefings leaking data | 0/5 |

## Safety and failure behaviour (automated tests, all passing)
| Risk | Control | Test |
|---|---|---|
| Unsupported claims / incorrect citations | Model statements without valid citations are dropped and counted (`unsupportedDropped`) | ai.test.ts (scripted engine returns `r999` and uncited text; both dropped) |
| Fabricated quotes | `locateQuote`: items whose quote isn't verbatim in the source are dropped | ai.test.ts (fabricated quote dropped) |
| Prompt injection in notes | Instruction-like lines are flagged and excluded; content is fenced; the model has no write tools | ai.test.ts, eval adversarial sets, isolation.test.ts (copilot asked to dump restricted data) |
| Cross-tenant retrieval | All retrieval runs under RLS as the requesting user | isolation.test.ts (copilot and briefings in tenant B, asked by name and id about A's records: 0 leaks) |
| Unauthorized action proposals | Accepting a proposal re-checks role and plan; the copilot has read-only tools only | ai.test.ts, ai-failures.test.ts (tool inventory has no create/update/delete/send/assign) |
| Incorrect stakeholder identification | Ambiguous first names are never resolved | ai-failures.test.ts, extract.test.ts |
| Invented deadlines | Relative dates resolve only when unambiguous; others are flagged | extract.test.ts, launch set |
| Timeouts / provider errors | Analysis 503 with nothing changed; briefings fall back to facts and rules with a notice; copilot error event | ai-failures.test.ts (error and timeout) |
| Excessive model cost | Per-user rate limit; plan allowance with atomic reservation; reservations released on failure, cache hit or cancel; no overage | billing.test.ts (8 concurrent requests against a 3-request allowance), ai-failures.test.ts (reserved = 0 after failures) |
| Autonomous consequential actions | None possible: every record change from AI goes through a human accept | E2E ai-flow, ai.test.ts |

## Required before enabling a model for customers (P0 for the model path, not for a rules-engine launch)
1. Review the provider's data terms (Phase 2 requirement).
2. Run `ANTHROPIC_API_KEY=… npm run eval` on the synthetic sets **only**, and record precision/recall, quote validity, unsupported-claim rate, latency and cost.
3. Agree acceptance thresholds. The gate currently enforces only safety and grounding; recall targets are a product decision.
4. Re-run the injection and leak suites with the live model.
