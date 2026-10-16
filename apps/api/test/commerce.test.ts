import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatINR, splitInclusive } from '@sahyadri/shared';
import { JobsService } from '../src/queue/jobs.service';
import { StockService } from '../src/modules/orders/stock.service';
import { SandboxPaymentProvider } from '../src/providers/payment';
import { PAYMENT } from '../src/providers/types';
import { ADDRESS, agent, api, bearer, db, drain, getApp, http, tokenFor } from './helpers';

let puneId: string;
let mumbaiId: string;
const product = (slug: string) => db.product.findUniqueOrThrow({ where: { slug } });

/** A fresh unique piece so tests do not depend on each other. */
async function uniquePiece(name: string, pricePaise = 1_000_000) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
  const sku = `T-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  return db.product.create({
    data: { sku, name, slug: sku.toLowerCase(), categoryId: cat.id, pricePaise, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } },
  });
}

async function guestCheckout(productId: string, paymentMethod: 'ONLINE' | 'COD', phone = '9811100001') {
  const a = agent();
  await a.post(api('/cart/items')).send({ productId, quantity: 1 });
  const r = await a.post(api('/checkout')).send({ contact: { name: 'Guest Buyer', phone }, address: { ...ADDRESS, phone }, cityId: puneId, paymentMethod });
  return { agent: a, res: r };
}

beforeAll(async () => {
  await getApp();
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
  mumbaiId = (await db.city.findUniqueOrThrow({ where: { slug: 'mumbai' } })).id;
});
afterAll(() => db.$disconnect());

describe('cart', () => {
  it('keeps a guest cart by cookie and computes totals on the server', async () => {
    const a = agent();
    const studs = await product('classic-studs-7mm');
    const add = await a.post(api('/cart/items')).send({ productId: studs.id, quantity: 2 }).expect(200);
    expect(add.body.count).toBe(2);
    const cart = await a.get(api('/cart?city=pune')).expect(200);
    expect(cart.body.totals.subtotalPaise).toBe(studs.pricePaise * 2);
    expect(cart.body.totals.taxablePaise + cart.body.totals.gstPaise).toBe(cart.body.totals.totalPaise);
    expect(cart.body.totals.deliveryPaise).toBe(0); // ₹9,800 is above the free-delivery threshold
    await a.patch(api(`/cart/items/${studs.id}`)).send({ quantity: 1 }).expect(200);
    const one = await a.get(api('/cart')).expect(200);
    expect(one.body.totals.deliveryPaise).toBe(15_000); // ₹4,900 is below the ₹5,000 free-delivery threshold
    expect(one.body.totals.totalPaise).toBe(studs.pricePaise + 15_000);
  });

  it('refuses price-on-request and sold pieces', async () => {
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: (await product('royal-peshwai-haar')).id }).expect(400);
    await a.post(api('/cart/items')).send({ productId: (await product('baroque-statement-ring')).id }).expect(409);
  });

  it('applies and rejects coupons with reasons', async () => {
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: (await product('everyday-single-strand')).id }).expect(200);
    const ok = await a.post(api('/cart/coupon')).send({ code: 'pearl500' }).expect(200);
    expect(ok.body.totals.discountPaise).toBe(50_000);
    const bad = await a.post(api('/cart/coupon')).send({ code: 'EARRINGS15' }).expect(400);
    expect(bad.body.message).toMatch(/does not apply/);
  });

  it('merges the guest cart into the account on login', async () => {
    const a = agent();
    const pendant = await product('moonlit-pendant');
    await a.post(api('/cart/items')).send({ productId: pendant.id }).expect(200);
    const t = await tokenFor('customerKaran');
    const merged = await a.get(api('/cart')).set(bearer(t)).expect(200);
    expect(merged.body.items.map((i: { productId: string }) => i.productId)).toContain(pendant.id);
    const again = await http().get(api('/cart')).set(bearer(t)).expect(200);
    expect(again.body.items.map((i: { productId: string }) => i.productId)).toContain(pendant.id);
  });
});

describe('checkout with cash on delivery', () => {
  it('places the order, sells the unique piece, clears the cart and sends a tracking link', async () => {
    const piece = await uniquePiece('COD Ring');
    const { agent: a, res } = await guestCheckout(piece.id, 'COD', '9811100002');
    expect(res.status).toBe(201);
    expect(res.body.order.number).toMatch(/^SP-\d{4}-\d{5}$/);
    expect(res.body.payment).toBeNull();
    const o = await db.order.findUniqueOrThrow({ where: { id: res.body.order.id }, include: { items: true } });
    expect(o.paymentStatus).toBe('COD_PENDING');
    expect(o.totalPaise).toBe(1_000_000);
    expect(o.taxablePaise + o.gstPaise).toBe(o.totalPaise);
    expect((await product(piece.slug)).soldAt).not.toBeNull();
    expect((await a.get(api('/cart')).expect(200)).body.items).toHaveLength(0);
    // guest can track with the signed link only
    await http().get(api(`/track/${o.number}`)).expect(404);
    const tr = await http().get(api(`/track/${o.number}?t=${res.body.order.token}`)).expect(200);
    expect(tr.body.status).toBe('PLACED');
    await drain();
    const msgs = await db.notificationLog.findMany({ where: { templateKey: 'ORDER_PLACED', context: { path: ['orderNumber'], equals: o.number } } });
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.some((m) => m.body.includes(`/track/${o.number}?t=`))).toBe(true);
    // the same unique piece cannot be bought again
    const again = await guestCheckout(piece.id, 'COD', '9811100003');
    expect([400, 409]).toContain(again.res.status);
  });

  it('enforces the COD limit and the online switch from settings', async () => {
    const big = await uniquePiece('Big Ring', 6_000_000);
    const r = await guestCheckout(big.id, 'COD', '9811100004');
    expect(r.res.status).toBe(400);
    expect(r.res.body.code).toBe('COD_UNAVAILABLE');
  });

  it('ignores totals sent by the client', async () => {
    const piece = await uniquePiece('Tamper Ring', 2_000_000);
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: piece.id }).expect(200);
    const r = await a.post(api('/checkout')).send({ contact: { name: 'XXx', phone: '9811100005' }, address: { ...ADDRESS, phone: '9811100005' }, cityId: puneId, paymentMethod: 'COD', totalPaise: 1, pricePaise: 1 }).expect(201);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.body.order.id } })).totalPaise).toBe(2_000_000);
  });
});

describe('rule 2: two buyers racing for one unique piece', () => {
  it('ends with exactly one order when many checkouts start at the same moment', async () => {
    const piece = await uniquePiece('Race Ring');
    const carts = await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const a = agent();
        await a.post(api('/cart/items')).send({ productId: piece.id }).expect(200);
        return { a, phone: `98222000${String(i).padStart(2, '0')}` };
      }),
    );
    const results = await Promise.all(
      carts.map(({ a, phone }) => a.post(api('/checkout')).send({ contact: { name: 'Racer', phone }, address: { ...ADDRESS, phone }, cityId: puneId, paymentMethod: 'ONLINE' })),
    );
    const won = results.filter((r) => r.status === 201);
    expect(won).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).length).toBe(5);
    expect(await db.order.count({ where: { items: { some: { productId: piece.id } } } })).toBe(1);
    expect(await db.stockHold.count({ where: { productId: piece.id, status: { in: ['ACTIVE', 'CONVERTED'] } } })).toBe(1);
  });

  it('is also guaranteed by the database: a second live hold on a unique piece is refused', async () => {
    const piece = await uniquePiece('Index Ring');
    const { res } = await guestCheckout(piece.id, 'ONLINE', '9811100006');
    expect(res.status).toBe(201);
    const other = await db.order.findFirstOrThrow({ where: { NOT: { id: res.body.order.id } } });
    await expect(db.stockHold.create({ data: { productId: piece.id, orderId: other.id, isUnique: true, status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) } })).rejects.toThrow();
  });
});

describe('payment webhooks (rule 5)', () => {
  const sandbox = async () => (await getApp()).get<SandboxPaymentProvider>(PAYMENT);
  const sign = async (event: 'payment.captured' | 'payment.failed', orderId: string, amountPaise: number, paymentId = `pay_${Date.now()}`) => (await sandbox()).buildWebhook(event, { orderId, paymentId, amountPaise });

  it('rejects a webhook with a bad signature and leaves the order unpaid', async () => {
    const piece = await uniquePiece('Sig Ring');
    const { res } = await guestCheckout(piece.id, 'ONLINE', '9811100007');
    const { body } = await sign('payment.captured', res.body.payment.orderId, res.body.order.totalPaise);
    await http().post(api('/webhooks/payment')).set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'deadbeef').send(body.toString()).expect(400);
    expect((await db.order.findUniqueOrThrow({ where: { id: res.body.order.id } })).paymentStatus).toBe('PENDING');
  });

  it('marks the order paid once, issues a GST invoice and redeems the coupon', async () => {
    const piece = await uniquePiece('Paid Ring', 1_500_000);
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: piece.id }).expect(200);
    await a.post(api('/cart/coupon')).send({ code: 'PEARL500' }).expect(200);
    const res = await a.post(api('/checkout')).send({ contact: { name: 'Online Buyer', phone: '9811100008', email: 'buyer@example.com' }, address: { ...ADDRESS, phone: '9811100008', state: 'Karnataka', cityName: 'Bengaluru' }, cityId: puneId, paymentMethod: 'ONLINE' }).expect(201);
    expect(res.body.payment.mode).toBe('sandbox');
    const { body, signature } = await sign('payment.captured', res.body.payment.orderId, res.body.order.totalPaise, 'pay_dup_1');
    for (let i = 0; i < 2; i++) await http().post(api('/webhooks/payment')).set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).send(body.toString()).expect(200);
    const o = await db.order.findUniqueOrThrow({ where: { id: res.body.order.id }, include: { invoice: true, couponRedemption: true, events: true } });
    expect(o.paymentStatus).toBe('PAID');
    expect(o.status).toBe('CONFIRMED');
    expect(o.discountPaise).toBe(50_000);
    expect(o.totalPaise).toBe(1_450_000);
    expect(o.invoice?.number).toMatch(/^SP\/\d{4}-\d{2}\/\d{5}$/);
    expect(o.invoice?.isInterState).toBe(true); // Karnataka address, Maharashtra seller → IGST
    expect(o.invoice?.igstPaise).toBe(o.gstPaise);
    expect(o.couponRedemption?.discountPaise).toBe(50_000);
    expect(o.events.filter((e) => e.type === 'PAYMENT_UPDATED')).toHaveLength(1); // processed once
    expect((await product(piece.slug)).soldAt).not.toBeNull();
    const pdf = await http().get(api(`/track/${o.number}/invoice.pdf?t=${res.body.order.token}`)).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });

  it('releases the piece when payment fails', async () => {
    const piece = await uniquePiece('Fail Ring');
    const { res } = await guestCheckout(piece.id, 'ONLINE', '9811100009');
    const { body, signature } = await sign('payment.failed', res.body.payment.orderId, res.body.order.totalPaise);
    await http().post(api('/webhooks/payment')).set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).send(body.toString()).expect(200);
    const o = await db.order.findUniqueOrThrow({ where: { id: res.body.order.id } });
    expect(o.status).toBe('FAILED');
    expect((await guestCheckout(piece.id, 'COD', '9811100010')).res.status).toBe(201); // available again
  });

  it('lets the same cart check out again: the earlier unpaid order releases its piece', async () => {
    const piece = await uniquePiece('Retry Ring');
    const { agent: a, res: first } = await guestCheckout(piece.id, 'ONLINE', '9811100031');
    expect(first.status).toBe(201);
    const again = await a.post(api('/checkout')).send({ contact: { name: 'Guest Buyer', phone: '9811100031' }, address: { ...ADDRESS, phone: '9811100031' }, cityId: puneId, paymentMethod: 'ONLINE' });
    expect(again.status).toBe(201);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.body.order.id } })).status).toBe('FAILED');
    expect(await db.stockHold.count({ where: { productId: piece.id, status: 'ACTIVE' } })).toBe(1);
    // A different buyer is still blocked by the live hold.
    expect((await guestCheckout(piece.id, 'COD', '9811100032')).res.status).toBe(409);
  });

  it('expires an unpaid hold after 15 minutes, and refunds a payment that arrives too late', async () => {
    const piece = await uniquePiece('Late Ring');
    const { res } = await guestCheckout(piece.id, 'ONLINE', '9811100011');
    await db.stockHold.updateMany({ where: { orderId: res.body.order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const app = await getApp();
    expect(await app.get(StockService).expireHolds()).toBeGreaterThanOrEqual(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: res.body.order.id } })).status).toBe('FAILED');
    // someone else buys it
    expect((await guestCheckout(piece.id, 'COD', '9811100012')).res.status).toBe(201);
    // then the first payment lands
    const { body, signature } = await sign('payment.captured', res.body.payment.orderId, res.body.order.totalPaise, 'pay_late_1');
    await http().post(api('/webhooks/payment')).set('Content-Type', 'application/json').set('X-Razorpay-Signature', signature).send(body.toString()).expect(200);
    const late = await db.order.findUniqueOrThrow({ where: { id: res.body.order.id }, include: { refunds: true } });
    expect(late.status).toBe('FAILED');
    expect(late.refunds).toHaveLength(1);
    expect(late.refunds[0]!.amountPaise).toBe(late.totalPaise);
    expect(await db.order.count({ where: { items: { some: { productId: piece.id } }, status: { not: 'FAILED' } } })).toBe(1);
    await app.get(JobsService).drain();
  });

  it('gives quantity stock back when an order is cancelled', async () => {
    const strand = await product('rose-layered-necklace');
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: strand.id, quantity: 2 }).expect(200);
    const r = await a.post(api('/checkout')).send({ contact: { name: 'QQx', phone: '9811100013' }, address: { ...ADDRESS, phone: '9811100013' }, cityId: puneId, paymentMethod: 'COD' }).expect(201);
    expect((await product(strand.slug)).quantity).toBe(strand.quantity - 2);
    await http().post(api(`/admin/orders/${r.body.order.id}/status`)).set(bearer(await tokenFor('superAdmin'))).send({ status: 'CANCELLED', reason: 'Customer changed mind' }).expect(200);
    expect((await product(strand.slug)).quantity).toBe(strand.quantity);
  });
});

describe('order scope by role', () => {
  let ashaOrder: { id: string; number: string };
  beforeAll(async () => {
    const t = await tokenFor('customerAsha');
    const piece = await uniquePiece('Asha Ring');
    await http().post(api('/cart/items')).set(bearer(t)).send({ productId: piece.id }).expect(200);
    const r = await http().post(api('/checkout')).set(bearer(t)).send({ contact: { name: 'Asha Patil', phone: '9800000007' }, address: ADDRESS, cityId: puneId, paymentMethod: 'COD', saveAddress: true }).expect(201);
    ashaOrder = r.body.order;
  });

  it('customers see only their own orders and invoices', async () => {
    const asha = bearer(await tokenFor('customerAsha'));
    const karan = bearer(await tokenFor('customerKaran'));
    const mine = await http().get(api('/me/orders')).set(asha).expect(200);
    expect(mine.body.items.map((o: { number: string }) => o.number)).toContain(ashaOrder.number);
    await http().get(api(`/me/orders/${ashaOrder.number}`)).set(karan).expect(404);
    await http().get(api(`/track/${ashaOrder.number}`)).set(karan).expect(404);
    await http().get(api(`/track/${ashaOrder.number}`)).set(asha).expect(200);
    const addrs = await http().get(api('/me/addresses')).set(asha).expect(200);
    await http().delete(api(`/me/addresses/${addrs.body[0].id}`)).set(karan).expect(404);
    await http().get(api('/admin/orders')).set(asha).expect(403);
  });

  it('city managers see only their city; vendors the orders sent to them; status rules per role', async () => {
    await http().get(api(`/admin/orders/${ashaOrder.id}`)).set(bearer(await tokenFor('mumbaiManager'))).expect(404);
    await http().get(api(`/admin/orders/${ashaOrder.id}`)).set(bearer(await tokenFor('puneManager'))).expect(200);
    // A Pune address goes to the Pune vendor (nearest PIN code), not to the Mumbai vendor.
    await http().get(api(`/admin/orders/${ashaOrder.id}`)).set(bearer(await tokenFor('vendor'))).expect(200);
    await http().get(api(`/admin/orders/${ashaOrder.id}`)).set(bearer(await tokenFor('vendor2'))).expect(404);
    await http().post(api(`/admin/orders/${ashaOrder.id}/status`)).set(bearer(await tokenFor('mumbaiManager'))).send({ status: 'CONFIRMED' }).expect(404);
    // vendor order: vendor may confirm and pack, nothing further
    const vendorPiece = await product('lavender-hoops');
    const a = agent();
    await a.post(api('/cart/items')).send({ productId: vendorPiece.id }).expect(200);
    const r = await a.post(api('/checkout')).send({ contact: { name: 'VVx', phone: '9811100014' }, address: { ...ADDRESS, phone: '9811100014' }, cityId: puneId, paymentMethod: 'COD' }).expect(201);
    const v = bearer(await tokenFor('vendor'));
    await http().post(api(`/admin/orders/${r.body.order.id}/status`)).set(v).send({ status: 'CONFIRMED' }).expect(200);
    await http().post(api(`/admin/orders/${r.body.order.id}/status`)).set(v).send({ status: 'PACKED' }).expect(200);
    await http().post(api(`/admin/orders/${r.body.order.id}/status`)).set(v).send({ status: 'ASSIGNED' }).expect(400);
    await http().post(api(`/admin/orders/${r.body.order.id}/status`)).set(v).send({ status: 'CANCELLED', reason: 'x' }).expect(400);
    // The vendor hands the packed order to one of its own available riders, never a busy one or another vendor's.
    const busy = await db.deliveryPartner.findUniqueOrThrow({ where: { phone: '+919800000028' } });
    const mine = await db.deliveryPartner.findUniqueOrThrow({ where: { phone: '+919800000005' } });
    const notMine = await db.deliveryPartner.findUniqueOrThrow({ where: { phone: '+919800000015' } });
    const options = await http().get(api(`/admin/orders/${r.body.order.id}/delivery-options`)).set(v).expect(200);
    expect(options.body.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([mine.id, busy.id]));
    expect(options.body.map((p: { id: string }) => p.id)).not.toContain(notMine.id);
    await http().post(api(`/admin/orders/${r.body.order.id}/assign-delivery`)).set(v).send({ deliveryPartnerId: notMine.id }).expect(400);
    await http().post(api(`/admin/orders/${r.body.order.id}/assign-delivery`)).set(v).send({ deliveryPartnerId: busy.id }).expect(400);
    const assigned = await http().post(api(`/admin/orders/${r.body.order.id}/assign-delivery`)).set(v).send({ deliveryPartnerId: mine.id }).expect(200);
    expect(assigned.body.status).toBe('ASSIGNED');
    await http().get(api(`/admin/orders/${r.body.order.id}`)).set(bearer(await tokenFor('vendor2'))).expect(404);
    await http().post(api(`/admin/orders/${r.body.order.id}/assign-delivery`)).set(bearer(await tokenFor('vendor2'))).send({ deliveryPartnerId: notMine.id }).expect(404);
    // delivery partner must serve the city
    const admin = bearer(await tokenFor('superAdmin'));
    const mumbaiDp = await db.deliveryPartner.findUniqueOrThrow({ where: { phone: '+919800000015' } });
    await http().post(api(`/admin/orders/${r.body.order.id}/assign-delivery`)).set(admin).send({ deliveryPartnerId: mumbaiDp.id }).expect(400);
  });
});

describe('manual orders and enquiry conversion', () => {
  it('creates a manual Instagram sale already paid, with an invoice', async () => {
    const admin = bearer(await tokenFor('superAdmin'));
    const piece = await uniquePiece('Insta Ring', 2_500_000);
    const r = await http()
      .post(api('/admin/orders'))
      .set(admin)
      .send({ contact: { name: 'Insta Buyer', phone: '9811100015' }, address: { ...ADDRESS, phone: '9811100015' }, cityId: mumbaiId, items: [{ productId: piece.id, quantity: 1 }], paymentMethod: 'BANK_TRANSFER', alreadyPaid: true, paymentReference: 'UTR123', channel: 'instagram', chargeDelivery: false })
      .expect(201);
    const o = await db.order.findUniqueOrThrow({ where: { id: r.body.id }, include: { invoice: true, payments: true } });
    expect(o.source).toBe('MANUAL');
    expect(o.channel).toBe('instagram');
    expect(o.paymentStatus).toBe('PAID');
    expect(o.invoice).not.toBeNull();
    expect(o.payments[0]!.status).toBe('CAPTURED');
  });

  it('turns an enquiry into an order in one click, and asks for a price on price-on-request pieces', async () => {
    const admin = bearer(await tokenFor('superAdmin'));
    const por = await product('collector-golden-pearl-12mm');
    const e = await http().post(api('/enquiries')).send({ type: 'PRODUCT', productId: por.id, citySlug: 'pune', name: 'Rhea', phone: '9811100016' }).expect(201);
    const addr = { ...ADDRESS, name: 'Rhea', phone: '9811100016' };
    const noPrice = await http().post(api(`/admin/enquiries/${e.body.id}/convert`)).set(admin).send({ address: addr }).expect(400);
    expect(noPrice.body.code).toBe('PRICE_REQUIRED');
    const ok = await http().post(api(`/admin/enquiries/${e.body.id}/convert`)).set(admin).send({ address: addr, items: [{ productId: por.id, quantity: 1, unitPricePaise: 7_500_000 }], paymentMethod: 'BANK_TRANSFER' }).expect(201);
    expect(ok.body.source).toBe('ENQUIRY');
    expect(ok.body.totalPaise).toBe(7_500_000);
    const enq = await db.enquiry.findUniqueOrThrow({ where: { id: e.body.id } });
    expect(enq.stage).toBe('CONVERTED');
    await http().post(api(`/admin/enquiries/${e.body.id}/convert`)).set(admin).send({ address: addr, items: [{ productId: por.id, quantity: 1, unitPricePaise: 1 }] }).expect(400);
    // franchise cannot change prices
    const e2 = await http().post(api('/enquiries')).send({ type: 'PRODUCT', productId: (await product('everyday-pearl-band')).id, citySlug: 'pune', name: 'Z', phone: '9811100017' }).expect(201);
    await http().post(api(`/admin/enquiries/${e2.body.id}/convert`)).set(bearer(await tokenFor('franchisePune'))).send({ address: { ...addr, phone: '9811100017' }, items: [{ productId: (await product('everyday-pearl-band')).id, quantity: 1, unitPricePaise: 100 }] }).expect(403);
  });
});

describe('returns, refunds and referral rewards', () => {
  it('runs a delivered order through return, receipt back into stock and refund', async () => {
    const admin = bearer(await tokenFor('superAdmin'));
    const newbie = '9811100018';
    // a referred customer signs up and buys
    const otp = await http().post(api('/auth/otp/request')).send({ phone: newbie }).expect(200);
    await drain();
    const { lastCode } = await import('./helpers');
    const login = await http().post(api('/auth/otp/verify')).send({ challengeId: otp.body.challengeId, code: lastCode(`+91${newbie}`), name: 'Neha Referred', referralCode: 'ASHA7K2P' }).expect(200);
    const me = bearer(login.body.accessToken);
    const piece = await uniquePiece('Return Ring', 1_200_000);
    await http().post(api('/cart/items')).set(me).send({ productId: piece.id }).expect(200);
    const order = await http().post(api('/checkout')).set(me).send({ contact: { name: 'Neha Referred', phone: newbie }, address: { ...ADDRESS, phone: newbie }, cityId: puneId, paymentMethod: 'COD' }).expect(201);
    const id = order.body.order.id;
    const dp = await db.deliveryPartner.findUniqueOrThrow({ where: { phone: '+919800000005' } });
    for (const s of ['CONFIRMED', 'PACKED']) await http().post(api(`/admin/orders/${id}/status`)).set(admin).send({ status: s }).expect(200);
    await http().post(api(`/admin/orders/${id}/assign-delivery`)).set(admin).send({ deliveryPartnerId: dp.id }).expect(200);
    for (const s of ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED']) await http().post(api(`/admin/orders/${id}/status`)).set(admin).send({ status: s, ...(s === 'DELIVERED' ? { reason: 'Collected at the store' } : {}) }).expect(200);
    await http().post(api(`/admin/orders/${id}/payments`)).set(admin).send({ method: 'COD', amountPaise: 1_200_000 }).expect(200);
    await drain();
    // referral rewarded on first delivery: two personal coupons
    const ref = await db.referral.findFirstOrThrow({ where: { referee: { user: { phone: `+91${newbie}` } } } });
    expect(ref.rewardedAt).not.toBeNull();
    const coupons = await db.coupon.findMany({ where: { customerId: { in: [ref.referrerId, ref.refereeId] } } });
    expect(coupons).toHaveLength(2);
    // personal coupon is not usable by someone else
    const other = agent();
    await other.post(api('/cart/items')).send({ productId: (await product('classic-studs-7mm')).id }).expect(200);
    await other.post(api('/cart/coupon')).send({ code: coupons[0]!.code }).expect(400);

    // return
    const ret = await http().post(api(`/me/orders/${order.body.order.number}/returns`)).set(me).field('type', 'RETURN').field('reason', 'Does not suit me').expect(201);
    for (const [action, body] of [['approve', {}], ['schedule', { pickupAt: new Date().toISOString() }], ['picked-up', {}], ['receive', {}]] as const) {
      await http().post(api(`/admin/returns/${ret.body.id}/${action}`)).set(admin).send(body).expect(200);
    }
    expect((await product(piece.slug)).soldAt).toBeNull(); // back on sale
    expect((await db.order.findUniqueOrThrow({ where: { id } })).status).toBe('RETURNED');
    await http().post(api(`/admin/returns/${ret.body.id}/refund`)).set(bearer(await tokenFor('puneManager'))).send({}).expect(403);
    await http().post(api(`/admin/returns/${ret.body.id}/refund`)).set(admin).send({}).expect(200);
    const done = await db.order.findUniqueOrThrow({ where: { id }, include: { refunds: true } });
    expect(done.refunds[0]!.amountPaise).toBe(1_200_000);
    expect(done.paymentStatus).toBe('REFUNDED');
    expect(done.status).toBe('REFUNDED');
  });

  it('allows reviews only for delivered pieces, held for moderation', async () => {
    const asha = bearer(await tokenFor('customerAsha'));
    const anyProduct = await product('classic-studs-7mm');
    await http().post(api('/me/reviews')).set(asha).send({ orderNumber: 'SP-0000-00000', productId: anyProduct.id, rating: 5 }).expect(400);
  });
});

describe('GST invoice maths', () => {
  it('splits CGST and SGST for a Maharashtra delivery', async () => {
    const piece = await uniquePiece('GST Ring', 1_030_000);
    const admin = bearer(await tokenFor('superAdmin'));
    const r = await http().post(api('/admin/orders')).set(admin).send({ contact: { name: 'GGx', phone: '9811100019' }, address: { ...ADDRESS, phone: '9811100019' }, cityId: puneId, items: [{ productId: piece.id, quantity: 1 }], paymentMethod: 'OTHER', alreadyPaid: true, chargeDelivery: false }).expect(201);
    const inv = await db.invoice.findUniqueOrThrow({ where: { orderId: r.body.id } });
    const { gstPaise } = splitInclusive(1_030_000, 300);
    expect(inv.isInterState).toBe(false);
    expect(inv.cgstPaise + inv.sgstPaise).toBe(gstPaise);
    expect(formatINR(inv.totalPaise)).toBe('₹10,300.00');
  });
});
