> **DRAFT — NOT FOR PUBLICATION. Requires review by qualified legal counsel in [JURISDICTION(S)] before use.**

# Cookies, browser storage and tracking — inventory (draft)

Source: `app/server/auth.ts`, `app/server/analytics.ts`, client code (`src/session/session.tsx`, `src/shell/CommandPalette.tsx`, `src/shell/AccessBanner.tsx`). Re-verify against the deployed build before publishing a cookie notice.

## Cookies
| Name | Set by | Purpose | Attributes | Lifetime | Category |
|---|---|---|---|---|---|
| `better-auth.session_token` (production: `__Secure-better-auth.session_token`) | Auth library (Better Auth), first-party | Keeps you signed in | HttpOnly, SameSite=Lax, Secure in production | Session expires after 7 days of inactivity (refreshed daily while active) | Strictly necessary |
| Other Better Auth cookies (e.g. "remember me" / session cache variants) | Auth library | [TO BE INVENTORIED — confirm none are set with the current configuration] | — | — | Strictly necessary (if any) |

No third-party cookies. No advertising cookies. No cookie is used for analytics.

## Browser storage (not cookies)
| Key | Storage | Contents | Purpose |
|---|---|---|---|
| `meridian.workspace` | localStorage | Id of the last workspace you opened | Reopen the same workspace |
| `meridian.recent` | localStorage | Up to 6 recently opened items: id, group, label, subtitle and path. **Labels can include stakeholder or record names** | "Recent" list in the command palette (⌘K) |
| `meridian.banner.dismissed` | sessionStorage | Which access banner you dismissed | Don't re-show a dismissed banner this tab session |
| Other UI conveniences | — | [TO BE INVENTORIED before publication] | — |

Stored only in your browser and never sent to Meridian. Cleared by clearing site data.
> ENGINEERING: Consider clearing `meridian.recent` on sign-out, since it can hold stakeholder names on shared devices.

## Analytics and tracking
- **First-party product analytics** only: an allow-listed set of events stored in Meridian's own database (`analytics_event`). No cookies, no third-party scripts, no record content. Users can opt out in Settings › Notifications & privacy; opted-out users are not recorded.
- Marketing-site events (`marketing_cta_clicked`, `pricing_viewed`) are defined but **not currently emitted** — verify before publication.
- **No third-party trackers**: no Google Analytics, ad pixels, session replay, chat widgets or social embeds.
- Email: open and click tracking is deliberately off.

## Consent banner
Whether a banner is needed, or a notice alone is enough for strictly-necessary cookies and local storage, is a **counsel decision per jurisdiction** (ePrivacy/PECR in EU/UK; DPDP Act and others). If any non-essential tracker is added later, revisit this first.
