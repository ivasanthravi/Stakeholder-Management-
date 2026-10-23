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

## Commercial layer (Phase 3)
New error codes:
| Status | Code | Meaning |
|---|---|---|
| 402 | `plan_required` | The workspace's plan doesn't include this feature. `feature` and `plan` (the lowest plan that has it) are included |
| 402 | `subscription_inactive` | The workspace is read-only or locked (trial ended, canceled, unpaid past grace, suspended). `access` is included |
| 402 | `seat_limit` | All seats are used or held by pending invitations. `seatLimit` and `used` are included |
| 429 | `quota_exceeded` | Monthly AI allowance reached (plan allowance or the admin's lower cap). No overage is charged |

Every `/api/w/:id/*` request passes the entitlement middleware. While access isn't `full`, writes are refused (402), except billing, member/invitation removal, notifications, data and copilot-history routes.

### Billing — `/api/w/:workspaceId/billing`
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/` | member | Entitlements, seats, AI allowance/usage, plan catalog. `billing` (period, payment-method summary) only for admins and owners |
| GET | `/invoices` | `billing.read` (admin) | Provider-hosted invoice list; never generated locally |
| POST | `/checkout` | `billing.manage` (owner) | `{plan, interval, seats}` → `{url}` for provider-hosted checkout. Seats must be ≥ current usage |
| POST | `/portal` | owner | → `{url}` of the provider's customer portal |
| POST | `/change` | owner | `{plan, interval, seats}` → prorated update, then a re-sync from the provider |
| POST | `/cancel` | owner | `{reason?}` → cancel at period end |
| POST | `/resume` | owner | Undo a scheduled cancellation |
| POST | `/refresh` | admin | Re-reads state from the provider (used while confirming a checkout) |

### Public
| Method | Path | Notes |
|---|---|---|
| POST | `/api/billing/webhooks/:provider` | Signature-verified provider webhooks (`stripe`, `paddle`, `simulator`). 400 on invalid signature; `{duplicate:true}` on redelivery |
| GET | `/api/billing/plans` | Plan catalog, approved display prices only, trial terms |
| GET, POST | `/api/billing/simulator/checkout/:id` | Development simulator's hosted checkout. 404 in production |
| GET, POST | `/api/notifications/unsubscribe?token=` | GET confirms; POST unsubscribes (RFC 8058 one-click) |
| POST | `/api/contact` | `{name, email, company?, teamSize?, topic, message, website(honeypot)}`. 5/hour/IP. 503 until `SALES_EMAIL` is set |

### Account — `/api/me`
| Method | Path | Notes |
|---|---|---|
| GET, PUT | `/preferences` | Notification channels per type, analytics opt-out |
| PATCH | `/profile` | `{name}` |
| GET | `/export` | Personal data export (JSON download) |
| POST | `/close` | `{confirmEmail}`. 409 lists workspaces where you're the only owner. Deletes the user; shared records remain |

### Workspace extras — `/api/w/:workspaceId`
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/invitations/:id/resend` | admin | New token and expiry; the old link stops working. 1/min per invitation |
| GET | `/notifications` · POST `/notifications/read {ids?}` | own | Inbox |
| GET, PATCH | `/onboarding` | read: member · write: admin | Progress derived from data; `{complete, dismissed}` |
| GET | `/data/requests` | `data.export` (admin) | Export and deletion requests |
| POST | `/data/export` | admin | Background JSON export (202); emailed when ready; kept 7 days |
| GET | `/data/exports/:id` | admin | Download |
| POST, DELETE | `/data/deletion` | owner | `{confirmName}` schedules deletion in 14 days; DELETE cancels |

`POST /api/workspaces` now accepts `{name, template?}` and returns `trial` (whether a no-card trial started).

### Operator
`GET /api/operator/metrics?days=30`: aggregate funnel (event counts, activation rate, trial conversion, median time to first value). Restricted to `OPERATOR_EMAILS`.
