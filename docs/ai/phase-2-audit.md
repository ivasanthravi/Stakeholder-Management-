# Phase 2 Entry Audit (AI Intelligence Engine)

Date: 2026-10-23 · Baseline commits: `9764ba9` (Phase 1), `7d3be4d` (dev server fix)

## 1. Verified starting state

| Check | Result |
|---|---|
| App starts | ✅ `npm run dev`: app on :5173, API on :8787 (`/api/health` ok); verified in the browser pane |
| Tests | ✅ 44/44 Vitest (18 tenant isolation), 6/6 Playwright E2E, 44/44 axe-clean views (Phase 1 run) |
| Schema | 22 tables, `server/db/schema.ts`; RLS migration `0001_rls.sql`; every tenant table carries `workspace_id` and same-tenant FKs |
| Auth & tenancy | Better Auth sessions; membership re-checked per request; `withTenant()` runs every tenant query as `app_user` under RLS; restricted stakeholders hidden by policy |
| Service boundaries | Hono modules per domain (`server/modules/*`); shared Zod schemas and permission matrix in `shared/`; read models in `insights.ts` |
| Design system | Tokens (`src/styles/tokens.css`), motion tokens (`src/lib/motion.ts`), components (`src/components/*`), docs in `docs/design/*`. Violet (`--ai`, `--ai-subtle`) is reserved for AI surfaces |
| Existing "intelligence" | Rule-based dashboard signals (`/dashboard`) and a rule-assembled cited briefing (`server/modules/briefing.ts`). No language model anywhere |
| Simulated / incomplete | AI extraction ("Preview — not available"), palette "Ask · not available", workspace vocabulary stored but not applied, no email transport, no API rate limiting |

## 2. Model access

- No `ANTHROPIC_API_KEY`, no `ANTHROPIC_AUTH_TOKEN`, no `ant` CLI profile on this machine (checked 2026-10-23).
- **Consequence:** the Claude integration is implemented with the official SDK (`@anthropic-ai/sdk` 1.2.0) but **has not been called from this environment**.
- **What runs without a key:** the product uses a deterministic **local engine** for every AI surface. The UI labels it "Local analysis (no AI model)".
- **What the evaluation harness measures:** it runs against the local engine and runs against Claude automatically when a key is present. No model-quality numbers are reported for Claude until that run happens.

## 3. Phase 1 issues to close before AI touches customer data

| Issue (from Phase 1 known limitations) | Phase 2 action |
|---|---|
| No API rate limiting beyond auth | Add a per-user and per-workspace limiter on all API routes and a stricter limiter and quota on AI routes |
| No security headers / CSP | Add `secureHeaders` (CSP, frame-ancestors, nosniff, referrer policy) |
| Restricted-record leaks (fixed in Phase 1) | AI retrieval goes only through `withTenant()`, so RLS applies to every tool. Tests cover restricted records in AI context |
| Partial-update data loss (fixed) | AI proposals execute through the same `patchBody` / versioned domain paths |
| No email transport | Out of scope; AI never sends messages |

## 4. Decisions (detailed in [architecture.md](architecture.md) and [model-strategy.md](model-strategy.md))

1. **No agent framework.** The orchestrator is a small manual tool loop on the Messages API; tools are read-only queries.
2. **Retrieval: SQL tools, not embeddings.** The data is structured and every claim must cite a record, so permission-scoped SQL is more precise than vector search. pgvector is deferred until there is unstructured volume (long transcripts and documents across many meetings) that needs semantic recall.
3. **Writes are only proposals.** The model cannot write. Extraction and recommendations produce `ai_proposal` rows; a person approves each one, and execution re-checks permissions and record versions.
4. **Evidence first.** Every generated claim carries citations to records the tools actually returned in that request. Citations to anything else are stripped and counted as unsupported.
5. **Content is untrusted.** Meeting notes, transcripts and uploads are passed as delimited data, never as instructions. Instruction-like lines are flagged, and the output schema can't express actions beyond proposals.
6. **Cost control.** Deterministic SQL for counts and filters. Model calls only for synthesis and extraction. Per-workspace monthly budgets, per-user rate limits, and usage accounting on every call.
