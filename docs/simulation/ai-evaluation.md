# AI Evaluation on Simulated Data (Phase 7)

> **Engine evaluated: the local rules engine only.** No Anthropic key is configured, so **no result here is a language-model result**. Every number below is deterministic: same input, same output, zero tokens, zero cost. The model engine (`claude` provider) remains **unevaluated on simulated data**. Its Phase 3–5 status is unchanged (contract-tested with a mocked transport, never run live).

## 1. Meeting-note extraction: one meeting per industry
**Dataset:** `app/evals/datasets/simulation.json`.
- 10 cases, one per industry, written before the first run.
- Each case is built around a named difficulty:
  - clear decision with three commitments;
  - ambiguous decision plus conflicting dates;
  - open questions plus a missing owner;
  - duplicate action;
  - irrelevant conversation;
  - client commitment;
  - prompt injection;
  - passive voice without an owner;
  - two decisions including a rejection;
  - hedged and reported statements.
- `forbidden` lists text that must never become a proposal: hedges, small talk, the injected instruction and the ambiguous decision.

### Results
| Metric | First run (before fixes) | After fixes | AI gate rule (`evals/gate.ts`) |
|---|---|---|---|
| Decision precision / recall | — (0 proposed) / **0%** (0 of 6) | 100% / 100% (6 of 6) | Not gated: reported only |
| Obligation precision / recall | **77.3%** (17 TP, 5 FP) / 100% | 100% / 100% (18 TP, 0 FP) | Precision ≥ 90% |
| Owner accuracy | 100% | 100% | Not gated |
| Due-date accuracy | 94.1% | 94.4% | Not gated |
| Open-question count exact | 100% | 100% | Not gated |
| Forbidden text shown to the user | 0 cases | 0 cases | Must be 0 |
| Prompt injection followed | No | No | Covered by the forbidden-text rule |
| Raw quote validity (proposals quote the notes verbatim) | 100% | 100% | ≥ 90% |

**Why the first run failed:** the AI gate failed on obligation precision (77.3% < 90%). Decision recall of 0% is not gated, but it was the larger quality problem.
- *Decisions:* the rules engine only recognised "we agreed / decided to …" sentences. It missed labelled lines ("Decision: …") and decisions made by a body ("The faculty agreed …").
- *False obligations (5):*
  - the decision lines were mis-read as actions ("we agreed to launch …" became an obligation of "we");
  - the duplicate recap line produced a second copy of the same action.

**Fixes** (`app/server/ai/local/extract.ts`):
1. Labelled decisions (`Decision:`, `Agreed:`, `Resolved:` …) are decisions, never obligations.
2. Decisions made by a decision-making body (faculty, board, committee, council …) are recognised; the action rule is skipped for those sentences.
3. Identical commitments, actions and decisions within one note are proposed once.

**Regression:**
- The other four evaluation sets were re-run and are **unchanged** (dev 100/100, adversarial 100/100, held-out 50/66.7 recall as before, launch held-out 100/100).
- `extract.test.ts` and the AI gate pass.

### Honest disclosure
- **One gold correction.** "Someone needs to confirm the consultation venue" was first gold as nothing. It is an ownerless action, and the other sets treat that pattern as an obligation with `owner: null`. The gold was corrected to match those sets, and the dataset description records it. This turned one "false positive" into a true positive; it did not change the engine.
- **The simulation set is now tuned.** The fixes were made after seeing its failures, so its 100% is a **development score, not a held-out score**. The untouched held-out sets are the honest measure, and they did not move. The held-out set's 50% decision recall remains the known weakness of the rules engine.
- **Remaining miss: conflicting dates.** "by Friday … later … Monday 26 October is more realistic" should resolve to the later, explicit date. The engine keeps the first ("Friday" = 23 October). The proposal still shows the quoted text, so the reviewer sees both. Logged as P2 in `remaining-issues.md`.

## 2. Copilot on a Profile B workspace (energy & utilities, 250 people, about 2,000 activity records)
**Before** (probe against the generated workspace, first run):

| Question | Result | Problem |
|---|---|---|
| Which commitments are overdue? | "74 commitments are overdue; the 10 oldest …", with citations | ✓ Correct total (matches SQL) |
| Who owns the pending decisions? | "**10** decisions are still pending, 10 past the date …" | ✗ **Wrong count.** It reported the page size (10), not the true total |
| Which stakeholders are connected to this initiative? | Asked the user to name two people | ✗ Unsupported (it fell into the path-finding route) |
| What changed during the last month? | Generic "I can answer these …" help text | ✗ Unsupported |
| Which follow-ups remain unresolved? | "74 overdue commitments and **5** decisions past …" | ✗ Late-decision count used the page, not the total |

**Fixes** (`app/server/ai/copilot/tools.ts`, `run.ts`):
- `list_decisions` returns `total_matching` and `late_matching` (window counts). Answers say "N decisions are pending; the 10 most urgent".
- New read-only `recent_changes` tool covers stance changes, decisions decided, commitments completed and stakeholders added, each with a citation. It is routed for "what changed / last week / last month".
- "Connected to / involved in / members of" with an initiative or organisation in context lists its members.

**After** (asserted in `tests/simulation.test.ts`, Copilot block):

| Assertion | Result |
|---|---|
| Overdue total equals SQL | ✓ |
| Pending-decisions total equals SQL; text names "the 10 most urgent" when more exist | ✓ |
| Initiative members answer lists members with citations | ✓ |
| "What changed" lists real changes with citations | ✓ |
| Unresolved follow-ups uses the true late-decision count | ✓ |
| A contributor never sees restricted stakeholders in any answer | ✓ |

**Safety:**
- `recent_changes` is **read-only**. The tool allow-list test documents it, and the Copilot still has no write tools (`ai-failures.test.ts`).
- Consequential actions still need a person to accept a proposal; nothing in Phase 7 changed that.

**Grounded Copilot evaluation (sample workspace, unchanged):** 10 of 10 answered; 100% citation validity; 0 leaks; 100% expected-fact recall.

## 3. AI failure behaviour on simulated data
Unchanged from Phase 5 and re-run green:
- an unavailable AI engine gives a 503 with no half-saved proposals, and the allowance is released;
- briefings degrade to recorded facts;
- ambiguous first names are flagged, never auto-resolved.

## What is not evaluated
- The Claude model engine on any of this data: no key. **Do not read these numbers as model quality.**
- Human judgement of usefulness: no user research was done.
