// Rule 1: every role tries to read and change data outside its scope. Every such attempt must fail.
// Later phases append their own cases (orders, enquiries, deliveries) in their test files.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, db, getApp, http, tokenFor, type Who } from './helpers';

let ids: {
  pune: string;
  mumbai: string;
  franchisePune: string;
  franchiseMumbai: string;
  dpPune: string;
  dpMumbai: string;
  vendor: string;
  vendor2: string;
  ashaCustomer: string;
  karanCustomer: string;
  anyProduct: string;
  vendorProduct: string;
};

beforeAll(async () => {
  await getApp();
  const city = (slug: string) => db.city.findUniqueOrThrow({ where: { slug } });
  const [pune, mumbai] = await Promise.all([city('pune'), city('mumbai')]);
  const fr = await db.franchise.findMany({ orderBy: { name: 'asc' } });
  const dps = await db.deliveryPartner.findMany();
  const vendors = await db.vendor.findMany();
  const customers = await db.customer.findMany({ include: { user: true } });
  ids = {
    pune: pune.id,
    mumbai: mumbai.id,
    franchisePune: fr.find((f) => f.cityId === pune.id)!.id,
    franchiseMumbai: fr.find((f) => f.cityId === mumbai.id)!.id,
    dpPune: dps.find((d) => d.phone === '+919800000005')!.id,
    dpMumbai: dps.find((d) => d.phone === '+919800000015')!.id,
    vendor: vendors.find((v) => v.name === 'Konkan Pearl House')!.id,
    vendor2: vendors.find((v) => v.name === 'Deccan Settings')!.id,
    ashaCustomer: customers.find((c) => c.user.phone === '+919800000007')!.id,
    karanCustomer: customers.find((c) => c.user.phone === '+919800000017')!.id,
    anyProduct: (await db.product.findFirstOrThrow({ where: { vendorId: null } })).id,
    vendorProduct: (await db.product.findFirstOrThrow({ where: { vendor: { name: 'Konkan Pearl House' } } })).id,
  };
});
afterAll(() => db.$disconnect());

const as = async (who: Who) => bearer(await tokenFor(who));

describe('unauthenticated and customer access to admin', () => {
  it('rejects anonymous callers', async () => {
    await http().get(api('/admin/products')).expect(401);
    await http().get(api('/admin/cities')).expect(401);
  });
  it('rejects customers on every admin module', async () => {
    const h = await as('customerAsha');
    for (const p of ['/admin/products', '/admin/cities', '/admin/customers', '/admin/settings', '/admin/audit-logs', '/admin/users', '/admin/franchises']) {
      await http().get(api(p)).set(h).expect(403);
    }
    await http().post(api('/admin/cities')).set(h).send({ name: 'Hack', state: 'X' }).expect(403);
  });
});

describe('Admin / Staff: only granted modules', () => {
  it('can work on products but not delete them', async () => {
    const h = await as('staff');
    await http().get(api('/admin/products')).set(h).expect(200);
    await http().patch(api(`/admin/products/${ids.anyProduct}`)).set(h).send({ lustre: 'Excellent' }).expect(200);
    await http().delete(api(`/admin/products/${ids.anyProduct}`)).set(h).expect(403);
  });
  it('cannot reach modules it was not granted', async () => {
    const h = await as('staff');
    await http().get(api('/admin/settings')).set(h).expect(403);
    await http().patch(api('/admin/settings/payments')).set(h).send({ codEnabled: false }).expect(403);
    await http().get(api('/admin/audit-logs')).set(h).expect(403);
    await http().get(api('/admin/customers')).set(h).expect(403);
    await http().get(api('/admin/users')).set(h).expect(403);
    await http().post(api('/admin/users')).set(h).send({ role: 'SUPER_ADMIN', name: 'x', email: 'x@x.com', password: 'xxxxxxxxxxxx' }).expect(403);
    await http().patch(api('/admin/feature-flags/live_gps')).set(h).send({ enabled: true }).expect(403);
  });
});

