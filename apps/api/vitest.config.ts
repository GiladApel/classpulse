import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.int.test.ts', 'node_modules/**'],
    // NFR-07: ≥80% of lines in the domain packages.
    coverage: {
      include: ['src/{admin,attendance,challenge,engagement,content}/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 80 },
    },
  },
});
