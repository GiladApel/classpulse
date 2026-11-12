import { defineConfig } from '@playwright/test';

// E2E scenarios of docs/08-testing.md §3. Needs the local PocketBase (docker compose up -d pocketbase).
// Starts its own API (MockProvider, 3 s QR windows) on :8788 and Vite on :5174, so the dev servers can keep running.
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'msedge', // installed on Windows; no browser download
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx src/index.ts',
      cwd: '../apps/api',
      url: 'http://127.0.0.1:8788/health',
      env: { PORT: '8788', LLM_PROVIDER: 'mock', QR_WINDOW_SEC: '3', ADMIN_EMAILS: 'e2e-admin@classpulse.test' },
      reuseExistingServer: false,
    },
    {
      command: 'node ../../node_modules/vite/bin/vite.js --port 5174 --strictPort',
      cwd: '../apps/web',
      url: 'http://localhost:5174',
      env: { API_PROXY: 'http://127.0.0.1:8788' },
      reuseExistingServer: false,
    },
  ],
});
