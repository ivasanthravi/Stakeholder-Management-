# Implementation Decisions (Phase 1)

Each decision lists the context, the choice, and its consequences. Decisions that need product-owner sign-off before production are marked **Review**.

## ADR-001 · Evolve the Vite SPA; add a TypeScript API in the same package
- **Context.** Phase 0 is a Vite + React 19 SPA whose UI is the quality baseline. The brief lists Next.js as a candidate.
- **Decision.** Keep the SPA and add a Hono API server (`app/server/`). Shared code lives in `app/shared/` (Zod schemas, permission matrix) and is imported by both sides.
- **Why.** The product is entirely behind authentication (no SEO or SSR need). A Next.js migration would rewrite routing, data loading and route transitions for no user-visible gain, and would risk the approved interactions.
- **Consequences.** In production one Node process serves `/api/*` and the built client from the same origin. That means first-party cookies, no CORS, and one deployable unit.

## ADR-002 · Hono + Drizzle ORM + PostgreSQL
- Hono is small and typed, built on web standards (testable in-process via `app.request()`), and its Node adapter is mature.
- Drizzle gives typed SQL with explicit migrations. It was chosen over Prisma because row-level security needs raw `set_config`/`set local role` inside transactions, which Drizzle handles cleanly.
- Migrations are generated SQL files in `server/db/migrations/`. `0001_rls.sql` is hand-written.

## ADR-003 · PGlite for development and tests; Postgres in production
- **Context.** This machine has no Postgres, Docker or Homebrew.
- **Decision.** When `DATABASE_URL` is unset, the server uses PGlite (real Postgres 17 compiled to WASM, persisted under `.data/pglite`). Tests use an in-memory PGlite per test file.
- **Consequence.** Tests run the real migrations, RLS policies, constraints and SQL. PGlite is single-connection, so it is **refused in production** (`loadEnv` throws). Production must set `DATABASE_URL`.
- **Review.** Performance under concurrent load has not been measured on real Postgres.

## ADR-004 · Better Auth for identity
- Email and password with mandatory email verification, password reset, and 7-day sessions refreshed daily (`httpOnly` cookies, `Secure` in production).
- Sessions are revoked on password reset, and rate limiting is enabled in production.
- No custom cryptography: hashing, tokens and session handling are Better Auth's.
- Organization-level tenancy is ours, not Better Auth's organization plugin (see ADR-005), so the permission model stays in one place.
- **Review.** There is no real email transport yet. Mail is written to `mail_outbox` and shown at `/dev/mail` in development. SSO/OIDC is not configured.

## ADR-005 · Tenancy: workspace-scoped rows, verified membership, and Postgres RLS
Defense in depth, three layers:
1. **Route gate.** Every tenant endpoint is `/api/w/:workspaceId/...`. `tenantMiddleware` looks up an active membership for the session user on every request. Non-members get **404** (not 403), so workspace ids can't be probed. Removed members lose access on their next request.
2. **Row-level security.** Each tenant request runs inside `withTenant()`, which opens a transaction, sets `app.workspace_id`, `app.user_id` and `app.role` (transaction-local), then `SET LOCAL ROLE app_user`. Every tenant table has a policy `workspace_id = app_workspace_id()`. A query that forgets a filter still can't read or write another tenant's rows (covered by a test).
3. **Same-tenant foreign keys.** Postgres FK checks bypass RLS, so a plain FK would let a caller link their record to another tenant's row by id. All cross-record references are composite `(workspace_id, x_id) → (workspace_id, id)`, which makes cross-tenant references impossible at the schema level (covered by a test).

The app connects as the database owner. Only tenant work drops to `app_user`. Identity, membership, invitation and audit reads use the owner connection with explicit `workspace_id` filters.

## ADR-006 · Roles and permissions
- Roles: Owner > Administrator > Manager > Contributor > Viewer. The single matrix in `shared/permissions.ts` drives server checks (`need(c, action)`) and client control visibility (`useSession().can`).
- Role changes can't grant above your own role. Only owners manage owners, and the last owner can't be demoted, removed or leave.
- **Record-level restriction.** `stakeholder.restricted` plus a `stakeholder_access` list, enforced in the RLS policy itself. Restricted stakeholders vanish from lists, search, the graph, the dashboard and profiles for anyone not owner/admin or on the list. This is the extension point for future record-level permissions.

## ADR-007 · Activity vs audit
- `activity_event`: the user-facing timeline (who changed what, with field diffs). Readable within the tenant and append-only for the app role.
- `audit_event`: the security trail (sign-in, sign-up, membership, invitations, role changes, restriction changes, settings). `UPDATE`/`DELETE` are revoked from the app role, and it is readable only by admins via `/audit`.
- Diffs omit `notes`, `customFields`, tokens and passwords.

## ADR-008 · Concurrency, idempotency and integrity
- **Optimistic concurrency.** Every mutable record has `version`. A PATCH must send the version it edited, and a mismatch returns `409 stale_version` with the current row. The UI keeps the user's input and explains.
- **Idempotency.** A POST with an `Idempotency-Key` header returns the original response on retry. A concurrent duplicate gets 409. The client sends a fresh key per create intent, so a resubmit after a dropped connection can't double-create.
- **Validation.** All mutations are validated server-side with the shared Zod schemas; the same schemas drive inline form validation.
- **Constraints.** Unique (case-insensitive) org names and initiative codes, unique active relationships per endpoint pair and type, range checks, and one current association per person and org. Constraint errors map to readable 409/422 messages.
- **Soft deletion.** Records are archived (`archived_at`), never hard-deleted through the API. Organization associations end (`valid_to`) rather than being deleted, which preserves history.

## ADR-009 · Relationships
- Endpoints are explicit nullable FKs (`source_stakeholder_id` | `source_organization_id`, same for the target), with check constraints ensuring exactly one of each. No polymorphic ids.
- Symmetric types (colleague, allied, opposes, partner) are stored once and the mirror is rejected. Allied vs opposes between the same pair is rejected as contradictory.
- `status = 'inferred'` is always rendered as "Inferred", never as fact.
- The map draws person-to-person edges. Organization endpoints appear in profiles and organization pages.

## ADR-010 · Client data layer
- TanStack Query. Every tenant query key starts with `['w', workspaceId]`, so switching workspaces can never render stale foreign data (the cache for the old workspace is dropped).
- Retries cover network and 5xx failures only.
- Optimistic updates are used only where reversal is safe (stance, commitment completion), with rollback and an explanatory toast on failure. Undo issues a compensating write with the new version.
- The Phase 0 in-memory store (`src/data/*`) was removed. Its deterministic generator now lives in `server/db/sample/` and seeds the development database only.

## ADR-011 · AI features stay honest
- The profile briefing is still assembled by rules (`server/modules/briefing.ts`), with the same citation contract, and is labelled "no language model is used".
- The Phase 0 meeting-suggestion fixtures were removed. Engagement notes support manual "selection → commitment/decision" capture, and AI extraction is labelled "Preview — not available".

## ADR-012 · Deferred
Not built in Phase 1, by decision rather than oversight:
- SSO/SAML and SCIM.
- An email transport.
- Background jobs.
- Full-text search: Postgres `ILIKE` is adequate at this scale, `pg_trgm` is next.
- A graph layout worker.
- Custom field definitions UI: the `custom_fields` column is validated but not configurable.
- Stakeholder groups UI: the tables exist.
- A billing area.
