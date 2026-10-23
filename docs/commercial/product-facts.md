# Product Facts for Public Copy

The only claims the marketing site, emails and sales material may make. If something isn't here, don't claim it. Verified as of 2026-10-23 against the code and tests.

## Available today
**Stakeholder directory:**
- People, with role/title, organizations, influence (1–4, recorded by your team, not computed), stance, interest, owner, tags.
- Fast table with filters and sorting, plus a keyboard-first command palette (⌘K).

**Organizations, and initiatives** (projects/programmes):
- Stakeholders are linked to initiatives.
- Vocabulary can be renamed per workspace (e.g. "Project", "Client"), as set by the industry template.

**Relationship mapping:**
- Interactive network map of recorded relationships (reports to, influences, allied with, opposes, …).
- Influence grid.
- "Find path" shows the shortest chain of recorded relationships, up to 4 steps. Never claim it measures influence.

**Engagements:** meetings, calls, emails, workshops, consultations, site visits and notes, with participants and notes.

**Decisions:** status workflow (proposed → under review → approved / rejected / deferred), approvers and consulted stakeholders, needed-by dates.

**Commitments:** promises made by us or to us, with owners, due dates, overdue tracking and source engagement.

**Command Center (Home):**
- Rule-based signals: overdue, due soon, decisions waiting, cooling relationships, stance shifts, unowned high-influence stakeholders, unassigned and repeatedly delayed commitments.
- Each signal shows why it's flagged, the rule, evidence and a suggested next step.

**AI:**
- **Meeting intelligence:** proposes decisions, commitments and actions from meeting notes or transcripts (.txt, .md, .vtt, .srt). Every item is tied to a verbatim quote. Nothing is saved until a person accepts it.
- **Briefings:** stakeholder (brief / detailed / meeting prep), decision and workspace. Facts, metrics with their method, rule-based recommendations, and (with a model configured) cited AI interpretation.
- **Copilot (⌘J):** answers from records you can access, with numbered citations.
- **Engines:**
  - Built-in rules engine with no data sent anywhere, OR a Claude model when configured by the operator.
  - Say "AI features run on a built-in rules engine, or on a large language model when enabled".
  - Don't claim model accuracy numbers.
- **Instruction-like text** in imported notes is flagged and ignored.

**Teams:**
- Roles: Owner, Administrator, Manager, Contributor, Viewer.
- Restricted stakeholders, visible only to listed people and admins (Professional plan).
- Email invitations with expiry, resend and revoke.

**Audit log** of security-relevant actions (Professional and above).

**Notifications:** in-app inbox; daily commitments digest email; decision assignment; invitation accepted. All can be switched off per type, and one-click unsubscribe is supported.

**Data:**
- Full workspace export (JSON) by admins.
- Personal data export.
- Account closure.
- Workspace deletion by an owner, with a 14-day cooling-off period that can be canceled.

**Billing:**
- 14-day free trial of Professional for up to 10 people, with no card required.
- Plans: Starter (up to 5 seats), Professional (up to 100), Enterprise (sales-led).
- Monthly or annual.
- Cancel any time; access continues to the end of the paid period.
- After a subscription ends, the workspace is read-only for 90 days so you can export. Nothing is deleted by cancellation.

**Prices:** NOT approved for publication. Show "Pricing on request" / "Talk to us" until `shared/pricing.ts` marks a plan approved.

## Security controls (implemented and tested — describe, don't certify)
- **Tenant isolation:** PostgreSQL row-level security on every customer table, plus application checks. Cross-tenant access is covered by automated tests.
- **Authentication:**
  - Passwords are hashed by the auth library (Better Auth).
  - Email verification is required before use.
  - Password reset links are single-use and expire after 1 hour.
  - Sessions expire after 7 days of inactivity.
  - Secure, HTTP-only cookies in production.
- **Web and API protection:**
  - Rate limiting on API, AI, invitation and contact endpoints.
  - Security headers, with a strict Content-Security-Policy in production.
- **Least privilege:** role-based permissions enforced on the server; billing controls are owner-only.
- **Audit:** the audit log records sign-ins, membership, role, billing and data-management events.
- **Payments:**
  - Card details are handled only by the payment provider's hosted checkout; Meridian never sees or stores card numbers.
  - Billing webhooks are signature-verified.
- **AI data handling:**
  - AI usage logs store counts and cost, never prompts or answers.
  - Copilot history retention is configurable, including zero (no storage).

## Not available — never imply otherwise
- SSO/SAML/SCIM (listed for Enterprise as **planned**)
- MFA
- Mobile apps
- Integrations (Outlook/Gmail/Slack/CRM)
- Public API
- Custom fields
- Audio transcription
- Real-time co-editing
- Data residency choice
- Uptime SLA
- **Certifications:** SOC 2, ISO 27001, HIPAA, GDPR certification or any other certification. Say "We don't hold certifications yet" if asked.
- **Hosted status:** there is no public deployment URL yet.

## Sample data
All screenshots use the fictional "Westshire Infrastructure" sample workspace. Any people shown are fictional.
