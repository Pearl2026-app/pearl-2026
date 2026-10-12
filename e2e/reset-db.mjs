// Gives the end-to-end run a fresh, seeded database schema. Only the schema named "e2e" is ever dropped.
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { E2E } from './env.mjs';

const url = new URL(E2E.DATABASE_URL);
if (url.searchParams.get('schema') !== 'e2e') throw new Error('E2E_DATABASE_URL must end with ?schema=e2e; refusing to reset anything else.');
const db = resolve(import.meta.dirname, '../packages/db');
const env = { ...process.env, ...E2E };
const base = new URL(url);
base.searchParams.delete('schema');
execSync(`npx prisma db execute --stdin --url "${base}"`, { cwd: db, env, input: 'DROP SCHEMA IF EXISTS "e2e" CASCADE;', stdio: ['pipe', 'inherit', 'inherit'] });
execSync('npx prisma migrate deploy', { cwd: db, env, stdio: 'inherit' });
execSync('npx tsx seed/seed.ts', { cwd: db, env, stdio: 'inherit' });
console.log('e2e schema ready');
