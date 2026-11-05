import { defineConfig } from 'vitest/config';

// Needs a running PocketBase with migrations applied (docker compose up pocketbase) and ../../.env.
export default defineConfig({
  test: { include: ['src/**/*.int.test.ts'], testTimeout: 20_000, hookTimeout: 30_000, fileParallelism: false },
});
