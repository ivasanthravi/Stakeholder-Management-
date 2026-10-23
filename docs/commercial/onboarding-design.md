# Onboarding Design

**Goal:** a new customer reaches meaningful value — their own initiative, their own stakeholders, a teammate invited — within a few minutes. No forced tour, and every step can be skipped and resumed.

## Journey
| # | Step | Where | Notes |
|---|---|---|---|
| 1 | Create account | `/sign-up` | Name, work email, password (10+ chars). Invite-aware copy when arriving from an invitation (email prefilled; `next` carried through verification) |
| 2 | Verify email | `/check-email` → emailed link | Required before creating or joining a workspace (server-enforced) |
| 3 | Create workspace + choose industry template | `/onboarding` (`CreateWorkspace`) | 8 templates as an accessible radio group, with a live preview of what the template sets: vocabulary, engagement types, organization types. Trial terms shown: 14-day Professional, up to 10 people, no card. Pending invitations are listed so invited people can join instead |
| 4–5 | Configure workspace | `/welcome` step 1 | Rename; adjust the three vocabulary words (e.g. Project / Stakeholder / Client) |
| 6 | First initiative | step 2 | Name, plus a short code suggested from the name; template example as placeholder; duplicate code shown on the field |
| 7 | Add stakeholders | step 3 | Quick multi-add (up to 8 rows: name and title), linked to the new initiative; template example titles as placeholders |
| 8 | Invite teammates | step 4 | Emails and role; live seat meter; per-row errors; `seat_limit` stops the remaining invites, with a billing link for owners |
| 9 | Command Center | "You're ready" → `/` | Home shows signals, the AI workspace briefing and the onboarding checklist state |

## Principles applied
- **Progress comes from data, not clicks.** `GET /onboarding` marks steps done when the data exists: template chosen, an initiative, a stakeholder, a second member or invitation, an engagement. Someone who adds stakeholders elsewhere sees the step complete, and the flow resumes at the first incomplete step after a reload.
- **Skippable everywhere.** Each step has "Skip for now", and the top bar has "Skip setup". Skipping doesn't mark a step done, so reopening setup resumes there.
- **Permission-aware.** Members without `workspace.update` go straight to `/`. Invited people never see setup; they land in the workspace.
- **One architecture.** Templates (`shared/templates.ts`) only set workspace settings (vocabulary, organization types, engagement kinds) and onboarding placeholders. The vocabulary is applied in navigation and onboarding labels through `useVocabulary()`.
- **Trial abuse limit.** Two no-card trials per person. A further workspace shows a "needs a plan" screen with *Choose a plan* or *Not now*; the workspace is read-only until it has a plan.
- **Feedback.** Optimistic progress ticks, inline validation, focus on the first invalid field or row, loading states on buttons, and an announced step change (focus moves to the step heading).
- **Motion.** Steps slide horizontally at standard motion tokens. Reduced motion is respected through the app's `MotionConfig`.
- **Responsive.** Desktop has a progress rail; mobile has a segmented progress bar and compact footer controls. No horizontal overflow at 390 px (verified by screenshot).

## Invitations
**Security:**
- Tokens are 32 random bytes; only their SHA-256 hash is stored.
- Links expire after 7 days and are single-use.
- Resend issues a new token and invalidates the old one.
- Revoke is immediate.
- Acceptance requires signing in with the invited address and a verified email, and re-checks seats under a row lock.

**Accept page:**
- Shows the workspace, inviter, role and invited email for a pending invite.
- Signed out: *Sign in to accept* if an account exists for that email, otherwise *Create your account* (prefilled).
- Signed in as a different email: explains which address to use and offers to switch.
- Expired, revoked or used links and unknown tokens all show the same neutral message with **no workspace details**.

**Inviter:** gets an in-app notification and an email when the invitation is accepted (can be switched off).

## Instrumentation (first-party analytics)
These events are recorded:
- `workspace_created` (template id)
- `trial_started`
- `onboarding_step_completed` (step)
- `onboarding_completed` (skipped?)
- `first_initiative_created`, `first_stakeholder_added`, `first_engagement_recorded`, `first_ai_briefing_generated`
- `teammate_invited` (role), `invitation_accepted` (role)

Time to first value is computed from `workspace_created` to the first value event.

## Known gaps
- The progress bar on mobile isn't clickable (Back and Skip only).
- Template "suggested fields" aren't possible: custom fields don't exist yet.
- No sample-data option for new workspaces. Considered and deferred: it would need clearly labelled, removable sample records.
