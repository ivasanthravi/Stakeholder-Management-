# Workflow Results (Phase 7)

**Two kinds of evidence, kept apart:**
1. **Automated workflow tests** call the real API (and, in E2E, a real browser) and assert outcomes. They run on every release gate.
2. **Simulated persona workflows** are scripted browser sessions on a generated workspace. They measure whether each step works at volume and how long the screen takes to settle. **They are not usability evidence: no real person took part.**

## 1. Lifecycle, decisions, commitments and engagements (automated)
| Area | Tests | What is asserted | Result |
|---|---|---|---|
| Stakeholder lifecycle | `workflow.test.ts`: create with organisation, validation, edit, version conflict, archive/restore, association history | Ending an affiliation keeps history; stale edits get 409; partial updates never reset other fields | Pass |
| Changed organisation (simulated) | `simulation.test.ts` | The new affiliation is current; the old one is history; earlier engagements unchanged | Pass |
| Initiatives | `workflow.test.ts`; `simulation.test.ts` (paused initiative) | Membership; an on-hold initiative stays on hold while its engagements remain visible | Pass |
| Engagements | `workflow.test.ts` (idempotent create, participants, timeline); `simulation.test.ts` (one meeting with three commitments) | The meeting lists all three commitments with their own due dates | Pass |
| Decisions | `workflow.test.ts` (propose → review → approve with outcome); `journeys.spec.ts` D (browser); `simulation.test.ts` (reopened decision; decisions of an archived organisation) | Reopening keeps both history entries; decided decisions of archived organisations stay readable with participants | Pass |
| Commitments | `workflow.test.ts` (create, complete, reopen, overdue filter); `simulation.test.ts` (reassigned, reopened, departed owner) | Full history kept; a departed owner's open commitments are flagged "Owner left the workspace" | Pass, **after fix** (see below) |
| Duplicates | `simulation.test.ts`; E2E `core-flow.spec.ts` | Both records are searchable; **new:** creating a stakeholder with an existing name shows a non-blocking hint that links to the existing record | Pass (hint new in Phase 7) |
| Relationships | `workflow.test.ts`; `simulation.test.ts` graph block | Duplicate, mirror and allied/opposed contradictions refused (409); ended relationships leave the map but stay in history | Pass |
| Command Center truth | `simulation.test.ts`; `dashboard.test.ts` | Counts equal SQL in all 10 industries and at Profile B; every kind keeps places in the list | Pass, **after fix** |

### Defects the workflows found, and what changed
1. **Command Center lost overdue items at scale (P1).**
   - At Profile D the database held 1,987 overdue commitments, and the Command Center listed **none**.
   - Cause: signals were cut to a global top 200, which other kinds filled first.
   - Fix: true per-kind counts (`signalCounts`), up to 40 items per kind for the team plus the viewer's own top 40, and a horizon bounded to ±30 days with an "N older" count.
   - Regression tests: `simulation.test.ts` and `dashboard.test.ts`.
2. **Departed owners' commitments were invisible as a problem (P1).** They now appear as "needs an owner" with the reason. Regression test: `simulation.test.ts`.
3. **Totals were page lengths (P1).** The summary sentence, tab counts and the Copilot's decision count reported the page size. They now report totals.
4. **Long histories were cut silently (P2).** A person with 310 engagements showed 200. The profile now says "Showing the latest 200 of 310".
5. **The briefing and "Due this week" contradicted the totals at scale (P1).** Found by the persona run; see section 4.
6. **Billing provider outage (P2).** Checkout and portal returned a generic 500. They now return a clear 503 ("Nothing was changed. Please try again"). A webhook received during the outage syncs when the provider returns. Regression test: `failure.test.ts`.

## 2. Failure and recovery (automated)
| Failure | Test | Behaviour |
|---|---|---|
| Database unavailable | `failure.test.ts` (new) | `/api/ready` turns 503 `{db: {ok: false}}`. Requests fail with "Your changes were not saved" and no internals |
| Background job keeps failing | `failure.test.ts` (new) | Retried with exponential backoff (no hot loop), parked as `dead` after `maxAttempts`, and counted by `/api/ready`. Other jobs keep running |
| Billing provider unreachable | `failure.test.ts` (new) | 503 `billing_unavailable`; subscription unchanged; no "checkout started" audit; webhooks recover after the outage |
| Network failure in the browser | `recovery.spec.ts` | A recoverable error with Retry |
| AI engine unavailable | `ai-failures.test.ts`, `recovery.spec.ts` | 503; nothing half-saved; allowance released; the page keeps working |
| Expired or revoked session | `security.test.ts`, `recovery.spec.ts` | Back to sign-in, then the same page |
| Duplicate submission | Idempotency keys on create (`workflow.test.ts`: idempotent engagement create) | One record |
| Concurrent edit | Version conflict (`workflow.test.ts`) | 409; the draft is kept |
| Oversized request | `security.test.ts` | 413 before parsing |

