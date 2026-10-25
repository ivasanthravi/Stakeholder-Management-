# Synthetic Data Generation (Phase 7)

**Code:** `app/server/db/sim/`

| File | Contents |
|---|---|
| `rng.ts` | Seeded randomness |
| `industries.ts` | Ten industry packs: data only |
| `generate.ts` | Planner |
| `write.ts` | Loader |
| `cli.ts` | Command line |

## Principles
- **Deterministic.** A seeded PRNG (mulberry32) drives every choice, and record ids are drawn from a separate seeded stream.
  - Same `--seed` + same `--anchor` date ⇒ byte-identical plan. Tested in `tests/simulation.test.ts`.
  - Without `--anchor`, the anchor is today, so dates stay relative to now.
- **Fictional only.** Invented people, organisations and places. Every email is on an `example.com` sub-domain (tested). No patient, financial-account or real contact data.
- **Through the product's own layers.**
  - Users are created with Better Auth (real password hashing).
  - Every workspace record is inserted inside `withTenant`, so **row-level security and same-tenant foreign keys apply to the simulation exactly as to real data**.
- **Only states the product can produce.** The generator follows the API's rules:
  - one active relationship per type between two records;
  - symmetric types are de-duplicated in both directions;
  - two people can't be both *allied* and *opposed* (the API refuses that);
  - ending a relationship archives it with a history entry (the API has no end date for relationships);
  - people who leave keep a membership row marked removed.
- **Meaningful structure, not random edges:**
  - Reporting lines inside each organisation run up to its most senior people.
  - Regulators *regulate*, funders *fund*, partners *partner*, at organisation level.
  - Colleagues sit within an organisation.
  - Cross-organisation *influence / allied / opposes / advises* ties exist only between people on a **shared initiative**, chosen by their stances.
- **Believable timelines:**
  - engagements over 24 months, denser recently;
  - commitments come out of meetings, with due dates 3–45 days after them;
  - statuses follow dates (most past-due commitments are completed, some are still open, some cancelled);
  - decisions are decided around their due dates.
- **Heavy-tailed engagement:**
  - a few people dominate (Pareto weights × influence);
  - 8% were never engaged;
  - 7% have gone quiet (nothing in the last 400 days);
  - one person has a long history.
- **History matches current state:** stance changes end at the current stance, status changes end at the current status.

## Profiles (engineering test profiles, not plan limits)
| Profile | Workspaces | Users | Stakeholders | Relationships | Activity records* |
|---|---|---|---|---|---|
| A Solo | 1 | 1 | 25 | 50 | 100 |
| B Small team | 1 | 5 | 250 | 1,000 | 2,000 |
| C Growing organisation | 1 | 25 | 1,000 | 5,000 | 10,000 |
| D Enterprise | 1 | 100 | 5,000 | 25,000 | 50,000 |
| E Multi-tenant stress | 50 | 3 each | 10,000 total (200 each) | 50,000 total | 100,000 total |

\***Activity records** are engagements (70%), commitments (18%), decisions (4%) and activity history (the rest). A few explicit complication records (one duplicate stakeholder, a handful of commitments) are added on top, so counts land within about 1% of the target.

**Commercial state:** workspaces with more than 10 users get an active Professional subscription, because the trial's seat cap would not fit them. Smaller workspaces start a normal trial.

## Named complications (explicit records, listed per workspace in the manifest)
| Kind | Representation |
|---|---|
| `changed_organization` | Old affiliation ended (`valid_to`) 120 days ago, new primary affiliation; history entries; earlier engagements unchanged |
| `sponsor_left` | A manager's membership removed; their initiative handed over (history entry); their open commitments still name them |
| `ownership_dispute` | A decision with no owner and approvers from two departments with opposing stances |
| `approved_decision_unfinished_commitment` | An approved decision and an overdue "Implement D-xxx" commitment (linked by initiative and text; see gap G1) |
| `overdue_commitment_blocks_decision` | A pending decision and an overdue commitment the stakeholder owes for it |
| `meeting_many_commitments` | One meeting with three commitments due 2, 7 and 21 days later |
| `paused_initiative_active_engagement` | An initiative on hold with recent engagements |
| `relationship_ended` | Relationship archived with a "Relationship removed" history entry |
| `archived_org_history` | An archived organisation whose people took part in decided decisions |
| `duplicate_stakeholder` | The same person entered twice (second record partial) |
| `multiple_organizations` | A second, non-primary affiliation (board seat) |
| `decision_reopened` | Approved, then reopened to review (two history entries) |
| `commitment_reassigned` / `commitment_reopened` | Owner change; completed then reopened |
| `restricted_stakeholder` | About 1% restricted, with an access list |
| `archived_stakeholders` | About 2% archived |
| `long_history`, `missing_information`, `never_engaged`, `gone_quiet` | As named |

## Running it locally
```bash
cd app
npm run sim -- --profile B --industry construction            # one workspace into .data/sim (PGlite)
npm run sim -- --profile B --industry all                     # ten workspaces, one per industry
npm run sim -- --profile E                                    # fifty isolated workspaces
PGLITE_DIR=.data/sim-c npm run sim -- --profile C --seed 42   # another directory and seed
DATABASE_URL=postgres://…@localhost:5432/sim npm run sim -- --profile D   # a local PostgreSQL
npm run sim -- --clean                                        # remove simulated workspaces and users
```

- **Manifest:** written next to the data (`manifest-<profile>.json`): workspace ids, counts, users and complications.
- **Signing in:** to browse a simulation, point the dev API at it (`PGLITE_DIR=.data/sim npm run dev`) and sign in with any user email from the manifest. The password is `simulation-2026`, a test-only credential for local simulation data.

**Safety:**
- The CLI refuses `NODE_ENV=production` and `DEPLOY_ENV=production`.
- It refuses a non-local `DATABASE_URL` unless `SIM_ALLOW_REMOTE=1`, which is for an authorised, non-production staging database only.
- `--clean` deletes only workspaces whose settings carry the simulation marker, and only users on `.example.com` with no remaining membership.

**After loading:** the loader runs `ANALYZE`, because without planner statistics a freshly loaded PGlite database made the relationship-map query up to about 550× slower (117 s vs 0.21 s at Profile D) (see `graph-stress-results.md`).

**Harnesses:**
| Command (from `app/`) | What it does | Results in |
|---|---|---|
| `npx tsx scripts/sim-scale.ts --profile C\|D\|E` | Truth checks, latency and load at 1–100 users on PostgreSQL | `performance-results.md` |
| `./scripts/sim-graph.sh` (`PROFILES="C D"` to limit) | Relationship-map stress in Chrome, profiles A–E | `graph-stress-results.md` |
| `npx tsx scripts/sim-serve.ts --profile D` | Serves a profile from PostgreSQL with a production build at http://localhost:4196, for browsing or personas | — |
| `node scripts/sim-personas.mjs http://localhost:4196 D` | Simulated persona workflows against `sim-serve` | `workflow-results.md`, section 4 |
