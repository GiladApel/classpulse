import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { buildProductionContainer } from './container.js';

try {
  process.loadEnvFile('../../.env');
} catch {
  // No .env in Docker — env comes from compose.
}

const cfg = loadConfig();
const app = createApp(await buildProductionContainer(cfg));
serve({ fetch: app.fetch, port: cfg.port }, ({ port }) => console.log(`ClassPulse API on :${port}`));
