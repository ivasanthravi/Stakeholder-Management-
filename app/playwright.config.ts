import { defineConfig } from '@playwright/test'

// E2E runs against an isolated stack: its own API (fresh PGlite database) and Vite dev server,
// so tests never touch the development data.
const API_PORT = 8799, WEB_PORT = 5199
const dir = `.data/e2e-${Date.now()}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: { baseURL: `http://localhost:${WEB_PORT}`, channel: 'chrome', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: `PORT=${API_PORT} APP_URL=http://localhost:${WEB_PORT} PGLITE_DIR=${dir} npx tsx server/index.ts`, url: `http://localhost:${API_PORT}/api/health`, reuseExistingServer: false, timeout: 60_000 },
    { command: `VITE_PORT=${WEB_PORT} API_PORT=${API_PORT} npx vite`, url: `http://localhost:${WEB_PORT}`, reuseExistingServer: false, timeout: 60_000 },
  ],
})
