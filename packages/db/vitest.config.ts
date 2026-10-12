import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 180000,
    hookTimeout: 60000,
  },
});
