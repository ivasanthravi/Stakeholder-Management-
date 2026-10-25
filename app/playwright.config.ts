import { defineConfig } from '@playwright/test'

// E2E runs against an isolated stack: its own API (fresh PGlite database) and Vite dev server,
// so tests never touch the development data.
const API_PORT = 8799, WEB_PORT = 5199
const dir = `.data/e2e-${Date.now()}`
// E2E_BASE_URL points the suite at an already-running deployment (the staging rehearsal); no local servers start.
const target = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: target ?? `http://localhost:${WEB_PORT}`, ignoreHTTPSErrors: !!target, channel: 'chrome', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: target ? [] : [
    { command: `API_PORT=${API_PORT} APP_URL=http://localhost:${WEB_PORT} PGLITE_DIR=${dir} npx tsx server/index.ts`, url: `http://localhost:${API_PORT}/api/health`, reuseExistingServer: false, timeout: 60_000 },
    { command: `VITE_PORT=${WEB_PORT} API_PORT=${API_PORT} npx vite`, url: `http://localhost:${WEB_PORT}`, reuseExistingServer: false, timeout: 60_000 },
  ],
})
