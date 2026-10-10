import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADDRESS, agent, api, bearer, db, drain, getApp, http, lastCode, tokenFor } from './helpers';

/** Any 2xx; shows the body when a setup call fails. */
const ok = (r: { status: number; body: unknown }) => {
  if (r.status >= 300) throw new Error(`${r.status} ${JSON.stringify(r.body)}`);
};

let puneId: string;
let admin: string;
let rider: string;
let png: Buffer;

async function uniquePiece(name: string, pricePaise = 1_000_000) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
  const sku = `D-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  return db.product.create({ data: { sku, name, slug: sku.toLowerCase(), categoryId: cat.id, pricePaise, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } } });
}

/** A COD order packed and assigned to the Pune rider. */
async function assignedOrder(phone: string, opts: { pricePaise?: number; manualPaid?: boolean } = {}) {
  const piece = await uniquePiece(`Ride ${phone}`, opts.pricePaise);
  let orderId: string;
  if (opts.manualPaid) {
    const r = await http().post(api('/admin/orders')).set(bearer(admin)).send({ contact: { name: 'Big Buyer', phone }, address: { ...ADDRESS, phone }, cityId: puneId, items: [{ productId: piece.id, quantity: 1 }], paymentMethod: 'BANK_TRANSFER', alreadyPaid: true, paymentReference: 'NEFT-1' }).expect(ok);
    orderId = r.body.id;
  } else {
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: piece.id, quantity: 1 }).expect(ok);
    const r = await a.post(api('/checkout')).send({ contact: { name: 'Rider Test', phone }, address: { ...ADDRESS, phone }, cityId: puneId, paymentMethod: 'COD' }).expect(ok);
    orderId = r.body.order.id;
    await http().post(api(`/admin/orders/${orderId}/status`)).set(bearer(admin)).send({ status: 'CONFIRMED' }).expect(ok);
  }
  await http().post(api(`/admin/orders/${orderId}/status`)).set(bearer(admin)).send({ status: 'PACKED' }).expect(ok);
  const dp = await db.deliveryPartner.findFirstOrThrow({ where: { phone: '+919800000005' } });
  await http().post(api(`/admin/orders/${orderId}/assign-delivery`)).set(bearer(admin)).send({ deliveryPartnerId: dp.id }).expect(ok);
  return orderId;
}

beforeAll(async () => {
  await getApp();
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
  admin = await tokenFor('superAdmin');
  rider = await tokenFor('deliveryPune');
  png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ccbbaa' } }).png().toBuffer();
});
afterAll(() => db.$disconnect());

describe('delivery partner jobs', () => {
  it('runs a COD delivery: pick up (replay-safe), out for delivery, proof, cash collected, invoice', async () => {
    const orderId = await assignedOrder('9811200001');
    const list = await http().get(api('/delivery/jobs')).set(bearer(rider)).expect(200);
    const job = list.body.items.find((j: { id: string }) => j.id === orderId);
    expect(job.codDuePaise).toBe(1_000_000);
    expect(job.contactPhone).toBe('+919811200001');

    // Another city's rider cannot see it.
    const other = await tokenFor('deliveryMumbai');
    await http().get(api(`/delivery/jobs/${orderId}`)).set(bearer(other)).expect(404);
    // Staff cannot use the rider endpoints.
    await http().get(api('/delivery/jobs')).set(bearer(admin)).expect(403);

    // An offline queue may send the same step twice.
    const ev = 'evt-pickup-0001';
    await http().post(api(`/delivery/jobs/${orderId}/picked-up`)).set(bearer(rider)).send({ clientEventId: ev }).expect(200);
    const again = await http().post(api(`/delivery/jobs/${orderId}/picked-up`)).set(bearer(rider)).send({ clientEventId: ev }).expect(200);
    expect(again.body.status).toBe('PICKED_UP');

    await http().post(api(`/delivery/jobs/${orderId}/out-for-delivery`)).set(bearer(rider)).send({}).expect(200);
    await drain();
    const code = lastCode('+919811200001');

    const deliver = () => http().post(api(`/delivery/jobs/${orderId}/delivered`)).set(bearer(rider));
    expect((await deliver().field('otp', code).field('codCollectedPaise', '1000000')).body.code).toBe('PHOTO_REQUIRED');
    expect((await deliver().attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).field('codCollectedPaise', '1000000')).body.code).toBe('PROOF_REQUIRED');
    expect((await deliver().attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).field('otp', code).field('codCollectedPaise', '500000')).body.code).toBe('COD_AMOUNT');
    expect((await deliver().attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).field('otp', '000000').field('codCollectedPaise', '1000000')).body.code).toBe('OTP_INVALID');

    const done = await deliver().attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).field('otp', code).field('codCollectedPaise', '1000000').field('clientEventId', 'evt-deliver-0001').expect(200);
    expect(done.body.status).toBe('DELIVERED');
    expect(done.body.paymentStatus).toBe('COD_COLLECTED');
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { delivery: true, invoice: true } });
    expect(o.delivery!.proofKind).toBe('CUSTOMER_OTP');
    expect(o.delivery!.proofPhotoUrl).toMatch(/^private:/);
    expect(o.delivery!.codCollectedPaise).toBe(1_000_000);
    expect(o.invoice).not.toBeNull();

    // Replaying the delivered event does not record cash twice.
    await deliver().attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).field('otp', code).field('codCollectedPaise', '1000000').field('clientEventId', 'evt-deliver-0001').expect(200);
    expect(await db.payment.count({ where: { orderId, method: 'COD' } })).toBe(1);

    const cash = await http().get(api('/delivery/jobs?view=done')).set(bearer(rider)).expect(200);
    expect(cash.body.cashInHand.amountPaise).toBeGreaterThanOrEqual(1_000_000);

    // The office sees the proof; another city's manager does not.
    const proof = await http().get(api(`/admin/deliveries/${o.delivery!.id}/proof`)).set(bearer(admin)).expect(302);
    expect(proof.headers.location).toMatch(/sig=/);
    await http().get(api(`/admin/deliveries/${o.delivery!.id}/proof`)).set(bearer(await tokenFor('mumbaiManager'))).expect(404);
  });

  it('requires the customer code for high-value orders; a signature is not enough', async () => {
    const orderId = await assignedOrder('9811200002', { pricePaise: 6_000_000, manualPaid: true });
    await http().post(api(`/delivery/jobs/${orderId}/picked-up`)).set(bearer(rider)).send({}).expect(200);
    const out = await http().post(api(`/delivery/jobs/${orderId}/out-for-delivery`)).set(bearer(rider)).send({}).expect(200);
    expect(out.body.otpRequired).toBe(true);
    expect(out.body.codDuePaise).toBe(0);
    const r = await http().post(api(`/delivery/jobs/${orderId}/delivered`)).set(bearer(rider)).attach('photo', png, { filename: 'p.png', contentType: 'image/png' }).attach('signature', png, { filename: 's.png', contentType: 'image/png' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('OTP_REQUIRED');
  });

  it('records a failed attempt with a reason; the office can reassign', async () => {
    const orderId = await assignedOrder('9811200003');
    await http().post(api(`/delivery/jobs/${orderId}/picked-up`)).set(bearer(rider)).send({}).expect(200);
    await http().post(api(`/delivery/jobs/${orderId}/failed`)).set(bearer(rider)).send({ reason: 'x' }).expect(400);
    const f = await http().post(api(`/delivery/jobs/${orderId}/failed`)).set(bearer(rider)).send({ reason: 'Customer not at home' }).expect(200);
    expect(f.body.status).toBe('FAILED');
    expect(f.body.delivery.failureReason).toBe('Customer not at home');
    const dp = await db.deliveryPartner.findFirstOrThrow({ where: { phone: '+919800000005' } });
    await http().post(api(`/admin/orders/${orderId}/assign-delivery`)).set(bearer(admin)).send({ deliveryPartnerId: dp.id }).expect(ok);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('ASSIGNED');
  });
});
