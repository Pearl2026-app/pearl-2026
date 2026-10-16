// Builds the front-end-only prototype folder from a recording (record.mjs) and the running demo container.
// Usage: node scripts/prototype/assemble.mjs <recording-dir> <out-dir> [container-name]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const [REC, OUT, CONTAINER = 'proto'] = process.argv.slice(2);
if (!REC || !OUT) throw new Error('Usage: assemble.mjs <recording-dir> <out-dir> [container]');
const here = dirname(new URL(import.meta.url).pathname);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const MOCK_TAG = '<script src="/mock/shim.js"></script>';
const inject = (html) => html.replace(/<head>/i, '<head>' + MOCK_TAG);

// 1. Pages: /a/b becomes a/b.html (Netlify serves /a/b from it); the 404 page becomes 404.html.
const index = JSON.parse(readFileSync(join(REC, 'pages.json'), 'utf8'));
for (const [path, file] of Object.entries(index)) {
  const body = readFileSync(join(REC, 'pages', file));
  if (/\.(svg|txt|xml|ico|png)$/.test(path)) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), body);
    continue;
  }
  let html = inject(body.toString('utf8'));
  const target = path === '/this-page-does-not-exist-404' ? '404.html' : path === '/' ? 'index.html' : path.slice(1) + '.html';
  if (path === '/platforms') html = html.replace('</body>', '<script src="/mock/qr.js"></script><script src="/mock/platforms.js"></script></body>');
  mkdirSync(dirname(join(OUT, target)), { recursive: true });
  writeFileSync(join(OUT, target), html);
}

// 2. Built assets and files from the container: website and admin bundles, public files and app previews, sample photos.
const cp = (from, to) => {
  mkdirSync(to, { recursive: true });
  execFileSync('docker', ['cp', `${CONTAINER}:${from}/.`, to]);
};
cp('/repo/apps/web/.next/static', join(OUT, '_next/static'));
cp('/repo/apps/admin/.next/static', join(OUT, 'admin/_next/static'));
cp('/repo/apps/web/public', OUT);
cp('/tmp/media/public', join(OUT, 'media'));
for (const app of ['customer', 'delivery']) {
  const f = join(OUT, 'apps', app, 'index.html');
  if (existsSync(f)) writeFileSync(f, inject(readFileSync(f, 'utf8')));
}

// 3. The mock: answers, the browser script, and a QR code library for /platforms.
mkdirSync(join(OUT, 'mock'), { recursive: true });
cpSync(join(REC, 'd'), join(OUT, 'mock', 'd'), { recursive: true });
const shim = readFileSync(join(here, 'shim.js'), 'utf8')
  .replace('__KEY_JS__', () => readFileSync(join(here, 'key.js'), 'utf8'))
  .replace('__IDENTITIES__', () => readFileSync(join(REC, 'identities.json'), 'utf8'));
writeFileSync(join(OUT, 'mock', 'shim.js'), shim);
const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const esbuild = createRequire(new URL('../../apps/api/package.json', import.meta.url)).resolve('esbuild');
const qrEntry = webRequire.resolve('qrcode/lib/browser.js');
execFileSync(process.execPath, ['-e', `require(${JSON.stringify(esbuild)}).buildSync({ entryPoints: [${JSON.stringify(qrEntry)}], bundle: true, minify: true, format: 'iife', globalName: 'QRCode', outfile: ${JSON.stringify(join(OUT, 'mock', 'qr.js'))} })`]);
// The QR codes on /platforms were drawn for the recording address; redraw them for wherever the site is opened.
writeFileSync(
  join(OUT, 'mock', 'platforms.js'),
  `window.addEventListener('load', function () {
  setTimeout(function () {
    document.querySelectorAll('li').forEach(function (li) {
      var link = li.querySelector('a[href^="/"]'), box = li.querySelector('[aria-hidden] > svg') && li.querySelector('[aria-hidden]');
      if (!link || !box || !window.QRCode) return;
      QRCode.toString(location.origin + link.getAttribute('href'), { type: 'svg', margin: 0, color: { dark: '#1F2A2B', light: '#00000000' } }, function (e, svg) { if (!e) box.innerHTML = svg; });
    });
  }, 300);
});
`,
);

// 4. Netlify rules: every screen of the app previews opens the app.
writeFileSync(join(OUT, '_redirects'), ['/apps/customer/*  /apps/customer/index.html  200', '/apps/delivery/*  /apps/delivery/index.html  200', ''].join('\n'));
writeFileSync(join(OUT, '_headers'), ['/mock/d/*', '  Cache-Control: public, max-age=3600', ''].join('\n'));
writeFileSync(
  join(OUT, 'README.txt'),
  'Sahyadri Pearls: front-end-only prototype. Static files: no server or database.\nPages and data are recordings of the full system with sample data; nothing typed here is saved.\nPublish this folder on any static host (Netlify: drag and drop it at app.netlify.com/drop).\nRebuild: see docs/DEPLOYMENT.md, "Front-end-only prototype".\n',
);
const count = (d) => readdirSync(d, { recursive: true }).length;
console.log(`[assemble] ${Object.keys(index).length} pages, ${count(join(OUT, 'mock', 'd'))} answers, ${count(OUT)} files in ${OUT}`);
