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
});
