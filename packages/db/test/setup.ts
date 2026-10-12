process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://referendum:referendum@127.0.0.1:5432/referendum_test';
process.env.DATABASE_URL_TEST = process.env.DATABASE_URL;
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
process.env.SESSION_SECRET = 'test-secret';
process.env.QUEUE_MODE = 'inline';
process.env.EMBEDDING_PROVIDER = 'local';
process.env.PUBLIC_BASE_URL = 'http://localhost:5173';
process.env.STORAGE_LOCAL_DIR = '/tmp/referendum-test-storage';
