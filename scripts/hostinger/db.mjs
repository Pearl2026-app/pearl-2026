// The shop's own PostgreSQL on Hostinger (owner, 11 Nov: "set up everything new in Hostinger"). Hostinger's Business
// plan offers MySQL only, and the shop's database is PostgreSQL, so when DATABASE_URL is not set the app runs a real
// PostgreSQL 16 of its own (the embedded-postgres package's binaries) as a child process. Its data lives outside the
// app folder (~/sahyadri-db by default, or SP_DB_DIR), so it survives redeploys. Its password is generated here, on
// the server, the first time, and kept beside the data; it never leaves the server.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Each Hostinger app (one per address, under ~/domains/<address>/) gets its own folder and port, so two apps on one
// plan never share or stop each other's database.
const site = /[\\/]domains[\\/]([^\\/]+)[\\/]/.exec(fileURLToPath(import.meta.url))?.[1] ?? 'default';
const sitePort = 5433 + ([...site].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 400);

/** Is something answering on this port? */
const reachable = (port) =>
  new Promise((done) => {
    const s = connect({ host: '127.0.0.1', port }, () => (s.end(), done(true)));
    s.on('error', () => done(false));
    s.setTimeout(3000, () => (s.destroy(), done(false)));
  });

export async function ownDatabase() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const base = process.env.SP_DB_DIR ?? join(homedir(), 'sahyadri-db', site);
  const dataDir = join(base, 'data');
  const pwFile = join(base, '.password');
  mkdirSync(base, { recursive: true, mode: 0o700 });
  if (!existsSync(pwFile)) writeFileSync(pwFile, randomBytes(24).toString('hex'), { mode: 0o600 });
  const password = readFileSync(pwFile, 'utf8').trim();
  const port = Number(process.env.SP_DB_PORT ?? sitePort);
  // PostgreSQL's own messages go to the app's runtime log, so a stop or a refusal there can be seen
  const say = (m) => String(m).split('\n').forEach((l) => l.trim() && console.log('[pg]', l.trim()));
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'sahyadri', password, port, persistent: true, onLog: say, onError: (e) => console.error('[db]', String(e)) });
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log(`[db] creating the database in ${dataDir} (first start)`);
    await pg.initialise();
  }
  await pg.start();
  pg.process?.on?.('exit', (code, signal) => console.error(`[db] PostgreSQL stopped (${code ?? signal})`));
  console.log(`[db] PostgreSQL on 127.0.0.1:${port}: ${(await reachable(port)) ? 'answering' : 'NOT answering'}`);
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
