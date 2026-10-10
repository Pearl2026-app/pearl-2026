import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { quoteCustom } from '@sahyadri/shared';
import { ADDRESS, api, bearer, db, drain, getApp, http, tokenFor } from './helpers';

let admin: string;
let pune: string;
let puneId: string;
let manufacturerId: string;

beforeAll(async () => {
  await getApp();
  admin = await tokenFor('superAdmin');
  pune = await tokenFor('puneManager');
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
  manufacturerId = (await db.manufacturer.findFirstOrThrow({ where: { isActive: true } })).id;
});
afterAll(() => db.$disconnect());

const costs = { metalCostPaise: 2_000_000, labourCostPaise: 500_000, pearlCostPaise: 1_500_000, marginPaise: 1_000_000 };

describe('customized orders', () => {
  it('runs requirement → quote → advance (creates the order) → PO → production → ready → delivered, with partial payments', async () => {
    const created = await http().post(api('/admin/custom-orders')).set(bearer(admin)).send({ jewelleryType: 'Ring', metal: '18k gold', size: '14', pearlDetails: '9mm golden South Sea', contact: { name: 'Neha Shah', phone: '9811300001' }, cityId: puneId }).expect(201);
    const id = created.body.id;
    expect(created.body.stage).toBe('REQUIREMENT');

    // A quote needs the cost breakdown; only head office sets it.
    expect((await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'QUOTED' })).body.code).toBe('QUOTE_REQUIRED');
    await http().patch(api(`/admin/custom-orders/${id}`)).set(bearer(pune)).send({ costs }).expect(403);
    const quoted = await http().patch(api(`/admin/custom-orders/${id}`)).set(bearer(admin)).send({ costs }).expect(200);
    const expected = quoteCustom({ ...costs, gstRateBp: 300 }).quotedPaise;
    expect(quoted.body.quotedPaise).toBe(expected);
    // The city manager sees the quote but not the cost breakdown.
    const seen = await http().get(api(`/admin/custom-orders/${id}`)).set(bearer(pune)).expect(200);
    expect(seen.body.quotedPaise).toBe(expected);
    expect(seen.body.marginPaise).toBeUndefined();

    await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'QUOTED' }).expect(200);
    // Skipping ahead is refused.
    expect((await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'IN_MANUFACTURING' })).body.code).toBe('INVALID_STAGE');
    expect((await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'ADVANCE_PAID' })).body.code).toBe('ADVANCE_REQUIRED');

    const advance = 2_000_000;
    const paid = await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'ADVANCE_PAID', advance: { amountPaise: advance, method: 'BANK_TRANSFER', reference: 'UPI-77', address: { ...ADDRESS, phone: '9811300001' } } }).expect(200);
    expect(paid.body.order.totalPaise).toBe(expected);
    expect(paid.body.paidPaise).toBe(advance);
    const orderId = paid.body.order.id;
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, invoice: true } });
    expect(order.type).toBe('CUSTOMIZED');
    expect(order.status).toBe('CONFIRMED');
    expect(order.paymentStatus).toBe('PENDING'); // balance still due
    expect(order.invoice).toBeNull();
    expect(order.items[0]!.lineTotalPaise).toBe(expected);
    // The quote is locked once the advance is in.
    expect((await http().patch(api(`/admin/custom-orders/${id}`)).set(bearer(admin)).send({ costs })).body.code).toBe('QUOTE_LOCKED');

    // PO Raised needs a PO; raising one moves the stage.
    expect((await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'PO_RAISED' })).body.code).toBe('PO_REQUIRED');
    const po = await http().post(api('/admin/purchase-orders')).set(bearer(admin)).send({ manufacturerId, customRequestId: id, specification: '18k gold ring, 9mm golden pearl, size 14', quantity: 1, agreedCostPaise: 3_500_000, dueDate: '2026-11-15' }).expect(201);
    expect(po.body.number).toMatch(/^PO-\d{4}-\d{5}$/);
    expect(po.body.status).toBe('DRAFT');
    expect((await db.customRequest.findUniqueOrThrow({ where: { id } })).stage).toBe('PO_RAISED');
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).manufacturerId).toBe(manufacturerId);

    const pdf = await http().get(api(`/admin/purchase-orders/${po.body.id}/pdf`)).set(bearer(admin)).buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    // PO steps drive the production stage.
    expect((await http().post(api(`/admin/purchase-orders/${po.body.id}/status`)).set(bearer(admin)).send({ status: 'RECEIVED' })).body.code).toBe('INVALID_STEP');
    for (const s of ['SENT', 'ACCEPTED', 'IN_PRODUCTION']) await http().post(api(`/admin/purchase-orders/${po.body.id}/status`)).set(bearer(admin)).send({ status: s }).expect(200);
    expect((await db.customRequest.findUniqueOrThrow({ where: { id } })).stage).toBe('IN_MANUFACTURING');
    await http().patch(api(`/admin/purchase-orders/${po.body.id}`)).set(bearer(admin)).send({ agreedCostPaise: 1 }).expect(400); // only drafts change
    await http().post(api(`/admin/purchase-orders/${po.body.id}/status`)).set(bearer(admin)).send({ status: 'RECEIVED' }).expect(200);
    expect((await db.customRequest.findUniqueOrThrow({ where: { id } })).stage).toBe('QUALITY_CHECK');

    await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'READY' }).expect(200);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PACKED');
    expect((await http().post(api(`/admin/custom-orders/${id}/stage`)).set(bearer(admin)).send({ stage: 'DISPATCHED' })).body.code).toBe('USE_DELIVERY');

    // Balance: more than due is refused; the exact balance completes payment and issues the invoice.
    await http().post(api(`/admin/orders/${orderId}/payments`)).set(bearer(admin)).send({ method: 'BANK_TRANSFER', amountPaise: expected, reference: 'X' }).expect(400);
    await http().post(api(`/admin/orders/${orderId}/payments`)).set(bearer(admin)).send({ method: 'BANK_TRANSFER', amountPaise: expected - advance, reference: 'NEFT-9' }).expect(200);
    const done = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { invoice: true } });
    expect(done.paymentStatus).toBe('PAID');
    expect(done.invoice).not.toBeNull();

    // Delivery moves the stage to Dispatched, then Delivered.
    const dp = await db.deliveryPartner.findFirstOrThrow({ where: { phone: '+919800000005' } });
    await http().post(api(`/admin/orders/${orderId}/assign-delivery`)).set(bearer(admin)).send({ deliveryPartnerId: dp.id });
    const rider = await tokenFor('deliveryPune');
    await http().post(api(`/delivery/jobs/${orderId}/picked-up`)).set(bearer(rider)).send({}).expect(200);
    expect((await db.customRequest.findUniqueOrThrow({ where: { id } })).stage).toBe('DISPATCHED');
    await drain();
  });

  it('starts from a customized enquiry once, and keeps other cities and roles out', async () => {
    const e = await http().post(api('/enquiries')).send({ type: 'CONTACT', name: 'Vikas', phone: '9811300002', message: 'Want a pearl mangalsutra made', citySlug: 'mumbai' }).expect(201);
    const enquiry = await db.enquiry.findFirstOrThrow({ where: { reference: e.body.reference } });
    // Pune's manager cannot start one for a Mumbai enquiry.
    await http().post(api('/admin/custom-orders')).set(bearer(pune)).send({ enquiryId: enquiry.id, jewelleryType: 'Mangalsutra' }).expect(404);
    const c = await http().post(api('/admin/custom-orders')).set(bearer(admin)).send({ enquiryId: enquiry.id, jewelleryType: 'Mangalsutra' }).expect(201);
    expect(c.body.contact.phone).toBe('+919811300002');
    expect((await http().post(api('/admin/custom-orders')).set(bearer(admin)).send({ enquiryId: enquiry.id, jewelleryType: 'Mangalsutra' })).body.code).toBe('ALREADY_STARTED');
    await http().get(api(`/admin/custom-orders/${c.body.id}`)).set(bearer(pune)).expect(404);
    await http().get(api(`/admin/custom-orders/${c.body.id}`)).set(bearer(await tokenFor('mumbaiManager'))).expect(200);
    await http().get(api('/admin/custom-orders')).set(bearer(await tokenFor('vendor'))).expect(403);
    await http().get(api('/admin/purchase-orders')).set(bearer(await tokenFor('franchisePune'))).expect(403);
    // City managers can view POs but not raise them.
    await http().post(api('/admin/purchase-orders')).set(bearer(pune)).send({ manufacturerId, specification: 'Test spec', agreedCostPaise: 100, dueDate: '2026-12-01' }).expect(403);
  });
});
