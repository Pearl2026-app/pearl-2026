#!/usr/bin/env node
// Load test for the API: browsing traffic, then many buyers racing for one unique piece.
// Plain Node (18+), no dependencies. Run against local or staging only: the race sells a real piece.
//
//   API_URL=http://localhost:4000/api/v1 node scripts/load/load.mjs
//
// Settings (environment variables):
//   API_URL         API base, default http://localhost:4000/api/v1
//   BROWSE_USERS    simultaneous shoppers in the browse phase (default 40)
//   BROWSE_SECONDS  length of the browse phase (default 30)
//   RACE_BUYERS     buyers racing for one piece (default 50)
//   RACE_PIECE      slug of the unique piece to race for (default: first unique piece in stock)
//   CITY            city slug for checkout (default pune)
//   REPORT          optional path to write the JSON results
//
// Every simulated shopper sends its own X-Forwarded-For address, as real shoppers come from
// different addresses; the API trusts one proxy hop, so per-address rate limits apply per shopper.
// Exits non-zero if the race does not end with exactly one order, or browsing errors exceed 1%.

import { writeFileSync } from 'node:fs';

const API = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const BROWSE_USERS = Number(process.env.BROWSE_USERS ?? 40);
const BROWSE_SECONDS = Number(process.env.BROWSE_SECONDS ?? 30);
const RACE_BUYERS = Number(process.env.RACE_BUYERS ?? 50);
const CITY = process.env.CITY ?? 'pune';

const ip = (n) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
let ipSeq = 1000;

async function call(path, { method = 'GET', body, headers = {}, from } = {}) {
  const t = performance.now();
  try {
    const r = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': from ?? ip(ipSeq++), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not JSON */
    }
    return { status: r.status, json, ms: performance.now() - t };
  } catch (e) {
    return { status: 0, json: { message: String(e) }, ms: performance.now() - t };
  }
}

function summary(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const pct = (p) => (ms.length ? Math.round(ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))]) : 0);
  const errors = samples.filter((s) => s.status === 0 || s.status >= 500).length;
  return { requests: samples.length, errors, errorRate: samples.length ? errors / samples.length : 0, p50: pct(50), p95: pct(95), p99: pct(99), max: Math.round(ms.at(-1) ?? 0) };
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function browse() {
  const list = await call('/catalogue/products?pageSize=48');
  const cats = await call('/catalogue/categories');
  if (list.status !== 200) throw new Error(`Catalogue not reachable at ${API} (status ${list.status})`);
  const slugs = list.json.items.map((p) => p.slug);
  const catSlugs = (Array.isArray(cats.json) ? cats.json : (cats.json?.items ?? [])).map((c) => c.slug);
  const routes = {
    site: () => '/site',
    list: () => `/catalogue/products?pageSize=24&page=${1 + Math.floor(Math.random() * 3)}`,
    category: () => (catSlugs.length ? `/catalogue/products?category=${pick(catSlugs)}` : '/catalogue/products'),
    search: () => `/catalogue/products?q=${pick(['pearl', 'ring', 'baroque', 'rose', 'necklace'])}`,
    product: () => `/catalogue/products/${pick(slugs)}`,
    filters: () => '/catalogue/filters',
  };
  // Weighted like real traffic: most views are product and listing pages.
  const mix = ['site', 'list', 'list', 'category', 'search', 'product', 'product', 'product', 'filters'];
  const byRoute = Object.fromEntries(Object.keys(routes).map((k) => [k, []]));
  const end = Date.now() + BROWSE_SECONDS * 1000;
  await Promise.all(
    Array.from({ length: BROWSE_USERS }, async (_, u) => {
      const from = ip(100 + u);
      while (Date.now() < end) {
        const k = pick(mix);
        byRoute[k].push(await call(routes[k](), { from }));
        await new Promise((r) => setTimeout(r, 100 + Math.random() * 400)); // think time
      }
    }),
  );
  const all = Object.values(byRoute).flat();
  return { users: BROWSE_USERS, seconds: BROWSE_SECONDS, throughputPerSec: Math.round(all.length / BROWSE_SECONDS), overall: summary(all), routes: Object.fromEntries(Object.entries(byRoute).map(([k, v]) => [k, summary(v)])) };
}

