import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { suggestPrice } from '@sahyadri/shared';
import { parseMetalFeed } from '../src/modules/pricing/metal-rates';
import { PearlPricingService } from '../src/modules/pricing/pricing.module';
import { api, bearer, db, getApp, http, tokenFor } from './helpers';

let admin: string;
let mulshi: string;
let rings: string;
let loose: string;

beforeAll(async () => {
  await getApp();
  admin = await tokenFor('superAdmin');
  mulshi = (await db.farm.findUniqueOrThrow({ where: { slug: 'mulshi-lake-farm' } })).id;
  rings = (await db.category.findUniqueOrThrow({ where: { slug: 'rings' } })).id;
  loose = (await db.category.findUniqueOrThrow({ where: { slug: 'loose-pearls' } })).id;
});
afterAll(() => db.$disconnect());

describe('pearl pricing calculator', () => {
  it('suggests a price from the rate table and the most specific margin rule', async () => {
    const r = await http().post(api('/admin/pricing/calculate')).set(bearer(admin)).send({ caratWeight: 2.5, grade: 'aaa', farmId: mulshi, sizeMm: 7, categoryId: rings, metalCostPaise: 1_200_000, labourCostPaise: 300_000 }).expect(200);
    expect(r.body.ratePerCaratPaise).toBe(450_000);
    expect(r.body.rate.farm).toBe('Mulshi Lake Farm');
    expect(r.body.marginRule.name).toBe('AAA grade');
    const expected = suggestPrice({ caratWeight: 2.5, ratePerCaratPaise: 450_000, metalCostPaise: 1_200_000, labourCostPaise: 300_000, marginBp: 4500, gstRateBp: 300 });
    expect(r.body.suggestedPricePaise).toBe(expected.suggestedPricePaise);
    expect(r.body.exclusivePaise + r.body.gstPaise).toBe(r.body.suggestedPricePaise);

    // A category rule with higher priority wins over the grade rule; its minimum margin applies.
    const l = await http().post(api('/admin/pricing/calculate')).set(bearer(admin)).send({ caratWeight: 0.1, grade: 'A', farmId: mulshi, sizeMm: 3, categoryId: loose }).expect(200);
    expect(l.body.marginRule.name).toBe('Loose pearls');
    expect(l.body.marginPaise).toBe(30_000);

    // A size outside every band, or an unknown grade, needs a rate.
    expect((await http().post(api('/admin/pricing/calculate')).set(bearer(admin)).send({ caratWeight: 1, grade: 'ZZ' })).body.code).toBe('NO_RATE');
    const manual = await http().post(api('/admin/pricing/calculate')).set(bearer(admin)).send({ caratWeight: 1, grade: 'ZZ', ratePerCaratPaise: 100_000 }).expect(200);
    expect(manual.body.rate).toBeNull();
    expect(manual.body.marginRule.name).toBe('Default margin');
  });

  it('lets head office manage rates; partners may only view and calculate', async () => {
    const pune = await tokenFor('puneManager');
    await http().post(api('/admin/pricing/calculate')).set(bearer(pune)).send({ caratWeight: 1, grade: 'AA', farmId: mulshi, sizeMm: 7 }).expect(200);
    await http().get(api('/admin/pearl-rates')).set(bearer(pune)).expect(200);
    await http().post(api('/admin/pearl-rates')).set(bearer(pune)).send({ grade: 'B', sizeMinMm: 2, sizeMaxMm: 4, ratePerCaratPaise: 1000 }).expect(403);
    await http().get(api('/admin/pearl-rates')).set(bearer(await tokenFor('vendor'))).expect(403);

    expect((await http().post(api('/admin/pearl-rates')).set(bearer(admin)).send({ grade: 'B', sizeMinMm: 6, sizeMaxMm: 4, ratePerCaratPaise: 1000 })).status).toBe(400);
    const created = await http().post(api('/admin/pearl-rates')).set(bearer(admin)).send({ grade: 'b', sizeMinMm: 2, sizeMaxMm: 4, ratePerCaratPaise: 90_000 }).expect(201);
    expect(created.body.grade).toBe('B');
    expect(created.body.source).toBe('MANUAL');
    const used = await http().post(api('/admin/pricing/calculate')).set(bearer(admin)).send({ caratWeight: 1, grade: 'B', sizeMm: 3 }).expect(200);
    expect(used.body.rate.id).toBe(created.body.id);
  });

  it('keeps the live feed off until configured, and never overwrites manual rates', async () => {
    expect((await http().post(api('/admin/pricing/feed/sync')).set(bearer(admin)).send({})).body.code).toBe('FEED_OFF');
    const svc = (await getApp()).get(PearlPricingService);
    const manualBefore = await db.pearlRate.count({ where: { source: 'MANUAL', isActive: true } });
    (svc as unknown as { feed: unknown }).feed = { name: 'test', configured: true, fetch: async () => [{ grade: 'AA', farmSlug: 'mulshi-lake-farm', sizeMinMm: 6, sizeMaxMm: 8.99, ratePerCaratPaise: 999_999 }] };
    const r = await svc.syncFeed(null);
    expect(r.imported).toBe(1);
    expect(await db.pearlRate.count({ where: { source: 'MANUAL', isActive: true } })).toBe(manualBefore);
    // Manual rows still win over feed rows for the same grade, farm and size.
    const calc = await svc.calculate({ caratWeight: 1, grade: 'AA', farmId: mulshi, sizeMm: 7 });
    expect(calc.rate!.source).toBe('MANUAL');
    (svc as unknown as { feed: unknown }).feed = { name: 'none', configured: false, fetch: async () => [] };
  });
});

