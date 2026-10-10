import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AbandonedCartService } from '../src/modules/orders/abandoned-carts';
import { RingFinderController } from '../src/modules/public/ring-finder.public';
import { outbox } from '../src/providers/messaging';
import { ADDRESS, agent, api, bearer, db, drain, getApp, http, tokenFor } from './helpers';

let admin: string;
let carts: AbandonedCartService;

async function piece(name: string, pricePaise = 400_000) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'earrings' } });
  const sku = `M-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  return db.product.create({ data: { sku, name, slug: sku.toLowerCase(), categoryId: cat.id, pricePaise, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } } });
}

/** A guest cart with one piece and a phone captured at checkout, last touched `hoursAgo`. */
async function guestCart(phone: string, hoursAgo: number) {
  const a = agent();
  const p = await piece(`Cart ${phone}`);
  await a.post(api('/cart/items')).send({ productId: p.id, quantity: 1 });
  await a.post(api('/checkout/quote')).send({ phone, name: 'Leena Joshi' }).expect(200);
  const cart = await db.cart.findFirstOrThrow({ where: { contactPhone: `+91${phone}` }, orderBy: { createdAt: 'desc' } });
  await db.cart.update({ where: { id: cart.id }, data: { lastActivityAt: new Date(Date.now() - hoursAgo * 3600_000) } });
  return { agent: a, cart, product: p };
}

beforeAll(async () => {
  const app = await getApp();
  admin = await tokenFor('superAdmin');
  carts = app.get(AbandonedCartService);
});
afterAll(() => db.$disconnect());

describe('abandoned carts', () => {
  it('sends one WhatsApp reminder with a link that reopens the guest cart', async () => {
    const { cart } = await guestCart('9811500001', 3);
    const fresh = await guestCart('9811500002', 0.5); // within the 2-hour delay
    await carts.sweep();
    await drain();
    const msg = outbox.filter((o) => o.to === '+919811500001' && o.channel === 'WHATSAPP').at(-1);
    expect(msg?.body).toContain(`/cart/restore?c=${cart.guestToken}`);
    expect(outbox.some((o) => o.to === '+919811500002')).toBe(false);
    expect((await db.cart.findUniqueOrThrow({ where: { id: cart.id } })).reminderSentAt).not.toBeNull();
    expect((await db.cart.findUniqueOrThrow({ where: { id: fresh.cart.id } })).reminderSentAt).toBeNull();

    // Only once.
    const before = outbox.length;
    await carts.sweep();
    await drain();
    expect(outbox.filter((o) => o.to === '+919811500001').length).toBe(outbox.slice(0, before).filter((o) => o.to === '+919811500001').length);
  });

  it('does not chase a shopper who ordered since, and respects the admin switch', async () => {
    await guestCart('9811500003', 4);
    const city = await db.city.findUniqueOrThrow({ where: { slug: 'pune' } });
    // They bought something else meanwhile.
    const other = await piece('Bought Elsewhere');
    const b = agent();
    await b.post(api('/cart/items')).send({ productId: other.id, quantity: 1 });
    await b.post(api('/checkout')).send({ contact: { name: 'Leena Joshi', phone: '9811500003' }, address: { ...ADDRESS, phone: '9811500003' }, cityId: city.id, paymentMethod: 'COD' }).expect(201);
    await carts.sweep();
    await drain();
    expect(outbox.some((o) => o.to === '+919811500003' && o.body.includes('/cart/restore'))).toBe(false);

    await http().patch(api('/admin/settings/cart_reminder')).set(bearer(admin)).send({ enabled: false, delayMinutes: 120 }).expect(200);
    await guestCart('9811500004', 5);
    expect(await carts.sweep()).toBe(0);
    await http().patch(api('/admin/settings/cart_reminder')).set(bearer(admin)).send({ enabled: true, delayMinutes: 120 }).expect(200);
  });

  it('lists abandoned carts for head office, who can send a reminder by hand', async () => {
    const { cart } = await guestCart('9811500005', 1);
    const list = await http().get(api('/admin/abandoned-carts')).set(bearer(admin)).expect(200);
    const row = list.body.items.find((c: { id: string }) => c.id === cart.id);
    expect(row.contact.phone).toBe('+919811500005');
    expect(row.valuePaise).toBe(400_000);
    await http().post(api(`/admin/abandoned-carts/${cart.id}/remind`)).set(bearer(admin)).expect(200);
    await drain();
    expect(outbox.some((o) => o.to === '+919811500005' && o.body.includes('/cart/restore'))).toBe(true);
    await http().get(api('/admin/abandoned-carts')).set(bearer(await tokenFor('puneManager'))).expect(403);
  });
});

describe('ring finder', () => {
  const find = (body: Record<string, unknown>) => http().post(api('/ring-finder')).send(body).expect(200);

  it('recommends only real, in-stock rings that fit the answers, with a reason for each', async () => {
    const rose = await find({ metal: 'rose-gold', budgetMaxPaise: 2_000_000 });
    expect(rose.body.results[0].product.name).toBe('Rose Petal Ring');
    expect(rose.body.results[0].reason.length).toBeGreaterThan(3);
    expect(rose.body.relaxed).toEqual([]);

    const golden = await find({ metal: 'yellow-gold', colour: 'Golden' });
    expect(golden.body.results.map((r: { product: { name: string } }) => r.product.name)).toEqual(['Golden Halo Ring']);

    // Within budget only.
    const cheap = await find({ budgetMaxPaise: 1_000_000 });
    expect(cheap.body.results.every((r: { product: { pricePaise: number } }) => r.product.pricePaise <= 1_000_000)).toBe(true);

    // A preference that cannot be met is loosened, and the answer says so.
    const loosened = await find({ metal: 'rose-gold', shape: 'Oval' });
    expect(loosened.body.relaxed).toEqual(['shape']);
    expect(loosened.body.results[0].product.name).toBe('Rose Petal Ring');

    // Nothing within budget → hand off to Customized Jewellery.
    const none = await find({ budgetMaxPaise: 100 });
    expect(none.body).toMatchObject({ results: [], handoff: true });

    // A sold ring never appears.
    const halo = await db.product.findFirstOrThrow({ where: { name: 'Golden Halo Ring' } });
    const soldAt = halo.soldAt;
    await db.product.update({ where: { id: halo.id }, data: { soldAt: new Date() } });
    const after = await find({ metal: 'yellow-gold', colour: 'Golden' });
    expect(after.body.results.some((r: { product: { id: string } }) => r.product.id === halo.id)).toBe(false);
    await db.product.update({ where: { id: halo.id }, data: { soldAt } });
  });

  it('uses the AI to rank when available, ignores invented products, and falls back when it fails', async () => {
    const ctrl = (await getApp()).get(RingFinderController) as unknown as { ai: unknown };
    const original = ctrl.ai;
    try {
      ctrl.ai = { name: 'test-ai', enabled: true, rank: async (_: unknown, c: Array<{ id: string }>) => [{ id: 'made-up', reason: 'x' }, ...[...c].reverse().map((x) => ({ id: x.id, reason: 'AI reason' }))] };
      const r = await find({});
      expect(r.body.ranker).toBe('test-ai');
      expect(r.body.results.every((x: { reason: string; product: { id: string } }) => x.reason === 'AI reason' && x.product.id !== 'made-up')).toBe(true);

      ctrl.ai = { name: 'broken', enabled: true, rank: async () => { throw new Error('down'); } };
      const f = await find({});
      expect(f.body.ranker).toBe('none');
      expect(f.body.results.length).toBeGreaterThan(0);
    } finally {
      ctrl.ai = original;
    }
  });
});

describe('push campaigns', () => {
  it('targets an audience, sends now or later, and counts deliveries', async () => {
    const asha = await db.user.findUniqueOrThrow({ where: { phone: '+919800000007' } });
    await db.deviceToken.upsert({ where: { token: 'test-device-asha' }, create: { token: 'test-device-asha', userId: asha.id, platform: 'ANDROID', appKind: 'customer' }, update: { isActive: true } });
    const pune = await db.city.findUniqueOrThrow({ where: { slug: 'pune' } });
    const mumbai = await db.city.findUniqueOrThrow({ where: { slug: 'mumbai' } });

    const est = await http().post(api('/admin/campaigns/estimate')).set(bearer(admin)).send({ audience: { type: 'cities', cityIds: [pune.id] } }).expect(200);
    expect(est.body.devices).toBeGreaterThanOrEqual(1);
    const none = await http().post(api('/admin/campaigns/estimate')).set(bearer(admin)).send({ audience: { type: 'cities', cityIds: [mumbai.id] } }).expect(200);
    expect(none.body.devices).toBe(0);

    await http().post(api('/admin/campaigns')).set(bearer(admin)).send({ title: 'Diwali', body: 'x', deepLink: 'javascript:alert(1)', audience: { type: 'all' } }).expect(400);
    const c = await http().post(api('/admin/campaigns')).set(bearer(admin)).send({ title: 'Diwali pearls', body: '10% off studs this week', deepLink: '/offers', audience: { type: 'cities', cityIds: [pune.id] } }).expect(201);
    expect(c.body.status).toBe('DRAFT');
    await http().post(api(`/admin/campaigns/${c.body.id}/send`)).set(bearer(admin)).send({}).expect(200);
    await drain();
    await drain();
    const sent = await http().get(api(`/admin/campaigns/${c.body.id}`)).set(bearer(admin)).expect(200);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.targetCount).toBeGreaterThanOrEqual(1);
    // Without Firebase keys the push provider only logs: every message is accounted for, as not delivered.
    expect(sent.body.pushReady).toBe(false);
    expect(sent.body.delivered + sent.body.failed).toBe(sent.body.targetCount);
    expect(await db.notificationLog.count({ where: { notificationId: c.body.id, error: 'PUSH_NOT_CONFIGURED' } })).toBe(sent.body.targetCount);
    expect(outbox.some((o) => o.channel === 'PUSH' && o.to === 'test-device-asha' && o.body.includes('10% off'))).toBe(true);
    // Sending twice does nothing; a sent campaign cannot change.
    await http().post(api(`/admin/campaigns/${c.body.id}/send`)).set(bearer(admin)).send({}).expect(400);
    await http().patch(api(`/admin/campaigns/${c.body.id}`)).set(bearer(admin)).send({ title: 'Changed' }).expect(400);

    // Scheduled: waits until due, can be cancelled.
    const later = await http().post(api('/admin/campaigns')).set(bearer(admin)).send({ title: 'Weekend', body: 'New baroque pieces', audience: { type: 'segment', segment: 'wishlist' } }).expect(201);
    const s = await http().post(api(`/admin/campaigns/${later.body.id}/send`)).set(bearer(admin)).send({ at: new Date(Date.now() + 3600_000).toISOString() }).expect(200);
    expect(s.body.status).toBe('SCHEDULED');
    await http().post(api(`/admin/campaigns/${later.body.id}/cancel`)).set(bearer(admin)).expect(200);
    expect((await db.notification.findUniqueOrThrow({ where: { id: later.body.id } })).status).toBe('CANCELLED');

    await http().get(api('/admin/campaigns')).set(bearer(await tokenFor('vendor'))).expect(403);
  });
});
