> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# Subprocessor inventory (draft)

Only providers referenced in the engineering docs are listed. **No provider has been contracted for production yet** and no production deployment exists. Do not publish this list until each row is "Contracted" and its location is known.

| Provider | Purpose | Personal data processed | Location | Status | Trigger for listing |
|---|---|---|---|---|---|
| [HOSTING PROVIDER] (application servers) | Run the app and job workers | All service data in transit/processing | [REGION] | **Undecided** | Production hosting chosen (launch blocker 19) |
| [DATABASE PROVIDER] (managed PostgreSQL, backups) | Store all service data; point-in-time recovery and backups | All stored data | [REGION] | **Undecided** (may be the same as hosting) | Database provider chosen |
| [OBJECT STORAGE PROVIDER] | Store workspace export files (7-day lifetime) | Full workspace exports | [REGION] | **Undecided** — exports are on local disk today; object storage is a launch blocker for multi-instance | Object storage implemented |
| Postmark | Transactional email: verification, reset, invitations, billing and data notices, notification emails, contact-form routing | Recipient name and email, email content (subjects never name stakeholders) | [LOCATION — confirm] | **Planned** (transport implemented, not yet configured or verified) | Postmark account and sending domain set up |
| Stripe **or** Paddle | Hosted checkout, subscriptions, invoices, customer portal. Paddle would be merchant of record | Billing contact, company, payment details (entered on provider's page), subscription data | [LOCATION — confirm] | **Undecided — exactly one will be used** | Entity and billing provider decision (launch blocker 1) |
| Anthropic (Claude) | Large language model for AI features | Text of records the requesting user can access, meeting notes/transcripts submitted for analysis, copilot questions | [LOCATION — confirm] | **Conditional** — used only if the operator configures an API key; off by default (rules engine) | Decision to enable a model after reviewing provider data terms (launch blocker 6) |
| [ERROR TRACKING PROVIDER] | Application error reporting | [TBD — configure to exclude request bodies and personal data where possible] | [REGION] | **Undecided** — none integrated | Error tracking added (launch blocker 15) |

Not subprocessors today: no third-party analytics, advertising, chat-widget, CRM or support-desk tools are integrated. If a support desk or status-page provider is adopted, add it here first.

> COUNSEL: Confirm whether the merchant-of-record (Paddle) is a subprocessor, an independent controller, or both, and how to present it.
