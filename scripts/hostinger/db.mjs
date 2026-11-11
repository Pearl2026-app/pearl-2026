// The shop's own PostgreSQL on Hostinger (owner, 11 Nov: "set up everything new in Hostinger"). Hostinger's Business
// plan offers MySQL only, and the shop's database is PostgreSQL, so when DATABASE_URL is not set the app runs a real
// PostgreSQL 16 of its own (the embedded-postgres package's binaries) as a child process. Its data lives outside the
// app folder (~/sahyadri-db by default, or SP_DB_DIR), so it survives redeploys. Its password is generated here, on
// the server, the first time, and kept beside the data; it never leaves the server.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function ownDatabase() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const base = process.env.SP_DB_DIR ?? join(homedir(), 'sahyadri-db');
  const dataDir = join(base, 'data');
  const pwFile = join(base, '.password');
  mkdirSync(base, { recursive: true, mode: 0o700 });
  if (!existsSync(pwFile)) writeFileSync(pwFile, randomBytes(24).toString('hex'), { mode: 0o600 });
  const password = readFileSync(pwFile, 'utf8').trim();
  const port = Number(process.env.SP_DB_PORT ?? 5433);
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'sahyadri', password, port, persistent: true, onLog: () => {}, onError: (e) => console.error('[db]', String(e)) });
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log('[db] creating the database (first start)');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('sahyadri');
  } catch {
    // already there
  }
  const stop = async () => {
    try {
      await pg.stop();
    } catch {
      // already stopped
    }
  };
  return { url: `postgresql://sahyadri:${password}@127.0.0.1:${port}/sahyadri`, stop };
}
