> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# Data Processing Agreement (draft skeleton)

Between **[CUSTOMER NAME]** ("Customer", controller) and **[LEGAL ENTITY NAME]**, [COUNTRY] ("Meridian", processor). Forms part of the Meridian Terms of Service / order form dated [DATE].

> COUNSEL: Align with GDPR Art. 28 / UK GDPR, DPDP Act Data Fiduciary–Processor requirements, and US state "service provider" terms as applicable. Decide whether SCCs/IDTA are incorporated by reference here.

## 1. Subject matter and duration
Meridian processes Customer Personal Data to provide the Meridian stakeholder-intelligence service. Duration: the term of the agreement plus the deletion/return period in §11.

## 2. Nature and purpose
Hosting, storage, retrieval, display, search, export and deletion of workspace content; computing rule-based signals and metrics; AI-assisted extraction, briefings and question answering on Customer's request; sending service and notification email to Customer's users.

## 3. Data subjects
- Customer's users (employees and contractors with workspace access).
- Stakeholders recorded by Customer (e.g. client contacts, officials, partners, community members) — people who do not themselves use Meridian.
- Individuals named in meeting notes or transcripts uploaded by Customer.

## 4. Categories of personal data
- User: name, work email, role, activity attribution.
- Stakeholder: name, title/role, organization, tags, Customer-recorded influence/stance/interest ratings, relationships, engagement history, decisions and commitments involving them, free-text notes.
- Free text and transcripts may contain any data Customer chooses to enter.
- **Special categories:** not intended. Customer will not submit special-category or sensitive personal data unless [COUNSEL: prohibition or conditions].

## 5. Customer instructions
Meridian processes Customer Personal Data only on Customer's documented instructions (these terms, the DPA and Customer's use of product settings), unless required by law, in which case Meridian will inform Customer where legally permitted.

## 6. Processor obligations
- Confidentiality commitments for personnel with access. [COUNSEL]
- Implement the measures in Annex A.
- Use subprocessors only per §9.
- Assist with data-subject requests (§7), security, breach notification (§8) and impact assessments to the extent reasonable, at [COST TERMS].
- Delete or return data at the end of the service (§11).
- Make available information needed to demonstrate compliance (§10).

## 7. Data-subject requests
Self-service tools available to Customer: record editing and archiving, full workspace export (JSON), personal data export and account closure for users, restricted stakeholders (Professional plan), workspace deletion. If Meridian receives a request directly from a data subject about workspace content, it will [forward it to Customer within [PERIOD] and not respond substantively unless instructed]. [COUNSEL]

## 8. Personal data breach
Meridian will notify Customer without undue delay and within **[NOTIFICATION TIMELINE — LEGAL/BUSINESS DECISION]** after becoming aware of a personal data breach affecting Customer Personal Data, with the information then available (nature, categories and approximate numbers, likely consequences, measures taken) and updates as they become available. Notification will go to [CUSTOMER SECURITY CONTACT / WORKSPACE OWNERS]. Template: `docs/support/incident-communication-templates.md` (data-incident notice).

## 9. Subprocessors
- Current list: [subprocessors.md](subprocessors.md) (not final; several providers undecided).
- General authorisation to engage subprocessors, with [NOTICE PERIOD] advance notice of changes via [CHANNEL] and a right to object on reasonable grounds. [COUNSEL]
- Meridian imposes data-protection terms on subprocessors no less protective than this DPA and remains responsible for them.
- The AI model provider is engaged **only if** Meridian enables a model for Customer's environment.

## 10. Audits
[AUDIT RIGHTS — BUSINESS/LEGAL DECISION: e.g. written security questionnaire annually; third-party report when available; on-site audit only where required by law, on notice, at Customer's cost]. Meridian holds no certifications or third-party audit reports today.

## 11. Deletion and return
- During the term: Customer can export the workspace at any time it has admin access and schedule deletion (Owner). Deletion completes after a 14-day cooling-off period and permanently removes the workspace; an audit entry with workspace id and name is kept.
- After a subscription ends: workspace kept read-only for 90 days for export, then locked; deleted on Customer's request or [AFTER PERIOD — DECISION PENDING; automatic purge not implemented].
- Export files expire after 7 days.
- Backups: deleted data persists in backups until they expire after [BACKUP RETENTION — to be configured; runbook proposes 30 days].

## 12. International transfers
Data hosted in [HOSTING PROVIDER / REGION]. Transfers to subprocessors outside [REGION] rely on [TRANSFER MECHANISM — e.g. SCCs, UK Addendum/IDTA, DPDP permitted-country rules]. [COUNSEL]

## 13. Liability
Subject to the liability terms in the main agreement. [COUNSEL]

---

## Annex A — Technical and organizational measures
Only controls that exist in the product today, or that are explicitly marked as pending.

| Control | Status |
|---|---|
| **Tenant isolation:** PostgreSQL row-level security on every customer table plus application checks; cross-tenant access covered by automated tests | Implemented |
| **Access control:** role-based permissions (Owner, Administrator, Manager, Contributor, Viewer) enforced server-side; restricted stakeholders visible only to listed people and admins; billing owner-only | Implemented |
| **Authentication:** passwords hashed by the auth library (Better Auth); email verification required; reset links single-use, 1-hour expiry, other sessions signed out on reset; sessions expire after 7 days of inactivity; secure, HTTP-only cookies in production | Implemented |
| **MFA / SSO** | Not available |
| **Encryption in transit:** TLS terminated at the deployment's proxy | [TO BE CONFIRMED AT DEPLOYMENT] |
| **Encryption at rest** | [TO BE CONFIRMED — depends on hosting provider] |
| **Audit log:** sign-ins, membership, role, billing and data-management events | Implemented (Professional and above in-app) |
| **Application protection:** rate limiting on API, AI, invitation and contact endpoints; security headers; strict Content-Security-Policy in production | Implemented (rate limiter is per process) |
| **Secrets and logs:** request logs exclude bodies; AI usage records hold counts/cost, not content; email log holds no bodies or links; billing webhook payloads not stored | Implemented |
| **AI safeguards:** retrieval under the requesting user's row-level security; untrusted text fenced; model has no write tools; every AI-created record requires human acceptance | Implemented |
| **Payment data:** card details only on the billing provider's hosted pages; only brand and last 4 stored | Implemented |
| **Backups and restore:** managed Postgres with point-in-time recovery and daily logical backups per deployment runbook | [TO BE CONFIGURED — not yet rehearsed] |
| **Deletion and return:** export, scheduled deletion with cooling-off, account closure | Implemented |
| **Error tracking and alerting** | [NOT YET INTEGRATED] |
| **Independent security review / penetration test** | [NOT YET PERFORMED] |

## Annex B — Subprocessors
See [subprocessors.md](subprocessors.md).

## Annex C — Transfer terms
[SCCs / UK Addendum / other — COUNSEL]
