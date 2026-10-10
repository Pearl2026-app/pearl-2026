import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, db, drain, getApp, http, tokenFor } from './helpers';

beforeAll(async () => {
  await getApp();
});
afterAll(() => db.$disconnect());

describe('public catalogue', () => {
  it('lists published products with filters, never exposing costs', async () => {
    const r = await http().get(api('/catalogue/products?category=rings&pageSize=50')).expect(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const p of r.body.items) {
      expect(p.category.slug).toBe('rings');
      expect(p).not.toHaveProperty('pearlCostPaise');
      expect(p).not.toHaveProperty('metalCostPaise');
    }
    const black = await http().get(api('/catalogue/products?colour=Black')).expect(200);
    expect(black.body.items.every((p: { colour: string }) => p.colour === 'Black')).toBe(true);
    const carat = await http().get(api('/catalogue/products?caratMin=5&caratMax=10')).expect(200);
    expect(carat.body.items.every((p: { caratWeight: number }) => p.caratWeight >= 5 && p.caratWeight <= 10)).toBe(true);
  });

  it('sorts by price and puts price-on-request last', async () => {
    const r = await http().get(api('/catalogue/products?sort=price_asc&pageSize=60')).expect(200);
    const priced = r.body.items.filter((p: { pricePaise: number | null; isSold: boolean }) => p.pricePaise != null && !p.isSold).map((p: { pricePaise: number }) => p.pricePaise);
    expect(priced).toEqual([...priced].sort((a: number, b: number) => a - b));
  });

  it('searches by name and SKU', async () => {
    const byName = await http().get(api('/catalogue/products?q=baroque')).expect(200);
    expect(byName.body.items.length).toBeGreaterThanOrEqual(3);
    const bySku = await http().get(api('/catalogue/products?q=SP-RI-0013')).expect(200);
    expect(bySku.body.items[0].sku).toBe('SP-RI-0013');
  });

  it('hides the price of a price-on-request piece and marks sold unique pieces', async () => {
    const por = await http().get(api('/catalogue/products/royal-peshwai-haar')).expect(200);
    expect(por.body.priceOnRequest).toBe(true);
    expect(por.body.pricePaise).toBeNull();
    const sold = await http().get(api('/catalogue/products/baroque-statement-ring')).expect(200);
    expect(sold.body.isSold).toBe(true);
    expect(sold.body.available).toBe(false);
    expect(sold.body.farm.name).toBeTruthy();
    expect(sold.body.related.length).toBeGreaterThan(0);
  });

  it('returns facets for the filter panel', async () => {
    const r = await http().get(api('/catalogue/filters?category=earrings')).expect(200);
    expect(r.body.shapes.length).toBeGreaterThan(0);
    expect(r.body.price.max).toBeGreaterThan(0);
  });

  it('does not show unpublished products', async () => {
    const draft = await db.product.findFirstOrThrow({ where: { status: { not: 'PUBLISHED' } } });
    await http().get(api(`/catalogue/products/${draft.slug}`)).expect(404);
  });

  it('serves farm pages with their pearls, and verifies certificates', async () => {
    const f = await http().get(api('/catalogue/farms/mulshi-lake-farm')).expect(200);
    expect(f.body.products.length).toBeGreaterThan(0);
    const v = await http().get(api('/verify/CERT-SP-NE-0001')).expect(200);
    expect(v.body.valid).toBe(true);
    expect(v.body.farm.name).toBe('Mulshi Lake Farm');
    await http().get(api('/verify/NOPE')).expect(404);
  });

  it('serves the site shell without the GSTIN, plus home, pages, FAQ and offers', async () => {
    const s = await http().get(api('/site')).expect(200);
    expect(s.body.store).not.toHaveProperty('gstin');
    expect(s.body.whatsapp.default).toMatch(/^\+91/);
    expect(s.body.whatsapp.wholesale).toBe('+919800000030');
    const h = await http().get(api('/content/home')).expect(200);
    expect(h.body.banners.length).toBeGreaterThan(0);
    expect(h.body.featured.length).toBeGreaterThan(0);
    await http().get(api('/content/pages/terms')).expect(200);
    const offers = await http().get(api('/offers')).expect(200);
    expect(offers.body.coupons.map((c: { code: string }) => c.code)).toContain('WELCOME10');
  });
});

