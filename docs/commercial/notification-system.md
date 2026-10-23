# Email & Notification System

## Delivery pipeline (`server/mail.ts`)
`mailer.send({ to, template, data, userId?, workspaceId? })`:
1. **Render** the template (`server/email/templates.ts`) to subject, preheader, HTML and plain text.
2. **Preferences:** notification-category email is suppressed when the recipient turned that type off. It's recorded as `suppressed`, with no send.
3. **Log** a row in `email_message`: template, recipient, category, subject, status, attempts, provider message id. Bodies and links are never stored, because they can carry tokens.
4. **Deliver immediately** through the transport. On failure the row is marked `failed` and an `email.retry` job retries with backoff (5 attempts).

**Transports:**
| Transport | Use |
|---|---|
| `log` | Development and test. Stores in `mail_outbox`, viewable at `/dev/mail`. Nothing leaves the machine. |
| `postmark` | Production. HTTP API, message stream `outbound`, tag = template, `X-Entity-Ref-ID` header. Needs `POSTMARK_SERVER_TOKEN` and a verified sender domain for `MAIL_FROM`. |

**Not yet implemented:**
- Postmark bounce and spam-complaint webhooks (suppression list).
- Open and click tracking (deliberately off).

## Templates
| Template | Category | Trigger |
|---|---|---|
| verify, reset | account | Better Auth sign-up and password reset |
| invite | account | Invitation created or resent |
| invitation_accepted | notification | Invitee joined (to the inviter) |
| subscription_activated, plan_changed, payment_failed, payment_recovered, cancel_scheduled, subscription_canceled, trial_ending, trial_ended | billing | Subscription transitions (to owners) |
| commitments_digest | notification | Daily: the recipient's own overdue and due-soon commitments |
| decision_assigned | notification | Someone else made the recipient a decision owner |
| workspace_deletion_scheduled, data_export_ready, account_closed | account | Data management |
| contact_request, contact_received | account | Website contact form (to `SALES_EMAIL`, plus a confirmation to the visitor) |

**Design:**
- Table layout with inline styles, max width 560 px, system font stack, product teal primary button at 4.5:1 or better, and a hidden preheader.
- `lang`, `role="presentation"` tables, and a `<title>` on every template.
- A plain-text alternative with link URLs written out.
- Light colour scheme declared.
- Previews: `/api/dev/email-preview/<template>` (add `?format=text` for the text version), development only.

**Privacy rules in copy:**
- Subjects and previews never name stakeholders or quote record content.
- Decision emails name the decision by key only.
- Digests list only the recipient's own commitments, queried under their own row-level security context, so restricted records never leak.

## Notification types and preferences
| Type | Default | Email | In-app |
|---|---|---|---|
| commitments_digest | on | daily, at most one per workspace per day (deduplicated) | ✓ |
| decision_assigned | on | ✓ | ✓ |
| invitation_accepted | on | ✓ | ✓ |
| billing | always (owners) | can't be turned off while an owner | ✓ |

- **Settings:** users manage these in Settings › Notifications (`/api/me/preferences`).
- **Unsubscribe:**
  - Every notification email has an unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058).
  - The token is per user and stored hashed. It's rotated on each send, so older links stop working.
  - GET shows a confirmation page, so link scanners can't unsubscribe people. POST unsubscribes from all notification email.
- **Inbox:** in-app notifications (`notification` table, RLS: recipient only) feed the inbox in the shell, with an unread count and mark read / all read.

## Not sending unnecessary email
- Digest instead of per-item reminders.
- No email for the actor's own actions.
- Trial-ending reminder once per workspace.
- Billing notices only on real state transitions.
- No marketing email exists in the product.

## Abuse prevention
- **Invitations:** 50 per workspace per hour, resend once per minute per invitation, admin role required.
- **Contact form:** 5 per IP per hour, honeypot field, and the visitor's confirmation goes only to the address they typed.
- **Auth email:** Better Auth's rate limit applies in production.

## Reliability
- **Retries:** a failed send is retried by the durable job queue with exponential backoff, so it survives restarts.
- **Scheduled jobs:** digests (daily), trials (hourly) and data processing (hourly) are enqueued with a time-bucket dedupe key. Several app processes won't double-send.
