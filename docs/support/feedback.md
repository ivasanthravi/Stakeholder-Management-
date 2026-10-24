# Feedback collection (internal)

## What exists today
- **Website contact form** — topic `sales`, `support`, `security` or `other`, emailed to `SALES_EMAIL`. Feedback arrives as `support` or `other`.
- **Support email** — [SUPPORT EMAIL ADDRESS, once set].
- **Indirect signals** (no free text): first-party analytics events such as `upgrade_prompt_shown`, `ai_limit_reached`, `subscription_cancel_scheduled`, and the operator funnel (`/api/operator/metrics`, limited to `OPERATOR_EMAILS`). Aggregates only; users who opted out are not recorded.

There is **no in-app feedback widget, survey, or cancellation-reason prompt**.

## Recommendations (not built)
1. A "Send feedback" item in the command palette and Help menu, posting to support with workspace id and page — no record content by default.
2. An optional, skippable reason picker when an Owner schedules cancellation.
3. A thumbs up/down on AI proposals and briefings, stored as counts per feature/engine (no content), to complement acceptance/rejection rates.
4. Pick a support desk or tracker before volume grows; add it to `docs/legal/subprocessors.md` first.

## Tagging taxonomy
Apply one **type**, one or more **areas**, and a **segment**.

- **Type:** `bug` · `feature-request` · `usability` · `ai-quality` · `billing` · `praise` · `churn-reason`
- **Area:** `onboarding` · `directory` · `organizations` · `initiatives` · `map` · `engagements` · `decisions` · `commitments` · `command-center` · `ai-meetings` · `ai-briefings` · `ai-copilot` · `notifications` · `members-roles` · `billing` · `data-export-deletion` · `security-auth` · `marketing-site`
- **Known gap:** `gap-sso` · `gap-mfa` · `gap-integrations` · `gap-api` · `gap-custom-fields` · `gap-transcription` · `gap-mobile` · `gap-csv`
- **Segment:** `trial` · `starter` · `professional` · `enterprise-prospect` · plus industry template if known.

Record: date, source channel, workspace id (not stakeholder names), verbatim quote (strip personal data), tags, link to ticket.

## Review cadence
- Triage new feedback: [CADENCE — BUSINESS DECISION].
- Product review of tagged themes with counts: [CADENCE].
- Close the loop with requesters when a requested item ships: [OWNER].
