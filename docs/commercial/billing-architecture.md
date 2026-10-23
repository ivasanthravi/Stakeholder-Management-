# Billing Architecture

## Provider evaluation (sources accessed 2026-10-23)

| | Stripe Billing | Paddle Billing | Razorpay Subscriptions |
|---|---|---|---|
| Merchant of record (tax liability) | No: you register and file (Stripe Tax calculates and collects) | **Yes**: Paddle collects and remits | No |
| India-registered business | **Invite-only.** Stripe support: "Stripe services are invite-only in India"; stripe.com/global lists India as "Preview" | Accepted (sanctioned countries excluded; India not on the list). India payout mechanics not confirmed on an official page | Yes (an India entity is required) |
| US/UK/EU business | Self-serve | Accepted | — |
| Fees (as published) | Billing 0.7% of billing volume; Tax 0.5% per transaction (no-code); card processing extra (only India-page rates were retrievable) | 5% + 50¢ per checkout transaction (covers tax, MoR, fraud) | 2% domestic, up to 3% international, plus 0.9% for subscriptions on cards; GST on fees |
| Seats, proration, trials, cancel at period end, portal | Yes | Yes (proration modes; cardless trials; hosted portal) | Partial: proration only on immediate updates; no customer portal found |
| Webhooks | `Stripe-Signature` HMAC-SHA256 over `t.body`; retries up to 3 days; **no ordering guarantee**; duplicates possible | `Paddle-Signature` `ts;h1` HMAC-SHA256 over `ts:body`; respond within 5 s; retries about 2 days; **no ordering guarantee** | Retries for 24 h, then the endpoint is disabled; order not guaranteed |
| Sandbox | Test mode / sandboxes | `sandbox-api.paddle.com` | Test mode |

**Recommendation:**
- **India entity:** Paddle (after written confirmation of onboarding and payouts from Paddle).
- **US/UK/EU entity:** Stripe, plus Stripe Tax or Managed Payments.

**The founder hasn't decided yet, so both adapters are implemented behind one interface.** `BILLING_PROVIDER` chooses the provider at deploy time.

Sources:
- https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india
- https://stripe.com/global
- https://stripe.com/billing/pricing
- https://stripe.com/tax/pricing
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/billing/subscriptions/prorations
- https://www.paddle.com/pricing
- https://www.paddle.com/help/legal/sanctions/which-countries-are-supported-by-paddle
- https://developer.paddle.com/webhooks/signature-verification
- https://developer.paddle.com/webhooks/respond-to-webhooks
- https://developer.paddle.com/build/subscriptions/add-remove-products-prices-addons
- https://razorpay.com/pricing/
- https://razorpay.com/docs/webhooks/best-practices/
- https://razorpay.com/docs/payments/subscriptions/update/

## Components
```
shared/plans.ts            plan catalog, features, limits, access policy (accessFor), allowance — single source of truth
shared/pricing.ts          public display prices (all unapproved → "Pricing on request")
server/billing/
  provider.ts              BillingProvider interface + normalised SubscriptionSnapshot / VerifiedEvent
  stripe.ts                Stripe adapter (stripe@23, API 2026-09-30.endive; period read from subscription items)
  paddle.ts                Paddle adapter (@paddle/paddle-node-sdk@3.10)
  simulator.ts             development/test provider: hosted page + HMAC-signed webhooks over the real endpoint; refused in production
  index.ts                 picks the provider from BILLING_PROVIDER
  entitlements.ts          resolve(), entitlementMiddleware, requireFeature, assertSeatAvailable, AI reserve/settle
  sync.ts                  ingestWebhook → billing_event → job → syncSubscription → applySnapshot; reconcile; trials
  notices.ts               transitions → owner emails + inbox
server/modules/billing.ts  /api/w/:id/billing (overview, invoices, checkout, portal, change, cancel, resume, refresh)
                           /api/billing (webhooks/:provider, plans, simulator pages)
server/jobs.ts             durable Postgres job queue
```

