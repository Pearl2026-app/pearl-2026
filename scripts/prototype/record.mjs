// Records the running demo system (Dockerfile.demo on http://localhost:7860) for the front-end-only prototype:
// every page's HTML and every /api/v1 answer, per role. Usage: node scripts/prototype/record.mjs <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

new Function(readFileSync(new URL('./key.js', import.meta.url), 'utf8'))();
const K = globalThis.protoKey;
const B = process.env.BASE ?? 'http://localhost:7860';
const OUT = process.argv[2];
if (!OUT) throw new Error('Usage: record.mjs <out-dir>');
const CODE = '123456';
const PASSWORD = 'Sahyadri@2026';

export const IDENTITIES = {
  'admin@sahyadripearls.test': 'superAdmin',
  'staff@sahyadripearls.test': 'staff',
  'pune.manager@sahyadripearls.test': 'puneManager',
  'vendor@sahyadripearls.test': 'vendor',
  '9800000003': 'vendor',
  'franchise.pune@sahyadripearls.test': 'franchisePune',
  '9800000004': 'franchisePune',
  '9800000005': 'deliveryPune',
  '9800000007': 'customerAsha',
};

const fixtures = new Map();
const pages = new Map(); // path -> html
const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function context(role, opts = devices['Pixel 7']) {
  const ctx = await browser.newContext(opts);
  const state = { role, cart: 'empty' };
  await ctx.route(/https:\/\/(wa\.me|api\.whatsapp\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  ctx.on('response', async (res) => {
    const req = res.request();
    const u = new URL(req.url());
    if (!u.pathname.startsWith('/api/v1/')) return;
    const ct = res.headers()['content-type'] ?? '';
    let body = null;
    if (ct.includes('json')) {
      try { body = await res.json(); } catch { return; }
    } else if (res.status() !== 204) return;
    let extra;
    if (req.method() === 'POST' && u.pathname === '/api/v1/checkout') {
      try { extra = 'pm:' + (JSON.parse(req.postData() ?? '{}').paymentMethod ?? 'COD'); } catch { /* not JSON */ }
    }
    const key = K.key(state.role, req.method(), u.pathname + u.search, state.cart, extra);
    const prev = fixtures.get(key);
    // First good answer wins, except the cart, which follows the latest state.
    if (!prev || (prev.s >= 400 && res.status() < 400) || key.includes('#cart:')) fixtures.set(key, { s: res.status(), b: body });
  });
  return { ctx, state, page: await ctx.newPage() };
}

async function saveHtml(path) {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (pages.has(clean)) return;
  try {
    const r = await fetch(B + path, { redirect: 'manual' });
    const ct = r.headers.get('content-type') ?? '';
    if (r.status === 200 && ct.includes('text/html')) pages.set(clean, await r.text());
  } catch { /* skip */ }
}

const settle = (page) => page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
async function visit(page, path) {
  try {
    await page.goto(B + path, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await settle(page);
    await page.waitForTimeout(300);
  } catch { /* keep going */ }
}

const SKIP = /^\/(api|media|_next|apps)(\/|$)/;
async function crawl(page, seeds, { prefix = '/', limit, save = true, skip = SKIP }) {
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length && seen.size < limit) {
    const path = queue.shift();
    const key = path.split('?')[0].replace(/\/+$/, '') || '/';
    if (seen.has(key)) continue;
    seen.add(key);
    await visit(page, path);
    if (save) await saveHtml(path);
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
    for (const href of links) {
      if (!href || !href.startsWith(prefix) || href.startsWith('//')) continue;
      const p = href.split('#')[0];
      if (skip.test(p) || p.includes('?')) continue;
      if (!seen.has(p.replace(/\/+$/, '') || '/')) queue.push(p);
    }
  }
  return seen.size;
}

const log = (...a) => console.log('[record]', ...a);

// 1. The shop as a visitor: every page reachable from the sitemap and its links.
{
  const { page } = await context('anon');
  const sitemap = await (await fetch(B + '/sitemap.xml')).text();
  const seeds = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const extras = ['/', '/platforms', '/login', '/cart', '/checkout', '/search', '/verify', '/pearl-guide', '/gifts', '/book-consultation', '/visit-us', '/ring-finder', '/customized-jewellery', '/offers', '/delete-account', '/newsletter/unsubscribe'];
  log('shop pages:', await crawl(page, [...extras, ...seeds], { limit: 400 }));
  await saveHtml('/search?q=pearl');
  await saveHtml('/this-page-does-not-exist-404');
  for (const p of ['/icon.svg', '/robots.txt', '/sitemap.xml', '/admin/icon.svg']) {
    const r = await fetch(B + p);
    if (r.ok) pages.set(p, Buffer.from(await r.arrayBuffer()));
  }
  await page.close();
}

// 2. Buying: cash on delivery, then online through the payment sandbox; and an enquiry, newsletter, ring finder.
const products = (await (await fetch(B + '/api/v1/catalogue/products?pageSize=48')).json()).items;
const plain = products.filter((p) => p.available && !p.isUnique && !p.priceOnRequest);
async function buy(c, piece, method) {
  const { page, state } = c;
  await visit(page, `/product/${piece.slug}`);
  state.cart = 'full';
  await page.getByRole('button', { name: 'Add to Cart' }).click();
  await page.getByRole('button', { name: 'Added to cart' }).waitFor();
  await visit(page, '/cart');
  await visit(page, '/checkout');
  await page.getByLabel('Full name').fill('Meera Joshi');
  await page.getByLabel('Mobile number').fill('9876500011');
  await page.getByRole('combobox', { name: /^City/ }).selectOption({ label: 'Pune' });
  await settle(page);
  await page.getByLabel('House, building, street').fill('4 Law College Road');
  await page.getByLabel('Town / city').fill('Pune');
  await page.getByLabel('PIN code').fill('411004');
  await page.getByRole('radio', { name: method === 'COD' ? /Cash on delivery/ : /Pay online/ }).check();
  await settle(page);
  await page.getByRole('button', { name: method === 'COD' ? /^Place order/ : /^Pay / }).click();
  if (method === 'ONLINE') {
    await page.waitForURL(/\/pay\/sandbox/);
    await saveHtml(new URL(page.url()).pathname);
    state.cart = 'empty';
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
  }
  await page.getByRole('link', { name: 'Track your order' }).waitFor();
  state.cart = 'empty';
  await settle(page);
  await saveHtml(new URL(page.url()).pathname);
  await page.getByRole('link', { name: 'Track your order' }).click();
  await settle(page);
  await saveHtml(new URL(page.url()).pathname);
  await visit(page, '/cart');
}
{
  const c = await context('anon');
  await buy(c, plain[0], 'COD');
  await buy(c, plain[1], 'ONLINE');
  const { page } = c;
  await visit(page, `/product/${products.find((p) => p.isUnique && p.available)?.slug ?? plain[2].slug}`);
  await page.getByRole('button', { name: /^Enquire/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.evaluate(async () => {
    const post = (p, b) => fetch('/api/v1' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    const d = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    await post('/enquiries/consultation', { mode: 'VIDEO', date: d, slot: 'EVENING', name: 'Demo Visitor', phone: '9876500012', citySlug: 'pune' });
    await post('/newsletter', { email: 'visitor@example.com', consent: true });
    await post('/ring-finder', { occasion: 'Engagement', metal: 'any', citySlug: 'pune' });
    await post('/enquiries', { type: 'CONTACT', name: 'Demo Visitor', phone: '+919876500013', message: 'Hello', citySlug: 'pune' });
  });
  await page.close();
  log('purchases and enquiries recorded');
}

// 3. A signed-in customer on the website.
async function webCustomer() {
  const c = await context('anon');
  const { page, state } = c;
  await visit(page, '/login');
  await page.getByLabel(/Mobile/).fill('9800000007');
  await page.getByRole('button', { name: /Send|Continue|code/i }).first().click();
  await page.getByLabel(/code/i).first().fill(CODE);
  state.role = 'customerAsha';
  await page.getByRole('button', { name: /Verify|Sign in|Continue/i }).first().click();
  await settle(page);
  log('customer pages:', await crawl(page, ['/account', '/', '/cart', '/checkout'], { limit: 40, save: false }));
  await page.close();
}
await webCustomer().catch((e) => log('customer web skipped:', e.message));

// 4. Admin and partner panels, one role at a time.
const NAV = ['/', '/enquiries', '/orders', '/custom-orders', '/purchase-orders', '/payments', '/returns', '/abandoned-carts', '/delivery', '/products', '/categories', '/collections', '/farms', '/certificates', '/reviews', '/customers', '/coupons', '/notifications', '/messages', '/newsletter', '/banners', '/content-blocks', '/pages', '/testimonials', '/gallery', '/faq', '/jobs', '/job-applications', '/cities', '/vendors', '/franchises', '/manufacturers', '/delivery-partners', '/pricing/calculator', '/pearl-rates', '/margin-rules', '/reports', '/whatsapp', '/users', '/settings', '/audit-log'].map((p) => '/admin' + (p === '/' ? '' : p));
const ADMINS = [
  ['superAdmin', 'team', 'admin@sahyadripearls.test', 220],
  ['staff', 'team', 'staff@sahyadripearls.test', 60],
  ['puneManager', 'team', 'pune.manager@sahyadripearls.test', 90],
  ['vendor', 'partner', '9800000003', 60],
  ['franchisePune', 'partner', '9800000004', 60],
  ['deliveryPune', 'partner', '9800000005', 30],
];
for (const [role, mode, id, limit] of ADMINS) {
  try {
    const c = await context('anon', { viewport: { width: 1440, height: 900 } });
    const { page, state } = c;
    await visit(page, '/admin/login');
    await saveHtml('/admin/login');
    if (mode === 'partner') {
      await page.getByRole('tab', { name: 'Vendor / Franchise / Delivery' }).click();
      await page.getByLabel('Email or mobile number').fill(id);
    } else {
      await page.getByLabel('Email').fill(id);
      await page.getByLabel('Password').fill(PASSWORD);
    }
    state.role = role;
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('One-time code').fill(CODE);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20_000 });
    await settle(page);
    const n = await crawl(page, ['/admin', ...NAV], { prefix: '/admin', limit, skip: /^\/admin\/(login|api)/ });
    log(role, 'admin pages:', n);
    await page.close();
  } catch (e) {
    log(role, 'stopped:', e.message.split('\n')[0]);
  }
}

// 5. The phone apps (their pages are files already; only their data is recorded).
async function appPaths(page, paths) {
  for (const p of paths) await visit(page, p);
}
{
  const { page } = await context('anon');
  await appPaths(page, ['/apps/customer', '/apps/customer/shop', '/apps/customer/wishlist', '/apps/customer/cart', '/apps/customer/account', '/apps/customer/ring-finder', '/apps/customer/custom', '/apps/customer/login', ...products.map((p) => `/apps/customer/product/${p.slug}`)]);
  await page.close();
  log('customer app recorded');
}
try {
  const { page, state } = await context('anon');
  await visit(page, '/apps/delivery');
  await page.getByRole('textbox').first().fill('9800000005');
  await page.getByText('Send code').click();
  await page.getByText(/^Sign in$/).waitFor();
  await page.getByRole('textbox').first().fill(CODE);
  state.role = 'deliveryPune';
  await page.getByText(/^Sign in$/).click();
  await page.getByText(/Collect cash|No deliveries/).first().waitFor({ timeout: 20_000 });
  await settle(page);
  const jobs = await page.$$eval('a[href*="/job/"]', (as) => as.map((a) => a.getAttribute('href')));
  await appPaths(page, ['/apps/delivery/done', '/apps/delivery/account', ...jobs.map((h) => (h.startsWith('/apps') ? h : '/apps/delivery' + h))]);
  await page.close();
  log('delivery app recorded, jobs:', jobs.length);
} catch (e) {
  log('delivery app stopped:', e.message.split('\n')[0]);
}

await browser.close();

// Write everything out.
mkdirSync(join(OUT, 'd'), { recursive: true });
mkdirSync(join(OUT, 'pages'), { recursive: true });
for (const [key, f] of fixtures) writeFileSync(join(OUT, 'd', K.hash(key) + '.json'), JSON.stringify(f));
writeFileSync(join(OUT, 'keys.txt'), [...fixtures.keys()].sort().join('\n'));
const index = {};
let i = 0;
for (const [path, body] of pages) {
  const file = `p${i++}`;
  writeFileSync(join(OUT, 'pages', file), body);
  index[path] = file;
}
writeFileSync(join(OUT, 'pages.json'), JSON.stringify(index, null, 1));
writeFileSync(join(OUT, 'identities.json'), JSON.stringify(IDENTITIES));
log(`done: ${fixtures.size} answers, ${pages.size} pages`);
