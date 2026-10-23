# Evaluation Results

**Run:** `AI_ENGINE=local npm run eval`, 2026-10-23, engine **Local analysis (no AI model)**. Raw output: `app/evals/results/local-2026-10-23.json`.
**Claude engine: not evaluated.** No model credentials were available. No model scores are reported here, and none should be quoted until `npm run eval` has run with `ANTHROPIC_API_KEY` set.

## Datasets (`app/evals/datasets/`, all fictional)
| Set | Cases | Content | Status |
|---|---|---|---|
| `meetings.json` | 10 | Infrastructure, healthcare, energy, local government, financial services, higher education, technology, non-profit, life sciences, and a speaker transcript | **Development set.** The local rules were changed after a first run on it. |
| `adversarial.json` | 8 | Direct and disguised injection, hedges, negations, ambiguous dates, unknown owners, cancellations, fabricated-quote bait | **Development set** (same caveat) |
| `heldout.json` | 7 | Email, ACTION-style minutes, bullets, transcript, quoted injection, conditional promises, negation and past tense | **Held out.** Written after tuning, run once, not tuned against. |

**Scoring:**
- **Matching:** a gold item counts as found when an extracted item's text plus quote contains all of its keywords. Each gold item matches at most once.
- **Obligations** = commitments + actions.
- **Precision and recall** are measured on what a user would see: the output after the server's guard, which requires verbatim quotes and skips flagged spans.
- **Forbidden strings** must not become a proposed decision or obligation.

## Meeting extraction: local engine
| Metric | Dev: multi-industry | Dev: adversarial | **Held-out** |
|---|---|---|---|
| Decisions precision / recall | 100% / 100% (11 items) | 100% / 100% (1) | **100% / 50%** (2 of 4) |
| Obligations precision / recall | 100% / 100% (23) | 100% / 100% (11) | **100% / 66.7%** (8 of 12) |
| Owner accuracy (on matched) | 100% | 100% | **87.5%** |
| Due-date accuracy (on matched) | 100% | 100% | **100%** |
| Open-question count exact | 90% | 100% | **85.7%** |
| Verbatim quote validity (raw output) | 100% | 100% | **100%** |
| Cases with forbidden content shown to the user | 0 | 0 | **0** |
| Structured-output validity | 100% | 100% | **100%** |
| Latency p50 / p95 | 0 / 4 ms | 0 / 0 ms | 0 / 0 ms |
| Cost | $0 | $0 | $0 |

**How to read this.** The development-set 100% scores show the rules handle the cases they were fixed for. They are *not* an estimate of real-world quality. The held-out column is the honest number for the local engine: **conservative and high-precision, with moderate recall.**

Held-out misses:
- `ACTION: Name to …` lines, because the prefix defeats the pattern.
- "(owner: X)" bullets.
- "Agreed: …" decisions.
- An unassigned "would like a paper" ask.
- "will not be extending" as a decision.

The first run on the development sets also found real defects, all fixed and recorded:
- A refusal ("I can't promise a date yet") was proposed as an obligation.
- `I'll` contractions and transcript speakers were missed.
- Group subjects ("the landowners will…") were missed.
- A cancellation wasn't recognised as a decision.

## Grounded answers: copilot and briefings (local engine, in-process app, synthetic workspace)
The workspace includes a restricted stakeholder and a second tenant holding a canary record.

| Metric | Result |
|---|---|
| Copilot questions answered | 10 / 10 (including an injection request and a cross-workspace request) |
| Inline citations valid (ref exists in returned refs) | 100% (14 citations) |
| Cited records resolvable by the asking user (`GET` = 200) | 100% |
| Answers leaking restricted or other-tenant data | 0 / 10 |
| Expected-fact recall | 100% (8 expected facts). On the first run it was 62.5%: three intent-routing defects were found and fixed (see below), so this set also became a development set. |
| Copilot latency p50 / p95 (in-process, local) | 11 / 20 ms |
| Briefing items with ≥ 1 citation | 97.8% (45 items, 5 briefings) |
| Briefing citations valid | 100% |
| Briefings leaking restricted or other-tenant data | 0 / 5 |

Copilot defects found by the first run:
- "What is due soon?" required the word "commit".
- "Who haven't **we** engaged…" didn't match the intent pattern.
- Path questions needed a profile open for context.

## Running it
```bash
AI_ENGINE=local npm run eval     # rules engine
ANTHROPIC_API_KEY=… npm run eval # Claude engine: spends tokens; review data terms first (synthetic data only)
```
For model runs, also compare latency p50/p95, tokens and `costUSD`, which the runner records from real usage.
