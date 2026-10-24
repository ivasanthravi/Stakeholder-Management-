# Security Report (Phase 4)

**Scope:** an internal, code-level review against the OWASP ASVS 4.0 chapters (V1–V14 where applicable) and the OWASP Top 10 (2021), with automated tests.

**This is not a penetration test.** An independent security assessment is still required (see remaining-blockers.md).

**Date:** 2026-10-24.

**Evidence:**
- `app/tests/security.test.ts`: 15 tests.
- `app/tests/isolation.test.ts`: 9 tests.
- `tenancy.test.ts`, `billing.test.ts`, `providers.test.ts`, `provider-flow.test.ts`, `ai.test.ts` and `ai-failures.test.ts`.

All of them pass on PGlite **and on real PostgreSQL 18.4** (`npm run test:pg`).

## Findings fixed in this phase
| # | Severity | Finding | Fix | Verified by |
|---|---|---|---|---|
| S1 | High | **No CSRF defence beyond the SameSite=Lax cookie** on cookie-authenticated JSON writes | An Origin / `Sec-Fetch-Site` check on every state-changing `/api/*` request. Webhooks and one-click unsubscribe are exempt, because they're authenticated by signature or token | security.test.ts (foreign Origin 403, cross-site 403, same-origin OK) |
| S2 | High | **Rate-limit identity spoofable.** Better Auth and our limiters keyed on the left-most `X-Forwarded-For`, which the client controls. Without a resolvable IP, Better Auth falls back to one *shared* bucket per path, which would let anyone lock everyone out of sign-in (3 attempts / 10 s) | `CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS` for our limiters (right-most trusted hop), and `advanced.ipAddress` (header plus `TRUSTED_PROXIES`) for Better Auth. **Must be set per hosting platform** (deployment runbook) | security.test.ts (production-mode sign-in limit; forged XFF can't rotate identity; IP helper unit tests) |
| S3 | Medium | **Sensitive data in logs.** Unhandled errors logged whole database errors, which include SQL parameters (record content). The dev mail transport logged token links. Request logs could carry tokens in query strings | Structured logger. DB errors are reduced to their code plus the first line. Secret-like keys are redacted. Paths are logged without query strings, ids are masked, and invitation tokens masked. Mail links appear only in development | security.test.ts (`errorFields` drops params) |
| S4 | Medium | **Open redirect** through the sign-in / sign-up `?next=` parameter | `safeNext()` accepts same-site paths only | security.test.ts (`//evil`, `/\\evil`, `https://`, `javascript:`, control chars) |
| S5 | Low | `DELETE /ai/conversations/:id` returned 200 for another tenant's id. Nothing was deleted, because RLS blocked it | Returns 404 when nothing was deleted | isolation.test.ts |
| S6 | Medium | **No request body limit** | 512 KB limit on `/api/*`, returning 413 | security.test.ts |
| S7 | Info | Request correlation missing | `x-request-id` is accepted when well-formed, otherwise minted, and echoed and logged | security.test.ts |
| S8 | Low | Production start relied on `tsx` arriving transitively | Declared as a runtime dependency | deploy drill |

## ASVS / Top 10 review summary
| Area | Status | Notes / evidence |
|---|---|---|
| **A01 Broken access control** (ASVS V4) | Controlled | Role matrix enforced server-side. RLS on every tenant table. Composite same-tenant foreign keys. 404 (not 403) for other tenants. Entitlements enforced server-side. Isolation attack matrix: 14 routes × reads, 9 write attacks, search, aggregates, copilot, briefings, exports, digests, revocation and demotion. Proven on real Postgres |
| **A02 Crypto failures** (V6, V9) | Partially verified | Better Auth hashes passwords (scrypt), session tokens are random, invite and unsubscribe tokens are stored as SHA-256 hashes. **TLS depends on the deployment** (HSTS is sent in production; verified in a production-mode test, not on a real domain). Encryption at rest depends on the managed database |
| **A03 Injection** (V5) | Controlled | Drizzle parameterises everything. The only `sql.raw` is an allow-listed sort map plus the operator `db:check` constants. Zod validation on every input. Test: SQL metacharacters stored and searched as data |
| **XSS** (V5.3) | Controlled | React escaping. No `dangerouslySetInnerHTML`. Server-rendered HTML (emails, simulator, unsubscribe) escapes interpolations. Production CSP: `script-src 'self'`, `frame-ancestors 'none'` |
| **A04 Insecure design** | Reviewed | Billing state only changes from signed webhooks or a provider re-fetch, never redirects. AI can't write without human approval. Destructive actions need typed confirmation plus cooling-off |
| **A05 Misconfiguration** (V14) | Mostly controlled | Production refuses to start without `AUTH_SECRET` and `DATABASE_URL`. The simulator is refused in production. Dev routes return 404 in production (tested). Live billing keys are refused without `BILLING_LIVE_APPROVED`. **CORS:** no CORS headers are ever sent (same-origin only, tested). **Open:** IP/proxy settings must be configured per platform (S2) |
| **A06 Vulnerable components** | Accepted | `npm audit --omit=dev`: 0 high/critical. 4 moderate in `drizzle-kit → @esbuild-kit/* → esbuild` (pulled in via `better-auth`'s dependency tree). The esbuild advisory concerns its dev server, which isn't used at runtime. The CI gate fails on high/critical |
| **A07 Authentication** (V2, V3) | Controlled, gaps listed | Email verification required. 10-character password minimum. Reset links are single-use, last 1 h, and revoke all sessions (tested). Cookies: HttpOnly, SameSite=Lax, Secure in production (tested). Sign-in rate limited (tested). **Gaps:** no MFA (P1). Sign-up responses reveal whether an email is registered (Better Auth default; P2) |
| **A08 Integrity** | Controlled | Webhook HMAC verification over the raw body, with replay tolerance and event-id dedupe (tested for simulator, Stripe and Paddle signing schemes). The lockfile is committed |
| **A09 Logging & monitoring** (V7) | Implemented, not yet connected | Structured logs, request ids, audit log for security events, Prometheus metrics, error-reporter hook. **No alerting destination configured yet** (P0 for launch: see incident runbook) |
| **A10 SSRF** | Not applicable / controlled | The server never fetches user-supplied URLs. The only outbound calls are fixed provider endpoints (Postmark, Stripe/Paddle SDKs, Anthropic SDK) |
| **File uploads** (V12) | Controlled | Transcript files are read in the browser as text only. The server receives text, size-capped (notes ≤ 50k chars; body ≤ 512 KB). No file storage except exports written server-side under `EXPORT_DIR` with mode 0600 |
| **Secrets** (V2.10, V6.4) | Process defined | Secrets come only from env; `.env` is git-ignored and `.env.example` has placeholders. A staged-diff secret scan ran before each commit. **Production secrets manager not yet chosen** (platform-native secrets recommended) |
| **Error disclosure** (V7.4) | Controlled | 500s return a generic message plus the request id. No stacks or SQL reach clients (tested) |
| **Headers** (V14.4) | Controlled | nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, CSP and HSTS in production (tested) |

## Residual risks (accepted or open)
1. **No independent penetration test.** P0 before handling real customer data at scale.
2. **No MFA, no SSO.** P1. SSO is listed as "Planned" and must not be sold.
3. **The in-memory rate limiter is per process.** Limits multiply with instances. P1 for multi-instance deployments; use a shared store.
4. **Account enumeration at sign-up.** P2.
5. **Contact form confirmation emails to arbitrary addresses.** Rate-limited to 5 per IP per hour, plus a honeypot. P2: monitor.
6. **Paddle checkout page not built.** Not a vulnerability, but the Paddle path needs Paddle.js under the CSP (`cdn.paddle.com`); review the CSP when it's added.
7. **The AI model path has never run against the live provider.** Prompt-injection defences are structural (fenced data, verbatim quotes, no write tools, human approval, RLS) and tested with scripted engines only.
