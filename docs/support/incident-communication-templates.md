# Incident communication templates (internal)

**Channels:** status page [STATUS PAGE — TBD, launch blocker 22] · email to workspace Owners via [MECHANISM — the product has no broadcast email; TBD] · direct replies to affected tickets. No uptime SLA exists — never imply one.

Rules: state facts only; no cause speculation; no stakeholder or customer names; give the next update time; use UTC plus [LOCAL TIMEZONE].

## Investigating
> **[Short title, e.g. "Some users can't sign in"]** — Investigating
> We're investigating reports that [symptom]. [Who is affected, if known.] Your data [is not known to be affected / impact is being assessed]. Next update by [time].

## Identified
> **[Title]** — Identified
> We've identified the cause of [symptom] and are working on a fix. [Workaround, if any.] Next update by [time].

## Monitoring
> **[Title]** — Monitoring
> A fix has been applied and [symptom] should be resolved. We're monitoring. If you still see problems, contact [SUPPORT EMAIL]. Next update by [time].

## Resolved
> **[Title]** — Resolved
> [Symptom] was resolved at [time]. It affected [scope] between [start] and [end]. [Any action customers need to take, e.g. "retry the export".] We'll publish a summary by [date] [if applicable].

## Post-incident summary
> **What happened:** [plain description]
> **Impact:** [who, what, how long; whether any data was affected]
> **Timeline (UTC):** detected · identified · mitigated · resolved
> **Cause:** [confirmed root cause]
> **What we're changing:** [concrete actions with owners/dates]
> **Questions:** [SUPPORT EMAIL]

## Data incident notice — ⚠ REQUIRES LEGAL REVIEW BEFORE SENDING
> Do not send without approval from [COUNSEL] and [INCIDENT OWNER]. Recipients, timing and content may be set by law and by the DPA (breach-notification timeline: [TBD]). Regulator and data-subject notifications are separate and handled by counsel.

> Subject: Security notice about your Meridian workspace [workspace name]
>
> We are writing to tell you about a security incident that affected [your workspace / your account].
> **What happened:** [facts, date discovered, date of incident]
> **What information was involved:** [categories; say clearly what was not involved]
> **What we have done:** [containment, investigation, fixes]
> **What you can do:** [specific actions, e.g. reset password, review audit log in Settings › Audit log]
> **Your obligations:** As controller of your workspace data, you may need to assess notification to [authorities / affected people]. We will provide the information you need, including [details].
> **Contact:** [named contact, email, reference number]
> We will update you by [date].

## Scheduled maintenance
> **Scheduled maintenance — [date], [start]–[end] [timezone]**
> Meridian will be [unavailable / read-only] during this window while we [plain reason]. No action is needed. Your data is not affected. Questions: [SUPPORT EMAIL].
>
> Notice period: [BUSINESS DECISION].
