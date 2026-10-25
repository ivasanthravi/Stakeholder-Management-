#!/bin/bash
# Phase 7 graph stress: Stakeholder Universe on a production build for simulation profiles A–E (local only).
# Each profile: generate into its own PGlite dir → API + vite preview → measure (default initiative and whole
# workspace, 1× and 4× CPU, median of 3) → stop and clean up. Results: ../docs/simulation/evidence/graph/
set -u
cd "$(dirname "$0")/.."
OUT=../docs/simulation/evidence/graph; mkdir -p $OUT
npx vite build --outDir .data/simgraph-dist --emptyOutDir > /dev/null 2>&1 || { echo BUILD_FAILED; exit 1; }
for P in ${PROFILES:-A B C D E}; do
  DIR=.data/simgraph-$P; rm -rf $DIR
  PGLITE_DIR=$DIR npx tsx server/db/sim/cli.ts --profile $P --industry construction --seed 7 --manifest $DIR-manifest.json > /dev/null 2>&1 || { echo "GEN_FAILED $P"; continue; }
  EMAIL=$(node -e "const m=require('./$DIR-manifest.json');console.log(m[0].users.find(u=>u.role==='owner').email)")
  API_PORT=8831 APP_URL=http://localhost:4195 PGLITE_DIR=$DIR JOBS_ENABLED=false API_RATE_LIMIT_PER_MINUTE=100000000 npx tsx server/index.ts > /dev/null 2>&1 & A=$!
  API_PORT=8831 npx vite preview --port 4195 --strictPort --outDir .data/simgraph-dist > /dev/null 2>&1 & W=$!
  for p in 4195 8831; do for k in $(seq 1 120); do curl -s -o /dev/null http://localhost:$p/ && break; sleep 1; done; done
  for SCOPE in default all; do for T in 1 4; do
    MEASURE_EMAIL=$EMAIL MEASURE_PASSWORD=simulation-2026 MEASURE_OUT=$OUT node scripts/sim-graph-measure.mjs http://localhost:4195 sim-$P-$SCOPE $T 3 $SCOPE $([ $T = 1 ] && echo shot) > /dev/null 2>&1 || echo "MEASURE_FAILED $P $SCOPE $T"
  done; done
  pkill -P $A; kill $A; pkill -P $W; kill $W; sleep 2; rm -rf $DIR $DIR-manifest.json
  echo "done $P"
done
rm -rf .data/simgraph-dist
