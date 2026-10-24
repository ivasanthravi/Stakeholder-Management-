// Runs the Vitest suites against a real PostgreSQL server (embedded-postgres, a dev dependency), not PGlite.
// Usage: node scripts/test-postgres.mjs [vitest args…]
import EmbeddedPostgres from 'embedded-postgres'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = mkdtempSync(path.join(tmpdir(), 'meridian-pg-'))
const port = 5545
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'meridian', password: 'test-only', port, persistent: false, onLog: () => {} })
await pg.initialise()
await pg.start()
const code = await new Promise(resolve => {
  const child = spawn('npx', ['vitest', 'run', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, TEST_PG_URL: `postgres://meridian:test-only@localhost:${port}/postgres` } })
  child.on('exit', resolve)
})
await pg.stop()
rmSync(dir, { recursive: true, force: true })
process.exit(code ?? 1)
