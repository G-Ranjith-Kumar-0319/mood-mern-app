import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Each integration file starts its own in-memory MongoDB replica set; capping parallel
    // files avoids startup timeouts when many mongod processes boot at once.
    maxWorkers: 4,
    // Integration tests share one in-memory MongoDB per test file.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    restoreMocks: true,
  },
});
