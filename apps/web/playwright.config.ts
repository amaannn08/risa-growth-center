import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const DB = `pglite:${resolve(__dirname, '../../.pglite-e2e')}`;
const PORT = 3200;
/** e2e runs against a local PGlite file DB (never the shared Neon DB): seed fresh, then start Next. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm --filter @gc/db exec tsx scripts/cli.ts seed --force && next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/campaigns`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: DB, MUTATION_RATE_LIMIT: '100000', COPILOT_MODE: 'mock', CHAT_RATE_LIMIT: '100000', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
