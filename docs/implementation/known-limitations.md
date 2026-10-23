# Known Limitations (Phase 1)

**Not ready for public deployment.** Authentication, tenancy and permissions are implemented and tested, but the items below are open. An independent security and operational review is required before customers use it.

## Blocking for production
| Area | Gap |
|---|---|
| Email | No transport. Verification, reset and invitation emails go only to the dev outbox (`/dev/mail`). In production nobody could verify, reset a password or accept an invitation until SMTP/API mail is added |
| Database | Development and tests run on PGlite. Real PostgreSQL has not been run against here (no server available). Migrations, RLS and queries are standard SQL and should behave the same, but this is unverified |
| Deployment | No hosting, TLS, backups, monitoring or error tracking configured. No deployment URL exists |
| Security review | No independent review or penetration test |
| Rate limiting | Better Auth limits auth endpoints in production. The data API has no rate limiting |
| Secrets | `AUTH_SECRET` falls back to a fixed development value outside production (production refuses to start without it) |

## Product gaps (by decision, see ADR-012)
- SSO/SAML/SCIM, MFA, account deletion and a user profile page are missing.
- Custom field definitions, stakeholder groups UI, saved views, CSV import/export and bulk owner assignment are missing.
- Configurable decision states are missing. The terminology overrides in Settings are stored but **not yet applied** to UI labels.
- AI: the briefing is rule-assembled; AI extraction and "Ask" are labelled unavailable.
- Restricted-record **access lists** can be set via the API. The UI only toggles restriction.
- Real-time updates: other users' changes appear on refetch (focus or navigation), not live.

## Quality gaps
- **Bundle and performance.**
  - Initial JS is ≈255 kB gzip, up from Phase 0's 196 kB (Zod and the auth client).
  - At 4× CPU, table wheel scroll drops ~26 % of frames.
  - fcose re-layout blocks the main thread for ~220 ms; a Web Worker is needed.
- **Accessibility.** Axe reports no violations on 44 views, but there has been no manual screen-reader pass. Text selection → commitment on engagement notes is pointer-only; keyboard users use the rail buttons.
- **Browsers.** Verified in Chrome only.
- **Lists.**
  - Organizations and Initiatives load up to 200 rows (no infinite scroll).
  - The initiatives status filter and "Due this week" on commitments are filtered in the browser, not the API.
- **Dashboard.** The "Hide" action on Home is per-session, not persisted.
- **Directory.** The Organization column isn't sortable server-side.
- **Sample data.**
  - Dates are relative to the seed run.
  - Some generated commitment titles repeat.
  - One sample engagement intentionally contains an instruction-like line, which is rendered as plain text.

## Phase 0 items carried forward
Map path finder, "since last visit" diff, map label legibility below ~50 % zoom, dark mode (tokens exist but have never been verified).
