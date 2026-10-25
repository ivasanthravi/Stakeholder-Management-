# Billing Activation (Phase 5)

**Status: BLOCKED at Stage A.** No sandbox credentials exist for either provider. When asked on 2026-10-24, none were supplied.

**Billing is not production-ready, and must not be described as such:**
- The **development simulator** and the **contract tests** (real Stripe and Paddle SDKs against fake APIs, with correctly signed webhooks) are **not** equivalent to a provider integration test.
- No live credential has ever been configured.
- No real or test payment has ever been made through a provider.

## What exists (verified)
| Area | Evidence |
|---|---|
| Provider interface, Stripe and Paddle adapters, simulator | `server/billing/*`; contract tests `provider-flow.test.ts` (8), `providers.test.ts` (6) |
| Activation only from verified webhooks or a provider re-fetch, never from the redirect | `billing.test.ts`, E2E commercial-flow (simulator) |
| Signature verification, replay tolerance, idempotent ingestion, out-of-order safety, reconciliation job | `billing.test.ts`, `provider-flow.test.ts`, load test (240-delivery burst, exact dedupe) |
| Entitlements: plans, seats, AI allowance (atomic), trial, grace, read-only | `billing.test.ts`, `commercial.test.ts` |
| Live-mode lock | Live Stripe keys or `PADDLE_ENVIRONMENT=production` are refused without `BILLING_LIVE_APPROVED=true`. **Staging refuses `BILLING_LIVE_APPROVED` entirely** (Phase 5, tested). Production refuses the simulator |
| Billing failure monitoring | `meridian_billing_events_unprocessed`, `_failed_24h`, `meridian_subscriptions_past_due`; alerts in `incident-response.md` |

## Decisions needed first (owner: business)
1. **Provider:** Stripe (we are the merchant; we handle tax registration) or Paddle (merchant of record; Paddle handles sales tax and VAT). This depends on the legal entity and country, which are undecided.
2. **Products and prices:** plan names exist in code (Starter, Professional, Enterprise via sales). Prices, currencies and the annual discount are business decisions; nothing is hard-coded.
3. **Refund and cancellation terms** (Terms of Service draft, §Fees).
4. **Tax:** with Stripe, Stripe Tax registrations per jurisdiction. With Paddle, confirm Paddle's handling for the entity's country, including India seller onboarding if applicable.

## Stage A: sandbox verification (blocked; runbook ready)
**Prerequisites:**
- Sandbox account.
- Test API key, in `app/.env` or the staging secret store, **entered by a person, never by the assistant**.
- Webhook endpoint `https://<staging>/api/billing/webhooks/<provider>` with its signing secret.
- Test prices in `BILLING_PRICE_*`.
- Paddle only: the **Paddle.js checkout page** (not built, P0 if Paddle is chosen) plus a CSP allowance for Paddle's CDN.

**Scenarios.** Record the date, provider event ids and results for each:

| # | Scenario | Pass criteria |
|---|---|---|
| A1 | Checkout success (test card) | Subscription active only after the webhook; entitlements = plan; owner email; audit row |
| A2 | Checkout decline and 3-D Secure challenge | Nothing changes on decline; 3DS completes, then active |
| A3 | Upgrade and seat increase (prorated) | Provider shows proration; entitlements updated from the webhook |
| A4 | Downgrade allowed; downgrade below used seats refused | Refused in-app before reaching the provider |
| A5 | Cancel at period end, then resume | `cancelAtPeriodEnd` toggles; access unchanged |
| A6 | Cancel and let the period end (test clock or simulation) | Workspace read-only, data exportable |
| A7 | Failed renewal → grace → recovery | `past_due` with access; read-only after grace; recovered on `invoice.paid` |
| A8 | Portal: update payment method, view and download an invoice | Portal URL works; invoice visible in-app |
| A9 | Webhook redelivered | `duplicate: true`; no double effect |
| A10 | Webhook dropped (endpoint disabled briefly) | Reconciliation repairs state within one cycle |
| A11 | Wrong signing secret | 400; `billing webhook rejected` logged; alert fires |

**After each scenario check:**
- `/api/w/:id/billing`
- `billing_event` statuses
- emails
- the audit log
- `npm run db:check`

## Stage B: live configuration (requires explicit approval; not requested yet)
**Gate:** written approval from the business owner naming the provider, entity, prices and go-live date.

**Steps:**
1. Live keys go into the production secret store only.
2. Register the production webhook endpoint and verify its signature with a provider test event.
3. Create the approved live products and prices, and set `BILLING_PRICE_*`.
4. Confirm merchant account readiness (KYC, payouts), supported currencies, tax registrations, invoice details (entity name, address, tax ids) and customer-facing billing policies on the site.
5. Configure billing alerts at the provider: disputes, failed payouts.
6. Set `BILLING_LIVE_APPROVED=true` **last**.

## Stage C: production verification (requires separate authorization)
- Use the provider's approved procedure. Options:
  - a real low-value transaction **with explicit authorization**, charged to a company card and refunded;
  - the provider's live-mode test facilities, where offered.
- Never use customer cards.
- Record the result here.
