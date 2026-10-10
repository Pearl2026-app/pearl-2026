import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL!;

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DATABASE_URL,
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  QUEUE_MODE: 'inline',
  RUN_WORKERS: 'false',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef',
  APP_SECRET: 'test-app-secret-0123456789abcdef',
  WEB_URL: 'http://web.test',
  ADMIN_URL: 'http://admin.test',
  API_URL: 'http://api.test',
  STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR ?? mkdtempSync(join(tmpdir(), 'sp-test-storage-')),
  PAYMENT_PROVIDER: 'sandbox',
});
delete process.env.DEV_FIXED_OTP;
