import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADDRESS, api, bearer, db, getApp, http, tokenFor } from './helpers';

let admin: string;
let puneId: string;

async function piece(name: string) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
  const sku = `R-${name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  return db.product.create({ data: { sku, name, slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 500_000, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } } });
}

beforeAll(async () => {
  await getApp();
  admin = await tokenFor('superAdmin');
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
});
afterAll(() => db.$disconnect());

describe('dashboard', () => {
  it('shows head office everything and a city manager only their city', async () => {
    const p = await piece('Dash Ring');
    await http().post(api('/admin/orders')).set(bearer(admin)).send({ contact: { name: 'Dash Buyer', phone: '9811400001' }, address: { ...ADDRESS, phone: '9811400001' }, cityId: puneId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'BANK_TRANSFER', alreadyPaid: true, paymentReference: 'R1' }).expect(201);

    const all = await http().get(api('/admin/dashboard')).set(bearer(admin)).expect(200);
    expect(all.body.cards.orders).toBeGreaterThanOrEqual(1);
    expect(all.body.cards.salesPaise).toBeGreaterThanOrEqual(500_000);
    expect(all.body.monthly.length).toBeGreaterThanOrEqual(12);
    expect(all.body.recentOrders.length).toBeGreaterThan(0);

    const pune = await http().get(api('/admin/dashboard')).set(bearer(await tokenFor('puneManager'))).expect(200);
    const yearAgo = new Date(Date.now() - 365 * 86400_000);
    expect(pune.body.cards.orders).toBe(await db.order.count({ where: { cityId: puneId, placedAt: { gte: yearAgo } } }));
    expect(pune.body.recentOrders.every((o: { city: { name: string } }) => o.city.name === 'Pune')).toBe(true);
    expect(pune.body.cards.franchises).toBe(await db.franchise.count({ where: { cityId: puneId, isActive: true } }));

    const vendor = await http().get(api('/admin/dashboard')).set(bearer(await tokenFor('vendor'))).expect(200);
    expect(vendor.body.cards.pendingEnquiries).toBeNull();
    expect(vendor.body.cards.customers).toBeNull();
    expect(vendor.body.recentEnquiries).toEqual([]);
    await http().get(api('/admin/dashboard')).set(bearer(await tokenFor('deliveryPune'))).expect(403);

    // A date range applies to the whole page.
    const empty = await http().get(api('/admin/dashboard?from=2020-01-01&to=2020-02-01')).set(bearer(admin)).expect(200);
    expect(empty.body.cards.orders).toBe(0);
    expect(empty.body.monthly.map((m: { month: string }) => m.month)).toEqual(['2020-01', '2020-02']);
    expect((await http().get(api('/admin/dashboard?from=2021-01-01&to=2020-01-01')).set(bearer(admin))).body.code).toBe('INVALID_RANGE');
  });
});

describe('reports', () => {
  it('produces every report, as JSON and CSV, scoped by role', async () => {
    for (const kind of ['sales', 'gst', 'enquiries', 'whatsapp', 'partners', 'products', 'commission']) {
      const r = await http().get(api(`/admin/reports/${kind}`)).set(bearer(admin)).expect(200);
      expect(Array.isArray(r.body.rows)).toBe(true);
      // Each row has exactly one field per column, in column order (the admin table relies on it).
      for (const row of r.body.rows) expect(Object.keys(row).length).toBe(r.body.columns.length);
      const csv = await http().get(api(`/admin/reports/${kind}?format=csv`)).set(bearer(admin)).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
    }
    await http().get(api('/admin/reports/nope')).set(bearer(admin)).expect(404);
    await http().get(api('/admin/reports/gst')).set(bearer(await tokenFor('franchisePune'))).expect(404);
    await http().get(api('/admin/reports/sales')).set(bearer(await tokenFor('franchisePune'))).expect(200);
    await http().get(api('/admin/reports/sales')).set(bearer(await tokenFor('customerAsha'))).expect(403);

    const sales = await http().get(api('/admin/reports/sales')).set(bearer(admin)).expect(200);
    expect(sales.body.summary.netPaise).toBe(sales.body.summary.grossPaise - sales.body.summary.refundsPaise);
    const gst = await http().get(api('/admin/reports/gst')).set(bearer(admin)).expect(200);
    for (const row of gst.body.rows) expect(row.taxablePaise + row.cgstPaise + row.sgstPaise + row.igstPaise).toBe(row.totalPaise);
  });

  it('WhatsApp analytics shows which sources, products and cities turn into orders', async () => {
    const p = await piece('Analytics Ring');
    const source = `insta-${Date.now()}`;
    const e = await http().post(api('/enquiries')).send({ type: 'PRODUCT', productId: p.id, name: 'Rohan', phone: '9811400002', citySlug: 'pune', source }).expect(201);
    await http().post(api('/enquiries')).send({ type: 'PRODUCT', productId: p.id, name: 'Sara', phone: '9811400003', citySlug: 'pune', source }).expect(201);
    const enquiry = await db.enquiry.findFirstOrThrow({ where: { reference: e.body.reference } });
    await http().post(api(`/admin/enquiries/${enquiry.id}/convert`)).set(bearer(admin)).send({ address: { ...ADDRESS, phone: '9811400002' }, paymentMethod: 'COD' }).expect(201);

    const r = await http().get(api('/admin/reports/whatsapp')).set(bearer(admin)).expect(200);
    const bySource = r.body.rows.find((x: { dimension: string; value: string }) => x.dimension === 'Source' && x.value === source);
    expect(bySource).toMatchObject({ enquiries: 2, orders: 1, conversionPct: 50 });
    const byProduct = r.body.rows.find((x: { dimension: string; value: string }) => x.dimension === 'Product' && x.value.includes(p.sku));
    expect(byProduct).toMatchObject({ enquiries: 2, orders: 1 });
    // A Mumbai manager does not see Pune's enquiries.
    const m = await http().get(api('/admin/reports/whatsapp')).set(bearer(await tokenFor('mumbaiManager'))).expect(200);
    expect(m.body.rows.find((x: { value: string }) => x.value === source)).toBeUndefined();

    // The people behind the counts: name, phone, what they asked about and from which page, with a CSV.
    const people = r.body.sections.find((x: { key: string }) => x.key === 'people');
    const rohan = people.rows.find((x: { reference: string }) => x.reference === e.body.reference);
    expect(rohan).toMatchObject({ name: 'Rohan', phone: '+919811400002', source });
    expect(rohan.product).toContain(p.sku);
    expect(Object.keys(rohan).length).toBe(people.columns.length);
    const csv = await http().get(api('/admin/reports/whatsapp?format=csv&section=people')).set(bearer(admin)).expect(200);
    expect(csv.text).toContain('Rohan');
    expect(csv.text.split('\r\n')[0]).toContain('Asked about');
    await http().get(api('/admin/reports/whatsapp?format=csv&section=nope')).set(bearer(admin)).expect(404);
  });

  it('commission splits the pearl value 50/30/20 and gives the metal to the trader', async () => {
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
    const farm = await db.farm.findFirstOrThrow({ where: { archivedAt: null } });
    const sku = `R-COMM-${Date.now().toString(36).toUpperCase()}`;
    // ₹10,300 incl. 3% GST = ₹10,000 sale value; metal ₹3,000 and making ₹1,000 → pearl value ₹6,000.
    const p = await db.product.create({
      data: { sku, name: 'Commission Ring', slug: sku.toLowerCase(), categoryId: cat.id, farmId: farm.id, pricePaise: 1_030_000, metalCostPaise: 300_000, labourCostPaise: 100_000, status: 'PUBLISHED', stockType: 'UNIQUE', quantity: 1, images: { create: { url: '/media/x.svg', kind: 'MAIN' } } },
    });
    const o = await http().post(api('/admin/orders')).set(bearer(admin)).send({ contact: { name: 'Comm Buyer', phone: '9811400009' }, address: { ...ADDRESS, phone: '9811400009' }, cityId: puneId, items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'BANK_TRANSFER', alreadyPaid: true, paymentReference: 'C1' }).expect(201);
    const r = await http().get(api('/admin/reports/commission')).set(bearer(admin)).expect(200);
    const row = r.body.rows.find((x: { order: string }) => x.order === o.body.number);
    expect(row).toMatchObject({ salePaise: 1_000_000, metalPaise: 300_000, makingPaise: 100_000, pearlPaise: 600_000, farmerPaise: 300_000, traderPearlPaise: 180_000, partnerSharePaise: 120_000, traderTotalPaise: 580_000 });
    expect(row.farm).toBe(farm.name);
    const farms = r.body.sections.find((x: { key: string }) => x.key === 'farms');
    expect(farms.rows.find((x: { farm: string }) => x.farm === farm.name).farmerPaise).toBeGreaterThanOrEqual(300_000);
    expect(r.body.sections.find((x: { key: string }) => x.key === 'partners').rows.length).toBeGreaterThan(0);

    // The shares are a setting and must add up to 100.
    await http().patch(api('/admin/settings/commission')).set(bearer(admin)).send({ farmerPercent: 60, traderPercent: 30, partnerPercent: 20 }).expect(400);
    await http().patch(api('/admin/settings/commission')).set(bearer(admin)).send({ farmerPercent: 40, traderPercent: 40, partnerPercent: 20 }).expect(200);
    const r2 = await http().get(api('/admin/reports/commission')).set(bearer(admin)).expect(200);
    expect(r2.body.rows.find((x: { order: string }) => x.order === o.body.number).farmerPaise).toBe(240_000);
    await http().patch(api('/admin/settings/commission')).set(bearer(admin)).send({ farmerPercent: 50, traderPercent: 30, partnerPercent: 20 }).expect(200);

    const csv = await http().get(api('/admin/reports/commission?format=csv&section=farms')).set(bearer(admin)).expect(200);
    expect(csv.text).toContain(farm.name);
    // Head office only.
    await http().get(api('/admin/reports/commission')).set(bearer(await tokenFor('puneManager'))).expect(404);
  });

  it('farm sales split business and retail buyers, and by channel', async () => {
    const r = await http().get(api('/admin/farm-sales')).set(bearer(admin)).expect(200);
    expect(r.body.segments.map((s: { name: string }) => s.name)).toEqual(['B2C', 'B2B']);
    expect(r.body.channels.map((s: { name: string }) => s.name)).toEqual(['Website', 'WhatsApp / enquiry', 'Campaign / coupon', 'Store']);
    for (const f of r.body.farms) expect(f.b2bPaise + f.b2cPaise).toBe(f.salesPaise);
    const total = r.body.farms.reduce((a: number, f: { salesPaise: number }) => a + f.salesPaise, 0);
    expect(r.body.channels.reduce((a: number, c: { salesPaise: number }) => a + c.salesPaise, 0)).toBe(total);
    const csv = await http().get(api('/admin/farm-sales?format=csv')).set(bearer(admin)).expect(200);
    expect(csv.text.split('\r\n')[0]).toContain('B2B / B2C');
  });
});
