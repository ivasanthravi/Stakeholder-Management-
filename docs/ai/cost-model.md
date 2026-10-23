# Cost Model

**Measured:** the local engine costs $0. The eval run recorded 0 tokens and $0.00.

**Not measured:** any model cost. No key was available. The figures below are **estimates from stated assumptions**, to be replaced with `ai_usage` data (Settings › AI) or `npm run eval` output once a key is configured.

## Prices used (USD per million tokens, `server/ai/usage.ts`)
| Model | Input | Output | Cache read |
|---|---|---|---|
| claude-opus-5-5 | 4 | 20 | 0.20 |
| claude-sonnet-5-5 | 2 | 10 | 0.20 |
| claude-haiku-5-5 | 0.10 | 0.50 | 0.01 |

Check these against the provider's current price list before budgeting. `costMicros` stores tokens × $/MTok as micro-dollars per call.

## Per-call estimates (Opus 5.5)
| Feature | Assumed input / output tokens | Estimated cost |
|---|---|---|
| Meeting extraction (≈ 2,000-word notes) | 5,000 / 1,500 | ≈ $0.05 |
| Briefing interpretation (≈ 30 evidence items) | 3,000 / 600 | ≈ $0.024, and $0 on a cache hit within 15 min |
| Copilot answer (≈ 3 tool turns) | 12,000 / 800 cumulative | ≈ $0.064 |

The system prompt is cached (`cache_control: ephemeral`), so repeat calls bill it at the cache-read rate.

## Example workspace month (assumptions, not data)
25 users; 120 analysed meetings; 600 briefings at a 40% cache hit rate; 1,500 copilot questions.

| Feature | Calculation | Cost |
|---|---|---|
| Extraction | 120 × $0.05 | ≈ $6 |
| Briefings | 360 model calls × $0.024 | ≈ $9 |
| Copilot | 1,500 × $0.064 | ≈ $96 |

Total ≈ $111 per month, around 33M tokens. That is more than the default 5M-token budget. Admins should raise the budget deliberately, or move the copilot to Sonnet (about half the cost) after an eval comparison.

## Levers, in order
1. Keep the local engine for deterministic questions. The copilot could route known intents to `runLocal` even when a key is set. This isn't done yet: see known limitations.
2. Use the briefing cache. Raise the TTL if staleness is acceptable.
3. Choose the model per feature after evals (`AI_MODEL` is global today).
4. Lower `effort` for extraction if held-out recall holds.
5. Set the monthly budget and per-user rate in Settings › AI.
