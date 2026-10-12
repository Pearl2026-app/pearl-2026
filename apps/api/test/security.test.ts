import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeFirstName } from '../src/modules/orders/abandoned-carts';
import { ADDRESS, agent, api, bearer, db, getApp, http, tokenFor } from './helpers';

// Regression tests for the Phase 6 security review. Each test names the finding it guards.

let puneId: string;
let mumbaiId: string;

async function piece(name: string, data: Record<string, unknown> = {}) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
  const sku = `T-SEC-${name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;
  return db.product.create({ data: { sku, name, slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 900_000, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } }, ...data } });
}

beforeAll(async () => {
  await getApp();
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
  mumbaiId = (await db.city.findUniqueOrThrow({ where: { slug: 'mumbai' } })).id;
});
afterAll(() => db.$disconnect());

describe('catalogue', () => {
  it('a vendor cannot change a live piece through CSV import (changes need approval)', async () => {
    const vendor = await db.user.findUniqueOrThrow({ where: { email: 'vendor@sahyadripearls.test' } });
    const p = await piece('Live Vendor Ring', { vendorId: vendor.vendorId });
    const csv = `sku,name,category,price_rupees\n${p.sku},Cheap Now,rings,1\n`;
    const r = await http().post(api('/admin/products/import?dryRun=false')).set(bearer(await tokenFor('vendor'))).attach('file', Buffer.from(csv), 'p.csv').expect(200);
    expect(r.body.applied).toBe(false);
    expect(r.body.results[0].errors.join(' ')).toMatch(/live/);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).pricePaise).toBe(900_000);
  });

  it('only head office issues or revokes certificates', async () => {
    const vendor = await db.user.findUniqueOrThrow({ where: { email: 'vendor@sahyadripearls.test' } });
    const p = await piece('Cert Ring', { vendorId: vendor.vendorId });
    await http().post(api('/admin/certificates')).set(bearer(await tokenFor('vendor'))).send({ productId: p.id, details: { grade: 'AAA' } }).expect(403);
    const ok = await http().post(api('/admin/certificates')).set(bearer(await tokenFor('superAdmin'))).send({ productId: p.id }).expect(201);
    await http().post(api(`/admin/certificates/${ok.body.id}/revoke`)).set(bearer(await tokenFor('vendor'))).expect(403);
  });

  it('search survives a lone hyphen', async () => {
    await http().get(api('/catalogue/products?q=-')).expect(200);
    await http().get(api('/catalogue/products?q=near-round')).expect(200);
  });

  it('banner links must be a page on this site or an https address', async () => {
    const admin = bearer(await tokenFor('superAdmin'));
    const base = { placement: 'HOME_HERO', imageUrl: '/media/x.svg', title: 'T' };
    await http().post(api('/admin/banners')).set(admin).send({ ...base, linkUrl: 'javascript:alert(1)' }).expect(400);
    await http().post(api('/admin/banners')).set(admin).send({ ...base, linkUrl: '//evil.example' }).expect(400);
    await http().post(api('/admin/banners')).set(admin).send({ ...base, linkUrl: '/offers', isActive: false }).expect(201);
  });
});

describe('enquiries and orders', () => {
  it('a city manager never sees costs of a customized request on the enquiry', async () => {
    const e = await db.enquiry.create({ data: { reference: `ENQ-T-${Date.now()}`, type: 'CUSTOMIZED', cityId: puneId, contactName: 'X', contactPhone: '+919811700300' } });
    await db.customRequest.create({ data: { enquiryId: e.id, cityId: puneId, jewelleryType: 'Ring', metalCostPaise: 100, labourCostPaise: 200, pearlCostPaise: 300, marginPaise: 400 } });
    const cm = await http().get(api(`/admin/enquiries/${e.id}`)).set(bearer(await tokenFor('puneManager'))).expect(200);
    for (const f of ['metalCostPaise', 'labourCostPaise', 'pearlCostPaise', 'marginPaise']) expect(cm.body.customRequest).not.toHaveProperty(f);
    const ho = await http().get(api(`/admin/enquiries/${e.id}`)).set(bearer(await tokenFor('superAdmin'))).expect(200);
    expect(ho.body.customRequest.marginPaise).toBe(400);
  });

  it('a city manager cannot push an enquiry out of their city by clearing it', async () => {
    const e = await db.enquiry.create({ data: { reference: `ENQ-T2-${Date.now()}`, type: 'CONTACT', cityId: puneId, contactPhone: '+919811700301' } });
    await http().patch(api(`/admin/enquiries/${e.id}`)).set(bearer(await tokenFor('puneManager'))).send({ cityId: null }).expect(400);
  });

  it('a franchise cannot convert an enquiry into an order in another city', async () => {
    const p = await piece('Franchise Ring');
    const fr = await db.user.findUniqueOrThrow({ where: { email: 'franchise.pune@sahyadripearls.test' } });
    const e = await db.enquiry.create({ data: { reference: `ENQ-T3-${Date.now()}`, type: 'PRODUCT', productId: p.id, cityId: puneId, franchiseId: fr.franchiseId, contactName: 'Buyer', contactPhone: '+919811700302' } });
    const r = await http().post(api(`/admin/enquiries/${e.id}/convert`)).set(bearer(await tokenFor('franchisePune'))).send({ cityId: mumbaiId, address: { ...ADDRESS, phone: '9811700302' }, paymentMethod: 'COD' });
    expect(r.status).toBe(400);
  });

  it('recording a payment needs head office with the Payments edit right', async () => {
    const order = await db.order.findFirstOrThrow({ where: { cityId: puneId, paymentMethod: 'COD', paymentStatus: 'PENDING' } }).catch(() => null);
    const id = order?.id ?? 'none';
    await http().post(api(`/admin/orders/${id}/payments`)).set(bearer(await tokenFor('puneManager'))).send({ method: 'COD', amountPaise: 1 }).expect(403);
  });

  it('a city manager sees only their city’s manufacturers', async () => {
    const other = await db.manufacturer.create({ data: { name: `Mumbai Maker ${Date.now()}`, cityId: mumbaiId } });
    const list = await http().get(api('/admin/manufacturers?pageSize=200')).set(bearer(await tokenFor('puneManager'))).expect(200);
    expect(list.body.items.map((m: { id: string }) => m.id)).not.toContain(other.id);
    await http().get(api(`/admin/manufacturers/${other.id}`)).set(bearer(await tokenFor('puneManager'))).expect(404);
  });

  it('two refunds at the same moment cannot add up to more than was paid', async () => {
    const p = await piece('Refund Ring', { pricePaise: 1_000_000 });
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: p.id, quantity: 1 }).expect(200);
    const placed = await a.post(api('/checkout')).send({ contact: { name: 'Refund Buyer', phone: '9811700303' }, address: { ...ADDRESS, phone: '9811700303' }, cityId: puneId, paymentMethod: 'COD' }).expect(201);
    const admin = bearer(await tokenFor('superAdmin'));
    const id = placed.body.order.id;
    const total = placed.body.order.totalPaise;
    await http().post(api(`/admin/orders/${id}/payments`)).set(admin).send({ method: 'COD', amountPaise: total }).expect(200);
    const both = await Promise.all([1, 2].map(() => http().post(api(`/admin/orders/${id}/refunds`)).set(admin).send({ amountPaise: total, reason: 'Test refund' })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    const sum = (await db.refund.findMany({ where: { orderId: id } })).reduce((s, r) => s + r.amountPaise, 0);
    expect(sum).toBe(total);
  });
});

describe('payments for the app', () => {
  it('the payment page gets its details from the API, only with the signed order link', async () => {
    const p = await piece('Online Ring');
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: p.id, quantity: 1 }).expect(200);
    const placed = await a.post(api('/checkout')).send({ contact: { name: 'Online Buyer', phone: '9811700304' }, address: { ...ADDRESS, phone: '9811700304' }, cityId: puneId, paymentMethod: 'ONLINE' }).expect(201);
    const { number, token } = placed.body.order;
    await http().get(api(`/track/${number}/payment`)).expect(404);
    await http().get(api(`/track/${number}/payment?t=wrong`)).expect(404);
    const c = await http().get(api(`/track/${number}/payment?t=${encodeURIComponent(token)}`)).expect(200);
    expect(c.body).toMatchObject({ orderId: placed.body.payment.orderId, amount: placed.body.order.totalPaise, orderNumber: number });
  });
});

describe('cart reminders', () => {
  it('greets with letters only, so a guest form cannot smuggle links into our WhatsApp', () => {
    expect(safeFirstName('Asha Patil')).toBe('Asha');
    expect(safeFirstName('evil.com/claim now')).toBe('evilcomclaim');
    expect(safeFirstName('http://x.y')).toBe('httpxy');
    expect(safeFirstName('   ')).toBe('there');
    expect(safeFirstName(null)).toBe('there');
  });
});