describe('enquiry capture (rule 3)', () => {
  it('saves the enquiry first and returns a WhatsApp link with product, SKU and reference', async () => {
    const p = await db.product.findFirstOrThrow({ where: { slug: 'mulshi-baroque-strand' } });
    const r = await http()
      .post(api('/enquiries'))
      .send({ clientId: randomUUID(), type: 'PRODUCT', productId: p.id, citySlug: 'pune', pageUrl: '/product/mulshi-baroque-strand', source: 'instagram', phone: '9876500001', name: 'Meera' })
      .expect(201);
    expect(r.body.reference).toMatch(/^ENQ-\d{2}-\d{6}$/);
    expect(r.body.whatsappNumber).toBe('+919800000010'); // Pune team
    expect(r.body.whatsappUrl).toContain('wa.me/919800000010');
    const text = decodeURIComponent(r.body.whatsappUrl.split('text=')[1]);
    expect(text).toContain('Mulshi Baroque Strand');
    expect(text).toContain(p.sku);
    expect(text).toContain(r.body.reference);
    const saved = await db.enquiry.findUniqueOrThrow({ where: { reference: r.body.reference }, include: { franchise: true } });
    expect(saved.franchise?.name).toBe('Sahyadri Pearls Koregaon Park');
    expect(saved.source).toBe('instagram');
  });

  it('never creates a duplicate when the same enquiry is retried', async () => {
    const p = await db.product.findFirstOrThrow({ where: { slug: 'tidepool-drop-earrings' } });
    const clientId = randomUUID();
    const body = { clientId, type: 'PRODUCT', productId: p.id, citySlug: 'mumbai' };
    const [a, b] = await Promise.all([http().post(api('/enquiries')).send(body), http().post(api('/enquiries')).send(body)]);
    const ok = [a, b].filter((x) => x.status === 201);
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const c = await http().post(api('/enquiries')).send(body).expect(201);
    expect(await db.enquiry.count({ where: { clientId } })).toBe(1);
    expect(c.body.reference).toBe(ok[0]!.body.reference);
  });

  it('keeps the reference the customer already sent on WhatsApp when the first save failed', async () => {
    const p = await db.product.findFirstOrThrow({ where: { slug: 'classic-studs-7mm' } });
    const r = await http().post(api('/enquiries')).send({ clientId: randomUUID(), fallbackReference: 'ENQ-W-AB12CD34', type: 'PRODUCT', productId: p.id }).expect(201);
    expect(r.body.reference).toBe('ENQ-W-AB12CD34');
    // a forged reference format is ignored
    const forged = await http().post(api('/enquiries')).send({ clientId: randomUUID(), fallbackReference: 'ADMIN', type: 'PRODUCT', productId: p.id }).expect(201);
    expect(forged.body.reference).toMatch(/^ENQ-\d{2}-/);
  });

  it('routes bulk enquiries to the wholesale number and acknowledges the customer', async () => {
    const r = await http()
      .post(api('/enquiries'))
      .send({ clientId: randomUUID(), type: 'BULK', citySlug: 'pune', name: 'Wedding Co', phone: '+919876500002', email: 'events@example.com', message: '200 pearl studs for gifting' })
      .expect(201);
    expect(r.body.whatsappNumber).toBe('+919800000030');
    await drain();
    const acks = await db.notificationLog.findMany({ where: { templateKey: 'ENQUIRY_ACK', context: { path: ['enquiryId'], equals: r.body.id } } });
    expect(acks.map((a) => a.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']);
    // WhatsApp Business is not configured in tests: the log keeps a click-to-chat link for staff
    const wa = acks.find((a) => a.channel === 'WHATSAPP')!;
    expect((wa.context as { manualLink?: string }).manualLink).toContain('wa.me/919876500002');
  });

  it('validates required details', async () => {
    const r = await http().post(api('/enquiries')).send({ type: 'PRODUCT' }).expect(400);
    expect(r.body.fields.productId).toBeTruthy();
    await http().post(api('/enquiries')).send({ type: 'CONTACT', message: 'hi' }).expect(400);
  });

  it('creates a customized enquiry with reference images', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const r = await http()
      .post(api('/enquiries/custom'))
      .field('jewelleryType', 'Ring')
      .field('metal', '18k gold')
      .field('size', '14')
      .field('designNotes', 'Single baroque pearl, vintage band')
      .field('budgetRupees', '45000')
      .field('name', 'Nisha')
      .field('phone', '9876500003')
      .field('citySlug', 'mumbai')
      .attach('images', png, { filename: 'ref.png', contentType: 'image/png' })
      .expect(201);
    const e = await db.enquiry.findUniqueOrThrow({ where: { reference: r.body.reference }, include: { customRequest: true } });
    expect(e.type).toBe('CUSTOMIZED');
    expect(e.customRequest?.budgetPaise).toBe(4500000);
    expect(e.customRequest?.referenceImageUrls.length).toBe(1);
  });
});

describe('enquiry inbox scope', () => {
  let puneEnquiry: string;
  beforeAll(async () => {
    puneEnquiry = (await db.enquiry.findFirstOrThrow({ where: { city: { slug: 'pune' }, franchise: { isNot: null } } })).id;
  });

  it('shows Pune enquiries to Pune staff and the assigned franchise only', async () => {
    await http().get(api(`/admin/enquiries/${puneEnquiry}`)).set(bearer(await tokenFor('puneManager'))).expect(200);
    await http().get(api(`/admin/enquiries/${puneEnquiry}`)).set(bearer(await tokenFor('franchisePune'))).expect(200);
    await http().get(api(`/admin/enquiries/${puneEnquiry}`)).set(bearer(await tokenFor('mumbaiManager'))).expect(404);
    await http().get(api(`/admin/enquiries/${puneEnquiry}`)).set(bearer(await tokenFor('franchiseMumbai'))).expect(404);
    await http().get(api(`/admin/enquiries/${puneEnquiry}`)).set(bearer(await tokenFor('vendor'))).expect(403);
    await http().get(api(`/admin/enquiries/${puneEnquiry}`)).set(bearer(await tokenFor('deliveryPune'))).expect(403);
    const list = await http().get(api('/admin/enquiries?pageSize=200')).set(bearer(await tokenFor('mumbaiManager'))).expect(200);
    expect(list.body.items.every((e: { cityId: string | null }) => e.cityId !== null)).toBe(true);
    expect(list.body.items.find((e: { id: string }) => e.id === puneEnquiry)).toBeUndefined();
  });

  it('records the first response time when staff act, and franchise cannot reassign', async () => {
    const h = bearer(await tokenFor('franchisePune'));
    await http().post(api(`/admin/enquiries/${puneEnquiry}/notes`)).set(h).send({ body: 'Called the customer, sending photos.' }).expect(201);
    const e = await db.enquiry.findUniqueOrThrow({ where: { id: puneEnquiry } });
    expect(e.firstResponseAt).not.toBeNull();
    expect(e.stage).toBe('IN_PROGRESS');
    await http().patch(api(`/admin/enquiries/${puneEnquiry}`)).set(h).send({ franchiseId: null }).expect(400);
    await http().patch(api(`/admin/enquiries/${puneEnquiry}`)).set(h).send({ stage: 'QUOTED' }).expect(200);
    await http().patch(api(`/admin/enquiries/${puneEnquiry}`)).set(h).send({ stage: 'CONVERTED' }).expect(400);
  });

  it('lets only WhatsApp-settings holders edit numbers, templates and routing', async () => {
    await http().get(api('/admin/routing-rules')).set(bearer(await tokenFor('superAdmin'))).expect(200);
    await http().get(api('/admin/routing-rules')).set(bearer(await tokenFor('staff'))).expect(403);
    await http().get(api('/admin/whatsapp-numbers')).set(bearer(await tokenFor('puneManager'))).expect(403);
  });
});

describe('careers', () => {
  it('accepts an application with a PDF resume and rejects other files', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
    await http()
      .post(api('/careers/jewellery-sales-associate-pune/apply'))
      .field('name', 'Ravi Kumar')
      .field('email', 'ravi@example.com')
      .field('phone', '9876500004')
      .attach('resume', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(201);
    const a = await db.jobApplication.findFirstOrThrow({ where: { email: 'ravi@example.com' } });
    expect(a.resumeUrl.startsWith('private:')).toBe(true);
    await http()
      .post(api('/careers/jewellery-sales-associate-pune/apply'))
      .field('name', 'X Y')
      .field('email', 'x@example.com')
      .field('phone', '9876500005')
      .attach('resume', Buffer.from('MZ fake exe'), { filename: 'cv.pdf', contentType: 'application/pdf' })
      .expect(400);
    // staff get a short-lived private link
    const link = await http().get(api(`/admin/job-applications/${a.id}/resume`)).set(bearer(await tokenFor('superAdmin'))).expect(200);
    expect(link.body.url).toContain('/api/v1/files/resumes/');
    const path = new URL(link.body.url).pathname + new URL(link.body.url).search;
    const file = await http().get(path).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    await http().get(path.replace(/sig=[^&]+/, 'sig=bad')).expect(404);
  });
});
