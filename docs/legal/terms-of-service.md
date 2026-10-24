> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# Meridian Terms of Service (draft skeleton)

Last updated: [DATE]

These terms are an agreement between [LEGAL ENTITY NAME], [COUNTRY] ("Meridian", "we") and the organization that creates or subscribes to a Meridian workspace ("Customer"). Meridian is a business service.

> COUNSEL: Confirm structure (click-through ToS + order form for Enterprise), B2B-only positioning, and which clauses change if Paddle is the merchant of record (Paddle then sells to the Customer under its own buyer terms; see §7).

## 1. Definitions
"Workspace", "Customer Data" (all content submitted to a workspace, including personal data about stakeholders), "User" (a person with access to a workspace), "AI Features", "Subscription", "Billing Provider" ([BILLING PROVIDER]). [COUNSEL]

## 2. Accounts
- Users register with a name, work email and password (minimum 10 characters) and must verify their email before creating or joining a workspace.
- Users are responsible for keeping credentials confidential. Multi-factor authentication and single sign-on are **not available** today.
- A person accepting an invitation must sign in with the invited email address.
- Customer is responsible for its Users' activity in its workspaces.

## 3. Workspaces and roles
- The User who creates a workspace becomes its Owner. Roles: Owner, Administrator, Manager, Contributor, Viewer, with server-enforced permissions. Only Owners manage billing or request workspace deletion.
- A workspace must always keep at least one Owner.
- Removing a member, or a member closing their account, does not delete the shared records they created; authorship is removed.

## 4. Customer Data
- **Customer owns Customer Data.** Meridian processes it only to provide the service and as described in the [DPA](dpa.md), which forms part of these terms. [COUNSEL: incorporation mechanism]
- Customer grants Meridian a limited licence to host, process and display Customer Data to provide the service.
- Customer may export its workspace at any time it has admin access, including during the read-only period (§8).
- Meridian's first-party product analytics do not include Customer Data content.

## 5. Acceptable use
Customer and Users must not:
- use the service unlawfully, or record personal data about any person without a lawful basis;
- upload malware, attempt to access other tenants' data, probe or bypass security or rate limits, or interfere with the service;
- resell the service or use it to build a competing product [COUNSEL];
- use the service for [PROHIBITED USES — COUNSEL].

**Stakeholder personal data.** Customer is solely responsible for having a lawful basis to record personal data about stakeholders, for providing any notice those people are entitled to, and for handling their requests. Influence, stance and interest values are judgements recorded by Customer's team, not computed by Meridian.

## 6. AI Features
- AI Features (meeting intelligence, briefings, copilot) run on a built-in rules engine, or on a large language model when Meridian enables one. The engine used is labelled in the product. See the [AI data processing disclosure](ai-data-processing-disclosure.md).
- **Outputs are suggestions that require human review.** They may be incomplete or wrong. Customer is responsible for decisions made using them.
- **Nothing is created in a workspace from AI output without a User's approval.** Extracted decisions, commitments and actions are proposals until accepted, and acceptance re-checks the User's permissions.
- AI usage is limited by a monthly allowance per plan (and any lower cap an admin sets). When the allowance is reached, model-based features stop until the next month; there are no overage charges. The rules engine is not metered.
- AI features are unavailable while a workspace is read-only.

## 7. Plans, trials, fees and taxes
- **Trial:** each new workspace starts a 14-day free trial of the Professional plan for up to 10 people. No payment card is required. A person may start up to 2 trials; further workspaces need a paid plan.
- **Plans:** Starter, Professional (self-serve) and Enterprise (by order form). Features and seat limits are described at [PRICING PAGE URL]. Prices: [PRICES — NOT YET APPROVED].
- **Billing:** monthly or annual, per seat, charged in advance through [BILLING PROVIDER]'s hosted checkout. Seats used = active members + pending invitations.
- **Changes:** upgrades and seat changes are prorated by the Billing Provider. Downgrades below the seats in use are not allowed.
- **Fees and taxes:** [DEPENDS ON MERCHANT OF RECORD]
  - If **Paddle**: Paddle is the merchant of record; it sells the subscription to Customer, invoices, collects and remits taxes, and its buyer terms apply to the payment.
  - If **Stripe**: Meridian is the seller and is responsible for [TAX REGISTRATION / COLLECTION]; fees exclude taxes unless stated.
- **Refunds:** [REFUND POLICY — BUSINESS DECISION; may be constrained by the merchant of record's policy].
- **Invoices** are available through the Billing Provider's customer portal, linked from Settings › Billing history.

## 8. Renewal, cancellation and non-payment
- Subscriptions renew automatically at the end of each period until cancelled. [COUNSEL: auto-renewal notice requirements]
- **Cancellation** by an Owner takes effect at the end of the current paid period; access continues until then and cancellation can be undone before it takes effect.
- **Failed payment:** the Billing Provider retries; full access continues for 14 days from the first failure, then the workspace becomes read-only until paid.
- **After a subscription or trial ends:** the workspace is **read-only for 90 days** (view, export, manage billing, remove members, delete data), then locked (billing and data management only). Ending a subscription does not delete data.
- Fees already paid are non-refundable except as stated in §7. [COUNSEL]

## 9. Suspension
Meridian may suspend access (workspace locked; billing and data management remain available) for [GROUNDS — e.g. material breach of §5, security risk, legal requirement], with notice where practicable. [COUNSEL]

## 10. Termination and data
- Customer may stop using the service at any time; an Owner may schedule workspace deletion, which completes after a 14-day cooling-off period unless cancelled, and stops any active subscription. Deletion is permanent.
- Users may close their own accounts; the last Owner of a workspace must first transfer ownership or schedule deletion.
- Workspace exports (JSON) are prepared in the background and available for download for 7 days.
- Retention of a lapsed workspace beyond the read-only period: [DECISION PENDING — automatic purge not implemented].
- Meridian may terminate for [GROUNDS] on [NOTICE PERIOD]. [COUNSEL]

## 11. Service availability and support
No uptime commitment or service-level agreement is offered. Support: [SUPPORT CHANNEL, HOURS — BUSINESS DECISION]. Planned features (e.g. SSO) are not commitments.

## 12. Warranties and disclaimers
[COUNSEL]. Note: Meridian holds no security or compliance certifications.

## 13. Limitation of liability and indemnities
[LIABILITY CAP], [EXCLUSIONS], [INDEMNITIES — incl. Customer indemnity for unlawful stakeholder data]. [COUNSEL]

## 14. Confidentiality
[COUNSEL]

## 15. Changes to these terms
[NOTICE METHOD AND PERIOD]. [COUNSEL]

## 16. Governing law and disputes
Governed by the laws of [GOVERNING LAW]; disputes resolved in [VENUE / ARBITRATION]. [COUNSEL — depends on entity country]

## 17. Contact
[LEGAL ENTITY NAME], [ADDRESS], [LEGAL CONTACT EMAIL]
