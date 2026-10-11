import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://referendum:referendum@127.0.0.1:5432/referendum_test',
      DATABASE_URL_TEST: 'postgresql://referendum:referendum@127.0.0.1:5432/referendum_test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      SESSION_SECRET: 'test-secret',
      QUEUE_MODE: 'inline',
      PORT: '3100',
      PUBLIC_BASE_URL: 'http://localhost:5173',
      STORAGE_LOCAL_DIR: '/tmp/referendum-test-storage',
    },
  },
});
