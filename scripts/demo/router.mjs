// One public port for the presentation container, split the way vercel.json splits the real site:
// /api and /media → API, /admin → admin, everything else → website. No dependencies.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 7860);
const target = (url) => (/^\/(api|media)\//.test(url) ? 4000 : /^\/admin(\/|\?|$)/.test(url) ? 3001 : 3000);

const starting = `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5"><meta name="viewport" content="width=device-width">
<body style="font-family:system-ui;padding:3rem;text-align:center;color:#1f2a2b"><h1>Sahyadri Pearls</h1><p>The demo is starting. This page refreshes by itself.</p></body>`;

http
  .createServer((req, res) => {
    const headers = { ...req.headers };
    // The host's own proxy sets X-Forwarded-For to the visitor's address; it is passed on untouched, so the
    // API (which trusts one proxy hop) sees each visitor separately. Set only when nothing set it.
    headers['x-forwarded-for'] ??= req.socket.remoteAddress ?? '';
    headers['x-forwarded-proto'] ??= 'http';
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
  .listen(PORT, '0.0.0.0', () => console.log(`[demo] router on :${PORT}`));
