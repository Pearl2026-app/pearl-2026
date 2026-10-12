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

describe('money and proof (handover review)', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  it('only head office can mark a manual or converted order as already paid', async () => {
    const p = await piece('Paid Ring');
    const body = { contact: { name: 'Walk In', phone: '9811700310' }, address: { ...ADDRESS, phone: '9811700310' }, cityId: puneId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'BANK_TRANSFER', alreadyPaid: true, paymentReference: 'UPI-1' };
    const r = await http().post(api('/admin/orders')).set(bearer(await tokenFor('puneManager'))).send(body).expect(403);
    expect(r.body.message).toMatch(/head office/);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).soldAt).toBeNull();
  });

  it('staff-made orders cannot be set to online payment (the customer would have no way to pay)', async () => {
    const p = await piece('Online Manual Ring');
    await http()
      .post(api('/admin/orders'))
      .set(bearer(await tokenFor('superAdmin')))
      .send({ contact: { name: 'Phone Buyer', phone: '9811700311' }, address: { ...ADDRESS, phone: '9811700311' }, cityId: puneId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'ONLINE' })
      .expect(400);
  });

  it('only head office records the advance on a customized order', async () => {
    const e = await db.enquiry.create({ data: { reference: `ENQ-T4-${Date.now()}`, type: 'CUSTOMIZED', cityId: puneId, contactName: 'Custom Buyer', contactPhone: '+919811700312' } });
    const c = await db.customRequest.create({ data: { enquiryId: e.id, cityId: puneId, jewelleryType: 'Necklace', stage: 'QUOTED', quotedPaise: 5_000_000 } });
    await http()
      .post(api(`/admin/custom-orders/${c.id}/stage`))
      .set(bearer(await tokenFor('puneManager')))
      .send({ stage: 'ADVANCE_PAID', advance: { amountPaise: 1_000_000, method: 'BANK_TRANSFER', reference: 'UPI-2', address: { ...ADDRESS, phone: '9811700312' } } })
      .expect(403);
  });

  it('marking delivered without the rider: head office only, with a note on how it was handed over', async () => {
    const order = await db.order.findFirstOrThrow({ where: { cityId: puneId } });
    await http().post(api(`/admin/orders/${order.id}/status`)).set(bearer(await tokenFor('puneManager'))).send({ status: 'DELIVERED' }).expect(403);
    const r = await http().post(api(`/admin/orders/${order.id}/status`)).set(bearer(await tokenFor('superAdmin'))).send({ status: 'DELIVERED' }).expect(400);
    expect(r.body.code).toBe('REASON_REQUIRED');
  });

  it('approving a vendor’s new piece needs a photo, like publishing', async () => {
    const vendor = await db.user.findUniqueOrThrow({ where: { email: 'vendor@sahyadripearls.test' } });
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
    const sku = `T-SEC-NOPIC-${Date.now().toString(36).toUpperCase()}`;
    const p = await db.product.create({ data: { sku, name: 'No Photo Ring', slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 100_000, status: 'PENDING_APPROVAL', vendorId: vendor.vendorId } });
    const r = await http().post(api(`/admin/products/${p.id}/approve`)).set(bearer(await tokenFor('superAdmin'))).expect(400);
    expect(r.body.code).toBe('NO_IMAGES');
  });

  it('a vendor cannot change photos on a live piece, but can on a draft', async () => {
    const vendor = await db.user.findUniqueOrThrow({ where: { email: 'vendor@sahyadripearls.test' } });
    const live = await piece('Live Photo Ring', { vendorId: vendor.vendorId });
    const token = bearer(await tokenFor('vendor'));
    await http().post(api(`/admin/products/${live.id}/images`)).set(token).attach('files', PNG, 'a.png').expect(403);
    const draft = await piece('Draft Photo Ring', { vendorId: vendor.vendorId, status: 'DRAFT' });
    await http().post(api(`/admin/products/${draft.id}/images`)).set(token).attach('files', PNG, 'a.png').expect(201);
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