## 3. Commercial simulation (billing simulator only)
`billing.test.ts` (17 tests) covers:
- the trial;
- seat limits;
- declined checkout;
- signed webhooks (duplicate, forged, out-of-order);
- upgrade and downgrade;
- failed renewal → grace → read-only → recovered;
- cancel and resume;
- trial expiry;
- the AI allowance under concurrency;
- reconciliation of a missed webhook.

`provider-flow.test.ts` exercises the real Stripe and Paddle SDK adapters against in-memory fakes of their HTTP APIs.

**The real payment providers are unverified.** No sandbox keys were supplied, and no live or sandbox charge was made.

Simulated workspaces carry commercial state: workspaces with more than 10 users have an active Professional subscription, and smaller ones are on trial.

## 4. Simulated persona workflows (Profile D: 100 users, 5,001 stakeholders)
> **Simulated workflow findings.** These are scripted Chrome sessions (`scripts/sim-personas.mjs`) against `scripts/sim-serve.ts`. The setup was a production build, PostgreSQL after `ANALYZE`, a 1440 × 900 window and one machine. Each persona signed in as a generated user with the matching role. The timing is from the action to the screen settling: no skeletons and no API request in flight for 300 ms. **This is not usability research: no human took part, and nothing here says whether a person would find the screens clear.**

| Persona (role used) | Step | Settled in | Result |
|---|---|---|---|
| Executive (owner) | Command Center: what needs attention | 425 ms | ✓ "1987 overdue commitments, 237 decisions waiting and 92 key relationships cooling" |
| | Decisions waiting | 402 ms | ✓ |
| | Relationship map (default initiative, 963 people) | 1,570 ms | ✓ |
| Program Manager (manager) | Initiatives register | 407 ms | ✓ |
| | Open an initiative | 207 ms | ✓ |
| | Overdue commitments (1,966 visible to a manager) | 485 ms | ✓ |
| Relationship Manager (contributor) | Directory | 85 ms | ✓ |
| | Filter by name | 10 ms* | ✓ |
| | Open a profile | 105 ms | ✓ |
| | Profile engagements tab | 64 ms | ✓ |
| Operations Lead (manager) | Command Center, commitments tab | 392 ms | ✓ |
| | Commitments due this week | 413 ms | ✓ 199 (**was 0**) |
| | Engagements register | 407 ms | ✓ |
| Workspace Admin (owner) | Members (98 role controls) | 392 ms | ✓ |
| | Audit log | 376 ms | ✓ |
| | Subscription | 36 ms | ✓ |

\*The filter is debounced, so 10 ms is the time to type, not to see results. The step proves only that the filter works.

**The first run found two defects**, kept as `evidence/personas-D-before.json` with its screenshots in `evidence/personas/before/`:
1. **"Due this week" read 0 with 2,835 open commitments (P1).**
   - The tab narrowed the first 200 open commitments in the browser, and at this volume all 200 were overdue.
   - Fix: a server filter (`dueWithinDays`) gives a true count (199) and full paging.
   - Regression test: `simulation.test.ts`.
2. **The workspace briefing contradicted the headline (P1).**
   - The headline read "1987 overdue commitments", while the briefing beneath it read "60 commitments are overdue. 45 decisions are waiting. 40 key relationships are cooling." The briefing counted the capped list.
   - Fix: it now uses the true per-kind totals.
   - Regression test: `simulation.test.ts`, verified to fail on the old code.

Compare `evidence/personas/before/D-executive-1.png` with `evidence/personas/D-executive-1.png`.

**Script defects in the first run, not product defects:**
- every persona signed in as the owner;
- the name filter used a field the manifest doesn't have;
- the members check read truncated text.

They were fixed before the second run.
