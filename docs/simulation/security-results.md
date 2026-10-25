# Security and Multi-Tenant Results (Phase 7)

**Rule applied throughout:** authorisation was never disabled to speed up a test.
- The simulation writes through the product's own `withTenant` (row-level security) path.
- Load tests sign in as real simulated users and call the real API with sessions.
- Rate limits were **raised** for the load harness (one IP, many virtual users), not removed. Sign-in rate limiting is tested separately.

## 1. Cross-tenant isolation on simulated data
| Test | Data | Result |
|---|---|---|
| **Direct object reference.** Each workspace owner requests the **next** workspace's stakeholder and decision ids through their own workspace | 12 simulated workspaces (10 industries at Profile A + 2 at Profile B) | 404 in every case (`simulation.test.ts`, "tenant boundaries") |
| **Workspace entry.** Each owner requests the other workspace's register directly | Same | 404 (membership gate; existence not revealed) |
| **Graph.** Each owner's full-scope graph contains none of the neighbouring workspace's people | Same | 0 foreign nodes |
| **Isolation under load.** 10 tenants drive concurrent traffic; every Directory response is checked against that tenant's own generated ids | **Profile E**: 50 workspaces, 10,050 people, 125 MB | **8,812 responses checked, 0 foreign records** (final run; 5,552 in the first run, also 0) (`evidence/scale-E.json`) |
| **Copilot.** A contributor asks about everyone; restricted stakeholders never appear | Energy Profile B | Never shown (`simulation.test.ts`) |

## 2. Existing security suites (re-run on both PGlite and PostgreSQL in the release gate)
| Suite | What it covers | Phase 7 status |
|---|---|---|
| `tenancy.test.ts` (18) | Workspace-id spoofing; direct object reference; cross-tenant links blocked by same-tenant foreign keys; RLS backstop when application code "forgets" a filter; role matrix; restricted records; membership lifecycle; audit | Pass |
| `isolation.test.ts` (11) | Reads and writes across tenants; search, aggregates and Copilot retrieval; per-tenant exports, digests and notifications; immediate effect of demotion and removal; RLS on every tenant-reachable table | Pass |
| `security.test.ts` (23) | CSRF; body limit; structured errors without stack traces; SQL metacharacters; security headers and CSP; cookie flags; session expiry and revocation; rate limiting with a forged `X-Forwarded-For`; production configuration guards | Pass |

## 3. Simulated security-relevant complications
| Complication (generated) | Expected | Result |
|---|---|---|
| `sponsor_left`: a manager's membership removed | They lose access at once. Their open commitments surface as needing an owner | Access removal: `isolation.test.ts`. **Finding fixed:** before Phase 7, commitments still owned by a departed member were not flagged anywhere. They now appear as "unassigned" with the reason "Owner left the workspace (name)" |
| `restricted_stakeholder`: about 1% restricted, with an access list | Hidden from contributors and viewers in lists, search, graph, dashboard and Copilot | Pass (`tenancy.test.ts`, Copilot test) |
| Duplicate-relationship and contradiction attempts | Refused (409) without partial writes | Pass (`simulation.test.ts`, graph block) |

## 4. Data-handling checks on the generator
- Every generated email is on an `example.com` sub-domain. This is asserted for every user and stakeholder in the plan.
- There are no patient, clinical or financial-account fields in any pack. Healthcare and financial-services packs are administrative and governance only.
- `npm run sim` refuses `NODE_ENV=production` or `DEPLOY_ENV=production`, and refuses a non-local `DATABASE_URL` unless `SIM_ALLOW_REMOTE=1` is set.
- `--clean` removes only workspaces carrying the simulation marker, and `.example.com` users with no remaining membership.
- The simulated password `simulation-2026` is a local test credential. It is documented, never used outside simulation data, and never logged.

## 5. Not verified
- **Penetration testing by a third party.** Not done.
- **A real multi-node deployment.** Every result is from a single API process on one machine. Isolation is enforced per request and per transaction, so it does not depend on the process count, but this was not tested on more than one node.
- **No compliance claim** is made or implied.
