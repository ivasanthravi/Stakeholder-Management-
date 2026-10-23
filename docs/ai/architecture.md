# AI Architecture (Phase 2)

The intelligence layer is part of the existing app: the same Hono API, Postgres schema, tenant gate, RLS, permissions and audit log. It has no separate service, agent framework or vector store. Code lives in `app/server/ai/` (engine, guards, services, copilot) and `app/server/modules/ai.ts` (routes). The client is `app/src/api/ai.ts`.

## Principles, as enforced in code

| Principle | Mechanism |
|---|---|
| Evidence first | Every AI output item carries evidence: a verbatim quote with offsets (meetings) or a citation ref into a per-request source registry (briefings, copilot). Items without valid evidence are dropped and counted (`dropped`, `unsupportedDropped`, `unsupported`). |
| Deterministic before probabilistic | Signals, metrics, gaps, paths and rule recommendations are computed in SQL/TypeScript. The model only adds *interpretation* and optional suggestions, which are labelled. |
| No writes without approval | The model can't call a write tool. Extraction produces `ai_proposal` rows. Records are created only when a user accepts a proposal, through the same domain functions (`createCommitment`, `createDecision`) and permission checks as the record APIs. |
| Retrieval goes through RLS | All retrieval runs in `withTenant` as `app_user`, so another tenant's rows and restricted stakeholders the user can't see never reach the engine. |
| Imported content is untrusted | Notes and evidence are fenced, instruction-like lines are flagged and excluded, and the system prompt says fenced text is data. Quotes must match the source verbatim. |
| Honest engine labelling | `engine.kind` (`claude` or `local`) and its label travel with every response, and the UI never implies a model when the rules engine answered. |

## Engines

`AIEngine` (`server/ai/engine.ts`) has two implementations with the same output contracts (`server/ai/contracts.ts`, Zod):

- **`claude`**: `@anthropic-ai/sdk`, `beta.messages.parse` with `betaZodOutputFormat` (schema-constrained output), a cached system prompt, server-side model fallback, `effort: medium`, a 90 s timeout and 2 retries. The copilot uses `beta.messages.stream` in a manual tool loop: strict tools, eager input streaming, at most 6 turns, refusal and `max_tokens` checks, and Zod validation of every tool input before it runs.
- **`local`**: deterministic rules (`server/ai/local/extract.ts`, `copilot/run.ts#runLocal`). It costs nothing and sends no data off the server. It gives no interpretation, only facts, metrics and rules.

`createEngine(env)` selects `claude` when `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` is set, otherwise `local`. `AI_ENGINE=local` forces local.

## Flows

### Meeting intelligence
1. `POST /ai/meetings/:id/analyze` checks the permission (`engagement.create`) and `assertAIAllowed` (enabled, rate, budget).
2. A short transaction loads the context (notes, participants, members, known people), all through RLS.
3. **Outside any transaction**, the engine extracts summary, topics, decisions, commitments, actions, open questions and people.
4. A transaction runs `analyseMeeting`:
   - Flag instruction-like lines.
   - Verify each quote verbatim (`locateQuote`). Drop the item if the quote fails or falls inside a flagged span.
   - Map owner names to members (ours) or stakeholders (theirs). Never guess when ambiguous.
   - Set review flags (`owner_missing`, `due_date_ambiguous`, `due_date_derived`, `vague_wording`, `inferred`, `possible_duplicate`, `stakeholder_unmatched`).
   - Detect duplicates against open records and within the batch.
   - Replace earlier *pending* proposals and insert the new ones.
5. Usage and audit (`ai.meeting_analyzed`, with counts only) are recorded.
6. The user reviews in `/engagements/:id/intelligence`: accept, edit, reject or merge. Accept locks the row and checks `version`, then re-checks the role's permission for the record type. A contributor accepting a decision as anything but *Proposed* gets 403. The values are validated against domain schemas, and the record is created with activity on the engagement and audit `ai.proposal_accepted`.

