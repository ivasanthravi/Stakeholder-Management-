# Phase 3 Test Results

Every result below was executed on 2026-10-23 in this environment: macOS, Node 24, PGlite, Google Chrome via Playwright. Nothing is reported that wasn't run.

## Summary
| Suite | Command | Result |
|---|---|---|
| Typecheck (client + server) | `npm run typecheck` | Clean |
| Unit + integration (Vitest) | `npm test` | **108 passed / 108** (9 files) |
| End-to-end (Playwright, Chrome) | `npm run test:e2e` | **11 passed / 11** (core flow, AI flow, commercial journey) |
| Accessibility, console and overflow sweep (axe-core, WCAG 2.0–2.2 A/AA) | `node audit/phase1-qa.mjs` | **98 views clean / 98** (desktop + mobile; includes 9 marketing pages and 10 new settings/inbox views) |
| Production build | `npm run build` | OK |
| Dependency audit | `npm audit --omit=dev` | 4 moderate (drizzle-kit → esbuild, build tooling), 0 high/critical |

## The 18 required scenarios
| # | Scenario | Where verified |
|---|---|---|
| 1 | New customer signs up | E2E `commercial-flow` (UI: sign up, then email verification link) |
| 2 | Creates workspace | E2E `commercial-flow` (Construction template) + `commercial.test.ts` (template settings) |
| 3 | Completes onboarding | E2E `commercial-flow`: configure → first project → stakeholders → invite → command center; `commercial.test.ts` resumable progress |
| 4 | Invites teammate | E2E (onboarding step 4); `commercial.test.ts` resend/rotation, rate limit, viewer forbidden |
| 5 | Teammate accepts invitation | E2E (new user via invite link); `commercial.test.ts` invalid/used links reveal nothing, inviter notified |
| 6 | Trial entitlement applied | `billing.test.ts` (Professional trial, 10 seats, features), E2E (Trial shown in Billing) |
| 7 | Customer starts checkout | `billing.test.ts`, E2E ("Choose Starter" → provider-hosted page) |
| 8 | Sandbox payment succeeds | **Development simulator** (signed webhooks through the real endpoint): `billing.test.ts`, E2E. **Stripe/Paddle sandboxes: not executed** (no keys; see below) |
| 9 | Billing webhook updates subscription | `billing.test.ts` (simulator), `providers.test.ts` (Stripe and Paddle signature verification + mapping, offline) |
| 10 | Paid entitlements activate | `billing.test.ts` (Starter features enforced: meeting intelligence 402, restrict 402, audit 402, briefings allowed); E2E (402 on analyze after Starter purchase) |
| 11 | Customer upgrades plan | `billing.test.ts` (Starter → Professional annual, 6 seats; enterprise and below-usage downgrades refused) |
| 12 | Customer cancels | `billing.test.ts` (cancel at period end, resume, renewal → canceled); E2E (cancel via UI) |
| 13 | Access follows cancellation policy | `billing.test.ts` (full until period end → read-only; GET allowed, writes 402; data retained; re-purchase restores) |
| 14 | Failed payment handled | `billing.test.ts` (past_due → grace with full access → read-only after grace → recovery; owner email once) |
| 15 | AI usage limits enforced | `billing.test.ts` (8 concurrent model requests against a 3-reservation cap: ≤ 3 succeed, the rest 429, ledger exact, no reservation leak; read-only workspace can't run AI) |
| 16 | Tenant data isolated | `billing.test.ts` (outsider 404 on billing), existing tenancy and AI suites, E2E tenant isolation |
| 17 | Unauthorized users can't use billing controls | `billing.test.ts` (contributor: no details, 403 checkout/invoices; admin: read but no checkout) |
| 18 | Customer can export permitted data | `commercial.test.ts` (admin workspace export in background + download, viewer 403, expiry purge; personal export excludes others' records) |

Also covered:
- **Webhooks:**
  - duplicate webhook (ignored)
  - forged signature, tampered body, replayed timestamp, missing signature (all 400)
  - wrong-provider endpoint
  - out-of-order old event (no rollback)
  - missed webhook recovered by reconciliation
- **Trial expiry:** idempotent, emails once.
- **Seat limits:** trial seat limit including pending invitations, and its release on revoke; trials-per-user limit.
- **Notifications:**
  - decision assignment (subject never names the stakeholder)
  - digest once per day, own commitments only
  - preference suppression
  - unsubscribe: GET confirms, POST unsubscribes
- **Deletion and closure:**
  - workspace deletion: owner-only, name confirmation, cooling-off, cancel, deletion with surviving audit row
  - account closure blocked for the last owner; shared records survive closure; closed account can't sign in
- **Analytics:** activation milestones once, no record content, opt-out respected.
- **Email:** templates render HTML + text (with link URLs); the email log holds no bodies.

## Not executed (requires credentials or infrastructure)
**Sandbox checklist**, to run with test keys (`BILLING_PROVIDER=stripe` or `paddle`, test prices in `BILLING_PRICE_*`, webhook endpoint registered):
1. Checkout with the provider's success test card → `subscription_activated`.
2. Checkout with a decline test card → no state change.
3. Upgrade and downgrade from Settings → proration on the next invoice.
4. Cancel → `cancel_at_period_end`. Advance the test clock (Stripe) or use simulation (Paddle) past period end → canceled → read-only.
5. Failed renewal (Stripe test clock with a failing card / Paddle simulation) → past_due → grace → recovery.
6. Resend a webhook from the dashboard → `duplicate: true`.
7. Portal opens; invoice links work.

Also not executed:
- Postmark delivery and rendering in Gmail, Outlook and Apple Mail.
- Real PostgreSQL.
- Load testing.

## Performance (local production build, `vite preview`, no network throttling)
| Page | Desktop FCP / LCP / CLS | Mobile (4× CPU) FCP / LCP / CLS |
|---|---|---|
| `/` marketing home | 468 / 1100 ms / 0.000 | 660 / 1316 ms / 0.000 |
| `/pricing` | 404 / 836 ms / 0.002 | 392 / 440 ms / 0.002 |

- **Initial app JS** ≈ 152 kB gzip. The marketing pages add 32 kB gzip, lazy-loaded.
- **Marketing images:** 13 WebP screenshots, 1.7 MB in total, `srcset` + lazy-loaded below the fold.
- **Caveat:** these are local measurements, not field data.

## Visual QA (BUILD → RUN → INSPECT → CRITIQUE → REFINE → RETEST)
- **Coverage:** marketing (9 pages at 1440 / 834 / 390), onboarding (every step, desktop + mobile, error states), billing (checkout → simulator → confirming → confirmed; change; cancel/resume; portal unavailable), members, inbox, access banners, data management.
- **Screenshots:**
  - `docs/commercial/screenshots/` (sweep)
  - `app/scratch/mk/`, `app/scratch/onboarding/` and `app/scratch/` (agent review rounds; not committed)
- **Findings fixed:** see phase-3-report.md §7.
- **Tooling caveat:** in the desktop app's browser pane, scroll-reveal animations above the fold can appear late because the pane runs as a background page. Headless Chrome confirmed 0 faint elements in the first viewport after 1.2 s on `/`, `/pricing` and `/security`.