describe('City Manager: own city only', () => {
  it('sees only their city and gets "not found" for another city', async () => {
    const h = await as('puneManager');
    const list = await http().get(api('/admin/cities')).set(h).expect(200);
    expect(list.body.items.map((c: { id: string }) => c.id)).toEqual([ids.pune]);
    await http().get(api(`/admin/cities/${ids.mumbai}`)).set(h).expect(404);
    await http().get(api(`/admin/franchises/${ids.franchiseMumbai}`)).set(h).expect(404);
    await http().get(api(`/admin/franchises/${ids.franchisePune}`)).set(h).expect(200);
    await http().get(api(`/admin/customers/${ids.karanCustomer}`)).set(h).expect(404);
    await http().get(api(`/admin/customers/${ids.ashaCustomer}`)).set(h).expect(200);
    const customers = await http().get(api('/admin/customers')).set(h).expect(200);
    expect(customers.body.items.every((c: { cityId: string }) => c.cityId === ids.pune)).toBe(true);
  });
  it('cannot change another city, settings, or move partners between cities', async () => {
    const h = await as('puneManager');
    await http().patch(api(`/admin/delivery-partners/${ids.dpMumbai}`)).set(h).send({ vehicleInfo: 'x' }).expect(404);
    await http().patch(api(`/admin/delivery-partners/${ids.dpPune}`)).set(h).send({ vehicleInfo: 'Scooter MH12' }).expect(200);
    await http().patch(api(`/admin/delivery-partners/${ids.dpPune}`)).set(h).send({ cityIds: [ids.mumbai] }).expect(403);
    await http().post(api('/admin/cities')).set(h).send({ name: 'Nashik', state: 'Maharashtra' }).expect(403);
    await http().patch(api(`/admin/cities/${ids.pune}`)).set(h).send({ name: 'Poona' }).expect(403);
    await http().get(api('/admin/settings')).set(h).expect(403);
    await http().get(api('/admin/audit-logs')).set(h).expect(403);
    await http().post(api(`/admin/customers/${ids.karanCustomer}/block`)).set(h).expect(403);
  });
  it('does not see product costs', async () => {
    const h = await as('puneManager');
    const p = await http().get(api(`/admin/products/${ids.anyProduct}`)).set(h).expect(200);
    expect(p.body.pearlCostPaise).toBeUndefined();
    expect(p.body.metalCostPaise).toBeUndefined();
  });
});

describe('Vendor: own products and stock only', () => {
  let otherVendorProduct: string;
  beforeAll(async () => {
    const cat = await db.category.findFirstOrThrow();
    const r = await http()
      .post(api('/admin/products'))
      .set(await as('vendor2'))
      .send({ sku: 'DS-RI-0001', name: 'Deccan Test Ring', categoryId: cat.id, pricePaise: 990000 })
      .expect(201);
    otherVendorProduct = r.body.id;
    expect(r.body.status).toBe('PENDING_APPROVAL');
    expect(r.body.vendorId).toBe(ids.vendor2);
  });

  it('lists only its own products and cannot open another vendor’s', async () => {
    const h = await as('vendor');
    const list = await http().get(api('/admin/products?pageSize=200')).set(h).expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.items.every((p: { vendorId: string }) => p.vendorId === ids.vendor)).toBe(true);
    await http().get(api(`/admin/products/${otherVendorProduct}`)).set(h).expect(404);
    await http().patch(api(`/admin/products/${otherVendorProduct}`)).set(h).send({ quantity: 0 }).expect(404);
    await http().get(api(`/admin/products/${ids.anyProduct}`)).set(h).expect(404);
  });

  it('cannot publish, approve, archive or reassign products', async () => {
    const h = await as('vendor');
    await http().post(api(`/admin/products/${ids.vendorProduct}/publish`)).set(h).expect(403);
    await http().post(api(`/admin/products/${ids.vendorProduct}/approve`)).set(h).expect(403);
    await http().delete(api(`/admin/products/${ids.vendorProduct}`)).set(h).expect(403);
    const r = await http().patch(api(`/admin/products/${ids.vendorProduct}`)).set(h).send({ vendorId: ids.vendor2, status: 'PUBLISHED' }).expect(200);
    expect(r.body.vendorId).toBe(ids.vendor);
  });

  it('changes stock directly, but price changes wait for approval', async () => {
    const h = await as('vendor');
    const before = await db.product.findUniqueOrThrow({ where: { id: ids.vendorProduct } });
    const r = await http().patch(api(`/admin/products/${ids.vendorProduct}`)).set(h).send({ quantity: 3, pricePaise: before.pricePaise + 100000 }).expect(200);
    expect(r.body.quantity).toBe(3);
    expect(r.body.pricePaise).toBe(before.pricePaise); // live price unchanged
    expect(r.body.pendingChanges).toMatchObject({ pricePaise: before.pricePaise + 100000 });
    const admin = await as('superAdmin');
    const approved = await http().post(api(`/admin/products/${ids.vendorProduct}/approve`)).set(admin).expect(200);
    expect(approved.body.pricePaise).toBe(before.pricePaise + 100000);
    expect(approved.body.pendingChanges).toBeNull();
  });

  it('sees only itself in the vendor list and has no access to settings or customers', async () => {
    const h = await as('vendor');
    const v = await http().get(api('/admin/vendors')).set(h).expect(403); // no VENDORS grant
    expect(v.body.code).toBe('FORBIDDEN');
    await http().get(api('/admin/customers')).set(h).expect(403);
    await http().get(api('/admin/settings')).set(h).expect(403);
  });
});

