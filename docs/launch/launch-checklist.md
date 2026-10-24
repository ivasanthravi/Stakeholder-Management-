# Launch Checklist

**Gate states:**
- ☑ passed with evidence
- ☐ open
- ⛔ blocked (missing credentials or decision)

**Rule:** launch is permitted only when every **critical** gate is ☑.

## Critical gates
| Gate | State | Evidence / blocker |
|---|---|---|
| Tenant isolation: zero cross-tenant exposure | ☑ | isolation.test.ts (PGlite + PostgreSQL) |
| No open critical or high security finding from internal review | ☑ | security-report.md (S1–S8 fixed) |
| Independent penetration test | ☐ | B8 |
| Release gate green (typecheck, lint, tests on both DBs, AI gate, restore drill, build, E2E) | see §Gate run | `scripts/release-gate.sh` |
| CI green on the remote | ☐ | B10 |
| Staging deployed and smoke-tested over https | ☐ | B4 |
| Restore drill (local) | ☑ | evidence/restore-drill-2026-10-24.json |
| PITR drill on the managed provider; RPO/RTO approved | ☐ | B5 |
| Rollback rehearsed | ☑ locally / ☐ on staging | evidence/deploy-rollback-drill-2026-10-24.json |
| Billing sandbox scenarios pass | ⛔ | B1, B2 (B3 if Paddle) |
| Live payments approved (`BILLING_LIVE_APPROVED`) | ☐ | Explicit business approval required; not requested |
| Alerting, uptime monitor, error tracker, on-call | ☐ | B6 |
| Legal documents reviewed by counsel and published | ☐ | B7 |
| Support owner and channels named | ☐ | B9 |
| AI: safety and grounding gate (rules engine) | ☑ | `evals/gate.ts` PASS |
| AI: model engine disabled, or live-evaluated | ☑ (disabled by default) | `AI_ENGINE=local` |
| Accessibility: automated + scripted checks | ☑ | 98/98 axe, 26/26 scripted |
| Performance budgets (local) | ☑ | performance-report.md |

## Pre-deploy (each release)
1. `./scripts/release-gate.sh` passes.
2. `CHANGELOG.md` updated, and a version chosen (semver).
3. Migrations reviewed against the expand/contract policy.
4. Required environment variables are present in the target (see the deployment runbook).

## Deploy (each release)
1. Deploy to staging.
2. Run `scripts/smoke.ts` with the smoke account.
3. Manually check the changed flows.
4. Get named approval.
5. Run a rolling deploy to production, gated on `/api/ready`.
6. Run a production smoke test.
7. Watch the metrics for 30 minutes.
8. Tag the release.

## Gate run: 2026-10-24, after all Phase 4 changes (including the visual fixes)
`./scripts/release-gate.sh` exited **0** ("✓ Release gate passed"). Local machine, not CI.

| Step | Result |
|---|---|
| `npm audit --omit=dev --audit-level=high` | 0 high/critical. 4 moderate (esbuild via drizzle-kit, dev-server advisory; accepted in security-report) |
| Typecheck (client + server) | Pass |
| ESLint | 0 errors, 10 warnings (limit 50) |
| Vitest on PGlite | 148/148 (13 files) |
| Vitest on PostgreSQL 18.4 | 148/148 (13 files) |
| AI evaluation + safety/grounding gate | PASS |
| Backup/restore drill | Pass |
| Production build | Pass (chunk-size advisory only) |
| Playwright E2E | 16/16 |

Also re-run after the visual fixes:
- axe sweep: 98/98 views
- `audit/a11y-manual.mjs`: 26/26 (evidence file refreshed)
