import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, db, getApp, http, tokenFor } from './helpers';

// Franchise areas (client meeting, 4 Nov): each franchise is allotted PIN codes, and a franchise's own pieces are
// shown only to shoppers in its area. Head office stock stays visible everywhere.
let kpId: string;
let bandraId: string;
let productId: string;
let slug: string;

beforeAll(async () => {
  await getApp();
  kpId = (await db.franchise.update({ where: { id: (await db.franchise.findFirstOrThrow({ where: { name: 'Sahyadri Pearls Koregaon Park' } })).id }, data: { pincodes: ['411001', '411006', '411014', '411036'] } })).id;
  bandraId = (await db.franchise.update({ where: { id: (await db.franchise.findFirstOrThrow({ where: { name: 'Sahyadri Pearls Bandra' } })).id }, data: { pincodes: ['400050', '400051', '400052'] } })).id;
});
afterAll(async () => {
  // Leave nothing behind for later test files.
  if (productId) await db.product.update({ where: { id: productId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  await db.$disconnect();
});

describe('franchise areas', () => {
  it('keeps PIN codes valid, unique and with one franchise only', async () => {
    const h = bearer(await tokenFor('superAdmin'));
    const ok = await http().patch(api(`/admin/franchises/${bandraId}`)).set(h).send({ pincodes: '400050, 400051\n400052 400050' }).expect(200);
    expect(ok.body.pincodes).toEqual(['400050', '400051', '400052']);
    await http().patch(api(`/admin/franchises/${bandraId}`)).set(h).send({ pincodes: '4000' }).expect(400);
    const clash = await http().patch(api(`/admin/franchises/${bandraId}`)).set(h).send({ pincodes: ['400050', '411036'] }).expect(409);
    expect(clash.body.message).toContain('Sahyadri Pearls Koregaon Park');
  });

  it('shows a franchise piece only inside its area; head office stock everywhere', async () => {
    const h = bearer(await tokenFor('superAdmin'));
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'rings' } });
    const sku = `TST-FA-${Date.now() % 1_000_000}`;
    const created = await http()
      .post(api('/admin/products'))
      .set(h)
      .send({ name: 'Koregaon Park pearl ring', sku, categoryId: cat.id, pricePaise: 1_500_000, status: 'PUBLISHED', franchiseId: kpId })
      .expect(201);
    productId = created.body.id;
    slug = created.body.slug;
    expect(created.body.franchise.id).toBe(kpId);

    const ids = (q: string) => http().get(api(`/catalogue/products?ids=${productId}${q}`)).expect(200).then((r) => r.body.items.map((p: { id: string }) => p.id));
    expect(await ids('&pin=411036')).toEqual([productId]);
    expect(await ids('&city=mumbai&pin=411036')).toEqual([productId]);
    expect(await ids('&pin=400050')).toEqual([]);
    expect(await ids('&city=pune&pin=411004')).toEqual([]); // a Pune PIN code not allotted to it
    // No PIN code given: the franchise's city decides.
    expect(await ids('&city=pune')).toEqual([productId]);
    expect(await ids('&city=mumbai')).toEqual([]);

    const there = await http().get(api(`/catalogue/products/${slug}?city=pune&pin=411001`)).expect(200);
    expect(there.body.availableInCity).toBe(true);
    const away = await http().get(api(`/catalogue/products/${slug}?city=mumbai&pin=400050`)).expect(200);
    expect(away.body.availableInCity).toBe(false);

    // Head office stock is untouched by the PIN code.
    const own = await db.product.findFirstOrThrow({ where: { status: 'PUBLISHED', archivedAt: null, franchiseId: null, vendorId: null, b2bOnly: false, cities: { none: {} }, category: { isActive: true, archivedAt: null } } });
    const r = await http().get(api(`/catalogue/products?ids=${own.id}&pin=400050`)).expect(200);
    expect(r.body.items.map((p: { id: string }) => p.id)).toEqual([own.id]);
  });

  it('names the allotted franchise for a PIN code, before the nearest store', async () => {
    const r = await http().get(api('/geo/pincode/411036')).expect(200);
    expect(r.body.nearestStore).toMatchObject({ name: 'Sahyadri Pearls Koregaon Park', allotted: true });
  });
});
