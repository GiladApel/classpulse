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
const container = await buildProductionContainer(cfg);
const app = createApp(container);
serve({ fetch: app.fetch, port: cfg.port }, ({ port }) => console.log(`ClassPulse API on :${port} (LLM: ${cfg.ai.provider})`));

// Challenges close on their own when the timer runs out.
let closing = false;
setInterval(async () => {
  if (closing) return;
  closing = true;
  try {
    await container.challenges.closeExpired();
  } catch (e) {
    console.error('closeExpired failed:', e);
  } finally {
    closing = false;
  }
}, 2000);
