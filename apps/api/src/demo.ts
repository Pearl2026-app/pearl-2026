import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@sahyadri/db';
import { config } from './config/config';
import { fillDemoActivity } from './demo-activity';

const log = new Logger('Demo');

const dbDir = resolve(__dirname, '../../../packages/db');

/** Demo site: apply the database migrations before the API starts (Prisma's own lock keeps two instances apart). */
export function migrateDemoDatabase(): void {
  const prisma = join(dbDir, 'node_modules/.bin/prisma');
  if (!existsSync(prisma)) return log.error(`Cannot set up the database: ${prisma} is missing.`);
  const run = (args: string[]) => spawnSync(prisma, args, { cwd: dbDir, env: process.env, encoding: 'utf8' });
  // Several instances start together on a new deployment, and the old one may still be busy with the database, so a
  // migration can be interrupted. Our migrations are written to be safe to run again: mark an interrupted one as
  // rolled back and try again, a few times, before giving up.
  for (let attempt = 1; ; attempt++) {
    const r = run(['migrate', 'deploy']);
    if (r.status === 0) break;
    const out = `${r.stderr ?? ''}${r.stdout ?? ''}`;
    const failed = [...new Set([...out.matchAll(/The `([^`]+)` migration started/g)].map((m) => m[1]!))];
    if (attempt >= 4) throw new Error(`Database setup failed: ${out.slice(-1500)}`);
    log.warn(`Database setup attempt ${attempt} did not finish${failed.length ? ` (${failed.join(', ')})` : ''}; trying again.`);
    for (const name of failed) run(['migrate', 'resolve', '--rolled-back', name]);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000 * attempt);
  }
  log.log('Database tables are up to date.');
}

/**
 * Demo site: draw every sample image before this instance serves requests. Each instance has its own disk, and the
 * seed (which also draws them) runs in the background after start, so without this a request could reach an
 * instance whose images are not drawn yet. Takes about a second; never stops the API from starting.
 */
export function drawDemoSamples(): void {
  const tsx = join(dbDir, 'node_modules/.bin/tsx');
  if (!existsSync(tsx)) return log.error(`Cannot draw the sample images: ${tsx} is missing.`);
  const r = spawnSync(tsx, ['seed/draw-samples.ts'], { cwd: dbDir, env: { ...process.env, STORAGE_LOCAL_DIR: config().storageDir }, encoding: 'utf8' });
  if (r.status !== 0) log.error(`Sample images were not drawn: ${(r.stderr || r.stdout || '').slice(-800)}`);
  else log.log((r.stdout || '').trim());
}

/**
 * Demo site (D66): load the sample data and redraw the sample photos. The seed never overwrites rows,
 * so this runs on every start: the first start fills the empty database, later starts only redraw the
 * photos (the container's disk is wiped on each deploy). A database lock stops two instances seeding at once.
 */
export async function prepareDemo(): Promise<void> {
  const c = config();
  const tsx = join(dbDir, 'node_modules/.bin/tsx');
  if (!existsSync(tsx)) {
    log.error(`Cannot load the sample data: ${tsx} is missing.`);
    return;
  }
  const db = new PrismaClient({ datasources: { db: { url: c.DATABASE_URL } } });
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('demo-seed'))`;
        const started = Date.now();
        await new Promise<void>((done, fail) => {
          const child = spawn(tsx, ['seed/seed.ts'], {
            cwd: dbDir,
            env: { ...process.env, SEED_MODE: 'demo', DEMO_MODE: 'true', STORAGE_LOCAL_DIR: c.storageDir },
            stdio: ['ignore', 'ignore', 'pipe'],
          });
          let err = '';
          child.stderr.on('data', (d) => (err = (err + String(d)).slice(-2000)));
          child.on('error', fail);
          child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`seed exited with ${code}: ${err}`))));
        });
        log.log(`Sample data and photos ready (${Math.round((Date.now() - started) / 1000)} s).`);
        // Some recent business for the presentation, once, while the database has no orders yet.
        if ((await tx.order.count()) === 0) {
          try {
            log.log(`Demo activity: ${await fillDemoActivity(`http://127.0.0.1:${c.PORT}/api/v1`, db)}.`);
          } catch (e) {
            log.error(`Demo activity stopped: ${(e as Error).message}`);
          }
        }
      },
      { maxWait: 120_000, timeout: 600_000 },
    );
  } catch (e) {
    log.error(`Sample data could not be loaded: ${(e as Error).message}`);
  } finally {
    await db.$disconnect();
  }
}
