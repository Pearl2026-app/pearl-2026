import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADDRESS, api, bearer, db, getApp, http, tokenFor } from './helpers';

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

  it('rechecks the PIN code in the cart and refuses checkout outside the franchise area', async () => {
    const pune = await db.city.findFirstOrThrow({ where: { slug: 'pune' } });
    const added = await http().post(api('/cart/items')).send({ productId, quantity: 1 }).expect(200);
    const token: string = added.body.token;
    const cart = (q: string, cookie?: string) => {
      const r = http().get(api(`/cart${q}`)).set('X-Cart-Token', token);
      return (cookie ? r.set('Cookie', cookie) : r).expect(200).then((x) => x.body);
    };
    // The website's chosen PIN code (sp_pin cookie) or ?pin= decides; outside the area the line is flagged.
    expect((await cart('?city=pune', 'sp_pin=400050')).items[0].problem).toBe('Not delivered to PIN code 400050');
    expect((await cart('?city=pune&pin=411004')).issues).toHaveLength(1);
    expect((await cart('?city=pune', 'sp_pin=411036')).items[0].problem).toBeNull();

    // Checkout goes by the delivery address's PIN code, whatever the shopper picked earlier.
    const buy = (pincode: string) =>
      http()
        .post(api('/checkout'))
        .set('X-Cart-Token', token)
        .set('Cookie', 'sp_pin=411036')
        .send({ contact: { name: 'Area Buyer', phone: '9811100071' }, address: { ...ADDRESS, phone: '9811100071', pincode }, cityId: pune.id, paymentMethod: 'COD' });
    const refused = await buy('411004');
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('NOT_DELIVERABLE');
    expect(refused.body.message).toContain('Koregaon Park pearl ring');
    const placed = await buy('411036');
    expect(placed.status).toBe(201);
  });

  it('counts farm pieces for the shopper’s area, and leaves a stopped vendor’s pieces out of the sitemap', async () => {
    const farm = await db.farm.findFirstOrThrow({ where: { isActive: true, archivedAt: null } });
    await db.product.update({ where: { id: productId }, data: { farmId: farm.id } });
    const countAt = async (q: string) => ((await http().get(api(`/catalogue/farms${q}`)).expect(200)).body as Array<{ id: string; _count: { products: number } }>).find((f) => f.id === farm.id)!._count.products;
    expect((await countAt('?city=pune&pin=411036')) - (await countAt('?city=pune&pin=411004'))).toBe(1);

    const cat = await db.category.findFirstOrThrow({ where: { slug: 'rings' } });
    const vendor = await db.vendor.create({ data: { name: 'Stopped Vendor', phone: '+919844400090', isActive: false } });
    const sku = `TST-SV-${Date.now() % 1_000_000}`;
    const piece = await db.product.create({ data: { sku, name: 'Stopped vendor ring', slug: sku.toLowerCase(), categoryId: cat.id, pricePaise: 100_000, status: 'PUBLISHED', vendorId: vendor.id } });
    const map = (await http().get(api('/seo/sitemap')).expect(200)).body as { products: Array<{ slug: string }> };
    expect(map.products.some((p) => p.slug === piece.slug)).toBe(false);
    expect(map.products.some((p) => p.slug === slug)).toBe(true);
    await db.product.update({ where: { id: piece.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  });

  it('names the allotted franchise for a PIN code, before the nearest store', async () => {
    const r = await http().get(api('/geo/pincode/411036')).expect(200);
    expect(r.body.nearestStore).toMatchObject({ name: 'Sahyadri Pearls Koregaon Park', allotted: true });
  });
});
