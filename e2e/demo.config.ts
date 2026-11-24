import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import base from './playwright.config';

// Read by e2e/support.ts: every window is recorded into demo-video/ (gitignored).
process.env.DEMO_VIDEO ??= fileURLToPath(new URL('../demo-video', import.meta.url));

// The backup demo video: the same servers as the E2E suite, only the demo scenario, slowed down so it can be followed.
export default defineConfig({
  ...base,
  testDir: './demo',
  testIgnore: undefined,
  retries: 0,
  reporter: [['list']],
  use: { ...base.use, launchOptions: { slowMo: 250 } },
  projects: [{ name: 'edge', use: { channel: 'msedge' } }],
});
