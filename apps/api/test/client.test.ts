import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, createClient, isNetworkError, memoryStore, type ApiClient } from '@sahyadri/api-client';
import { ADDRESS, api, bearer, db, drain, getApp, http, lastCode, tokenFor } from './helpers';

// Contract tests: the mobile apps' client against the real API (token auth, refresh, cart token, delivery steps).
let baseUrl: string;

beforeAll(async () => {
  const app = await getApp();
  const addr = app.getHttpServer().address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
});
afterAll(() => db.$disconnect());

const client = (opts: Partial<Parameters<typeof createClient>[0]> = {}): ApiClient => createClient({ baseUrl, store: memoryStore(), client: 'app-test/1.0', ...opts });

describe('mobile API client', () => {
  it('signs a customer in with OTP, keeps the cart token, refreshes an expired access token', async () => {
    const store = memoryStore();
    let signedOut = 0;
    const c = client({ store, onSignedOut: () => signedOut++ });
    expect(await c.isSignedIn()).toBe(false);
    await expect(c.auth.me()).rejects.toMatchObject({ status: 401 });

    const { challengeId } = await c.auth.requestCustomerOtp('9811700001');
    await drain();
    const me = await c.auth.verifyCustomerOtp(challengeId, lastCode('+919811700001'), { name: 'App Shopper' });
    expect(me.role).toBe('CUSTOMER');
    expect((await c.auth.me()).name).toBe('App Shopper');

    // Guest-style cart token travels in a header (no cookies in the app).
    const p = await db.product.findFirstOrThrow({ where: { status: 'PUBLISHED', priceOnRequest: false, soldAt: null, stockType: 'QUANTITY', quantity: { gt: 5 } } });
    await c.post('/cart/items', { productId: p.id, quantity: 1 });
    expect(await store.get('sp.cart')).toBeTruthy();
    const cart = await c.get<{ count: number }>('/cart');
    expect(cart.count).toBeGreaterThanOrEqual(1);

    // Expire the access token: the client refreshes once and retries.
    const t = JSON.parse((await store.get('sp.tokens'))!);
    await store.set('sp.tokens', JSON.stringify({ ...t, accessToken: 'expired.token.value' }));
    expect((await c.auth.me()).name).toBe('App Shopper');
    expect(JSON.parse((await store.get('sp.tokens'))!).refreshToken).not.toBe(t.refreshToken); // rotated

    // A revoked session signs the app out.
    await store.set('sp.tokens', JSON.stringify({ accessToken: 'expired.token.value', refreshToken: 'not-a-real-refresh-token' }));
    await expect(c.auth.me()).rejects.toBeInstanceOf(ApiError);
    expect(signedOut).toBe(1);
    expect(await c.isSignedIn()).toBe(false);
  });

  it('reports a network failure as NetworkError (what the offline queue retries)', async () => {
    const c = client({ baseUrl: 'http://127.0.0.1:9/api/v1', timeoutMs: 2000 });
    const e = await c.get('/site').catch((x) => x);
    expect(isNetworkError(e)).toBe(true);
  });

  it('runs delivery steps for a rider, including a multipart proof upload, and replays safely', async () => {
    const admin = await tokenFor('superAdmin');
    const city = await db.city.findUniqueOrThrow({ where: { slug: 'pune' } });
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
    const sku = `C-${Date.now().toString(36).toUpperCase()}`;
    const piece = await db.product.create({ data: { sku, name: 'Client Ring', slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 700_000, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } } });
    const order = await http().post(api('/admin/orders')).set(bearer(admin)).send({ contact: { name: 'Door Buyer', phone: '9811700002' }, address: { ...ADDRESS, phone: '9811700002' }, cityId: city.id, items: [{ productId: piece.id, quantity: 1 }], paymentMethod: 'BANK_TRANSFER', alreadyPaid: true, paymentReference: 'R' }).expect(201);
    await http().post(api(`/admin/orders/${order.body.id}/status`)).set(bearer(admin)).send({ status: 'PACKED' });
    const dp = await db.deliveryPartner.findFirstOrThrow({ where: { phone: '+919800000005' } });
    await http().post(api(`/admin/orders/${order.body.id}/assign-delivery`)).set(bearer(admin)).send({ deliveryPartnerId: dp.id });

    const r = client({ client: 'app-delivery/1.0' });
    const { challengeId } = await r.auth.requestPartnerOtp('+919800000005');
    await drain();
    expect((await r.auth.verifyPartnerOtp(challengeId, lastCode('+919800000005'))).role).toBe('DELIVERY_PARTNER');
    await r.auth.registerDevice('rider-device-token-123', 'ANDROID', 'delivery');

    const jobs = await r.delivery.jobs<{ items: Array<{ id: string }> }>();
    expect(jobs.items.some((j) => j.id === order.body.id)).toBe(true);
    const step = { orderId: order.body.id, clientEventId: 'cl-evt-pickup-01', fields: {} };
    await r.delivery.step({ ...step, action: 'picked-up' });
    await r.delivery.step({ ...step, action: 'picked-up' }); // replay: no error, applied once
    await r.delivery.step({ orderId: order.body.id, clientEventId: 'cl-evt-out-0001', fields: {}, action: 'out-for-delivery' });

    // Node's FormData needs a Blob; the app passes { uri, name, type } which React Native turns into a file.
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#eee' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('photo', new Blob([png], { type: 'image/png' }), 'p.png');
    fd.append('signature', new Blob([png], { type: 'image/png' }), 's.png');
    fd.append('clientEventId', 'cl-evt-deliver-1');
    const done = await r.upload<{ status: string }>(`/delivery/jobs/${order.body.id}/delivered`, fd);
    expect(done.status).toBe('DELIVERED');
    await expect(r.delivery.step({ orderId: order.body.id, clientEventId: 'cl-evt-bad-0001', fields: { reason: 'x' }, action: 'failed' })).rejects.toMatchObject({ status: 400 });
  });
  it('lets an app shopper browse, buy as a guest, sign in, see the order, enquire and save to wishlist', async () => {
    const store = memoryStore();
    const c = client({ store, client: 'app-customer/1.0' });
    const home = await c.shop.home<{ featured: unknown[] }>();
    expect(home).toHaveProperty('featured');
    // The real stock list fills the first pages with one-of-a-kind rings: look through the pages for a quantity piece.
    type Item = { id: string; slug: string; available: boolean; priceOnRequest: boolean; isUnique: boolean };
    let pick: Item | undefined;
    for (let page = 1; !pick && page <= 40; page++) {
      const list = await c.shop.products<{ items: Item[]; total: number }>({ inStock: 'true', pageSize: 60, page });
      pick = list.items.find((p) => p.available && !p.priceOnRequest && !p.isUnique);
      if (page * 60 >= list.total) break;
    }
    if (!pick) throw new Error('No quantity piece in the seeded catalogue');
    const detail = await c.shop.product<{ id: string; specification?: unknown; name: string }>(pick.slug);
    expect(detail.id).toBe(pick.id);

    // Guest cart by token, then checkout with cash on delivery and gift packing.
    await c.shop.addToCart(pick.id, 1);
    const cart = await c.shop.cart<{ items: Array<{ quantity: number }> }>();
    expect(cart.items).toHaveLength(1);
    const pune = await db.city.findUniqueOrThrow({ where: { slug: 'pune' } });
    const phone = '9811700040';
    const placed = await c.shop.checkout<{ order: { number: string; token: string }; payment: unknown }>({
      contact: { name: 'App Buyer', phone },
      address: { ...ADDRESS, phone },
      cityId: pune.id,
      paymentMethod: 'COD',
      giftWrap: true,
      giftMessage: 'From the app',
    });
    expect(placed.payment).toBeNull();
    const tracked = await c.shop.track<{ status: string }>(placed.order.number, placed.order.token);
    expect(tracked.status).toBe('PLACED');

    // Signing in with the same phone shows the order under the account.
    const { challengeId } = await c.auth.requestCustomerOtp(phone);
    await drain();
    await c.auth.verifyCustomerOtp(challengeId, lastCode(`+91${phone}`), { name: 'App Buyer' });
    const orders = await c.account.orders<{ items: Array<{ number: string }> }>();
    expect(orders.items.map((o) => o.number)).toContain(placed.order.number);
    const one = await c.account.order<{ number: string; giftWrap?: boolean }>(placed.order.number);
    expect(one.number).toBe(placed.order.number);

    await c.account.addToWishlist(pick.id);
    expect(await c.account.wishlistIds()).toContain(pick.id);
    await c.account.removeFromWishlist(pick.id);
    expect(await c.account.wishlistIds()).not.toContain(pick.id);

    const enq = await c.shop.enquire<{ reference: string; whatsappUrl: string }>({ clientId: crypto.randomUUID(), type: 'PRODUCT', productId: pick.id });
    expect(enq.whatsappUrl).toContain(enq.reference);
    expect((await db.enquiry.findUniqueOrThrow({ where: { reference: enq.reference } })).source).toBe('app');
  });
});