## State model
`subscription` has one row per workspace.
- **Billing status** (provider's view of money): `trialing | active | past_due | canceled | expired | suspended | incomplete`.
- **Access** (what people can do) is derived from status and dates by `accessFor()`, and stays separate from billing status:

| Status | Access |
|---|---|
| trialing (before `trialEndsAt`) | full |
| active (incl. `cancelAtPeriodEnd`) | full until period end |
| past_due | full for `pastDueGraceDays` (14) from the first failure, then read-only |
| trial ended / canceled / expired / incomplete | **read-only for `readOnlyRetentionDays` (90)**, then locked |
| suspended | locked |

**Read-only:**
- Every non-GET request is refused with `402 subscription_inactive`, except:
  - billing
  - member and invitation removal
  - notifications
  - data export and deletion
  - copilot history deletion
- AI is unavailable.

**Locked:** only billing and data routes remain usable.

**No status change deletes data.**

### Retention (proposed defaults; confirm against contracts and law)
| Data | Retention |
|---|---|
| Workspace after subscription ends | Kept read-only 90 days, then locked. Not deleted automatically: deletion is an explicit owner request or an operator action after notice (automatic purge is a launch blocker pending legal review). |
| Workspace deletion request | 14-day cooling-off (cancelable), then hard delete. An audit row is kept with the workspace id and name. |
| Workspace export files | 7 days, then purged |
| Billing events | Kept (no payloads stored) |
| Email log | Template, recipient, status (no bodies) |
| Account closure | User row deleted immediately (sessions, memberships, preferences, notifications, copilot history). Shared records stay with the workspace with authorship removed. |

## Flows
**Trial:**
- Workspace creation inserts `trialing / professional / 10 seats / provider none` in the same transaction.
- Each user may start `trialsPerUser` (2) trials. Further workspaces start `incomplete` (read-only until a plan is bought).
- The hourly `billing.trials` job expires ended trials and emails owners once.

**Checkout:**
1. `POST /billing/checkout` (owner): validates the plan (self-serve, price configured) and that seats ≥ usage, then creates a provider-hosted checkout with `workspaceId` in metadata.
2. The browser goes to the provider and returns to `/settings/billing?checkout=success`.
3. **The return proves nothing.** The page shows "Confirming…" and calls `POST /billing/refresh` until the webhook-driven state arrives. Refresh itself only re-fetches from the provider.

**Webhooks:** `POST /api/billing/webhooks/:provider`.
1. Verify the signature over the raw body; reject with 400 without logging the payload.
2. Insert `billing_event (provider, event_id)` with a unique key. A duplicate returns `{duplicate: true}` and stops.
3. Queue `billing.sync` (deduplicated per subscription while queued) and respond 200 quickly. This meets Paddle's 5-second rule.
4. The job **fetches the subscription's current state from the provider** and applies it inside a row lock.

Because embedded event state is never applied, delivery order doesn't matter:
- A late "payment failed" for a now-healthy subscription just re-reads `active`.
- Late events for a superseded subscription can't overwrite a newer live one.

**Durability:**
- Jobs retry with exponential backoff (30 s → 1 h cap, 6 attempts), then go dead.
- Stuck jobs are recovered after 10 minutes.
- Daily `billing.reconcile` re-syncs every provider-backed subscription, which catches missed webhooks.

**Changes:**
- Plan, interval or seat changes go through `updateSubscription`: Stripe `create_prorations`, Paddle `prorated_immediately`.
- The server then re-syncs from the provider.
- Downgrades below used seats are refused (422).
- Losing features never deletes data. Restrictions can still be lifted, and existing analyses stay readable.

**Cancellation:**
- Self-serve cancel is always at period end, and Resume undoes it.
- Renewal past the end moves the workspace to `canceled` (read-only).

**Payment failure:** provider retries; `past_due` → owner email ("full access until …") → recovery email when paid.

**Live-mode safety:**
- Live Stripe keys (`sk_live_…`) and Paddle `production` are refused unless `BILLING_LIVE_APPROVED=true`.
- The simulator is refused in production.
- No card data ever touches this server. The only payment detail stored is the provider-reported brand and last 4.

## Seats
Seats used = active members + pending (unexpired, unrevoked) invitations.
- Invitations and acceptance lock the subscription row (`SELECT … FOR UPDATE`), so concurrent invites can't oversell.
- Trial = 10 seats. Paid = purchased quantity capped by the plan's `seatLimit`. Enterprise = contract quantity.

## AI allowance (Phase 2 integration)
- **Effective monthly limit** = min(plan allowance, admin cap from Settings › AI).
- **Reservation:**
  - A model call first reserves an estimate with one conditional `UPDATE` (`used + reserved + estimate <= limit`), so concurrent requests can't overshoot.
  - After the call it settles the actual tokens (0 for failures, cache hits and cancellations).
- **No overage:** the allowance is a hard stop (`429 quota_exceeded`, with a calm message). The rules engine is never metered.

## Configuration
| Variable | Purpose |
|---|---|
| `BILLING_PROVIDER` | `stripe`, `paddle`, `simulator` (dev only) or `none`. Default: simulator in dev/test, none in production |
| `BILLING_LIVE_APPROVED` | Must be `true` to accept live keys |
| `BILLING_PRICE_{STARTER,PROFESSIONAL}_{MONTHLY,ANNUAL}` | Provider price ids. Unset = not sold |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_ENVIRONMENT` | Paddle (`sandbox` / `production`). Paddle also needs a default payment link in its dashboard |
| `SIMULATOR_WEBHOOK_SECRET` | Development simulator |

**Provider dashboard setup:**
- Point the webhook endpoint at `https://<app>/api/billing/webhooks/<provider>`.
- Events:
  - **Stripe:** `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`.
  - **Paddle:** `subscription.*`, `transaction.completed`, `transaction.payment_failed`.
- Enable the customer portal.