async function race() {
  let slug = process.env.RACE_PIECE;
  if (!slug) {
    let piece = null;
    for (let page = 1; !piece && page <= 10; page++) {
      const r = await call(`/catalogue/products?pageSize=48&page=${page}`);
      const items = r.json?.items ?? [];
      piece = items.find((p) => p.isUnique && p.available && !p.priceOnRequest) ?? null;
      if (items.length < 48) break;
    }
    if (!piece) throw new Error('No unique piece in stock to race for. Set RACE_PIECE.');
    slug = piece.slug;
  }
  const product = (await call(`/catalogue/products/${slug}`)).json;
  if (!product?.id) throw new Error(`Piece ${slug} not found.`);

  // Every buyer fills a cart first, so the race is only on checkout.
  const buyers = await Promise.all(
    Array.from({ length: RACE_BUYERS }, async (_, i) => {
      const from = ip(5000 + i);
      const add = await call('/cart/items', { method: 'POST', body: { productId: product.id, quantity: 1 }, from });
      if (add.status !== 200) throw new Error(`Buyer ${i} could not add to cart: ${add.status} ${JSON.stringify(add.json)}`);
      return { i, from, token: add.json.token };
    }),
  );
  const quote = await call('/checkout/quote', { method: 'POST', body: { citySlug: CITY }, headers: { 'X-Cart-Token': buyers[0].token }, from: buyers[0].from });
  const paymentMethod = quote.json?.paymentMethods?.cod ? 'COD' : 'ONLINE';

  const results = await Promise.all(
    buyers.map((b) => {
      const phone = `98${String(10_000_000 + b.i).padStart(8, '0')}`;
      return call('/checkout', {
        method: 'POST',
        headers: { 'X-Cart-Token': b.token },
        from: b.from,
        body: {
          contact: { name: `Load Buyer ${b.i}`, phone },
          address: { name: `Load Buyer ${b.i}`, phone, line1: '12 Prabhat Road', area: 'Erandwane', cityName: 'Pune', state: 'Maharashtra', pincode: '411004' },
          citySlug: CITY,
          paymentMethod,
        },
      });
    }),
  );
  const won = results.filter((r) => r.status === 201);
  const codes = {};
  for (const r of results.filter((x) => x.status !== 201)) {
    const key = `${r.status} ${r.json?.code ?? ''}`.trim();
    codes[key] = (codes[key] ?? 0) + 1;
  }
  const after = (await call(`/catalogue/products/${slug}`)).json;
  return {
    piece: { slug, sku: product.sku, pricePaise: product.pricePaise },
    buyers: RACE_BUYERS,
    paymentMethod,
    orders: won.length,
    orderNumbers: won.map((w) => w.json?.order?.number),
    refusals: codes,
    serverErrors: results.filter((r) => r.status === 0 || r.status >= 500).length,
    pieceAvailableAfter: after?.available ?? null,
    timing: summary(results),
  };
}

const started = new Date().toISOString();
console.log(`Load test against ${API}`);
console.log(`Browse: ${BROWSE_USERS} shoppers for ${BROWSE_SECONDS}s ...`);
const browsing = await browse();
console.table(Object.fromEntries(Object.entries(browsing.routes).map(([k, v]) => [k, v])));
console.log(`Overall: ${browsing.overall.requests} requests, ${browsing.throughputPerSec}/s, p95 ${browsing.overall.p95} ms, errors ${browsing.overall.errors}`);

console.log(`\nRace: ${RACE_BUYERS} buyers check out the same unique piece at once ...`);
const racing = await race();
console.log(`Piece ${racing.piece.sku}: ${racing.orders} order(s) ${racing.orderNumbers.join(', ')}; refused: ${JSON.stringify(racing.refusals)}; server errors: ${racing.serverErrors}; still available: ${racing.pieceAvailableAfter}`);
console.log(`Checkout timing: p50 ${racing.timing.p50} ms, p95 ${racing.timing.p95} ms, max ${racing.timing.max} ms`);

const ok = racing.orders === 1 && racing.serverErrors === 0 && racing.pieceAvailableAfter === false && browsing.overall.errorRate <= 0.01;
if (process.env.REPORT) writeFileSync(process.env.REPORT, JSON.stringify({ started, api: API, browsing, racing, ok }, null, 2));
console.log(ok ? '\nPASS: exactly one buyer got the piece, no server errors.' : '\nFAIL: see the numbers above.');
process.exit(ok ? 0 : 1);
