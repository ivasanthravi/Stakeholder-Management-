# Model Strategy

## Current state
No model credentials were available while this was built. Every AI feature was implemented, tested and evaluated on the **local rules engine**. The Claude engine compiles against `@anthropic-ai/sdk` 1.2.0, and its control flow is covered by a scripted test double. **It has not been run against the live API.** Treat its quality as unmeasured until `npm run eval` is run with a key (see `evaluation-results.md`).

## Choices
| Feature | Default | Why |
|---|---|---|
| Meeting extraction | `claude-opus-5-5`, effort `medium`, Zod-constrained output | Hardest task: attribution, deadlines, hedge detection. Structured output removes parse failures. Quality matters more than cost here, because a wrong proposal costs a reviewer's time. |
| Briefing interpretation | same model, effort `medium` | Short output over fenced evidence. The result is cached for 15 minutes per user and evidence hash, so repeat views cost nothing. |
| Copilot | same model, effort `low`, streaming, max 6 tool turns | Latency matters. The tools do the retrieval and the model writes the cited answer. |

`AI_MODEL` overrides the model for all features. Candidates to evaluate once a key exists:
- `claude-sonnet-5-5` for the copilot (half the price per token).
- `claude-haiku-5-5` for briefing interpretation. It's a much cheaper tier, but it needs its own eval run before it's adopted.

Don't switch models without re-running `npm run eval` and comparing:
- held-out recall
- quote validity
- forbidden-content violations
- citation validity

## Fallback behaviour
- **Server-side fallback** (`fallbacks: 'default'`, beta `server-side-fallback-2026-07-01`) lets the API route to a fallback model when the primary is overloaded. The `model` actually used is recorded in `ai_usage`.
- **Model failure:**
  - Analyze returns 503 and changes nothing.
  - Briefings return facts and rules with `aiError`.
  - The copilot emits an `error` event.
  - Each of these is recorded in usage with `status: 'error'`.
- **Refusals** (`stop_reason: 'refusal'`) return empty output, recorded as `status: 'refused'`.
- **Turning AI off** (`enabled: false`) blocks all AI endpoints. Deterministic signals on Home are unaffected.

## Why not embeddings or RAG
Questions in this domain are structured: "who's overdue", "what's pending", "prepare me for X". SQL tools over RLS-scoped tables answer them exactly, with record-level citations and no separate index to keep in sync or secure. Semantic search over engagement notes is a candidate for a later phase. If it's added, the index must be tenant-partitioned and filtered by RLS-visible ids at query time.