describe('daily metal rates', () => {
  it('re-prices only the pieces that follow the rate, with the margin, making and pearl cost', async () => {
    const stamp = Date.now().toString(36).toUpperCase();
    // Margin for 22K gold: 10%.
    await http().put(api('/admin/metal-rates/margins')).set(bearer(admin)).send({ margins: { GOLD_22K: { percent: 10, perGramPaise: 0 }, SILVER_925: { percent: 0, perGramPaise: 2_000 } } }).expect(200);
    const following = await http()
      .post(api('/admin/products'))
      .set(bearer(admin))
      .send({ sku: `MR-${stamp}`, name: 'Rate Ring', categoryId: rings, pricePaise: 100_000, metal: '22K Gold', priceFollowsMetalRate: true, netWeight: 4.25, labourCostPaise: 150_000, pearlCostPaise: 300_000 })
      .expect(201);
    const fixed = await http().post(api('/admin/products')).set(bearer(admin)).send({ sku: `MF-${stamp}`, name: 'Fixed Ring', categoryId: rings, pricePaise: 100_000, metal: '22K Gold', netWeight: 4.25 }).expect(201);
    // Following without a weight is refused.
    const bad = await http().post(api('/admin/products')).set(bearer(admin)).send({ sku: `MB-${stamp}`, name: 'No Weight Ring', categoryId: rings, pricePaise: 100_000, metal: '22K Gold', priceFollowsMetalRate: true });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('METAL_PRICE');

    // Partners cannot enter rates.
    await http().post(api('/admin/metal-rates')).set(bearer(await tokenFor('puneManager'))).send({ rates: [{ metal: 'GOLD_22K', ratePerGramPaise: 1 }] }).expect(403);
    const saved = await http().post(api('/admin/metal-rates')).set(bearer(admin)).send({ rates: [{ metal: 'GOLD_22K', ratePerGramPaise: 650_000 }, { metal: 'SILVER_925', ratePerGramPaise: 9_500 }] }).expect(200);
    expect(saved.body.saved).toBe(2);
    // 4.25 g × ₹6,500 = ₹27,625 + 10% + making ₹1,500 + pearl ₹3,000 = ₹34,887.50 → ₹34,890
    const after = await db.product.findUniqueOrThrow({ where: { id: following.body.id } });
    expect(after.pricePaise).toBe(3_489_000);
    expect(after.metalCostPaise).toBe(2_762_500);
    expect(after.b2bPricePaise).toBeLessThan(after.pricePaise);
    expect((await db.product.findUniqueOrThrow({ where: { id: fixed.body.id } })).pricePaise).toBe(100_000);

    // Correcting today's rate re-prices again (one row per metal per day).
    await http().post(api('/admin/metal-rates')).set(bearer(admin)).send({ rates: [{ metal: 'GOLD_22K', ratePerGramPaise: 660_000 }] }).expect(200);
    expect((await db.product.findUniqueOrThrow({ where: { id: following.body.id } })).pricePaise).toBeGreaterThan(3_489_000);

    const today = await http().get(api('/admin/metal-rates/today')).set(bearer(admin)).expect(200);
    const g22 = today.body.rates.find((r: { metal: string }) => r.metal === 'GOLD_22K');
    expect(g22).toMatchObject({ ratePerGramPaise: 660_000, isToday: true, source: 'MANUAL' });
    const page = await http().get(api('/admin/metal-rates')).set(bearer(admin)).expect(200);
    expect(page.body.following.some((p: { id: string }) => p.id === following.body.id)).toBe(true);
    expect(page.body.margins.GOLD_22K.percent).toBe(10);
    // No feed configured: fetching says so.
    expect((await http().post(api('/admin/metal-rates/fetch')).set(bearer(admin)).send({})).body.code).toBe('FEED_OFF');
  });

  it('reads the common feed shapes', () => {
    expect(parseMetalFeed([{ metal: 'gold_22k', ratePerGramPaise: 650_000 }, { metal: 'NOPE', ratePerGramPaise: 1 }])).toEqual([{ metal: 'GOLD_22K', ratePerGramPaise: 650_000 }]);
    expect(parseMetalFeed({ rates: { GOLD_24K: 7100.5, SILVER_999: 98 } })).toEqual([
      { metal: 'GOLD_24K', ratePerGramPaise: 710_050 },
      { metal: 'SILVER_999', ratePerGramPaise: 9_800 },
    ]);
    expect(parseMetalFeed('garbage')).toEqual([]);
  });
});
