# API Reference (Phase 1)

Base: same origin as the app. JSON in and out. Auth is a Better Auth session cookie.

**Errors** always come back as `{ "error": { "code", "message", "fields"?, "current"? } }`.

| Status | Codes | Meaning |
|---|---|---|
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Role doesn't allow the action |
| 404 | `not_found` | Missing, or not visible to you. Other tenants' and restricted records are indistinguishable from missing ones |
| 409 | `conflict`, `duplicate` | Duplicate or contradictory record |
| 409 | `stale_version` | Someone else changed the record; `current` holds the latest row |
| 409 | `in_progress` | The same idempotency key is already being processed |
| 410 | `expired` | Invitation expired |
| 422 | `invalid` | Validation failed; `fields` maps field to message |

**Writes.** PATCH bodies must include the record's current `version` (optimistic concurrency). POSTs accept an `Idempotency-Key` header.

Request and response schemas are in `app/shared/schemas.ts`; the handlers are in `app/server/modules/*`.

## Auth (Better Auth) — `/api/auth/*`
`POST sign-up/email` · `POST sign-in/email` · `POST sign-out` · `GET get-session` · `GET verify-email?token=` · `POST send-verification-email` · `POST request-password-reset` · `POST reset-password`

## Account (signed in, not workspace-scoped)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/me` | User, workspaces (with role), pending invitations to this email |
| POST | `/api/workspaces` | `{name}` → creates the workspace; caller becomes owner. Requires a verified email |
| GET | `/api/invitations/:token` | Public preview (workspace, inviter, role, status) |
| POST | `/api/invitations/:token/accept` | Must be signed in as the invited email, verified, single use |

## Workspace — `/api/w/:workspaceId` (membership verified on every request)
| Method | Path | Min role |
|---|---|---|
| GET | `/` | viewer |
| PATCH | `/settings` `{name?, vocabulary?}` | admin |
| GET | `/members` | viewer (pending invitations are visible to admins only) |
| POST | `/invitations` `{email, role}` · DELETE `/invitations/:id` | admin |
| PATCH | `/members/:membershipId` `{role}` | admin (owners only for owner changes) |
| DELETE | `/members/:membershipId` | admin, or self (leave) |
| GET | `/audit?before=` | admin |

## Records
All are under `/api/w/:workspaceId`. Lists take `q, limit (≤200), offset, archived=true|false` and return `{items, total}`.

| Resource | Endpoints | Extra list filters |
|---|---|---|
| Stakeholders | `GET /stakeholders` · `POST` · `GET /:id` · `PATCH /:id` · `POST /:id/archive|restore` · `POST /:id/organizations` · `POST /:id/organizations/:assocId/end` · `PUT /:id/access` (admin) · `GET /:id/activity` · `GET /:id/overview` (profile bundle and rule-based briefing) | `stance` (csv), `minInfluence`, `initiativeId`, `organizationId`, `ownerId`, `cold`, `sort=name|influence|last|open|stance|updated`, `dir` |
| Organizations | `GET /organizations` · `POST` · `GET /:id` (people, initiatives, engagements) · `PATCH /:id` · `POST /:id/archive|restore` | `type`, `sort=stakeholders` |
| Initiatives | `GET /initiatives` · `POST` (manager) · `GET /:id` · `PATCH /:id` · `POST /:id/archive|restore` · `POST /:id/stakeholders` · `DELETE /:id/stakeholders/:sid` | — |
| Relationships | `POST /relationships` · `PATCH /:id` · `POST /:id/archive` | — |
| Engagements | `GET /engagements` · `POST` · `GET /:id` · `PATCH /:id` · `POST /:id/archive` | `kind` (csv), `initiativeId`, `stakeholderId` |
| Decisions | `GET /decisions` · `POST` (contributors may only propose) · `GET /:id` · `PATCH /:id` (manager) · `POST /:id/archive` | `status` (csv), `initiativeId`, `stakeholderId` |
| Commitments | `GET /commitments` · `POST` · `GET /:id` · `PATCH /:id` · `POST /:id/archive` | `status` (csv), `overdue`, `initiativeId`, `stakeholderId`, `ownerId` |

