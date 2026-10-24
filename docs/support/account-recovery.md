# Account access and recovery

## Forgot your password
1. On the sign-in page choose **Forgot password** and enter your email.
2. Open the emailed link. It works **once** and **expires after 1 hour**.
3. Set a new password (10+ characters).
4. **All your other sessions are signed out** — sign in again on other devices.

Didn't get the email? Check spam, wait a few minutes, then request a new link. For security we show the same message whether or not an account exists for that address.

**Support note:** support cannot reset passwords or send reset links on someone's behalf, and must never ask for a password.

## Email not verified
Signing in with an unverified email shows "Verify your email first" with a **Resend the link** option. You can't create or join a workspace until verified. If links never arrive: check spam and any corporate quarantine, and ask IT to allow mail from [SENDING DOMAIN].

## Lost access to your email address
There is no self-service way to change an account's email or recover an account without access to its mailbox. **[BUSINESS DECISION: manual verification process.]** Until defined:
1. Ask the customer's workspace Owner or Administrator to **invite the person's new address**; their workspace records are unaffected.
2. The old account can be closed only by signing in to it.
3. Do not change emails in the database. Escalate to [ESCALATION OWNER] if an exception is requested; any operator change needs a written verification record and an audit note.

## Removed from a workspace
If an Administrator or Owner removes you, the workspace disappears from your list. Records you created stay with the workspace. To regain access, ask an Administrator or Owner to invite you again. Support cannot restore membership.

## Owner rules
- A workspace must always have at least one Owner. You can't remove or demote the last Owner, or leave as the last Owner, until someone else is made Owner.
- Only an Owner can remove another Owner.
- **The only Owner left the company?** Another Owner is needed. If none exists: **[BUSINESS DECISION: ownership-transfer verification process]** — escalate to [ESCALATION OWNER]; do not change roles by hand without that process.

## Sessions
Sessions end after 7 days of inactivity. Settings › Security lists your sessions and has **Sign out other sessions**. Changing your password there can also sign out other sessions.

Multi-factor authentication and single sign-on are not available yet.

## Closing your account
Settings › Data management › Close account. Type your email to confirm. Consider downloading your personal data first (same page).

What happens:
- Your account, sessions, memberships, preferences, notifications and copilot history are **deleted immediately**. This can't be undone.
- Records you created in shared workspaces **stay with the workspace**, with your name removed as author.
- Pending invitations to your address are removed.
- If you're the **only Owner** of a workspace, you must first make someone else an Owner or schedule that workspace for deletion.
- You receive a confirmation email.
