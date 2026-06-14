import { defineConfig } from 'vitest/config';

/**
 * Test runner config.
 *
 * - `setupFiles` injects a valid test environment (config validation is strict
 *   and would otherwise refuse to boot during import).
 * - `unit` tests are pure and need no services.
 * - `integration` tests that need Postgres/Redis are gated behind those
 *   services being available (CI provides them; see .github/workflows/ci.yml).
 * - `fileParallelism: false` runs test FILES sequentially. The integration
 *   suites all share ONE Postgres database and post to the ledger under
 *   SERIALIZABLE isolation, where concurrent transactions across files raise
 *   spurious write-conflict (P2034) failures via predicate locks. Within-file
 *   tests already run in order; serializing files makes the suite deterministic.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
