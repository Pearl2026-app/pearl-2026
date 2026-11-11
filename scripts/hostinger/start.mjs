// Runs the whole shop as ONE Hostinger Web App (owner, 11 Nov: Vercel is paused; host on Hostinger). Starts the API,
// the website and the admin on private Unix sockets (the processes of a Hostinger app cannot reach each other over
// 127.0.0.1; socket-shim.cjs does the plumbing) and puts a small router on the port Hostinger gives the app, splitting
// requests the way vercel.json does: /api and /media → API, /admin → admin, everything else → website. Each part is
// restarted if it stops. Settings come from the app's environment variables in hPanel (see docs/HOSTINGER.md); without
// DATABASE_URL the shop runs its own PostgreSQL beside it.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
const PORTS = { api: 4100, web: 4101, admin: 4102 };
// one socket file per part, named for this app's folder so two apps never share one (short paths: sockets allow ~100 characters)
const tag = createHash('sha1').update(root).digest('hex').slice(0, 10);
const SOCK = Object.fromEntries(Object.keys(PORTS).map((k) => [k, join(tmpdir(), `sp-${tag}-${k}.sock`)]));
const shim = join(root, 'scripts', 'hostinger', 'socket-shim.cjs');
// Hostinger starts this file by node's full path without node on PATH, so tools run as scripts (Prisma's migrate,
// which the API runs at start) fail with "node: not found": put this node's folder first on PATH for every part.
process.env.PATH = [dirname(process.execPath), process.env.PATH].filter(Boolean).join(delimiter);

// No DATABASE_URL: the shop runs its own PostgreSQL here (scripts/hostinger/db.mjs).
let ownDb = null;
if (!process.env.DATABASE_URL) {
  const { ownDatabase } = await import('./db.mjs');
  ownDb = await ownDatabase();
  process.env.DATABASE_URL = ownDb.url;
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => void ownDb.stop().finally(() => process.exit(0)));
}

const shared = {
  ...process.env,
  NODE_ENV: 'production',
  WEB_URL: process.env.WEB_URL ?? PUBLIC_URL,
  ADMIN_URL: process.env.ADMIN_URL ?? `${PUBLIC_URL}/admin`,
  API_URL: process.env.API_URL ?? PUBLIC_URL,
  API_INTERNAL_URL: `http://127.0.0.1:${PORTS.api}`, // the website's and the admin's server-side calls: to API_SOCKET (socket-shim.cjs)
  API_SOCKET: SOCK.api,
  STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR ?? join(process.env.HOME ?? root, 'sahyadri-media'),
};
if (!PUBLIC_URL.startsWith('https://')) shared.COOKIE_SECURE ??= 'false';

// The website and the admin: Next's standalone server from deploy/ (build.sh), or `next start` in a local test build.
const nextPart = (app, port) => {
  const standalone = join(root, 'deploy', app, 'apps', app);
  if (existsSync(join(standalone, 'server.js'))) return { cwd: standalone, args: ['server.js'], env: { PORT: String(port), HOSTNAME: '127.0.0.1' } };
  const next = createRequire(join(root, 'apps', app, 'package.json')).resolve('next/dist/bin/next');
  return { cwd: join(root, 'apps', app), args: [next, 'start', '-p', String(port), '-H', '127.0.0.1'], env: {} };
};
const parts = {
  api: { cwd: join(root, 'apps/api'), args: ['--enable-source-maps', 'dist/main.js'], env: { PORT: String(PORTS.api) } },
  web: nextPart('web', PORTS.web),
  admin: nextPart('admin', PORTS.admin),
};
const keep = (name) => {
  const p = parts[name];
  const child = spawn(process.execPath, ['-r', shim, ...p.args], { cwd: p.cwd, env: { ...shared, ...p.env, LISTEN_SOCKET: SOCK[name] }, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.error(`[shop] ${name} stopped (${code}); restarting in 2 s`);
    setTimeout(() => keep(name), 2000);
  });
};
Object.keys(parts).forEach(keep);

const target = (url) => (/^\/(api|media)\//.test(url) ? SOCK.api : /^\/admin(\/|\?|$)/.test(url) ? SOCK.admin : SOCK.web);
const starting = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><meta name="viewport" content="width=device-width">
<body style="font-family:system-ui;padding:3rem;text-align:center;color:#1f2a2b"><h1>Sahyadri Pearls</h1><p>Starting up. This page refreshes by itself.</p></body>`;
http
  .createServer((req, res) => {
    const headers = { ...req.headers };
    headers['x-forwarded-for'] ??= req.socket.remoteAddress ?? '';
    headers['x-forwarded-proto'] ??= PUBLIC_URL.startsWith('https://') ? 'https' : 'http';
    headers['x-forwarded-host'] ??= req.headers.host ?? '';
    const up = http.request({ socketPath: target(req.url ?? '/'), method: req.method, path: req.url, headers }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': '5' });
      res.end(starting);
    });
    req.pipe(up);
  })
  .listen(PORT, () => console.log(`[shop] ${PUBLIC_URL} on :${PORT}`));
