import { defineConfig } from 'vitest/config';

/**
 * Two projects, because the two kinds of test have very different costs.
 *
 * `unit` covers domain and application code and needs no I/O, so it runs in
 * milliseconds and is what you keep in watch mode. `integration` covers
 * repositories and hits real Postgres. Separating them means the fast suite
 * stays fast — and if a unit test ever starts needing the database, that is a
 * design signal worth noticing rather than hiding.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // The integration project has no repositories yet. CI still runs it so the
    // wiring is exercised from day one rather than found broken when the first
    // repository lands in Phase 1.
    passWithNoTests: true,
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
          // Repository tests share a database; running files in parallel would
          // make them fight over it.
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/shared/testing/**', 'src/app/**'],
    },
  },
});
