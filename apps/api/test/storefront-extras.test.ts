import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADDRESS, agent, api, bearer, db, getApp, http, tokenFor } from './helpers';

let puneId: string;
const indiaDate = (days: number) => new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

async function listedStore() {
  const f = await db.franchise.findFirstOrThrow({ where: { city: { slug: 'pune' } } });
  return db.franchise.update({ where: { id: f.id }, data: { showInStoreList: true, openingHours: 'Mon–Sat 11 am – 8 pm' } });
}

beforeAll(async () => {
  await getApp();
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
});
afterAll(() => db.$disconnect());

describe('site settings for the storefront', () => {
  it('publishes storefront settings and only the stores switched on for the list', async () => {
    const store = await listedStore();
    const hidden = await db.franchise.create({ data: { name: 'Hidden Kiosk', cityId: puneId, area: 'Baner', address: '1 Hidden Lane, Pune', phone: '+919800001234' } });
    const site = await http().get(api('/site')).expect(200);
    expect(site.body.storefront).toMatchObject({ giftWrapEnabled: true, deliveryMinDays: 3, deliveryMaxDays: 5, consultationsEnabled: true });
    const ids = site.body.stores.map((s: { id: string }) => s.id);
    expect(ids).toContain(store.id);
    expect(ids).not.toContain(hidden.id);
    expect(site.body.stores[0]).not.toHaveProperty('email'); // only what a shop sign would show
  });
});

describe('consultations', () => {
  it('books a video call as an enquiry for the city team', async () => {
    const r = await http().post(api('/enquiries/consultation')).send({ mode: 'VIDEO', date: indiaDate(2), slot: 'EVENING', name: 'Meera Joshi', phone: '9811700001', citySlug: 'pune', notes: 'Bridal strand' }).expect(201);
    const e = await db.enquiry.findUniqueOrThrow({ where: { reference: r.body.reference } });
    expect(e.type).toBe('CONSULTATION');
    expect(e.cityId).toBe(puneId);
    expect(e.message).toContain('Video consultation');
    expect(e.payload).toMatchObject({ mode: 'VIDEO', slot: 'EVENING' });
  });

  it('books a store visit only at a listed store, and refuses past dates', async () => {
    const store = await listedStore();
    await http().post(api('/enquiries/consultation')).send({ mode: 'STORE', date: indiaDate(1), slot: 'MORNING', name: 'Meera Joshi', phone: '9811700002' }).expect(400);
    await http().post(api('/enquiries/consultation')).send({ mode: 'VIDEO', date: indiaDate(-1), slot: 'MORNING', name: 'Meera Joshi', phone: '9811700002' }).expect(400);
    const unlisted = await db.franchise.create({ data: { name: 'Back Office', cityId: puneId, area: 'Kothrud', address: '2 Office Road, Pune', phone: '+919800001235' } });
    await http().post(api('/enquiries/consultation')).send({ mode: 'STORE', storeId: unlisted.id, date: indiaDate(1), slot: 'MORNING', name: 'Meera Joshi', phone: '9811700002' }).expect(400);
    const ok = await http().post(api('/enquiries/consultation')).send({ mode: 'STORE', storeId: store.id, date: indiaDate(1), slot: 'MORNING', name: 'Meera Joshi', phone: '9811700002' }).expect(201);
    const e = await db.enquiry.findUniqueOrThrow({ where: { reference: ok.body.reference } });
    expect(e.message).toContain(store.name);
    expect(e.cityId).toBe(store.cityId);
  });

  it('is refused while appointments are switched off', async () => {
    const admin = await tokenFor('superAdmin');
    await http().patch(api('/admin/settings/storefront')).set(bearer(admin)).send({ consultationsEnabled: false }).expect(200);
    try {
      const r = await http().post(api('/enquiries/consultation')).send({ mode: 'VIDEO', date: indiaDate(1), slot: 'MORNING', name: 'Meera Joshi', phone: '9811700003' }).expect(400);
      expect(r.body.code).toBe('CONSULTATIONS_OFF');
    } finally {
      await http().patch(api('/admin/settings/storefront')).set(bearer(admin)).send({ consultationsEnabled: true }).expect(200);
    }
  });
});

describe('newsletter', () => {
  it('needs consent, never duplicates, and unsubscribes by token', async () => {
    const email = `reader-${Date.now()}@example.com`;
    await http().post(api('/newsletter')).send({ email }).expect(400);
    await http().post(api('/newsletter')).send({ email, consent: false }).expect(400);
    await http().post(api('/newsletter')).send({ email: email.toUpperCase(), consent: true, source: 'footer' }).expect(200);
    await http().post(api('/newsletter')).send({ email, consent: true }).expect(200);
    const rows = await db.newsletterSubscriber.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    const un = await http().post(api('/newsletter/unsubscribe')).send({ token: rows[0]!.unsubscribeToken }).expect(200);
    expect(un.body.email).not.toBe(email); // masked
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).unsubscribedAt).not.toBeNull();
    await http().post(api('/newsletter/unsubscribe')).send({ token: 'not-a-real-token' }).expect(400);
  });

  it('lists subscribers to marketing staff only', async () => {
    const list = await http().get(api('/admin/newsletter')).set(bearer(await tokenFor('superAdmin'))).expect(200);
    expect(list.body).toHaveProperty('active');
    await http().get(api('/admin/newsletter')).set(bearer(await tokenFor('vendor'))).expect(403);
    await http().get(api('/admin/newsletter')).expect(401);
  });
});

describe('gift packing at checkout', () => {
  it('stores the gift choice and message without changing the price', async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
    const sku = `T-GIFT-${Date.now().toString(36).toUpperCase()}`;
    const p = await db.product.create({ data: { sku, name: 'Gift Ring', slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 800_000, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } } });
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: p.id, quantity: 1 }).expect(200);
    const phone = '9811700010';
    const r = await a.post(api('/checkout')).send({ contact: { name: 'Gift Giver', phone }, address: { ...ADDRESS, phone }, cityId: puneId, paymentMethod: 'COD', giftWrap: true, giftMessage: 'Happy anniversary, Asha' }).expect(201);
    const o = await db.order.findUniqueOrThrow({ where: { number: r.body.order.number } });
    expect(o.giftWrap).toBe(true);
    expect(o.giftMessage).toBe('Happy anniversary, Asha');
    expect(o.subtotalPaise).toBe(800_000);

    // The gift packing slip adds a message card page; staff outside the order's scope cannot print it.
    const pages = (buf: Buffer) => (buf.toString('latin1').match(/\/Type \/Page[^s]/g) ?? []).length;
    const slip = await http().get(api(`/admin/orders/${o.id}/packing-slip.pdf`)).set(bearer(await tokenFor('superAdmin'))).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(slip.headers['content-type']).toBe('application/pdf');
    expect(pages(slip.body as Buffer)).toBe(2);
    await db.order.update({ where: { id: o.id }, data: { giftWrap: false } });
    const plain = await http().get(api(`/admin/orders/${o.id}/packing-slip.pdf`)).set(bearer(await tokenFor('superAdmin'))).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pages(plain.body as Buffer)).toBe(1);
    await http().get(api(`/admin/orders/${o.id}/packing-slip.pdf`)).set(bearer(await tokenFor('vendor'))).expect(404);
  });
});
