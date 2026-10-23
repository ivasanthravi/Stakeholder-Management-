# Launch Blockers

**The product is not launch-ready.** Each item below must be resolved, and verified where noted, before taking real customers or real money. Owner: F = founder or business decision, E = engineering, L = legal/compliance, O = operations.

## Business decisions (F)
1. **Legal entity and billing provider.** Stripe is invite-only for India-registered businesses; Paddle (merchant of record) is the recommended path for an India entity (billing-architecture.md). Get written confirmation of onboarding and payouts from the chosen provider.
2. **Prices.** Approve prices, currency and intervals (pricing-strategy.md). Create them in the provider, set `BILLING_PRICE_*`, and mark them approved in `shared/pricing.ts`. Until then checkout works only for configured prices, and the site says "Pricing on request".
3. **Plan packaging confirmation:** seat caps, AI allowances, whether SSO moves to mid-tier.

## Legal & compliance (L)
4. **Terms of Service, Privacy Policy, DPA and subprocessor list.** These don't exist yet. The site has no legal pages, and checkout must link to the terms.
5. **Retention periods:**
   - Confirm the 90-day read-only window, the 14-day deletion cooling-off and 7-day export expiry.
   - Decide on automatic purge of lapsed workspaces. It's not implemented, deliberately.
6. **AI provider data terms** reviewed before enabling a model on customer data (Phase 2 requirement).
7. **Tax registration**, if using Stripe (not merchant of record).
8. **Accessibility statement and cookie notice review.** No third-party cookies are used today: the analytics is first-party, with no cookies beyond the session.

## Verification not yet possible here (E)
9. **Provider sandbox runs.**
   - Real Stripe or Paddle sandbox checkout, renewal, failure, upgrade, downgrade and cancel were **not executed**: no sandbox credentials were available.
   - Adapters are verified offline: signatures with the SDKs' own signing helpers, plus mapping against fixture responses.
   - Run `docs/commercial/test-results.md` §Sandbox checklist with test keys.
10. **Postmark.** Real delivery and rendering in Gmail, Outlook and Apple Mail are not verified; rendering was checked in a browser only. Configure SPF, DKIM and DMARC for the sending domain.
11. **Real PostgreSQL.** Everything was tested on PGlite (carried over from Phase 1/2).

## Engineering (E)
12. **Postmark bounce and complaint webhooks**, to suppress hard-bounced addresses.
13. **Object storage for exports.** Required before running more than one instance (files currently live on local disk).
14. **Shared rate-limit store** (Redis) for multi-instance deployments.
15. **Error tracking and alerting** (see deployment.md for the minimum alert set).
16. **MFA, and SSO for Enterprise.** SSO is listed as "Planned"; it must not be sold until built.
17. **Admin/operator tooling** for support: suspend, comp, extend trial. Today this means manual SQL against `subscription` with provider `manual`.
18. **Independent security review / penetration test** of auth, tenancy, billing webhooks and data deletion.

## Operations (O)
19. **Production hosting, TLS, domain and email domain.** No deployment URL exists.
20. **Backups configured and a restore rehearsed** (deployment.md).
21. **Support channel and process:** `SALES_EMAIL` inbox, response targets.
22. **Status page and incident process.**

## Already done (for context)
- Entitlements are enforced server-side.
- Webhooks are signature-verified, deduplicated and order-independent, with durable jobs and reconciliation.
- Trials, read-only and grace policies are implemented.
- Seat limits are race-safe.
- AI allowance uses atomic reservation with no overage.
- Invitations: secure, single-use, resend, revoke, expiry, no leakage on invalid links.
- Templated email with retries, preferences and one-click unsubscribe.
- Workspace and personal export; scheduled deletion with cancel; account closure that preserves shared data.
- First-party analytics with opt-out.
- All verified by automated tests (test-results.md).
