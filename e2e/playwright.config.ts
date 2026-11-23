import { defineConfig } from '@playwright/test';

// E2E scenarios of docs/08-stp-std.md §3. Needs the local PocketBase (docker compose up -d pocketbase).
// Starts its own API (MockProvider, 3 s QR windows) on :8788 and Vite on :5174, so the dev servers can keep running.
// Locally it runs on the installed Edge; CI runs Chromium and WebKit (Safari's engine, as on iPhones).
const CI = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  projects: CI
    ? [
        { name: 'chromium', use: { browserName: 'chromium' } },
        { name: 'webkit', use: { browserName: 'webkit' } },
      ]
    : [{ name: 'edge', use: { channel: 'msedge' } }],
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