describe('Franchise: own records only', () => {
  it('cannot see other franchises or edit products', async () => {
    const h = await as('franchisePune');
    await http().get(api(`/admin/franchises/${ids.franchiseMumbai}`)).set(h).expect(403); // no FRANCHISES grant at all
    const cat = await db.category.findFirstOrThrow();
    await http().post(api('/admin/products')).set(h).send({ sku: 'FR-X-1', name: 'x', categoryId: cat.id, pricePaise: 1 }).expect(403);
    const p = await http().get(api(`/admin/products/${ids.anyProduct}`)).set(h).expect(200);
    expect(p.body.labourCostPaise).toBeUndefined();
  });
  it('sees only delivery partners in its own city', async () => {
    const h = await as('franchisePune');
    const list = await http().get(api('/admin/delivery-partners')).set(h).expect(200);
    expect(list.body.items.map((d: { id: string }) => d.id)).toEqual([ids.dpPune]);
    await http().get(api(`/admin/delivery-partners/${ids.dpMumbai}`)).set(h).expect(404);
    await http().patch(api(`/admin/delivery-partners/${ids.dpPune}`)).set(h).send({ name: 'x' }).expect(403);
  });
});

describe('Delivery Partner: no admin data', () => {
  it('cannot read products, customers or other partners', async () => {
    const h = await as('deliveryPune');
    await http().get(api('/admin/products')).set(h).expect(403);
    await http().get(api('/admin/customers')).set(h).expect(403);
    await http().get(api(`/admin/delivery-partners/${ids.dpMumbai}`)).set(h).expect(403);
  });
});

describe('Super Admin and the audit log', () => {
  it('records who changed what, before and after, and from where', async () => {
    const h = await as('superAdmin');
    await http().patch(api(`/admin/cities/${ids.mumbai}`)).set(h).set('X-Forwarded-For', '203.0.113.9').send({ sortOrder: 7 }).expect(200);
    const log = await db.auditLog.findFirstOrThrow({ where: { entity: 'City', entityId: ids.mumbai, action: 'UPDATE' }, orderBy: { createdAt: 'desc' } });
    expect(log.ip).toBe('203.0.113.9');
    expect((log.before as { sortOrder: number }).sortOrder).toBe(2);
    expect((log.after as { sortOrder: number }).sortOrder).toBe(7);
    const viaApi = await http().get(api(`/admin/audit-logs?entity=City&entityId=${ids.mumbai}`)).set(h).expect(200);
    expect(viaApi.body.items[0].actor.role).toBe('SUPER_ADMIN');
  });
  it('cannot alter or delete audit entries, even directly in the database', async () => {
    const log = await db.auditLog.findFirstOrThrow();
    await expect(db.auditLog.update({ where: { id: log.id }, data: { action: 'X' } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
  });
  it('can add a city, vendor, franchise, manufacturer and delivery partner with no code change', async () => {
    const h = await as('superAdmin');
    const city = await http().post(api('/admin/cities')).set(h).send({ name: 'Nashik', state: 'Maharashtra' }).expect(201);
    expect(city.body.slug).toBe('nashik');
    await http().post(api('/admin/vendors')).set(h).send({ name: 'Nashik Pearls', phone: '+919811000001', cityIds: [city.body.id] }).expect(201);
    await http()
      .post(api('/admin/franchises'))
      .set(h)
      .send({ name: 'Sahyadri Pearls College Road', cityId: city.body.id, area: 'College Road', address: 'College Road, Nashik', phone: '+919811000002' })
      .expect(201);
    await http().post(api('/admin/manufacturers')).set(h).send({ name: 'Nashik Gold Works', cityId: city.body.id }).expect(201);
    const dp = await http().post(api('/admin/delivery-partners')).set(h).send({ name: 'Ravi', phone: '+919811000003', cityIds: [city.body.id] }).expect(201);
    expect(dp.body.cities[0].city.name).toBe('Nashik');
    // and give the new partner a login
    const u = await http().post(api('/admin/users')).set(h).send({ role: 'DELIVERY_PARTNER', name: 'Ravi', deliveryPartnerId: dp.body.id }).expect(201);
    expect(u.body.phone).toBe('+919811000003');
  });
  it('deactivating a user signs them out everywhere', async () => {
    const h = await as('superAdmin');
    const created = await http()
      .post(api('/admin/users'))
      .set(h)
      .send({ role: 'STAFF', name: 'Temp', email: 'temp@sahyadripearls.test', password: 'Temporary#2026', grants: [{ module: 'PRODUCTS', canView: true, canCreate: false, canEdit: false, canDelete: false }] })
      .expect(201);
    const { staffToken } = await import('./helpers');
    const t = await staffToken('temp@sahyadripearls.test', 'Temporary#2026');
    await http().get(api('/admin/products')).set(bearer(t)).expect(200);
    await http().post(api(`/admin/users/${created.body.id}/deactivate`)).set(h).expect(200);
    await http().get(api('/admin/products')).set(bearer(t)).expect(401);
  });
});
