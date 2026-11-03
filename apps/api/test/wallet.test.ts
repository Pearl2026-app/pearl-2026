import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { outbox } from '../src/providers/messaging';
import { ADDRESS, api, bearer, customerToken, db, drain, getApp, http, tokenFor } from './helpers';

/**
 * Client meeting, 4 Nov: the referral wallet (₹200 per order placed with your code, spent at checkout or withdrawn
 * as cash) and the fuller business-buyer application.
 */

let puneId: string;
let admin: { Authorization: string };

async function piece(name: string, pricePaise = 1_000_000) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
  const sku = `W-${name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  return db.product.create({
    data: {
      sku,
      name,
      slug: sku.toLowerCase(),
      categoryId: cat.id,
      pricePaise,
      status: 'PUBLISHED',
      stockType: 'UNIQUE',
      quantity: 1,
      images: { create: { url: '/media/x.svg', kind: 'MAIN' } },
    },
  });
}

/** Signed-in customer buys one new piece with cash on delivery. */
async function buy(
  token: string,
  phone: string,
  name: string,
  extra: Record<string, unknown> = {},
  pricePaise = 1_000_000,
) {
  const p = await piece(name, pricePaise);
  const me = bearer(token);
  await http().post(api('/cart/items')).set(me).send({ productId: p.id }).expect(200);
  const r = await http()
    .post(api('/checkout'))
    .set(me)
    .send({
      contact: { name, phone },
      address: { ...ADDRESS, phone },
      cityId: puneId,
      paymentMethod: 'COD',
      ...extra,
    })
    .expect(201);
  return r.body.order as { id: string; number: string; totalPaise: number };
}

const setStatus = (id: string, status: string, reason?: string) =>
  http()
    .post(api(`/admin/orders/${id}/status`))
    .set(admin)
    .send({ status, ...(reason ? { reason } : {}) })
    .expect(200);

const wallet = async (token: string) =>
  (await http().get(api('/me/wallet')).set(bearer(token)).expect(200)).body;

beforeAll(async () => {
  await getApp();
  puneId = (await db.city.findUniqueOrThrow({ where: { slug: 'pune' } })).id;
  admin = bearer(await tokenFor('superAdmin'));
});
afterAll(() => db.$disconnect());

describe('referral wallet', () => {
  const referrerPhone = '9811700001';
  const friendPhone = '9811700002';
  let referrer: string;
  let friend: string;

  it('credits the referrer on every confirmed order placed with their code, and takes it back on cancellation', async () => {
    referrer = await customerToken(`+91${referrerPhone}`, { name: 'Ravi Referrer' });
    const code = (await wallet(referrer)).referralCode as string;
    friend = await customerToken(`+91${friendPhone}`, { name: 'Meera Friend', referralCode: code });

    const first = await buy(friend, friendPhone, 'Meera Friend');
    await drain();
    expect((await wallet(referrer)).balancePaise).toBe(0); // placed, not confirmed yet
    await setStatus(first.id, 'CONFIRMED');
    await drain();
    const w1 = await wallet(referrer);
    expect(w1.balancePaise).toBe(20_000);
    expect(w1.entries[0]).toMatchObject({ kind: 'REFERRAL_REWARD', amountPaise: 20_000 });

    // Confirming again (or a later step) never credits twice.
    await setStatus(first.id, 'PACKED');
    await drain();
    expect((await wallet(referrer)).balancePaise).toBe(20_000);

    // Every order counts (the default).
    const second = await buy(friend, friendPhone, 'Meera Friend');
    await setStatus(second.id, 'CONFIRMED');
    await drain();
    expect((await wallet(referrer)).balancePaise).toBe(40_000);

    // A cancelled order takes its reward back.
    await setStatus(second.id, 'CANCELLED', 'Changed her mind');
    await drain();
    expect((await wallet(referrer)).balancePaise).toBe(20_000);
    expect(await db.walletEntry.count({ where: { orderId: second.id } })).toBe(2);
  });

  it('rewards only the first order when the setting says so', async () => {
    await http()
      .patch(api('/admin/settings/wallet'))
      .set(admin)
      .send({ rewardOn: 'FIRST_ORDER' })
      .expect(200);
    try {
      const third = await buy(friend, friendPhone, 'Meera Friend');
      await setStatus(third.id, 'CONFIRMED');
      await drain();
      expect((await wallet(referrer)).balancePaise).toBe(20_000);
    } finally {
      await http()
        .patch(api('/admin/settings/wallet'))
        .set(admin)
        .send({ rewardOn: 'EVERY_ORDER' })
        .expect(200);
    }
  });

  it('pays part of an order from the wallet, computed on the server, and gives it back if the order is cancelled', async () => {
    // The quote shows what the wallet pays.
    const p = await piece('Wallet Spend Ring', 1_000_000);
    const me = bearer(referrer);
    await http().post(api('/cart/items')).set(me).send({ productId: p.id }).expect(200);
    const q = await http()
      .post(api('/checkout/quote'))
      .set(me)
      .send({ cityId: puneId, useWallet: true })
      .expect(200);
    expect(q.body.wallet).toMatchObject({ usedPaise: 20_000, balancePaise: 20_000 });
    expect(q.body.totals.totalPaise).toBe(1_000_000 - 20_000);
    expect(q.body.totals.deliveryPaise).toBe(0); // still above the free-delivery threshold before the wallet part

    // A client-sent total is ignored; the order records the wallet part and the ledger the spend.
    const r = await http()
      .post(api('/checkout'))
      .set(me)
      .send({
        contact: { name: 'Ravi Referrer', phone: referrerPhone },
        address: { ...ADDRESS, phone: referrerPhone },
        cityId: puneId,
        paymentMethod: 'COD',
        useWallet: true,
        totalPaise: 1,
      })
      .expect(201);
    const o = await db.order.findUniqueOrThrow({ where: { id: r.body.order.id } });
    expect(o.walletPaise).toBe(20_000);
    expect(o.totalPaise).toBe(980_000);
    expect(o.discountPaise).toBe(0); // the wallet part is shown separately from coupon discounts
    expect((await wallet(referrer)).balancePaise).toBe(0);
    expect(
      (await db.walletEntry.findUniqueOrThrow({ where: { idemKey: `spend:${o.id}` } })).amountPaise,
    ).toBe(-20_000);

    await setStatus(o.id, 'CANCELLED', 'Wrong size');
    expect((await wallet(referrer)).balancePaise).toBe(20_000);
    // Cancelling is idempotent for the wallet.
    expect(
      await db.walletEntry.count({ where: { idemKey: { in: [`spend:${o.id}`, `spend-back:${o.id}`] } } }),
    ).toBe(2);
  });

  it('lets the customer request a cash-out above the minimum, which head office pays or rejects', async () => {
    const me = bearer(referrer);
    // Below the ₹500 minimum.
    const low = await http()
      .post(api('/me/wallet/withdraw'))
      .set(me)
      .send({ method: 'UPI', amountPaise: 20_000, upiId: 'ravi@okaxis' })
      .expect(400);
    expect(low.body.code).toBe('BELOW_MINIMUM');

    // Head office adds goodwill money (Super Admin only).
    const customerId = (
      await db.customer.findFirstOrThrow({ where: { user: { phone: `+91${referrerPhone}` } } })
    ).id;
    await http()
      .post(api(`/admin/wallet/customers/${customerId}/adjust`))
      .set(bearer(await tokenFor('staff')))
      .send({ amountPaise: 40_000, note: 'Goodwill' })
      .expect(403);
    await http()
      .post(api(`/admin/wallet/customers/${customerId}/adjust`))
      .set(admin)
      .send({ amountPaise: 40_000, note: 'Goodwill' })
      .expect(200);
    expect((await wallet(referrer)).balancePaise).toBe(60_000);

    // More than the balance, a bad UPI ID, then a good request that holds the amount.
    expect(
      (
        await http()
          .post(api('/me/wallet/withdraw'))
          .set(me)
          .send({ method: 'UPI', amountPaise: 70_000, upiId: 'ravi@okaxis' })
          .expect(400)
      ).body.code,
    ).toBe('INSUFFICIENT_BALANCE');
    await http()
      .post(api('/me/wallet/withdraw'))
      .set(me)
      .send({ method: 'UPI', amountPaise: 50_000, upiId: 'not a upi' })
      .expect(400);
    const req = await http()
      .post(api('/me/wallet/withdraw'))
      .set(me)
      .send({ method: 'UPI', amountPaise: 50_000, upiId: 'ravi@okaxis' })
      .expect(200);
    expect(req.body.status).toBe('REQUESTED');
    expect((await wallet(referrer)).balancePaise).toBe(10_000);
    expect(
      (
        await http()
          .post(api('/me/wallet/withdraw'))
          .set(me)
          .send({ method: 'UPI', amountPaise: 50_000, upiId: 'ravi@okaxis' })
          .expect(400)
      ).body.code,
    ).toBe('PAYOUT_PENDING');

    // Head office sees it; others cannot.
    const list = await http().get(api('/admin/wallet/payouts')).set(admin).expect(200);
    expect(list.body.items.some((x: { id: string }) => x.id === req.body.id)).toBe(true);
    await http()
      .get(api('/admin/wallet/payouts'))
      .set(bearer(await tokenFor('puneManager')))
      .expect(403);

    // Rejected: the money comes back.
    await http()
      .post(api(`/admin/wallet/payouts/${req.body.id}/reject`))
      .set(admin)
      .send({ note: 'UPI ID did not match the account name' })
      .expect(200);
    expect((await wallet(referrer)).balancePaise).toBe(60_000);

    // A bank request, marked paid with the reference; it cannot be paid twice.
    const bank = await http()
      .post(api('/me/wallet/withdraw'))
      .set(me)
      .send({
        method: 'BANK',
        amountPaise: 50_000,
        bankAccountName: 'Ravi Referrer',
        bankAccountNumber: '123456789012',
        bankIfsc: 'hdfc0001234',
      })
      .expect(200);
    expect(bank.body.bankAccountNumber).toBe('•••• 9012');
    await http()
      .post(api(`/admin/wallet/payouts/${bank.body.id}/paid`))
      .set(admin)
      .send({ reference: 'UTR123456789' })
      .expect(200);
    await http()
      .post(api(`/admin/wallet/payouts/${bank.body.id}/paid`))
      .set(admin)
      .send({ reference: 'UTR123456789' })
      .expect(400);
    const paid = await db.walletPayout.findUniqueOrThrow({ where: { id: bank.body.id } });
    expect(paid).toMatchObject({ status: 'PAID', reference: 'UTR123456789' });
    expect(paid.paidAt).not.toBeNull();
    const w = await wallet(referrer);
    expect(w.balancePaise).toBe(10_000);
    expect(w.payouts[0]).toMatchObject({ status: 'PAID', amountPaise: 50_000 });

    // The customers list and page show points and wallet.
    const rows = await http()
      .get(api(`/admin/customers?q=${referrerPhone}`))
      .set(admin)
      .expect(200);
    expect(rows.body.items[0]).toMatchObject({ walletPaise: 10_000, pointsPaise: expect.any(Number) });
    const page = await http()
      .get(api(`/admin/customers/${customerId}`))
      .set(admin)
      .expect(200);
    expect(page.body.walletPaise).toBe(10_000);
    expect(page.body.walletPayouts).toHaveLength(2);
  });
});

describe('business buyer application', () => {
  it('collects shop details, confirms to the applicant, tells head office, and emails the buyer on approval', async () => {
    const phone = '+919811700010';
    const t = bearer(await customerToken(phone, { name: 'Sunil Mehta' }));
    const bad = await http()
      .post(api('/me/business/apply'))
      .set(t)
      .send({ businessName: 'Mehta Pearls Pvt Ltd', gstin: '27AAAPM1234C1Z5' })
      .expect(400);
    expect(bad.body.fields?.shopName ?? bad.body.message).toBeTruthy();
    const res = await http()
      .post(api('/me/business/apply'))
      .set(t)
      .send({
        businessName: 'Mehta Pearls Pvt Ltd',
        gstin: '27aaapm1234c1z5',
        shopName: 'Mehta Pearl House',
        shopAddress: '22 Laxmi Road, Pune 411030',
        contactPhone: '9811700011',
        contactEmail: 'sunil@mehta.example',
        note: '200 strands a month',
      })
      .expect(200);
    expect(res.body.message).toContain("We're verifying your details");
    await drain();
    expect(
      outbox.some((o) => o.to === 'sunil@mehta.example' && o.body.includes("We're verifying your details")),
    ).toBe(true);
    expect(
      outbox.some(
        (o) =>
          o.channel === 'EMAIL' &&
          o.body.includes('Mehta Pearl House') &&
          o.body.includes('22 Laxmi Road') &&
          o.body.includes('+919811700011'),
      ),
    ).toBe(true);

    const status = await http().get(api('/me/business')).set(t).expect(200);
    expect(status.body).toMatchObject({
      b2bStatus: 'PENDING',
      shopName: 'Mehta Pearl House',
      b2bContactPhone: '+919811700011',
      b2bContactEmail: 'sunil@mehta.example',
    });

    const list = await http().get(api('/admin/business-buyers?status=PENDING')).set(admin).expect(200);
    const row = list.body.items.find((b: { shopName: string }) => b.shopName === 'Mehta Pearl House');
    expect(row).toMatchObject({
      shopAddress: '22 Laxmi Road, Pune 411030',
      b2bContactEmail: 'sunil@mehta.example',
    });

    await http()
      .post(api(`/admin/business-buyers/${row.id}/approve`))
      .set(admin)
      .send({})
      .expect(200);
    await drain();
    const mail = outbox.filter((o) => o.to === 'sunil@mehta.example').at(-1);
    expect(mail?.body).toContain("You're registered as a business buyer with Sahyadri Pearls");
    expect(mail?.body).toContain('/account/business');
  });

  it('turns a request above stock into a bulk enquiry for the remaining quantity', async () => {
    const t = bearer(await customerToken('+919811700010'));
    const cat = await db.category.findUniqueOrThrow({ where: { slug: 'rings' } });
    const sku = `W-B2B-${Date.now().toString(36).toUpperCase()}`;
    const p = await db.product.create({
      data: {
        sku,
        name: 'Trade Pearl Stud',
        slug: sku.toLowerCase(),
        categoryId: cat.id,
        pricePaise: 300_000,
        b2bPricePaise: 200_000,
        b2bMinQty: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        stockType: 'QUANTITY',
        quantity: 4,
        images: { create: { url: '/media/x.svg', kind: 'MAIN' } },
      },
    });
    const items = (await http().get(api('/me/business/products')).set(t).expect(200)).body.items;
    expect(items.find((i: { id: string }) => i.id === p.id).inStock).toBe(4);

    await http()
      .post(api('/me/business/request-more'))
      .set(t)
      .send({ productId: p.id, quantity: 3 })
      .expect(400); // there are 4
    const r = await http()
      .post(api('/me/business/request-more'))
      .set(t)
      .send({ productId: p.id, quantity: 10, phone: '9811700011' })
      .expect(200);
    expect(r.body).toMatchObject({ remaining: 6, message: "We'll call you about the remaining quantity." });
    const e = await db.enquiry.findUniqueOrThrow({ where: { reference: r.body.reference } });
    expect(e).toMatchObject({ type: 'BULK', productId: p.id, contactPhone: '+919811700011' });
    expect(e.payload).toMatchObject({ requestedQuantity: 10, availableQuantity: 4, remainingQuantity: 6 });

    // Someone not approved cannot.
    await http()
      .post(api('/me/business/request-more'))
      .set(bearer(await tokenFor('customerKaran')))
      .send({ productId: p.id, quantity: 10 })
      .expect(403);
  });
});
