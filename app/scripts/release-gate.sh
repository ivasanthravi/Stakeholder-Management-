#!/usr/bin/env bash
# Release gate: every check CI runs, in order, stopping at the first failure. Run from app/.
#   ./scripts/release-gate.sh            full gate (≈ 10–15 min)
#   SKIP_E2E=1 ./scripts/release-gate.sh   without browser tests
set -euo pipefail
cd "$(dirname "$0")/.."
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

step "Dependency audit (fail on high/critical in runtime deps)"
npm audit --omit=dev --audit-level=high

step "Type check (client + server)"
npm run typecheck

step "Lint"
npx eslint . --max-warnings=50

step "Unit + integration tests (PGlite)"
npx vitest run

step "Unit + integration tests (real PostgreSQL)"
node scripts/test-postgres.mjs

step "AI evaluation (rules engine) + safety/grounding gate"
AI_ENGINE=local npx tsx evals/run.ts > /dev/null
npx tsx evals/gate.ts

step "Backup/restore drill (real PostgreSQL)"
npx tsx scripts/restore-drill.ts > /dev/null

step "Production build"
npm run build > /dev/null

if [ "${SKIP_E2E:-0}" != "1" ]; then
  step "End-to-end (Playwright, isolated stack)"
  npx playwright test
fi

printf '\n\033[1;32m✓ Release gate passed\033[0m\n'
