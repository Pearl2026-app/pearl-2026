import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PrismaClient } from '@sahyadri/db';

/**
 * Each test run gets its own fresh schema in the test database (created, migrated and seeded here,
 * dropped in teardown). Nothing that existed before the run is touched.
 */
export default async function setup() {
  const base = process.env.TEST_DATABASE_BASE_URL ?? 'postgresql://sahyadri:sahyadri@localhost:5432/sahyadri_test';
  const schema = `run_${process.pid}_${Date.now().toString(36)}`;
  const url = `${base}${base.includes('?') ? '&' : '?'}schema=${schema}`;
  process.env.TEST_DATABASE_URL = url;

  const db = resolve(__dirname, '../../../packages/db');
  const env = { ...process.env, DATABASE_URL: url, SEED_PASSWORD: 'Sahyadri@2026', STORAGE_LOCAL_DIR: '/tmp/sp-test-seed-media' };
  execSync('npx prisma migrate deploy', { cwd: db, env, stdio: 'pipe' });
  execSync('npx tsx seed/seed.ts', { cwd: db, env, stdio: 'pipe' });

  return async () => {
    if (process.env.KEEP_TEST_SCHEMA) return;
    const admin = new PrismaClient({ datasources: { db: { url: base } } });
    try {
      // Only the schema this run created is dropped.
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await admin.$disconnect();
    }
  };
}
