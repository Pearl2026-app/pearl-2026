// Runs the whole shop as ONE Hostinger Web App (owner, 11 Nov: Vercel is paused; host on Hostinger). Starts the API,
// the website and the admin on private ports and puts a small router on the port Hostinger gives the app, splitting
// requests the way vercel.json does: /api and /media → API, /admin → admin, everything else → website. Each part is
// restarted if it stops. Settings come from the app's environment variables in hPanel (see docs/HOSTINGER.md); without
// DATABASE_URL the shop runs its own PostgreSQL beside it.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
const PORTS = { api: 4100, web: 4101, admin: 4102 };

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
  API_INTERNAL_URL: `http://127.0.0.1:${PORTS.api}`, // the website's and the admin's server-side calls stay inside
  STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR ?? join(process.env.HOME ?? root, 'sahyadri-media'),
};
if (!PUBLIC_URL.startsWith('https://')) shared.COOKIE_SECURE ??= 'false';

const nextBin = (app) => createRequire(join(root, 'apps', app, 'package.json')).resolve('next/dist/bin/next');
const parts = {
  api: { cwd: join(root, 'apps/api'), args: ['--enable-source-maps', 'dist/main.js'], env: { PORT: String(PORTS.api) } },
  web: { cwd: join(root, 'apps/web'), args: [nextBin('web'), 'start', '-p', String(PORTS.web), '-H', '127.0.0.1'], env: {} },
  admin: { cwd: join(root, 'apps/admin'), args: [nextBin('admin'), 'start', '-p', String(PORTS.admin), '-H', '127.0.0.1'], env: {} },
};
const keep = (name) => {
  const p = parts[name];
  const child = spawn(process.execPath, p.args, { cwd: p.cwd, env: { ...shared, ...p.env }, stdio: 'inherit' });
  child.on('exit', (code) => {
    console.error(`[shop] ${name} stopped (${code}); restarting in 2 s`);
    setTimeout(() => keep(name), 2000);
  });
};
Object.keys(parts).forEach(keep);

const target = (url) => (/^\/(api|media)\//.test(url) ? PORTS.api : /^\/admin(\/|\?|$)/.test(url) ? PORTS.admin : PORTS.web);
const starting = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><meta name="viewport" content="width=device-width">
<body style="font-family:system-ui;padding:3rem;text-align:center;color:#1f2a2b"><h1>Sahyadri Pearls</h1><p>Starting up. This page refreshes by itself.</p></body>`;
http
  .createServer((req, res) => {
    const headers = { ...req.headers };
    headers['x-forwarded-for'] ??= req.socket.remoteAddress ?? '';
    headers['x-forwarded-proto'] ??= PUBLIC_URL.startsWith('https://') ? 'https' : 'http';
    headers['x-forwarded-host'] ??= req.headers.host ?? '';
    const up = http.request({ host: '127.0.0.1', port: target(req.url ?? '/'), method: req.method, path: req.url, headers }, (r) => {
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