## Read models
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | Signals (rules, each with its rule text and evidence), commitment horizon, decisions in progress, recent engagements, initiative coverage, stance counts |
| GET | `/graph?initiativeId=|all` | Authorized nodes (≤2000), organizations, edges between visible endpoints; `gap` flag per node |
| GET | `/search?q=` | Stakeholders, organizations, initiatives, commitments, decisions, engagements |
| GET | `/lookups` | Members, initiatives, organizations (for pickers) |
| GET | `/activity?entityType=&entityId=&before=` | User-facing history |

## Development only
`GET /api/dev/mail` lists the emails that would have been sent. It is disabled when `NODE_ENV=production`.

## AI layer (Phase 2) — `/api/w/:workspaceId/ai`
Everything here runs behind the same tenant gate and RLS as the record APIs. Model-backed calls are also checked against the workspace's AI settings (`ai_disabled` 403), the per-user rate limit (`rate_limited` 429, `retry-after`) and the monthly token budget (`quota_exceeded` 429). Every call is metered in `ai_usage` (counts, cost, latency — never content). See `docs/ai/architecture.md`.

| Method | Path | Min role / permission | Notes |
|---|---|---|---|
| GET | `/status` | viewer | Engine (`kind` claude/local, label, model), settings, tokens used this month |
| PATCH | `/settings` | `workspace.update` (admin) | `{enabled?, retentionDays? (0–365), monthlyTokenBudget?, perUserPerMinute? (1–120), thresholds?: {noContactDays, dueSoonDays, decisionStaleDays, coolingRatio}}` |
| GET | `/usage` | `audit.read` | Last 30 days grouped by feature/engine: calls, errors, tokens, cost (µ$), p50/p95 latency |
| GET | `/meetings/:engagementId` | viewer | Latest analysis with proposals; `stale` when the notes changed since |
| POST | `/meetings/:engagementId/analyze` | `engagement.create` | Extracts proposals from the notes (≥ 40, ≤ 60,000 chars). Replaces earlier *pending* proposals. 503 `ai_unavailable` on engine failure (nothing changed) |
| PATCH | `/proposals/:id` | `engagement.create` | `{version, values}` edits a pending proposal; returns it with a new version |
| POST | `/proposals/:id/accept` | permission of the record created (`commitment.create`, `decision.create`; `decision.update` to accept as anything other than Proposed) | `{version, values?}` → creates the record through the normal domain path, with activity and audit. 409 `stale_version` if edited or already decided |
| POST | `/proposals/:id/reject` | `engagement.create` | `{version}` |
| POST | `/proposals/:id/merge` | `engagement.create` | `{version, into}` marks it as a duplicate of an existing record |
| GET | `/briefings/stakeholders/:id?mode=brief\|detailed\|prep` | viewer | Evidence-backed briefing: sections of items (`fact`, `metric` + `method`, `interpretation` (model only, cited), `recommendation` + `origin` rule/ai), `sources`, `unsupportedDropped`, `aiError?`. `fresh=1` bypasses the 15-minute cache |
| GET | `/briefings/decisions/:id` | viewer | Same shape, for a decision |
| GET | `/briefings/workspace` | viewer | Same shape, from the Home signals |
| GET | `/paths?from&to` | viewer | Shortest chain of recorded person-to-person relationships (≤ 4 steps) visible to the caller |
| POST | `/copilot` | viewer | `{message, conversationId?, context?}` → `text/event-stream` of `meta`, `status`, `text`, `sources`, `card`, `final {text, refs, followUps, unsupported}`, `error` |
| GET | `/conversations` · `/conversations/:id` | own only | Copilot history; private to its author, expires per `retentionDays` |
| DELETE | `/conversations/:id` · `/conversations` | own only | Delete one / all of your conversations |

Rate limiting also applies to every `/api/w/*` request (600/min per user and workspace) and to auth endpoints.
