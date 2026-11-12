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

// PostgreSQL is reached over its Unix socket in /tmp, never TCP: the processes of a Hostinger app cannot reach
// each other over 127.0.0.1 (a server listening there is never answered).
const SOCKET_DIR = '/tmp';

/** Is PostgreSQL answering on its socket? */
const reachable = (port) =>
  new Promise((done) => {
    const s = connect({ path: join(SOCKET_DIR, `.s.PGSQL.${port}`) }, () => (s.end(), done(true)));
    s.on('error', () => done(false));
    s.setTimeout(3000, () => (s.destroy(), done(false)));
  });

/** onStop: called if PostgreSQL stops by itself (not through stop()). */
export async function ownDatabase({ onStop } = {}) {
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
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'sahyadri', password, port, persistent: true, postgresFlags: ['-c', `unix_socket_directories=${SOCKET_DIR}`], onLog: say, onError: (e) => console.error('[db]', String(e)) });
  const url = `postgresql://sahyadri:${password}@localhost:${port}/sahyadri?host=${SOCKET_DIR}`;
  // one already answering (left by an app process that was killed outright): use it rather than start a second
  if (await reachable(port)) {
    console.log(`[db] PostgreSQL already running on ${SOCKET_DIR}/.s.PGSQL.${port}; using it`);
    return { url, stop: async () => {} };
  }
  if (!existsSync(join(dataDir, 'PG_VERSION'))) {
    console.log(`[db] creating the database in ${dataDir} (first start)`);
    await pg.initialise();
  }
  await pg.start();
  let stopping = false;
  pg.process?.on?.('exit', (code, signal) => {
    console.error(`[db] PostgreSQL stopped (${code ?? signal})`);
    if (!stopping) onStop?.();
  });
  console.log(`[db] PostgreSQL on ${SOCKET_DIR}/.s.PGSQL.${port}: ${(await reachable(port)) ? 'answering' : 'NOT answering'}`);
  const admin = pg.getPgClient('postgres', SOCKET_DIR);
  try {
    await admin.connect();
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'sahyadri'");
    if (!rowCount) await admin.query('CREATE DATABASE sahyadri');
  } catch (e) {
    console.error('[db] could not create the database:', String(e));
  } finally {
    await admin.end().catch(() => {});
  }
  const stop = async () => {
    stopping = true;
    try {
      await pg.stop();
    } catch {
      // already stopped
    }
  };
  return { url, stop };
}
