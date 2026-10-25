# Product Maturity Scorecard (after Phase 7)

**How to read this:**
- **Scale:**
  - **1:** prototype;
  - **2:** works on sample data;
  - **3:** works at realistic volume with known gaps;
  - **4:** verified at volume, gaps minor;
  - **5:** verified in production with real users.
- **No area scores 5:** the product has had no production traffic and no real users.
- **Scores reflect evidence in this repository only.** Anything blocked on credentials or people is marked **Unverified** and capped at 3.

| Area | Score | Evidence | What holds it back |
|---|---|---|---|
| **Data model and integrity** | 4 | Ten industries and 20 complication kinds load through the API's own rules; consistency checks pass; history is kept for every change | Gaps G1 (commitment→decision link), G2 (dormant relationship dates) and no merge (R6) |
| **Tenant isolation and security** | 4 | 0 foreign records in 8,812 responses under load (50 tenants); direct-reference, search, graph, Copilot, export and RLS backstop tests on both databases | No third-party penetration test; single-node only |
| **Command Center truth** | 4 | Counts equal SQL in 10 industries and at Profiles B–E; three P1 truth defects found and fixed (list crowding, briefing, "due this week") | The horizon is long at enterprise scale (R1) |
| **Registers and Directory** | 4 | 11–15 ms at 5,000 stakeholders; true totals; paging | Engagement aggregation about 90 ms (R3) |
| **Relationship map** | 3 | Smooth to about 1,000 people; cap disclosed; structural cases handled | 2,000 people on a slow CPU at 15 fps (R4); no labels at fit on standard-density screens (R4b); uncompressed payload (R2) |
| **Decisions and commitments workflows** | 4 | Lifecycle, reopen, reassign, departed owner and meeting-to-commitments covered by tests and simulated personas | No bulk reassignment (R7); no dependency link (R8) |
| **AI: meeting extraction (rules engine)** | 3 | 100% on the simulation set, but **tuned**; held-out decision recall 50%; injection never followed; quotes always verbatim | Rules-engine ceiling; conflicting dates (R5) |
| **AI: Copilot (rules engine)** | 3 | True totals, citations, restricted data never shown, read-only tools; new "what changed" and "who is connected" answers | A narrow question set; anything else falls back to help text |
| **AI: Claude model engine** | Unverified | Contract-tested with a mocked transport only | No API key; never run live |
| **Performance and load** | 3 | 0 errors at 1–100 users at every profile; D p95 1.3 s at 100 users (one process); A–C and E fast | One machine and one process; production capacity not measured |
| **Failure and recovery** | 4 | Database outage, job failure (backoff, then dead and reported), provider outage, network, AI outage, expired session, conflicts, idempotency | Not tested on real infrastructure (failover, restarts under load) |
| **Commercial and billing** | 3 (simulator) / Unverified (real) | Full lifecycle in the simulator; real SDK adapters against faked HTTP | No sandbox credentials; no real charge ever made |
| **UX at volume** | 3 | Every screen truthful at Profile D; key fixes shown before and after | Map readability at scale; no real-user testing |
| **Usability with real people** | Unverified | None | Needs moderated sessions |
| **Operability (tooling)** | 4 | Deterministic generator, scale, graph, serve and persona harnesses; release gate; restore drill | No production monitoring data |

## Severity summary
| Severity | Open | Fixed in Phase 7 |
|---|---|---|
| P0 | 0 | 0 found |
| P1 | 0 | 8 (Command Center crowding, page-length totals, departed owners, Copilot totals, extraction gate failure, briefing contradiction, "due this week" = 0, PGlite map without statistics: tooling) |
| P2 | 10 (R1–R7, R4b, R5, R11) | 6 |
| P3 | 3 (R8–R10) | 1 |

## Overall
- **Simulation readiness for a pilot:** ready for **small and mid-size teams** (Profiles A–C: up to about 25 users and 1,000 stakeholders), with no open P0/P1 issues.
- **Enterprise volume** (Profile D: 100 users, 5,000 stakeholders):
  - **functionally correct** after this phase's fixes;
  - **performance-limited** on a single API process (p95 1.3 s at 100 concurrent users);
  - the relationship map at full scale is weak on slow machines.
- **Before a paid launch:**
  - verify the real billing provider in a sandbox;
  - decide on and evaluate the model engine;
  - run real-user sessions;
  - load-test on the target hosting.

**This is an engineering assessment, not a certification, and no compliance claim is made.**

## Final verification (2026-10-25, after every Phase 7 fix)
`app/scripts/release-gate.sh` passed:
- dependency audit: no high or critical issues; 4 moderate in dev tooling (drizzle-kit's esbuild);
- typecheck (client + server) and lint;
- **201 / 201** Vitest tests on PGlite and **201 / 201** on real PostgreSQL (17 files, including `simulation.test.ts` and the new `failure.test.ts`);
- AI gate PASS;
- backup/restore drill;
- production build;
- **31 / 31** Playwright E2E.
