# Phase 3 Audit: From Product to Commercial SaaS

Date: 2026-10-23. Baseline commit `f2dd53e` (Phase 2).

## Verified state
| Area | Observed | Evidence |
|---|---|---|
| Tests | 71 Vitest, 7 Playwright, all passing at Phase 2 close. Vitest re-run today: 71 passed. | `npx vitest run` |
| Auth | Better Auth 1.7: email + password, verification (sign-in blocked until verified), reset, 7-day sessions, auth rate limit in production, sign-in/up audit hooks. No MFA, SSO, account deletion or profile page. | `server/auth.ts` |
| Tenancy | `workspace` → `membership` (5 roles) → RLS on every tenant table through `withTenant`. Workspace id comes from the verified membership. | `server/context.ts`, `0001_rls.sql` |
| Roles | One matrix in `shared/permissions.ts` (`can`, `canChangeRole`). Owner is described as "billing and deleting the workspace", but no billing permission exists yet. | — |
| Invitations | Exist: email + role, 7-day TTL, SHA-256-hashed single-use token, re-invite revokes the previous one, revoke, email-match on accept, verified email required, audit. **Missing:** resend, seat limits, "invitation accepted" notice, rate limit on invites. Preview endpoint reveals workspace name and inviter to anyone with a valid token (acceptable: the token is the secret), and 404s invalid tokens. | `modules/workspaces.ts` |
| Workspace creation | One-field form (`Onboarding` in `Auth.tsx`). No templates, no guided setup. | — |
| Workspace settings | `vocabulary`, `organizationTypes`, `engagementKinds` are stored, but **vocabulary is not applied to UI labels** (Phase 1 limitation). | `shared/schemas.ts` |
| Mail | `log` transport only (stores to `mail_outbox`, shows at `/dev/mail`). Three kinds: verify, reset, invite. Plain text. No retries, preferences, history or unsubscribe. | `server/mail.ts`, `env.ts` |
| AI usage | `ai_usage` metering (tokens, µ$, latency, no content). Monthly token budget and per-user rate limit live in `workspace.settings.ai`, an admin-editable setting, not a plan entitlement. The budget check is read-then-call, so concurrent requests can overshoot. | `server/ai/usage.ts` |
| Rate limiting | In-memory sliding window per process (600/min on `/api/w/*`, plus AI limits) | `server/ratelimit.ts` |
| Background work | None. Mail is sent inline in the request. No job queue, scheduler or retries. | — |
| Analytics | None | — |
| Marketing / public site | None. `/` is the authenticated Home. Public routes are only the auth pages and the invite accept page. | `src/main.tsx` |
| Deployment | `npm run build && npm start` (single process serves API + SPA). No Dockerfile, CI, hosting, TLS, backups or monitoring. No deployment URL exists. | `app/README.md` |
| Dependencies | `npm audit --omit=dev`: 4 moderate, all in `drizzle-kit` → `@esbuild-kit/*` → `esbuild` (migration tooling, not in the request path). 0 high or critical. | `npm audit` |
| Design / motion | Tokens (`styles/tokens.css`), design-system doc §1–12 (AI surfaces §7.12), motion tokens (`lib/motion.ts`), reduced-motion support | `docs/design/*` |

## What Phase 3 builds on, rather than rebuilds
- **Kept:**
  - Better Auth for identity
  - The membership and role model
  - Invitation tokens
  - RLS tenancy
  - The audit log
  - `ai_usage` metering
  - Design tokens and components
  - The single-process deployment shape
- **Extended:**
  - Invitations: resend, seat enforcement, accepted notice, invite rate limits
  - Mail: templates, a real provider transport, an outbox with retries, preferences
  - AI budget: becomes a plan allowance with atomic reservation
  - Onboarding: templates and guided steps
  - Settings: profile, billing, usage, notifications, security, data
- **New:**
  - Entitlement service
  - Billing provider adapter and webhook ingestion
  - Durable job queue
  - First-party analytics
  - Data export and deletion
  - Marketing site

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Merchant eligibility unknown (legal entity country not stated) | Provider choice could be wrong | Provider-agnostic billing interface. Evaluation in `billing-architecture.md`. Decision required. |
| No provider sandbox credentials in this environment | Live sandbox flows can't be exercised here | Implement against the official SDK. Test with locally signed webhook payloads and a provider stub. Report sandbox runs as **not executed** until keys exist. |
| Prices not approved | Can't publish prices | Prices live in configuration with an `approved` flag. Unapproved plans render as "Pricing on request" on the site and are unavailable in checkout. |
| No email provider account | Can't verify real delivery or rendering in mail clients | Provider transport behind an interface, outbox with retries. Rendering checked in a browser only. |
| Concurrency on quotas | Overspend of AI allowance | Atomic reservation in Postgres (conditional update). |
| PGlite single connection in dev | Background worker and requests contend | Short jobs, worker yields between jobs. Production uses Postgres. |
| `/` is the app | Marketing site needs public routes | Decision below |

## Decisions (made here, reversible)
1. **Marketing site:** lives in the same SPA as lazy-loaded public routes (`/product`, `/pricing`, `/security`, …). `/` shows the marketing homepage when signed out and Home when signed in. One deployment, one design system. Can move to a separate static host later; the components are isolated under `src/marketing/`.
2. **Jobs:** a Postgres-backed queue (`job` table, `FOR UPDATE SKIP LOCKED`, retries with backoff), run by the API process. No new infrastructure.
3. **Analytics:** first-party event table, no third-party scripts, no stakeholder content, per-user opt-out.
4. **Billing state:** the provider is the source of truth for money; our `subscription` table is the source of truth for access and is updated only by verified webhooks or reconciliation, never by a checkout redirect.

## Decisions required from the founder
1. **Legal entity country**, which determines the billing provider (Stripe / Paddle / Razorpay; see `billing-architecture.md`).
2. **Plan prices, and whether to sell monthly, annual or both.** Recommendations are in `pricing-strategy.md`; nothing is published until approved.
3. **Email provider account** (Postmark, Resend, SES or SMTP) and a verified sending domain.
4. **Data-retention periods** after cancellation (proposed defaults in `billing-architecture.md` §Retention), to be checked against contracts and applicable law.
