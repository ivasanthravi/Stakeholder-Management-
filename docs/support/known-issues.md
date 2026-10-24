# Known issues and limitations

Current as of [DATE]. Planned items have no committed dates.

## Not available yet
| Limitation | Workaround |
|---|---|
| **Single sign-on (SSO/SAML/SCIM)** — planned for Enterprise | Email and password sign-in; Admins manage members and roles in Settings › Members |
| **Multi-factor authentication** | Use a strong unique password; review Settings › Security and sign out other sessions you don't recognise |
| **Integrations** (Outlook, Gmail, Slack, calendar, CRM) and **email/calendar import** | Log engagements manually; paste notes or upload a transcript file |
| **Public API** | Workspace export (JSON) for Admins/Owners |
| **Custom fields** (templates can't add fields either) | Use tags and notes |
| **Audio transcription; PDF/DOCX upload** | Upload a transcript as .txt, .md, .vtt or .srt (up to 50,000 characters) |
| **Mobile apps** | Use the web app in a mobile browser |
| **Real-time co-editing** | Others' changes appear when you refresh or navigate |
| **Data residency choice** | — |
| **CSV import/export** | Guided setup quick-add (up to 8 stakeholders at a time); JSON workspace export |
| **Uptime SLA; certifications** (SOC 2, ISO 27001, etc.) | We don't hold certifications yet; see the Security page for the controls we have |
| **Published prices** | Pricing on request — contact us |

## AI
- AI features run on a **built-in rules engine, or on a large language model when enabled**. Each result is labelled with its engine.
- **Rules engine:** conservative extraction — misses some phrasings (e.g. "ACTION: Name to …" lines, "(owner: X)" bullets, "Agreed: …" headers); doesn't read email signatures, so "I'll …" in an email gets no owner. Copilot answers about ten question patterns and lists the ones it supports. Briefings show facts, metrics and rules, without written interpretation. *Workaround:* edit proposals before accepting; add missing items manually.
- Merging a proposal works only with another pending proposal, not with an existing record. *Workaround:* reject the duplicate.
- Only the latest meeting analysis is shown per engagement.
- Briefings are cached for 15 minutes. *Workaround:* press **Regenerate**.
- Instruction-like text in imported notes is flagged and ignored; detection is pattern-based.
- AI is unavailable while a workspace is read-only, and model features pause when the monthly allowance is used up.

## Product
- **Restricted-record access lists:** the profile toggles restriction and shows the access list; editing who is on the list may not be available in the UI yet [VERIFY before publishing]. *Workaround:* Owners and Administrators always see restricted stakeholders.
- On mobile, the setup progress bar isn't clickable — use Back and Skip.
- Skipped setup steps stay incomplete (by design) so you can resume them.
- Dark mode hasn't been fully reviewed; light mode is recommended.
- Tested mainly in Chrome; other browsers have not been fully verified.

## Billing
- The checkout page for the billing provider is available only once prices are configured. If you'd like to buy before then, contact us.
- Downgrading below the number of seats in use isn't possible — remove members or revoke pending invitations first.
