> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# Legal drafts

Working drafts for Meridian's customer-facing legal documents. They describe the product **as built** (sources: `docs/commercial/product-facts.md`, `billing-architecture.md`, `notification-system.md`, `docs/ai/*`, `app/shared/plans.ts`, `app/server/modules/data.ts`, `app/server/analytics.ts`, `app/server/auth.ts`). They are not legal advice and make no compliance or certification claims. Nothing here is linked from the app or the marketing site.

Placeholders in `[SQUARE BRACKETS]` must be filled before use. `> COUNSEL:` notes are questions for legal review. `> BUSINESS:` notes are decisions for the founder.

## Documents
| File | What it is | Audience |
|---|---|---|
| [privacy-notice.md](privacy-notice.md) | Privacy notice for customers' users and website visitors | Public |
| [terms-of-service.md](terms-of-service.md) | Customer terms skeleton (accounts, plans, trial, AI, data, termination) | Public; linked from checkout (launch blocker 4) |
| [dpa.md](dpa.md) | Data Processing Agreement skeleton, Meridian as processor of workspace content | Customers (B2B) |
| [subprocessors.md](subprocessors.md) | Candidate subprocessor inventory with status | Public, once finalised |
| [ai-data-processing-disclosure.md](ai-data-processing-disclosure.md) | Plain-language explanation of AI data flows | Public / sales |
| [cookie-and-tracking.md](cookie-and-tracking.md) | Inventory of cookies, browser storage and analytics | Internal basis for a cookie notice |

## Open decisions requiring legal review
| # | Decision | Depends on / blocks | Owner |
|---|---|---|---|
| 1 | **Contracting entity**: name, country, registered address, company number | Everything below; billing provider choice | [OWNER — FOUNDER] |
| 2 | **Billing provider**: Stripe (Meridian is the seller; Meridian handles tax registration) or Paddle (Paddle is merchant of record and the seller of record to the customer) | Fees/tax/refund/invoice clauses in ToS; subprocessor list; privacy notice billing section | [OWNER — FOUNDER] |
| 3 | **Hosting and database provider and region**; whether a data-residency option is offered (not available today) | Transfer mechanism; DPA Annex; subprocessor list | [OWNER — ENGINEERING] |
| 4 | **Controller/processor split**: confirm Meridian is processor for workspace content and controller for account, billing, analytics, security logs and website data | Privacy notice structure; DPA scope | [OWNER — COUNSEL] |
| 5 | **Retention periods**: confirm 90-day read-only window, 14-day deletion cooling-off, 7-day export expiry, 30-day default copilot history; set periods not yet defined (analytics events, audit log, email log, billing events, sessions, backups); decide whether lapsed workspaces are purged automatically (not implemented) | Privacy notice retention table; DPA deletion clause | [OWNER — COUNSEL + FOUNDER] |
| 6 | **AI model provider terms**: review Anthropic's commercial/data terms (retention, training, region, zero-data-retention availability) before any real customer data reaches a model | AI disclosure; subprocessor status of Anthropic; DPA | [OWNER — COUNSEL + ENGINEERING] |
| 7 | **Breach notification timeline** to customers | DPA §8; incident templates | [OWNER — COUNSEL] |
| 8 | **Liability cap, warranties, indemnities** | ToS §12–13 | [OWNER — COUNSEL] |
| 9 | **Governing law and venue / dispute resolution** | ToS §16 | [OWNER — COUNSEL] |
| 10 | **Refund policy** (and whether the merchant of record's policy governs) | ToS §7; billing support | [OWNER — FOUNDER] |
| 11 | **Audit rights** offered to customers, and in what form (questionnaire, report, on-site) | DPA §10 | [OWNER — FOUNDER + COUNSEL] |
| 12 | **Error-tracking provider** (none integrated yet) and whether it receives personal data | Subprocessor list | [OWNER — ENGINEERING] |
| 13 | **Support commitments**: hours, response targets, channels (no SLA exists; none offered today) | ToS; support docs | [OWNER — FOUNDER] |
| 14 | **Data-subject request handling for stakeholders** (people recorded by customers who contact Meridian directly) | Privacy notice §8; DPA §7; contact workflow | [OWNER — COUNSEL] |
| 15 | **Account-closure residue**: on closure, email-log rows keep the recipient address and analytics events keep the (now orphaned) user id; audit rows keep IP/user agent of past sign-ins. Decide whether these must be erased or retained, and for how long | Privacy notice; engineering change | [OWNER — COUNSEL + ENGINEERING] |
| 16 | **Contact-form confirmation**: the form sends one confirmation to whatever address is entered (rate-limited 5/IP/hour) | Abuse/privacy review | [OWNER — ENGINEERING] |

## Items requiring jurisdiction-specific advice
- **International transfers.** Data flows to the hosting region, the email provider, the billing provider and (if enabled) the AI model provider. Counsel to identify the transfer mechanism for each (e.g. adequacy, standard contractual clauses, UK IDTA/Addendum) once entity and providers are known.
- **India — Digital Personal Data Protection Act, 2023 and Rules** (if the entity is Indian, or Indian users are served): notice content and language requirements, consent and legitimate-use grounds, Data Fiduciary vs Data Processor contract requirements, breach reporting to the Board and to affected persons, cross-border transfer restrictions, grievance officer contact.
- **EU GDPR / UK GDPR** (if EU/UK customers or users): Article 28 processor terms (DPA), Article 13/14 notices, EU/UK representative (Art. 27) if no establishment, legal bases, transfers, supervisory-authority breach notification.
- **Article 14 position for stakeholder data.** Customers enter personal data about third parties (stakeholders) who never interact with Meridian. Counsel to confirm the customer (as controller) carries the notice obligation and what Meridian must contractually require.
- **US state privacy laws** (e.g. California CCPA/CPRA and other comprehensive state laws): applicability thresholds, service-provider contract terms, "sale/share" analysis (no third-party trackers today), notice at collection.
- **Records of processing** (GDPR Art. 30 or equivalent): one record as controller, one as processor. Not yet prepared.
- **DPIA / risk assessment for AI features**: meeting-note analysis, briefings and copilot over stakeholder data, especially with a model enabled. Not yet prepared.
- **Cookie / ePrivacy rules**: whether the strictly-necessary session cookie and browser storage (see cookie-and-tracking.md) require a banner or only a notice in each target jurisdiction.
- **Consumer vs business terms**: Meridian is B2B; confirm whether any consumer-protection rules still apply (e.g. sole traders, auto-renewal notice laws in some US states).
- **Tax**: VAT/GST/sales tax registration if Stripe is chosen (Meridian is the seller); with Paddle the merchant of record handles collection.
- **Accessibility statement** (launch blocker 8): whether a statement is required in target markets.
