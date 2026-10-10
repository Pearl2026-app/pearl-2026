import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADDRESS, api, bearer, db, drain, getApp, http, lastCode, tokenFor } from './helpers';

/**
 * End to end through the API, as the people involved would do it:
 * a visitor browses and enquires on WhatsApp → the city team converts the enquiry → the franchise
 * packs it → the rider delivers it with proof and cash → the customer sees it delivered.
 */
describe('journey: browse → enquire → convert → deliver', () => {
  beforeAll(async () => {
    await getApp();
  });
  afterAll(() => db.$disconnect());

  it('runs the whole way with each role seeing only its part', async () => {
    // 1. Browse: a published, available piece in Pune.
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'pendants' } });
    const sku = `J-${Date.now().toString(36).toUpperCase()}`;
    const product = await db.product.create({ data: { sku, name: 'Journey Pendant', slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 1_250_000, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } } });
    const listing = await http().get(api(`/catalogue/products?q=${sku}`)).expect(200);
    expect(listing.body.items[0].slug).toBe(product.slug);
    const detail = await http().get(api(`/catalogue/products/${product.slug}`)).expect(200);
    expect(detail.body.available).toBe(true);

    // 2. Enquire: saved first, then WhatsApp opens with the reference.
    const phone = '9811600001';
    const enq = await http().post(api('/enquiries')).send({ clientId: crypto.randomUUID(), type: 'PRODUCT', productId: product.id, name: 'Kavya Iyer', phone, citySlug: 'pune', source: 'instagram', pageUrl: `/product/${product.slug}` }).expect(201);
    expect(enq.body.whatsappText).toContain(enq.body.reference);
    expect(enq.body.whatsappText).toContain(sku);
    const enquiry = await db.enquiry.findFirstOrThrow({ where: { reference: enq.body.reference } });

    // The Pune manager sees it; Mumbai's does not.
    const pune = await tokenFor('puneManager');
    await http().get(api(`/admin/enquiries/${enquiry.id}`)).set(bearer(pune)).expect(200);
    await http().get(api(`/admin/enquiries/${enquiry.id}`)).set(bearer(await tokenFor('mumbaiManager'))).expect(404);

    // 3. Convert in one click (COD), and hand it to the Pune franchise.
    const order = await http().post(api(`/admin/enquiries/${enquiry.id}/convert`)).set(bearer(pune)).send({ address: { ...ADDRESS, name: 'Kavya Iyer', phone }, paymentMethod: 'COD' }).expect(201);
    const orderId = order.body.id;
    expect((await db.enquiry.findUniqueOrThrow({ where: { id: enquiry.id } })).stage).toBe('CONVERTED');
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).soldAt).not.toBeNull(); // the piece is off sale
    const franchise = await db.franchise.findFirstOrThrow({ where: { city: { slug: 'pune' } } });
    await http().patch(api(`/admin/orders/${orderId}`)).set(bearer(pune)).send({ franchiseId: franchise.id }).expect(200);

    // 4. The franchise confirms and packs; the city manager assigns the rider.
    const fr = await tokenFor('franchisePune');
    await http().post(api(`/admin/orders/${orderId}/status`)).set(bearer(fr)).send({ status: 'CONFIRMED' }).expect(200);
    await http().post(api(`/admin/orders/${orderId}/status`)).set(bearer(fr)).send({ status: 'PACKED' }).expect(200);
    const rider = await db.deliveryPartner.findFirstOrThrow({ where: { phone: '+919800000005' } });
    await http().post(api(`/admin/orders/${orderId}/assign-delivery`)).set(bearer(pune)).send({ deliveryPartnerId: rider.id }).expect(200);

    // 5. The rider delivers with a photo, the customer's code and the cash.
    const rt = await tokenFor('deliveryPune');
    await http().post(api(`/delivery/jobs/${orderId}/picked-up`)).set(bearer(rt)).send({}).expect(200);
    await http().post(api(`/delivery/jobs/${orderId}/out-for-delivery`)).set(bearer(rt)).send({}).expect(200);
    await drain();
    const code = lastCode(`+91${phone}`);
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ddd' } }).png().toBuffer();
    const done = await http().post(api(`/delivery/jobs/${orderId}/delivered`)).set(bearer(rt)).attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).field('otp', code).field('codCollectedPaise', '1250000').expect(200);
    expect(done.body.status).toBe('DELIVERED');

    // 6. Everyone sees the outcome: the order is paid and invoiced, the cash awaits reconciliation,
    //    and the customer can track it and is asked for a review later.
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true, events: true } });
    expect(o.paymentStatus).toBe('COD_COLLECTED');
    expect(o.invoice).not.toBeNull();
    expect(o.events.map((e) => e.toStatus).filter(Boolean)).toEqual(expect.arrayContaining(['CONFIRMED', 'PACKED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED']));
    const cod = await http().get(api('/admin/payments?unreconciled=true')).set(bearer(await tokenFor('superAdmin'))).expect(200);
    expect(cod.body.items.some((p: { order: { id: string } }) => p.order.id === orderId)).toBe(true);
    const trackToken = order.body.trackUrl?.match(/t=([^&]+)/)?.[1] ?? (await http().get(api(`/admin/orders/${orderId}`)).set(bearer(pune))).body.trackUrl.match(/t=([^&]+)/)[1];
    const track = await http().get(api(`/track/${o.number}?t=${trackToken}`)).expect(200);
    expect(track.body.status).toBe('DELIVERED');
    // The vendor (not assigned) cannot see the order at all.
    await http().get(api(`/admin/orders/${orderId}`)).set(bearer(await tokenFor('vendor'))).expect(404);
    // Reports pick it up as an Instagram enquiry that converted.
    const wa = await http().get(api('/admin/reports/whatsapp')).set(bearer(pune)).expect(200);
    expect(wa.body.rows.find((r: { dimension: string; value: string }) => r.dimension === 'Product' && r.value.includes(sku))).toMatchObject({ enquiries: 1, orders: 1 });
  });
});
