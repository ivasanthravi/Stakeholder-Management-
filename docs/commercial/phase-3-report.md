# Phase 3 Report: The Commercial SaaS

**Status: commercially complete in code, not launch-ready.** Everything a self-serve customer needs is built and verified by automated tests: discover, compare, sign up, onboard, invite, pay, manage, cancel, export and delete. Launch still depends on business decisions (legal entity, provider, prices), legal documents, provider sandbox verification and production operations. See [launch-blockers.md](launch-blockers.md).

## 1. Implemented commercial functionality
| Area | What exists |
|---|---|
| Pricing & packaging | Starter / Professional / Enterprise in `shared/plans.ts`. Hybrid per-seat model with a pooled AI allowance, 14-day no-card Professional trial, monthly + annual. Prices withheld until approved ([pricing-strategy.md](pricing-strategy.md)) |
| Entitlements | One service (`server/billing/entitlements.ts`) with server-side enforcement: feature gates (402 `plan_required`), read-only/locked access (402 `subscription_inactive`), race-safe seat limits (402 `seat_limit`), trial abuse limit, AI allowance with atomic reservation. Billing status is kept distinct from application access |
| Billing | Provider-agnostic interface with **Stripe and Paddle adapters** (founder's entity undecided) plus a development simulator. Covers hosted checkout, customer portal, plan/seat/interval changes with proration, cancel at period end, resume, invoices and payment-method summary. Webhooks are signature-verified, deduplicated, order-independent, processed by durable jobs and reconciled daily. Live keys are refused without explicit approval ([billing-architecture.md](billing-architecture.md)) |
| Marketing site | Homepage (10-beat narrative) plus Product, Features, Stakeholder Intelligence, Relationship Mapping, AI, Pricing, Security and Contact. Every claim is checked against [product-facts.md](product-facts.md) |
| Onboarding | Sign-up → verify → workspace + industry template (8) → guided, skippable, resumable setup (workspace, first initiative, stakeholders, invites) → Command Center. Vocabulary is applied across navigation ([onboarding-design.md](onboarding-design.md)) |
| Invitations | Secure single-use tokens, expiry, resend (rotates the link), revoke, seat enforcement, existing vs new user handling, no workspace leakage on invalid links, invite rate limits, inviter notification |
| Email & notifications | 19 responsive templates (HTML + text), Postmark transport, delivery log without bodies, retries, per-type preferences, RFC 8058 one-click unsubscribe, in-app inbox, daily commitments digest, decision assignment ([notification-system.md](notification-system.md)) |
| Account & billing UI | Profile, notifications & privacy, security (password change, sessions), members (seats, resend/revoke), roles matrix, subscription, billing history, usage, AI, audit, data management. Access banner and a non-blocking upgrade prompt |
| AI commercial controls | Phase 2 metering is now linked to plans: effective limit is the lower of the plan allowance and the admin cap. Concurrency-safe, no overage, calm limit messaging, admin usage view |
| Data | Background workspace export (7-day download), personal export, scheduled workspace deletion (14-day cooling-off, cancelable, audited), account closure that keeps shared records |
| Analytics | First-party, allow-listed events (no record content), opt-out. Activation, time-to-first-value, trial-conversion and churn events, with an operator funnel endpoint |
| Contact / sales | Public form with honeypot, per-IP rate limit, routed to `SALES_EMAIL` |

## 2. Verified billing workflows
**Verified through the development simulator.** It signs and delivers webhooks over the real public endpoint, so the production ingestion path runs. Flows verified:
- checkout success and decline (redirect alone doesn't activate)
- activation emails
- upgrade with proration call and downgrade refusal
- cancel at period end and resume
- renewal → canceled → read-only → re-purchase
- payment failure → grace → read-only → recovery
- trial expiry
- duplicate, forged, tampered and replayed webhooks
- out-of-order events
- reconciliation of a missed webhook

**Stripe and Paddle adapters are verified offline.** Signatures were checked with each SDK's own signing scheme, and subscriptions mapped from fixture API responses. **Real sandbox runs were not executed** (no keys). A checklist is in [test-results.md](test-results.md). **No real charge was ever initiated.**

## 3. Onboarding demonstration
The E2E test `commercial-flow.spec.ts` runs the journey in Chrome:
1. Visitor sees the marketing home and pricing; no prices are shown anywhere.
2. Owner signs up and verifies.
3. Owner creates "E2E Rail Partners" with the Construction template.
4. Owner creates the first *project*, adds a stakeholder and invites a teammate.
5. Owner lands in the Command Center, where the nav reads "Projects".
6. The teammate creates an account from the invite link and joins.
7. The owner buys Starter through the hosted checkout page; access waits for the webhook.
8. The server refuses meeting intelligence on Starter.
9. The owner cancels at period end; access continues.

## 4. Marketing website status
- **Built:** all 9 public pages, light-first, using the product's own tokens and type, with real product screenshots (fictional sample data, labelled).
- **Motion:** restrained reveals and scroll drift, honouring reduced motion.
- **Checks:** axe-clean, and no overflow at 1440, 834 and 390.
- **Not yet:** legal pages (blocker), dark mode, and focus-trap in the mobile menu (Esc closes it).
- **Deployment:** not deployed; **no public URL exists.**

## 5. Security findings
**Implemented and tested:**
- Server-side entitlements on every tenant route.
- Owner-only billing controls, with admin read access.
- Signature verification against the raw body and replay tolerance (simulator 5 min; SDK defaults for Stripe and Paddle).
- Event dedupe on a unique key; webhook payloads not stored or logged.
- Live-key guard.
- No card data handled; only brand and last-4 are stored.
- Invitation tokens hashed, rotated on resend, and neutral on invalid links.
- Seat checks under row locks.
- Atomic AI reservation.
- Typed confirmation for destructive actions; deletion cooling-off with an audit trail.
- System tables (billing events, jobs, email log, analytics, data requests) under RLS with **no** `app_user` grants.
- Notification titles and email subjects free of stakeholder details.
- Digest queries run under the recipient's own RLS context.
- Unsubscribe tokens hashed and rotated, with GET-confirm / POST-act.
- Contact form honeypot and rate limit.

**Open:**
- No MFA.
- In-memory rate limiter (per process).
- Exports stored on local disk (needs private object storage).
- No Postmark bounce suppression.
- The contact form sends one confirmation to whatever address is entered (rate-limited at 5 per IP per hour; review for abuse).
- No independent security review.

**No compliance certification is claimed anywhere.**

## 6. Performance findings
Local production build, no network throttling:
- **Marketing home:** LCP 1.1 s desktop / 1.3 s mobile (4× CPU), CLS 0.000.
- **Pricing:** LCP 0.8 s / 0.4 s.
- **Bundles:** initial app JS ≈ 152 kB gzip; marketing pages +32 kB gzip, lazy-loaded.
- **Images:** 13 WebP screenshots, 1.7 MB in total, responsive and lazy-loaded.
- **Background work:** done by jobs, so webhooks respond immediately.
- **Not measured:** field data and load testing.

## 7. Visual QA results
Every priority surface went through BUILD → RUN → INSPECT → CRITIQUE → REFINE → RETEST at desktop, tablet and mobile: homepage, pricing, signup/onboarding, checkout, billing management and the invitation flow.

**Findings fixed:**
- **Marketing:** mobile menu clipped by its header, mis-anchored screenshot pins, link colours overridden, empty "Everything in Professional, plus:" list, dark-band frames, blurry upscaled crops, collage overlap, accent line crossing the CTA headline.
- **Onboarding:** indented preview list, mobile step card floating, footer wrapping, redundant error banner (focus now goes to the first invalid field), dark-mode colour misuse, wrong-user CTA.
- **Billing UI:** wrapping figures, misaligned plan cards (subgrid), two primary buttons, the typed-confirm dialog not taking focus, unreliable inbox focus, banner close button placement on mobile.
- **Integration fixes (mine):**
  - duplicate error toast plus upgrade prompt on restrict
  - mark-read refetching everything
  - error details lost on the client
  - plain-text emails dropping link URLs (unsubscribe link missing)
  - first-name matching attributing people to the wrong stakeholder (Phase 2 carry-over)
  - two axe "scrollable region not focusable" findings
- **Sweep result:** 98/98 views clean on axe; no console errors; no overflow.

## 8. Test execution results
- Typecheck clean.
- **Vitest 108/108.** New suites:
  - `billing.test.ts` (17)
  - `providers.test.ts` (6)
  - `commercial.test.ts` (14)
  - additions to AI and extract suites
- **Playwright 11/11.**
- **Axe sweep 98/98.**
- **Build OK.**

All 18 required scenarios are mapped to executed tests in [test-results.md](test-results.md).

## 9. Known limitations
- **No real-provider sandbox runs** (no keys); Postmark not exercised; PGlite only.
- **Prices unapproved:** checkout works only for configured price ids.
- **Enterprise SSO is "Planned".** MFA, integrations, a public API and custom fields don't exist.
- **Operator tools:** suspend/comp/extend trial is manual SQL.
- **Templates can't add custom fields**, because the field system doesn't exist yet.
- **Not reviewed:** dark mode on the new surfaces.
- **Onboarding:** skipped steps aren't marked complete (deliberate), and the mobile progress bar isn't clickable.
- **Simulator state** persists in `.data/billing-simulator.json` (development only).
- **Shared dev workspace changed during QA.** The sample workspace is now on an active Professional simulator subscription. `npm run db:reset` restores a trial.

## 10. Remaining launch blockers
Summarised from [launch-blockers.md](launch-blockers.md):
- Entity and provider decision, plus provider confirmation.
- Price approval.
- Terms of service, privacy policy, DPA, subprocessor list.
- Retention confirmation.
- AI provider data terms.
- Tax.
- Provider sandbox and Postmark verification.
- Real Postgres.
- Bounce handling.
- Object storage.
- Shared rate limiting.
- Error tracking and alerts.
- MFA, and SSO before selling Enterprise.
- Operator tooling.
- Security review.
- Hosting, TLS and domains.
- Backup restore rehearsal.
- Support process.
- Status page.

## 11. Phase 4 recommendations
1. **Go-to-market verification sprint.**
   - Decide the entity and provider, then run the sandbox checklist end to end with test keys.
   - Approve prices and wire them up.
   - Configure Postmark and DNS.
   - Deploy to a staging environment on managed Postgres.
2. **Trust & security.** MFA (TOTP), SSO/SAML + SCIM for Enterprise, session management UI, independent penetration test, security page and DPA.
3. **Operator console.** Search workspaces, extend trials, comp plans, suspend, view billing events and dead jobs.
4. **Activation.** Optional removable sample data per template, an in-app checklist on Home driven by the onboarding state, and calendar/email import for engagements (the biggest time-to-value lever).
5. **Measure.** Ship the funnel dashboard on `/api/operator/metrics` and set activation and trial-conversion targets after 30 days of real traffic.
6. **Platform.** Object storage for exports, a Redis rate limiter, error tracking, and CI running typecheck, Vitest, Playwright, axe and `npm audit`.
