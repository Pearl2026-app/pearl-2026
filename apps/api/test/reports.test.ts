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
    for (const kind of ['sales', 'gst', 'enquiries', 'whatsapp', 'partners', 'products']) {
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
  });
});
