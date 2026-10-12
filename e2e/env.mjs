// Settings for the API during end-to-end runs: development mode with the fixed sign-in code and the payment sandbox.
// No real secrets: these values only ever run against a throwaway local or CI database.
export const E2E = {
  NODE_ENV: 'development',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgresql://sahyadri:sahyadri@localhost:5432/sahyadri_test?schema=e2e',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/2',
  QUEUE_MODE: 'inline',
  RUN_WORKERS: 'false',
  JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
  APP_SECRET: 'e2e-app-secret-0123456789abcdef',
  DEV_FIXED_OTP: '123456',
  OTP_MAX_PER_WINDOW: '50',
  PAYMENT_PROVIDER: 'sandbox',
  WEB_URL: 'http://localhost:3000',
  ADMIN_URL: 'http://localhost:3001',
  API_URL: 'http://localhost:4000',
  STORAGE_LOCAL_DIR: process.env.E2E_STORAGE_DIR ?? '/tmp/sp-e2e-media',
  SEED_PASSWORD: 'Sahyadri@2026',
};
