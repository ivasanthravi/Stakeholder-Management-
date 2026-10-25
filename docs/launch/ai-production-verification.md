# AI Production Verification (Phase 5)

**Recommendation: launch with the built-in rules engine. Keep the Claude model engine OFF.**

| Path | Status |
|---|---|
| Rules engine (default; no data leaves the server) | **VERIFIED**: evaluation gate PASS, failure and isolation tests, E2E, staging rehearsal |
| Claude model engine | **BLOCKED**: no API key was supplied. Connectivity, latency, cost and accuracy are **unmeasured**. It is now **locked off in production by code** unless `AI_MODEL_APPROVED=true` |

**Nothing simulated is advertised as live.**
- The UI labels the engine on every AI surface. For example, "Built-in rules engine … No model key is configured, so there is no AI interpretation" on the workspace briefing (seen in E2E screenshots).
- The marketing AI pages were checked 2026-10-24. They say AI "runs on a built-in rules engine, or a large language model when enabled", that every output says which engine produced it, and that audio transcription isn't available. No simulated capability is presented as live.

## Checklist
| Requirement | Rules engine | Model engine | Evidence |
|---|---|---|---|
| Claude API connectivity | n/a | **BLOCKED** (no key) | — |
| Secure key storage | n/a | Env/secret store only; never logged (logger redacts `api_key`/`token` keys); not in the repo | `server/log.ts`, security.test.ts |
| Model configuration | n/a | Default `claude-opus-5-5`, override via `AI_MODEL`. SDK `maxRetries: 2`, `timeout: 90 s`, structured output via Zod, server-side fallback | `server/ai/engine.ts` (code review only) |
| Authorized context retrieval | ✓ | Same retrieval layer (runs under RLS as the requesting user) | isolation.test.ts (copilot and briefings in tenant B, 0 leaks), ai.test.ts (restricted records invisible) |
| Evidence citations | ✓ 100% valid (45 briefing items, 14 copilot citations) | Uncited or invalidly cited model sentences are dropped and counted | eval gate; ai.test.ts with a scripted model |
| Usage accounting | ✓ (zero-cost local usage recorded) | Token and cost accounting per call; content never stored | ai.test.ts "usage is metered without storing content" |
| Cost controls | n/a | Plan allowance with atomic reservation, admin spending cap, monthly budget stop, no overage | billing.test.ts (8 concurrent vs a 3-call allowance), ai.test.ts (budget stop) |
| Rate limits | ✓ per-user 20/min (429) | same | ai.test.ts |
| Timeouts / retries / error recovery | ✓ | Analysis returns 503 with nothing changed; briefings fall back to facts and rules with a notice; copilot error event; reservations released | ai-failures.test.ts (scripted error and timeout); **E2E with a 503 from the AI endpoint: page shows "Couldn’t prepare this briefing", the app keeps working** (recovery.spec.ts) |
| Prompt-injection defences | ✓ instruction-like lines flagged and excluded | Fenced data; verbatim-quote requirement; read-only tools; human approval | eval adversarial sets, ai.test.ts |
| Action approval workflow | ✓ every AI proposal needs a human accept; accept re-checks role and plan | same | ai.test.ts, E2E ai-flow, ai-failures.test.ts (tool inventory read-only) |

## Quality gates (rules engine, measured 2026-10-24; see `ai-evaluation-report.md`)
| Gate | Result |
|---|---|
| No cross-tenant retrieval | 0 leaks (copilot 10/10, briefings 5/5, isolation suite) |
| No unauthorized source access | Restricted records never cited, on any path |
| No unsupported material claims as facts | 100% citation validity; the rules engine states only recorded facts |
| No automatic consequential actions | None possible (no write tools; accept is human) |
| Ambiguous information | Shared first name is never resolved to a person; vague deadlines are left empty and flagged |
| Accurate citation links | 100% resolve to records the user can open |
| Graceful model failure | Verified with scripted failing engines and with an E2E 503 |

## Activation procedure for the model engine (later; each step needs approval)
1. **Data terms:** the business reviews Anthropic's commercial terms, retention and training settings, and records the decision in `docs/legal/ai-data-processing-disclosure.md`. Legal counsel signs off.
2. **Staging only:** set `ANTHROPIC_API_KEY` in the staging secret store (entered by a person). Staging permits the model without approval, on **synthetic data only**.
3. **Run the evaluation:** `ANTHROPIC_API_KEY=… npm run eval`, then `npx tsx evals/gate.ts`. Record:
   - precision and recall
   - quote validity
   - unsupported-claim drop rate
   - p50/p95 latency
   - cost per call
   - refusal rate
4. **Agree thresholds:** recall, latency and cost are product decisions. The safety gate is already enforced.
5. **Re-run live:** the injection and leak suites (`isolation.test.ts` scenarios via staging), and the E2E ai-flow against staging.
6. **Production:** set `AI_MODEL_APPROVED=true` and the production key. Start with one internal workspace (workspace AI settings), watch `meridian_ai_*` metrics and cost for a week, then widen.

**Deployment rule:** never set `ANTHROPIC_BASE_URL` in staging or production unless model traffic is meant to go somewhere else. The SDK reads it from the environment.
