# Stakeholder Profile Review (Phase 8)

**Hierarchy the profile must express:** identity → context → activity → responsibilities → relationships → intelligence → next actions.

## Passes
| Pass | Purpose | Result |
|---|---|---|
| **1. "What has happened?"** | One chronological record of the person | The History tab, which only listed edits to the record, became **Timeline**: engagements, commitments (raised and completed), decisions (opened and decided) and record changes, filterable, grouped by month, paged on the server |
| **2. Context first** | The briefing's first line should add context, not repeat the header | The rules briefing opens with the initiatives the person is recorded on, and their role in each |
| **3. Finish** | Unfinished details on the flagship screen | The "Record" card's description list was unstyled (each value indented under its label). It now uses a label/value row layout |
| **4. Correctness** | The test written for the timeline found a defect | Filtering to "Decisions" alone failed with a server error (unaliased union columns). Fixed, with a regression test |

## Changes
| # | Before | After | Files |
|---|---|---|---|
| P1 | "History: No history yet" for a person with 18 engagements | **Timeline** tab (same `?tab=history` URL). Filters: All · Engagements · Commitments · Decisions · Changes. Each line shows the kind ("Meeting", "Commitment raised", "Decision approved"), key, initiative and time, and opens its source record. Engagement summaries and decision outcomes appear inline. "Load older" pages 40 at a time | `GET /stakeholders/:id/timeline` (new, `stakeholders.ts`), `useTimeline` (`hooks.ts`), `TimelineItem` (`types.ts`), `Profile.tsx` (HistoryTab), `profile.css` |
| P2 | Briefing line 1: "Jakob McAllister is Connections Lead at Westshire Water, recorded as concerned with low influence" (all in the header above it) | "Jakob is recorded on one initiative: EDR Eastgate Depot Renewal (partner)." People with no initiative keep the identity sentence, plus "not yet linked to an initiative" | `server/modules/briefing.ts` |
| P3 | Record card: browser-default `<dl>` | `.kv` rows: label left, value right | `profile.css` |

**Evidence:**
- `screenshots/before/i-13-profile-tab-history.png` vs `screenshots/after/i-14-profile-tab-history.png`;
- `before/profile-1440.png` vs `after/profile-1440.png`;
- `after/profile-390.png`.

## Timeline at scale
- **Server-paged:** keyset on (time, id), 40 per page. It never loads the full history: a person with 310 engagements (Phase 7 Profile D) loads page by page.
- **Rendering:** each page adds 40 rows to a plain list. Virtualization wasn't needed at that page size. A user who loads more than 1,000 rows would be the case for it (tracked in `final-quality-report.md`).
- **Permissions:**
  - row-level security applies to every source table;
  - a restricted person returns 404 to people outside their access list;
  - another workspace's person returns 404.

  Tested in `simulation.test.ts` ("a person the caller can't see has no timeline either").

## AI briefing (requirement 6.6)
**The profile briefing is rule-assembled**, labelled "Assembled by rules from this workspace's records — no language model is used. Every claim cites the record it came from". Sentences are typed fact or inference ("Contact has slowed…" is marked as an inference, with its counts). The **Prepare briefing** document (Phase 3) holds the longer, model-capable briefing, with its own engine label and fallback.

**Never invented:** sentiment, intent or loyalty. Stance and influence appear only as recorded values.

## Tests
- `simulation.test.ts`, "stakeholder timeline (Phase 8)":
  - paging returns every engagement, commitment, completion and decision for a long-history person;
  - no repeats; newest first;
  - the decision-only filter works;
  - restricted and foreign people return 404.
- E2E `signature.spec.ts`: the timeline shows the engagement and the "Commitment raised" line; completing the commitment on the profile updates Home.

## Remaining
- The Overview tab still shows the engagement list and the 52-week strip. The Timeline is the complete record, but the two aren't merged, to keep the approved Overview layout.
- Record changes from before Phase 8 exist only where the app recorded them. The seeded sample data has none, so the "Changes" filter is empty there.
