> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# Meridian Privacy Notice (draft)

Last updated: [DATE]

This notice explains how [LEGAL ENTITY NAME], a company registered in [COUNTRY] (company number [NUMBER], registered address [ADDRESS]) ("Meridian", "we"), handles personal data when you use the Meridian application or visit our website.

> COUNSEL: Confirm notice structure and mandatory content for each target jurisdiction (GDPR Art. 13/14, UK GDPR, DPDP Act notice requirements, US state notice-at-collection). Add an EU/UK representative or grievance officer if required.

## 1. Who is responsible for your data
Meridian acts in two roles. **[COUNSEL: confirm this split.]**

| Data | Our role | Who to contact first |
|---|---|---|
| **Workspace content**: everything a customer's team records in a workspace (stakeholders, organizations, initiatives, relationships, engagements and notes, decisions, commitments, uploaded transcripts, AI analyses and proposals) | **Processor / service provider** acting for the customer organization that owns the workspace | The customer organization (your employer, or the organization that recorded you) |
| **Account data, billing records, security logs, product analytics, email delivery logs, website contact requests** | **Controller** | Meridian at [PRIVACY CONTACT EMAIL] |

If you are a **stakeholder** (a person recorded in a customer's workspace) you have probably never used Meridian. The customer that recorded you decides what is recorded and why, and is responsible for telling you. We will pass requests we receive about workspace content to the relevant customer. **[COUNSEL: confirm handling — see README decision 14.]**

## 2. What we collect
| Category | Examples | Source |
|---|---|---|
| Account | Name, work email, hashed password (we never store it in readable form), email-verification status, workspace memberships and roles | You, or an invitation from your workspace |
| Sessions and security | Session records with IP address and browser user agent; sign-in, membership, role, billing and data-management events in the audit log | Generated when you use the app |
| Preferences | Notification settings, analytics opt-out | You |
| Workspace content (processor) | Records about stakeholders entered by customers: names, titles, organizations, influence/stance/interest ratings recorded by the customer's team, tags, relationships, meeting notes and transcripts, decisions, commitments. May include personal data about third parties | Customer users |
| AI data | Copilot conversation history (only if the workspace retains it — see §5); AI usage records with feature, engine, model, token counts, cost and status — **never prompts or answers** | Generated when you use AI features |
| Product analytics (first-party) | A fixed, allow-listed set of events (e.g. workspace created, first stakeholder added, plan changed) with your user id, workspace id and a few short properties (e.g. template, plan, role). **No record content or stakeholder details** | Generated when you use the app, unless you opt out |
| Billing | Plan, seats, subscription status and dates; the provider's customer/subscription ids; card brand and last 4 digits as reported by the provider. **Card numbers are entered only on the billing provider's hosted page; we never see or store them** | You (via [BILLING PROVIDER]) |
| Email delivery log | Template name, recipient address, subject, status, attempts and provider message id. **No email bodies or links** | Generated when we send email |
| Website contact form | Name, email, company, team size, topic, message | You. Delivered by email to our team; not stored in the application database beyond the email delivery log |
| In-browser storage | See [cookie-and-tracking.md](cookie-and-tracking.md) | Your browser |

## 3. Why we use it
| Purpose | Data | Legal basis [COUNSEL to confirm per jurisdiction] |
|---|---|---|
| Provide the service: sign-in, workspaces, roles, features | Account, sessions, workspace content | [CONTRACT / PROCESSING ON CUSTOMER'S INSTRUCTIONS] |
| Security, abuse prevention, audit trail | Sessions, audit log, rate-limit data | [LEGITIMATE INTERESTS / LEGAL OBLIGATION] |
| Billing, subscriptions, invoices | Billing | [CONTRACT / LEGAL OBLIGATION] |
| Service and account emails (verification, password reset, invitations, billing notices, data-export and deletion notices) | Account, email log | [CONTRACT] |
| Optional notification emails (daily commitments digest, decision assigned, invitation accepted) — each can be switched off; one-click unsubscribe | Account, preferences | [CONTRACT / LEGITIMATE INTERESTS] |
| AI features on your request | Workspace content you can access | [PROCESSING ON CUSTOMER'S INSTRUCTIONS] |
| Improve onboarding and product (aggregate funnel metrics) | Product analytics | [LEGITIMATE INTERESTS — opt-out available] |
| Respond to sales/support contact | Contact form | [LEGITIMATE INTERESTS / PRE-CONTRACT] |

We do not send marketing email from the product, and we do not sell personal data. **[COUNSEL: confirm "sale/share" wording for US state laws.]**

## 4. How long we keep it
Periods marked *implemented* are enforced by the system today. Others are proposed and **[COUNSEL + BUSINESS: confirm]**.

| Data | Retention | Status |
|---|---|---|
| Workspace while subscribed or trialing | For the life of the workspace | Implemented |
| Workspace after a subscription or trial ends | Read-only for 90 days (view, export, manage billing), then locked. **Not deleted automatically**; deleted on an owner's request or by operator action after notice | Implemented (automatic purge: [DECISION PENDING]) |
| Workspace deletion request | 14-day cooling-off (owner can cancel), then permanently deleted. An audit entry with the workspace id and name is kept | Implemented |
| Workspace export files | 7 days, then purged | Implemented |
| Copilot conversation history | Set by the workspace admin: default 30 days; 0 means never stored. Users can delete their own conversations at any time | Implemented |
| Briefing cache | 15 minutes | Implemented |
| Sessions | Expire after 7 days of inactivity; deleted on account closure | Implemented |
| Account | Until you close it. Closure deletes your account, sessions, memberships, preferences, notifications and copilot history immediately. Records you created in shared workspaces stay with the workspace with your authorship removed | Implemented |
| Audit log | [PERIOD] | Not defined |
| Product analytics events | [PERIOD] | Not defined |
| Email delivery log | [PERIOD] | Not defined |
| Billing event records (no payloads stored) | [PERIOD — likely tied to tax/accounting law] | Not defined |
| Backups | [PERIOD — runbook proposes 30 days for daily logical backups] | Not configured (no production deployment) |
| Contact-form emails | [PERIOD] in [SUPPORT MAILBOX] | Not defined |

> COUNSEL: On account closure, email-log rows keep the recipient address, analytics events keep the former user id, and past audit entries keep IP/user agent. Confirm whether this is acceptable (README decision 15).

## 5. AI processing
AI features (meeting intelligence, briefings, copilot) run on a **built-in rules engine by default, which sends no data outside our servers**. If [LEGAL ENTITY NAME] enables a large language model — currently [MODEL PROVIDER: Anthropic (Claude)] — the text needed for a request (only records the requesting user is allowed to see) is sent to that provider to generate the result. AI outputs are suggestions; nothing is saved to a workspace until a person accepts it. Details: [ai-data-processing-disclosure.md](ai-data-processing-disclosure.md).

> COUNSEL: Do not add statements about model-provider training or retention until the provider's terms are reviewed (README decision 6).

## 6. Who we share it with
- **Subprocessors** that host, email, bill or (if enabled) run AI models for us: see [subprocessors.md](subprocessors.md). The list is not final.
- **The workspace you belong to**: admins and owners can see members' names, emails and roles, and the audit log (Professional and above); workspace exports include member names, emails and roles.
- **Authorities** when legally required. [COUNSEL: wording]

## 7. International transfers
Data is stored in [HOSTING PROVIDER / REGION]. Some subprocessors may process data in [COUNTRIES]. Transfers rely on [TRANSFER MECHANISM]. **[COUNSEL: depends on entity, hosting and provider decisions.]** A choice of data region is not available today.

## 8. Your choices and rights
What you can do yourself in the app today:

| Action | Where | Who |
|---|---|---|
| Download your personal data (profile, memberships, sessions, preferences, notifications, copilot conversation titles, email log entries) as JSON | Settings › Data management | Any user |
| Close your account | Settings › Data management | Any user. If you are the only owner of a workspace, first make someone else an owner or schedule the workspace for deletion |
| Turn off notification emails or unsubscribe | Settings › Notifications & privacy, or the link in any notification email | Any user |
| Opt out of product analytics (opted-out users are not recorded at all) | Settings › Notifications & privacy | Any user |
| Delete your copilot conversations | Copilot panel | Any user |
| Export the whole workspace (JSON, 7-day download) | Settings › Data management | Admins and owners |
| Schedule workspace deletion (14-day cooling-off) | Settings › Data management | Owners |
| Sign out other sessions; change password | Settings › Security | Any user |

You may also have legal rights to access, correct, delete, restrict or object to processing, to portability, and to complain to a regulator. Send requests to [PRIVACY CONTACT EMAIL]. We will verify your identity before acting. **[COUNSEL: list rights and response deadlines per jurisdiction; name the regulator(s).]**

**Stakeholders**: contact the organization that recorded you. If you contact us, we will forward your request to that customer as described in our agreement with them.

## 9. Cookies and browser storage
We use only what is needed to keep you signed in and remember interface conveniences. **No third-party analytics or advertising cookies or trackers.** Our product analytics is first-party, stored in our own database, and does not use cookies. Inventory: [cookie-and-tracking.md](cookie-and-tracking.md).

## 10. Security
Controls in place today (we describe them; we do not hold certifications):
- Tenant isolation with PostgreSQL row-level security on every customer table, plus application checks, covered by automated tests.
- Role-based permissions enforced on the server; billing controls are owner-only.
- Passwords hashed by our authentication library; email verification required; password-reset links single-use and expire after 1 hour; sessions expire after 7 days of inactivity; secure, HTTP-only cookies in production.
- Rate limiting; security headers with a strict Content-Security-Policy in production.
- Audit log of security-relevant actions.
- Card data handled only by the billing provider's hosted checkout.
- AI usage logs store counts and cost, never prompts or answers.

Not available today: multi-factor authentication, single sign-on. Encryption in transit (TLS) and backups depend on the production deployment, which is [TO BE CONFIRMED AT DEPLOYMENT].

## 11. Children
Meridian is a business service and is not intended for children. [COUNSEL: wording / age threshold]

## 12. Changes
We will post updates here and notify workspace owners of material changes by [METHOD]. [COUNSEL]

## 13. Contact
[LEGAL ENTITY NAME], [ADDRESS] · Privacy: [PRIVACY CONTACT EMAIL] · [DATA PROTECTION OFFICER / GRIEVANCE OFFICER / EU-UK REPRESENTATIVE, if required]
