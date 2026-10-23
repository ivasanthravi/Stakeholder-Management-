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
