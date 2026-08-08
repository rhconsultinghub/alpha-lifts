import { defineConfig } from 'vitest/config';

// Deliberately its own config (not vite.config.ts): the app config carries the PWA plugin and
// build-time env handling that unit tests don't need. Tests cover the pure logic modules only
// (state/logic.ts, data/wizard.ts, state/deload.ts) and run in plain node — no DOM, no React.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
