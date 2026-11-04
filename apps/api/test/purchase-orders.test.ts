import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokensService } from '../src/auth/tokens.service';
import { api, bearer, db, drain, getApp, http, tokenFor } from './helpers';

let admin: string;
let maker: string;
let manufacturerId: string;
let productId: string;

beforeAll(async () => {
  const app = await getApp();
  admin = await tokenFor('superAdmin');
  // The seeded manufacturer login (Pune Silver Studio); partners of this role sign in by OTP, so mint a session directly.
  const u = await db.user.findUniqueOrThrow({ where: { email: 'maker@sahyadripearls.test' } });
  manufacturerId = u.manufacturerId!;
  maker = (await app.get(TokensService).createSession(u, {})).accessToken;
  productId = (await db.product.findFirstOrThrow({ where: { archivedAt: null }, orderBy: { sku: 'asc' } })).id;
});
afterAll(() => db.$disconnect());

const po = (id: string, path = '') => api(`/admin/purchase-orders/${id}${path}`);

describe('purchase orders (meeting of 31 Oct)', () => {
  it('carries exact numbers, photos and CAD, sends pearls first, tracks the new stages and checks the bill', async () => {
    // Exact numbers per piece; the agreed cost defaults to weight × rate × quantity + 5% GST.
    const created = await http()
      .post(api('/admin/purchase-orders'))
      .set(bearer(admin))
      .send({ manufacturerId, productId, pearlSizeMm: 7.125, pearlWeightCt: 1.5, metal: '92.5 Silver', metalWeightG: 4.25, ringSize: '12', makingRatePerGramPaise: 12_000, quantity: 2, dueDate: '2026-12-15', specification: 'High polish' })
      .expect(201);
    const id: string = created.body.id;
    expect(created.body.cost).toEqual({ subtotalPaise: 102_000, gstPaise: 5_100, totalPaise: 107_100 });
    expect(created.body.agreedCostPaise).toBe(107_100);
    expect(Number(created.body.pearlSizeMm)).toBe(7.125);
    expect(created.body.metal).toBe('92.5 Silver');

    // A draft follows the computed total when the numbers change.
    const edited = await http().patch(api(`/admin/purchase-orders/${id}`)).set(bearer(admin)).send({ quantity: 1 }).expect(200);
    expect(edited.body.agreedCostPaise).toBe(53_550);
    await http().patch(api(`/admin/purchase-orders/${id}`)).set(bearer(admin)).send({ quantity: 2 }).expect(200);

    // Photos and the CAD file (head office only); both show on the PDF.
    const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#d8c8a8' } }).png().toBuffer();
    const withPhoto = await http().post(po(id, '/files')).set(bearer(admin)).field('kind', 'image').attach('files', png, 'design.png').expect(200);
    expect(withPhoto.body.images.length).toBeGreaterThanOrEqual(1);
    const withCad = await http().post(po(id, '/files')).set(bearer(admin)).field('kind', 'cad').attach('files', Buffer.from('solid ring\nendsolid ring\n'), 'ring v2.stl').expect(200);
    expect(withCad.body.cad.name).toBe('ring_v2.stl');
    await http().post(po(id, '/files')).set(bearer(maker)).field('kind', 'cad').attach('files', Buffer.from('x'), 'a.stl').expect(403);
    const pdf = await http().get(po(id, '/pdf')).set(bearer(admin)).buffer(true).expect(200);
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    // The manufacturer cannot edit a draft or raise a PO.
    await http().patch(api(`/admin/purchase-orders/${id}`)).set(bearer(maker)).send({ quantity: 3 }).expect(403);
    await http().post(api('/admin/purchase-orders')).set(bearer(maker)).send({ manufacturerId, specification: 'Anything at all', agreedCostPaise: 100, dueDate: '2026-12-01' }).expect(403);

    // Sent → "Received PO".
    const sent = await http().post(po(id, '/status')).set(bearer(admin)).send({ status: 'SENT' }).expect(200);
    expect(sent.body.stage).toBe('Received PO');

    // Pearls first: no accepting, and no "received", before head office sends them.
    expect((await http().post(po(id, '/status')).set(bearer(maker)).send({ status: 'ACCEPTED', dueDate: '2026-12-20' })).body.code).toBe('PEARLS_FIRST');
    expect((await http().post(po(id, '/pearls')).set(bearer(maker)).send({ step: 'RECEIVED' })).body.code).toBe('PEARLS_NOT_SENT');
    await http().post(po(id, '/pearls')).set(bearer(maker)).send({ step: 'SENT' }).expect(403);
    await http().post(po(id, '/pearls')).set(bearer(admin)).send({ step: 'SENT', note: 'By courier' }).expect(200);

    const emailsBefore = await db.notificationLog.count({ where: { templateKey: 'PO_STAGE', context: { path: ['purchaseOrderId'], equals: id } } });
    const received = await http().post(po(id, '/pearls')).set(bearer(maker)).send({ step: 'RECEIVED' }).expect(200);
    expect(received.body.stage).toBe('Pearls received');
    expect(received.body.pearlsReceivedAt).toBeTruthy();
    const accepted = await http().post(po(id, '/status')).set(bearer(maker)).send({ status: 'ACCEPTED', dueDate: '2026-12-20' }).expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    expect(String(accepted.body.dueDate).slice(0, 10)).toBe('2026-12-20');

    // Work stages: the flow's own stages and head office's pickup check are not the manufacturer's to tap.
    expect((await http().post(po(id, '/stage')).set(bearer(maker)).send({ stage: 'Received PO' })).body.code).toBe('USE_FLOW');
    await http().post(po(id, '/stage')).set(bearer(maker)).send({ stage: 'Quality check at pickup' }).expect(403);
    const casting = await http().post(po(id, '/stage')).set(bearer(maker)).send({ stage: 'Casting', note: '2 of 2 cast' }).expect(200);
    expect(casting.body.status).toBe('IN_PRODUCTION');
    await http().post(po(id, '/stage')).set(bearer(maker)).send({ stage: 'Polishing' }).expect(200);
    await http().post(po(id, '/status')).set(bearer(maker)).send({ status: 'RECEIVED' }).expect(403);
    await drain();
    // Head office is emailed on every update: pearls received, accepted, casting, polishing.
    expect(await db.notificationLog.count({ where: { templateKey: 'PO_STAGE', context: { path: ['purchaseOrderId'], equals: id } } })).toBeGreaterThanOrEqual(emailsBefore + 4);

    // The manufacturer's bill: ₹2 more than the computed total is flagged.
    const pdfBill = Buffer.from('%PDF-1.4\n%bill\n');
    await http().post(po(id, '/files')).set(bearer(maker)).field('kind', 'bill').attach('files', pdfBill, 'bill.pdf').expect(400); // amount needed
    const billed = await http().post(po(id, '/files')).set(bearer(maker)).field('kind', 'bill').field('amountPaise', '107300').attach('files', pdfBill, 'bill.pdf').expect(200);
    expect(billed.body.bill.amountPaise).toBe(107_300);
    expect(billed.body.bill.mismatch).toBe(true);

    // Earnings summary: work completed once the piece is ready for pickup.
    const before = (await http().get(api(`/admin/purchase-orders/summary`)).set(bearer(maker)).expect(200)).body;
    await http().post(po(id, '/stage')).set(bearer(maker)).send({ stage: 'Ready for pickup' }).expect(200);
    const after = (await http().get(api(`/admin/purchase-orders/summary`)).set(bearer(maker)).expect(200)).body;
    expect(after.completed.count).toBe(before.completed.count + 1);
    expect(after.amountDuePaise - before.amountDuePaise).toBe(107_100);
    expect(after.bills.count).toBeGreaterThanOrEqual(1);
    expect(after.bills.mismatches).toBeGreaterThanOrEqual(1);

    // Head office checks at pickup and receives the pieces.
    const qc = await http().post(po(id, '/stage')).set(bearer(admin)).send({ stage: 'Quality check at pickup', note: 'All good' }).expect(200);
    expect(qc.body.stage).toBe('Quality check at pickup');
    await http().post(po(id, '/status')).set(bearer(admin)).send({ status: 'RECEIVED' }).expect(200);
    const history = (await db.purchaseOrder.findUniqueOrThrow({ where: { id } })).stageHistory as Array<{ stage: string }>;
    expect(history.map((h) => h.stage)).toEqual(['Received PO', 'Pearls sent', 'Pearls received', 'Accepted', 'Casting', 'Polishing', 'Bill uploaded', 'Ready for pickup', 'Quality check at pickup']);
  });

  it('prefills a new PO from the catalogue piece, and a manufacturer sees only its own POs', async () => {
    const original = await db.product.findUniqueOrThrow({ where: { id: productId }, select: { metal: true, sizeMm: true, netWeight: true } });
    const product = await db.product.update({ where: { id: productId }, data: { metal: '18K Gold', sizeMm: 8.5, netWeight: 3.456 } });
    const pre = await http().get(api(`/admin/purchase-orders/prefill?productId=${product.id}`)).set(bearer(admin)).expect(200);
    expect(pre.body.metal).toBe('18K Gold');
    expect(pre.body.metalWeightG).toBe(3.456);
    // The design's last agreed rate carries over (₹120/g from the PO above).
    expect(pre.body.makingRatePerGramPaise).toBe(12_000);

    const created = await http().post(api('/admin/purchase-orders')).set(bearer(admin)).send({ manufacturerId, productId: product.id, quantity: 1, dueDate: '2026-12-31' }).expect(201);
    expect(created.body.metal).toBe('18K Gold');
    expect(Number(created.body.metalWeightG)).toBe(3.456);
    expect(created.body.agreedCostPaise).toBe(created.body.cost.totalPaise);
    // Nothing to compute from and no cost given: refused.
    expect((await http().post(api('/admin/purchase-orders')).set(bearer(admin)).send({ manufacturerId, metal: '92.5 Silver', specification: 'Plain band', dueDate: '2026-12-31' })).body.code).toBe('COST_REQUIRED');

    const mine = await http().get(api('/admin/purchase-orders?pageSize=100')).set(bearer(maker)).expect(200);
    expect(mine.body.items.length).toBeGreaterThan(0);
    expect(mine.body.items.every((r: { manufacturer: { id: string } }) => r.manufacturer.id === manufacturerId)).toBe(true);
    await http().get(api('/admin/purchase-orders/prefill?productId=' + product.id)).set(bearer(maker)).expect(403);
    await db.product.update({ where: { id: productId }, data: original });
  });
});
