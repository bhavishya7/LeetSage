import { defineConfig } from 'vitest/config';

/**
 * Vitest config, kept separate from vite.config.ts on purpose.
 *
 * vite.config.ts carries the Chrome-extension build wiring (CRXJS-style
 * multi-entry rollup inputs for side_panel / background / content). The tests
 * here exercise PURE modules — the solution filter, structured parser, session
 * digest, analytics, records, rate limiter, stuck timer, URL normalization —
 * so they need none of that. A dedicated config keeps the test runner simple
 * and fast, and avoids dragging the extension build graph into unit tests.
 *
 * environment: 'node' because nothing under test touches the DOM. The few
 * places that reach for `chrome.*` are mocked minimally per-test.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    globals: false,
  },
});