### Briefings (stakeholder brief/detailed/prep, decision, workspace)
Briefings run in two phases (`services/briefings.ts`):
1. **Gather** (in a transaction, via RLS). Build sections of facts and metrics, each with a `method`. Run gap checks and rule recommendations (`origin: 'rule'`). Register every source in `Refs` (`r1…`). The cache key is a hash of the evidence and the mode.
2. **Complete** (outside the transaction). Check the per-user cache (15 min, Claude only). Otherwise the engine synthesises interpretation and suggestions over the fenced evidence. `validateCites` keeps only items that cite refs from the registry, and drops and counts the rest. Model suggestions carry `origin: 'ai'`. If the model fails, the briefing still returns facts and rules, with `aiError`.

### Copilot
`POST /ai/copilot` returns server-sent events.
- **History:** the last 8 messages of the user's own conversation (RLS `owner_only`).
- **Tools:** read-only and permission-scoped:
  - `search_records`
  - `get_stakeholder`
  - `list_stakeholders`
  - `list_commitments`
  - `list_decisions`
  - `engagement_history`
  - `get_initiative`
  - `relationship_path`
- **Tool execution:** each tool validates its input with Zod and runs in `withTenant`. Results register refs with hrefs.
- **Citations:** the answer cites `[rN]`, and `sanitizeInlineCites` strips refs that weren't returned.
- **Storage:** conversations are stored only when `retentionDays > 0`, and expire after that many days.
- **Local engine:** `runLocal` routes known intents to the same tools.

### Signals (Command Center)
`computeDashboard` (`modules/insights.ts`) is deterministic, with thresholds from workspace AI settings.

Signal kinds:
- overdue
- due-soon
- decision-waiting
- cooling
- unowned
- stance-shift
- unassigned
- repeated-delay (the due date changed two or more times, from `activity_event.changes`)

Each signal carries `reason`, `rule`, evidence and a deterministic `next` step. Actions only navigate or open a form.

### Relationship paths
`relationshipPath` runs a breadth-first search over recorded person-to-person relationships visible through RLS, up to 4 hops. Inferred hops are labelled. It never claims influence.

## Data model (migrations `0002_ai_layer.sql`, `0003_ai_rls.sql`)
| Table | Purpose | RLS |
|---|---|---|
| `meeting_analysis` | One analysis per run: source hash (for staleness), engine, summary, topics, open questions, mentions, flags | tenant |
| `ai_proposal` | Reviewable change: kind, status, values, evidence, basis, needs-review flags, required permission, created record, decided by/at, version | tenant |
| `ai_conversation`, `ai_message` | Copilot history with `expires_at` | tenant + `owner_only` |
| `ai_cache` | Per-user briefing cache with `expires_at` | tenant + `owner_only` |
| `ai_usage` | Metering: feature, engine, model, tokens, cost µ$, latency, status. **No content.** | tenant; SELECT/INSERT only |

## Observability
- `ai_usage` holds a row for every engine call, including local and failed, cancelled or refused calls. `GET /ai/usage` aggregates it for admins (Settings › AI).
- Audit events: `ai.meeting_analyzed`, `ai.proposal_accepted`, `ai.proposal_rejected`, `ai.proposal_merged` and `ai.settings_updated`. They hold counts and ids, never note text.
- Request logs follow the Phase 1 logger, which logs no bodies, so neither prompts nor answers are logged.

## Limits
- Per user per minute: `perUserPerMinute`, default 20, applied to analyze, briefings and copilot.
- Monthly token budget: `monthlyTokenBudget`, default 5M. It applies only when a model would be called.
- Input cap: 60,000 characters per source.
- Global API limit: 600 requests per minute per user and workspace.
- Model calls: 90 s timeout.
- Client cancellation: the copilot aborts on disconnect, which is recorded as `cancelled`.
