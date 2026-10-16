// Serves the prototype folder the way Netlify does (/a → a.html, _redirects 200 rules, 404.html), for testing.
// Usage: node scripts/prototype/serve.mjs <folder> [port]
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';

const [DIR, PORT = '8888'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.ttf': 'font/ttf' };
const rules = existsSync(join(DIR, '_redirects')) ? readFileSync(join(DIR, '_redirects'), 'utf8').split('\n').map((l) => l.trim().split(/\s+/)).filter((r) => r.length >= 2) : [];
const file = (p) => {
  const f = join(DIR, normalize(p));
  return f.startsWith(DIR) && existsSync(f) && statSync(f).isFile() ? f : null;
};
http
  .createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = file(path) ?? file(path.replace(/\/$/, '') + '.html') ?? file(join(path, 'index.html'));
    let status = 200;
    if (!f) for (const [from, to] of rules) if (from.endsWith('/*') ? path.startsWith(from.slice(0, -1)) : path === from) { f = file(to); break; }
    if (!f) { f = file('/404.html'); status = 404; }
    if (!f) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(status, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' });
    createReadStream(f).pipe(res);
  })
  .listen(Number(PORT), () => console.log(`[serve] ${DIR} on http://localhost:${PORT}`));
