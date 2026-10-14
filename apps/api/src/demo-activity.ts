import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@sahyadri/db';
import { DEMO_CODE } from './auth/otp.service';

/**
 * Demo site only (D66): a little recent business, so the presentation does not open on empty screens.
 * Everything goes through the API's own endpoints, so the same rules apply as for real use:
 * enquiries, orders at different stages, one paid online through the sandbox, and deliveries waiting for the Pune rider.
 */
export async function fillDemoActivity(base: string, db: PrismaClient): Promise<string> {
  let ip = 10;
  const call = async <T = any>(path: string, opts: { method?: string; body?: unknown; token?: string; cart?: string } = {}): Promise<T> => {
    const r = await fetch(base + path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `10.99.0.${ip++ % 250}`, // spread over addresses, like real visitors (rate limits are per address)
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.cart ? { 'X-Cart-Token': opts.cart } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${opts.method ?? 'POST'} ${path} → ${r.status} ${JSON.stringify(json)}`);
    return json as T;
  };

  const admin = (await call('/auth/staff/verify', { body: { challengeId: (await call('/auth/staff/login', { body: { email: 'admin@sahyadripearls.test', password: process.env.SEED_PASSWORD ?? 'Sahyadri@2026' } })).challengeId, code: DEMO_CODE } })).accessToken as string;
  const rider = (await call('/auth/partner/otp/verify', { body: { challengeId: (await call('/auth/partner/otp/request', { body: { identifier: '+919800000005' } })).challengeId, code: DEMO_CODE } })).accessToken as string;
  const pune = await db.city.findUniqueOrThrow({ where: { slug: 'pune' } });
  const partner = await db.deliveryPartner.findUniqueOrThrow({ where: { phone: '+919800000005' } });
  // Pieces in stock with a listed price, cheapest first, so cash on delivery is allowed.
  const pieces = await db.product.findMany({ where: { status: 'PUBLISHED', priceOnRequest: false, soldAt: null, pricePaise: { lte: 4_000_000 } }, orderBy: { pricePaise: 'asc' }, take: 12 });

  const buyers = [
    { name: 'Meera Joshi', phone: '9876501101', line1: '4 Law College Road', area: 'Erandwane', pincode: '411004' },
    { name: 'Rohan Kulkarni', phone: '9876501102', line1: '7 Karve Road', area: 'Kothrud', pincode: '411038' },
    { name: 'Sneha Deshpande', phone: '9876501103', line1: '21 Baner Road', area: 'Baner', pincode: '411045' },
    { name: 'Aditya Rao', phone: '9876501104', line1: '9 North Main Road', area: 'Koregaon Park', pincode: '411001' },
    { name: 'Priya Nair', phone: '9876501105', line1: '15 Aundh Road', area: 'Aundh', pincode: '411007' },
    { name: 'Kavya Shah', phone: '9876501106', line1: '3 Senapati Bapat Road', area: 'Shivajinagar', pincode: '411016' },
  ];
  const order = async (i: number, method: 'COD' | 'ONLINE', gift = false) => {
    const b = buyers[i]!;
    const add = await call('/cart/items', { body: { productId: pieces[i]!.id, quantity: 1 } });
    return call('/checkout', {
      cart: add.token,
      body: {
        contact: { name: b.name, phone: b.phone },
        address: { name: b.name, phone: b.phone, line1: b.line1, area: b.area, cityName: 'Pune', state: 'Maharashtra', pincode: b.pincode },
        cityId: pune.id,
        paymentMethod: method,
        ...(gift ? { giftWrap: true, giftMessage: 'Happy anniversary, with love' } : {}),
        source: 'instagram',
        utm: { utm_source: 'instagram' },
      },
    });
  };
  const move = (id: string, status: string, reason?: string) => call(`/admin/orders/${id}/status`, { token: admin, body: { status, ...(reason ? { reason } : {}) } });
  const toAssigned = async (id: string, alreadyConfirmed = false) => {
    if (!alreadyConfirmed) await move(id, 'CONFIRMED'); // a paid online order confirms itself
    await move(id, 'PACKED');
    await call(`/admin/orders/${id}/assign-delivery`, { token: admin, body: { deliveryPartnerId: partner.id } });
  };

  // 1. New today, waiting for head office.
  await order(0, 'COD');
  // 2. Confirmed, gift packed.
  const confirmed = await order(1, 'COD', true);
  await move(confirmed.order.id, 'CONFIRMED');
  // 3–4. With the Pune rider: one to pick up, one already on the road.
  const assigned = await order(2, 'COD');
  await toAssigned(assigned.order.id);
  const onRoad = await order(3, 'COD');
  await toAssigned(onRoad.order.id);
  await call(`/delivery/jobs/${onRoad.order.id}/picked-up`, { token: rider, body: { clientEventId: randomUUID() } });
  await call(`/delivery/jobs/${onRoad.order.id}/out-for-delivery`, { token: rider, body: { clientEventId: randomUUID() } });
  // 5. Paid online through the payment sandbox.
  const online = await order(4, 'ONLINE');
  if (online.payment?.orderId) await call(`/payments/sandbox/${online.payment.orderId}/complete`, { body: { outcome: 'success' } });
  // 6. Paid online and already delivered (handed over at the store): shows in the sales figures.
  const done = await order(5, 'ONLINE');
  if (done.payment?.orderId) await call(`/payments/sandbox/${done.payment.orderId}/complete`, { body: { outcome: 'success' } });
  await toAssigned(done.order.id, true);
  await move(done.order.id, 'PICKED_UP');
  await move(done.order.id, 'OUT_FOR_DELIVERY');
  await move(done.order.id, 'DELIVERED', 'Collected at the Koregaon Park store (demo)');

  // Enquiries from the website and Instagram, as they arrive on WhatsApp.
  const enquiries: Array<Record<string, unknown>> = [
    { type: 'PRODUCT', productId: pieces[6]?.id, citySlug: 'pune', name: 'Anjali Patil', phone: '+919876501107', source: 'website', message: 'Is this available in a longer length?' },
    { type: 'PRODUCT', productId: pieces[7]?.id, citySlug: 'mumbai', name: 'Farhan Sheikh', phone: '+919876501108', source: 'instagram', message: 'Can I see this at your Bandra store?' },
    { type: 'BULK', citySlug: 'pune', name: 'Shree Weddings', phone: '+919876501109', source: 'website', message: 'Return gifts for 40 guests, budget ₹2,000 each.' },
    { type: 'CONTACT', citySlug: 'mumbai', name: 'Neha Iyer', phone: '+919876501110', source: 'google', message: 'Do you restring pearl necklaces?' },
  ];
  for (const e of enquiries) await call('/enquiries', { body: { ...e, clientId: randomUUID() } }).catch(() => undefined);
  const inTwoDays = new Date(Date.now() + 2 * 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
  await call('/enquiries/consultation', { body: { mode: 'VIDEO', date: inTwoDays, slot: 'EVENING', name: 'Ritu Agarwal', phone: '9876501111', citySlug: 'pune', notes: 'Bridal set for a December wedding.' } }).catch(() => undefined);
  return `6 orders and 5 enquiries created`;
}
