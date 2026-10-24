# Billing Verification (Phase 4)

**Real provider sandbox checkout verification is BLOCKED.** No Stripe or Paddle sandbox credentials exist. **Billing is not production-ready.** No live payment was ever initiated, and live keys are refused by the code without `BILLING_LIVE_APPROVED=true`.

## What is verified, and how
| Capability | Development simulator (signed webhooks through the real endpoint) | Stripe adapter: contract test (real SDK, fake Stripe API, Stripe-signed webhooks) | Paddle adapter: contract test (real SDK, fake Paddle API, Paddle-signed webhooks) | Real sandbox |
|---|---|---|---|---|
| Plan entitlements (features, seats, allowance) | ✓ billing.test.ts | ✓ (Starter → Professional features) | ✓ | BLOCKED |
| Trial lifecycle (start, limit per user, expiry, emails) | ✓ | n/a (trial is ours) | n/a | n/a |
| Seat limits (members + pending invites; race-safe) | ✓ | — | — | — |
| Subscription creation via hosted checkout | ✓ | ✓ request shape: `mode=subscription`, provider price, quantity, workspace metadata, our return URLs, no card fields | ✓ transaction with `custom_data.workspaceId` → hosted checkout URL | BLOCKED |
| Activation only after verified webhook (not redirect) | ✓ (plus E2E) | ✓ `checkout.session.completed` → sync → active | ✓ `subscription.created` → active | BLOCKED |
| Upgrade / downgrade with proration | ✓ | ✓ `items[0][price]`, quantity, `proration_behavior=create_prorations` | Adapter code only (`prorated_immediately`) | BLOCKED |
| Downgrade below used seats refused | ✓ | — | — | — |
| Renewal | ✓ (simulated period end) | — | — | BLOCKED |
| Cancel at period end / resume / ended → read-only | ✓ | ✓ `cancel_at_period_end=true`; `customer.subscription.deleted` → read-only | ✓ scheduled cancel → `cancelAtPeriodEnd` | BLOCKED |
| Payment failure → grace → read-only → recovery | ✓ | ✓ `invoice.payment_failed` → past_due (grace); `invoice.paid` → active | — | BLOCKED |
| Billing portal | n/a (simulator has none; UI explains) | ✓ returns the portal URL | Adapter code only | BLOCKED |
| Invoice access | ✓ simulated invoices | ✓ hosted invoice URL listed | Adapter code only (PDF on demand) | BLOCKED |
| Webhook signature verification | ✓ forged, tampered, replayed, missing | ✓ wrong secret rejected (SDK scheme) | ✓ wrong secret and tampered body rejected (`ts;h1` HMAC over `ts:body`) | — |
| Idempotency (duplicate delivery) | ✓ | — | ✓ redelivery → `duplicate: true` | — |
| Out-of-order delivery | ✓ (late failure event doesn't roll back) | by design (state always re-fetched) | by design | — |
| Reconciliation (missed webhook) | ✓ | — | — | — |
| Webhook burst | ✓ 240 deliveries, 0 errors, dedupe exact (load test) | — | — | — |

Suites: `billing.test.ts` (17), `providers.test.ts` (6), `provider-flow.test.ts` (8), E2E `commercial-flow` (simulator checkout through the UI). All pass on PGlite and real PostgreSQL.

## Defects found in this phase
- **Paddle checkout:** the adapter passed our post-payment return URL as the transaction's `checkout.url`. In Paddle Billing that field is the page that **hosts** Paddle.js checkout.
  - **Fixed:** the field is no longer passed, so the dashboard default payment link applies.
  - **Still blocked:** the Paddle path also needs a checkout page in this app that loads Paddle.js with a client-side token, plus a CSP allowance for Paddle's CDN. **Until that exists, Paddle checkout won't work.** (P0 if Paddle is chosen.)

## Provider-specific behaviour not yet verified (requires sandbox)
- Stripe:
  - Checkout with test cards: success; decline; 3-D Secure (`4000 0025 0000 3155`).
  - Test clocks for renewal, failure and trial-end paths.
  - Customer Portal configuration (plan changes allowed? cancellation mode?) and how its changes arrive as webhooks.
  - Tax (Stripe Tax registration).
  - Invoice email settings.
- Paddle:
  - Checkout page (to be built).
  - Sandbox simulations for subscription lifecycle events.
  - Customer portal session URLs.
  - Payout and tax handling as merchant of record.
  - India seller onboarding confirmation.
- Both:
  - Webhook retry and backoff behaviour against our endpoint under failure.
  - Event types actually emitted for each portal action.
  - Currency and tax display on invoices.

## Sandbox runbook (execute when test keys exist)
1. **Configure.** Set `BILLING_PROVIDER=stripe|paddle`, test keys, test prices in `BILLING_PRICE_*`, and register the webhook endpoint (the provider CLI forwarder is fine for local).
2. **Run the scenarios:**
   1. checkout success
   2. decline
   3. upgrade
   4. downgrade (allowed and refused)
   5. seat increase
   6. cancel at period end, then resume
   7. cancel and let the period end (test clock or simulation) → read-only
   8. failed renewal → grace → recovery
   9. portal: update payment method, view invoice
   10. resend a webhook → duplicate
   11. drop a webhook → reconciliation repairs
3. **Check after each step:**
   - `/api/w/:id/billing` entitlements
   - `billing_event` statuses
   - owner emails
   - audit log
   - `npm run db:check`
4. **Record** results in this file with dates and event ids. Never use real cards.
