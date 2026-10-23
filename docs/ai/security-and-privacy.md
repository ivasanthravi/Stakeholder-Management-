# AI Security and Privacy

## Before processing real customer data
**Review the model provider's data handling, retention and training terms, and your customers' contracts, before setting `ANTHROPIC_API_KEY` in any environment that holds real data.** With no key, nothing leaves the server, because the local engine runs in-process. Record the decision, the agreement (for example zero-data-retention, where available) and the region in your deployment notes.

## Threats and controls
| Threat | Control | Verified by |
|---|---|---|
| Prompt injection in notes, transcripts or record text | Untrusted text is fenced (`fence`). `SYSTEM_RULES` says fenced text is data. Instruction-like lines are detected (`findInstructionLikeText`), shown to the reviewer, and nothing is extracted from them. Quotes must be verbatim. The model has no write tools, and every write is a human-accepted proposal. | `tests/ai.test.ts` (direct injection, injection-derived model output dropped); eval adversarial and held-out quoted-injection cases |
| Fabricated facts or quotes | `locateQuote` verifies every quote against the source, or the item is dropped. Briefing and copilot statements must cite refs from the per-request registry, or they are dropped and counted. | Scripted-engine tests (fabricated quote, `r999`, uncited claim); eval `rawQuoteValidity`, `citationValidity` |
| Cross-tenant leakage | Retrieval and tools run in `withTenant`, under RLS. Cache and conversations are keyed and RLS-scoped per user. Workspace id comes from the verified membership, never from the model. | Tests (outsider 404s, copilot in another workspace); eval canary record (`answersWithLeak = 0`) |
| Restricted stakeholders | RLS hides them from users without access, and the engine only ever sees what the user can see. | Tests and eval (`Sabine` canary absent from briefings, copilot and paths) |
| AI actions bypassing permissions | Accept re-checks `can(role, …)` for the record type. The status rule (a contributor can't record a decision as decided) is enforced server-side. Values are re-validated by domain schemas. Optimistic version checks prevent stale accepts. | Tests (viewer 403, contributor decision 403, stale 409, double-accept 409) |
| Stale data | Analyses store a source hash, and changed notes mark them stale. Proposals carry versions. Briefing cache keys include an evidence hash. | Tests |
| Cost abuse or denial of wallet | Per-user per-minute limit, monthly token budget, 60k-character input cap, 6-turn copilot cap, 90 s timeout, briefing cache. | Tests (429 `rate_limited`, `quota_exceeded`) |
| Secrets in logs | The key is read from env only and never logged. Usage rows and audit metadata hold counts and ids, never prompts or answers. `.env` is git-ignored. | Test asserts `ai_usage` has no content columns |
| Retention | Copilot conversations expire after `retentionDays` (default 30, 0 = never stored) and are purged on each copilot call. Users can delete their own conversations, or all of them. Analyses and proposals are business records and live with the engagement (cascade on delete). | Test (retention 0 → no conversation) |

## Not claimed
- Injection detection is heuristic. A crafted instruction that avoids the patterns won't be *flagged*. The structural controls still hold whether or not a line is flagged: verbatim quotes, no write tools, human approval, and RLS-scoped retrieval.
- No automated red-team suite runs against the live model yet, because no key was available. Run `npm run eval` with a key: the adversarial and held-out sets include injection cases.
- Provider-side retention can't be verified from inside the app.
