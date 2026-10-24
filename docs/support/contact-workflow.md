# Contact and triage workflow (internal)

## Intake channels
| Channel | How it works today | Status |
|---|---|---|
| Website contact form (`/contact`) | Fields: name, email, company, team size, topic (**sales / support / security / other**), message. Emailed to `SALES_EMAIL`; the visitor gets an automatic confirmation. Not stored in the app (only an email delivery log row). Rate-limited to 5 per IP per hour, with a honeypot | Built; `SALES_EMAIL` [TO BE CONFIGURED] |
| Support email | [SUPPORT EMAIL ADDRESS] | [BUSINESS DECISION] |
| Security reports | [SECURITY CONTACT, e.g. security@DOMAIN] | [BUSINESS DECISION] |
| Privacy / data requests | [PRIVACY CONTACT EMAIL] | [BUSINESS DECISION] |
| In-app help or chat | None | Not built |

Support hours: **[BUSINESS DECISION]**. No SLA is offered.

## Triage categories
`account-access` · `billing` · `data-request` · `security-report` · `bug` · `ai-output` · `how-to` · `feature-request` · `sales` · `other`

## Priority definitions
Response targets are **[BUSINESS DECISION]** — do not quote times to customers until set.

| Priority | Definition | Target first response |
|---|---|---|
| P1 | Suspected security or data incident; service unavailable for many customers; data loss | [TARGET] |
| P2 | A workspace cannot work (locked unexpectedly, paid but not active, nobody can sign in) | [TARGET] |
| P3 | Feature broken with a workaround; billing question; single-user access issue | [TARGET] |
| P4 | How-to, feedback, feature request | [TARGET] |

## First-response templates
**General**
> Hi [Name], thanks for getting in touch. I'm looking into this and will update you by [time/date]. To help, could you send [workspace name, what you clicked, what you saw, a screenshot without personal data]?

**Billing**
> Hi [Name], thanks — I'm checking your subscription. Please don't send card details by email; payment details are only ever entered on [BILLING PROVIDER]'s secure page, reached from Settings › Subscription.

**Feature not available**
> Thanks for asking. [Feature] isn't available in Meridian today. I've recorded your request so the product team sees it. [Workaround, if any, from known-issues.md.]

**Security report acknowledgement**
> Thank you for reporting this. We've received it and are investigating. Please don't share details publicly while we do. We'll update you by [time/date].

## Security-report handling
1. Acknowledge (template above). Tag `security-report`, P1 unless clearly not a vulnerability.
2. Forward immediately to [SECURITY OWNER]; do not discuss in public channels.
3. Don't ask the reporter to test further or access other customers' data.
4. If customer data may be affected, the security owner starts the incident process and consults counsel before any customer notice (data-incident template in `incident-communication-templates.md`).
5. Disclosure/bounty policy: **[BUSINESS DECISION]** — make no promises of rewards.

## Data requests
**Prefer the product's self-service tools:**
| Request | Self-service |
|---|---|
| My personal data | Settings › Data management → Download JSON |
| Close my account | Settings › Data management → Close account |
| Export a workspace | Admin/Owner: Settings › Data management → Export (7-day download) |
| Delete a workspace | Owner: Settings › Data management → schedule deletion (14-day cooling-off, cancelable) |
| Stop emails | Settings › Notifications & privacy, or the unsubscribe link |
| Stop analytics | Settings › Notifications & privacy → analytics opt-out |

**Manual requests** (person can't use the tools, or a stakeholder asks about their data):
1. Log the request with date received; tag `data-request`.
2. **Verify identity** before acting: the request must come from the account's email address, confirmed by replying to a message we send to that address. [COUNSEL: additional verification for high-risk requests]
3. **Stakeholder (not a user)**: Meridian is processor for workspace content. Don't confirm or deny whether they appear in any workspace. Identify the customer if the requester names it, and forward per the DPA; reply with [COUNSEL-APPROVED TEXT].
4. **Workspace data requested by a non-admin**: direct them to their workspace Admin/Owner.
5. Any operator action on data needs written approval from [DATA OWNER] and an audit note.
6. Respond within [STATUTORY DEADLINE PER JURISDICTION — COUNSEL].

## Feedback
Tag and log per [feedback.md](feedback.md).
