# Billing support procedures (internal)

Reference: `docs/commercial/billing-architecture.md`, `app/shared/plans.ts`. Billing provider: **[BILLING PROVIDER — Stripe or Paddle, undecided]**. Prices are **not approved**: tell customers "pricing on request" and route to sales.

## Trials
- Every new workspace gets a **14-day Professional trial, up to 10 people, no card**.
- Each person can start **2** trials. A third workspace starts without a trial and is read-only until a plan is bought (the app shows "needs a plan").
- Owners get a trial-ending reminder once, and an email when it ends.
- After the trial ends without a purchase: **read-only for 90 days**, then locked. Data is kept.
- Trial extensions: no self-serve or console tool. **[BUSINESS DECISION: who may approve extensions]**; if approved, engineering applies it (see Guardrails).

## Plans, seats and AI allowance
| Plan | Seats | AI tokens / seat / month | Notes |
|---|---|---|---|
| Starter | up to 5 | 150,000 | Copilot, briefings |
| Professional | up to 100 | 600,000 | + meeting intelligence, path finder, restricted records, audit log |
| Enterprise | by contract | 1,000,000 | Sales-led; SSO is **planned, not available** — never sell it as available |
| Trial | 10 | 1,000,000 per workspace | Professional features |

- **Seats used** = active members + pending invitations. Revoking unused invitations frees seats.
- Adding seats or upgrading is prorated by the provider. **Downgrades below seats in use are refused** — remove members or revoke invitations first.
- Losing a feature on downgrade never deletes data.
- **AI allowance** = min(plan allowance, admin cap in Settings › AI), pooled per workspace per calendar month. At the limit, model features stop with a "limit reached" message until next month. No overage billing. The rules engine is never metered. Admins see usage in Settings › Usage / AI.

## Checkout
- Owners only. Checkout happens on the provider's hosted page; the app shows "Confirming…" until the provider's webhook arrives. **A return to the app alone does not activate a plan.**
- Stuck on "Confirming…" for more than [N] minutes → escalate (see below).

## Failed payment and grace
- Provider retries the card. Owners get a "payment failed — full access until …" email.
- **Full access for 14 days from the first failure**, then read-only until paid. Recovery email when paid.
- Tell the customer to update the payment method in the provider's portal (Settings › Subscription → manage billing). Never take card details.

## Cancellation and resume
- Owner cancels in Settings › Subscription. Always **at period end**; full access continues until then.
- **Resume** undoes a scheduled cancellation before the period ends.
- After the period ends: read-only for 90 days, then locked. Re-purchasing restores full access.

## Read-only and locked workspaces
- **Read-only:** view everything; export; manage billing; remove members and invitations; manage notifications; delete data and copilot history. No edits, no AI.
- **Locked** (after 90 days read-only, or suspended): billing and data routes only.
- Point customers to **Settings › Data management → Export workspace** (JSON, ready in the background, downloadable for 7 days by Admins/Owners).
- Nothing is deleted automatically. Lapsed-workspace purge policy: **[PENDING LEGAL REVIEW]**.

## Refunds
**[BUSINESS DECISION — depends on provider.]** With Paddle (merchant of record), refunds are issued through Paddle under its policy; with Stripe, through the Stripe dashboard. Until a policy exists, do not promise refunds; escalate to [REFUND APPROVER].

## Invoices and receipts
Settings › Billing history lists invoices from the provider; the provider's customer portal has downloadable copies. Tax details on invoices: [DEPENDS ON PROVIDER]. Admins can view billing; only Owners can change it.

## Guardrails — what support must never do
- **Never ask for, accept or record card numbers**, CVCs or bank details. If a customer sends them, delete the message, tell them not to, and point them to the portal.
- **Never change subscription state in the database to "fix" billing.** State must come from the provider and reconciliation. Make the change in the provider dashboard, then let the webhook/daily reconcile (or the in-app refresh) apply it.
- Comp plans, trial extensions and suspensions currently require **operator SQL** (subscription with provider `manual`). Only [AUTHORISED OPERATORS], only with a written approval and an **audit note** (ticket id, who, why, before/after values). No operator console exists yet.
- Never quote unapproved prices or promise unreleased features (SSO, MFA, integrations, API, custom fields).

## Escalate to engineering
Escalate to [ENGINEERING ON-CALL / CHANNEL] with workspace id, provider customer/subscription id, timestamps and what the customer sees, when:
- the provider shows paid/active but the app doesn't after [N] minutes;
- webhook errors (rejected signatures, dead `billing.sync` jobs, `billing_event` failures);
- seat counts or access level look wrong.

Runbook: `docs/commercial/billing-architecture.md` (state model, webhooks, reconciliation) and `docs/commercial/deployment.md` (dead jobs, restore). Daily `billing.reconcile` re-syncs every provider-backed subscription.
