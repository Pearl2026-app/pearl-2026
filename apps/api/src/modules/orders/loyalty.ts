import type { Prisma, PrismaClient } from '@sahyadri/db';

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Credit points (meeting of 19 Oct): 1 point = Re 1. Customers earn a percentage of every delivered order and can
 * pay part of a later order with them. Every movement is a LoyaltyLedger row, so the balance is always the sum and
 * every change can be traced to its order.
 */
export async function pointsBalancePaise(db: Db, customerId: string): Promise<number> {
  const r = await db.loyaltyLedger.aggregate({ where: { customerId }, _sum: { points: true } });
  return Math.max(0, (r._sum.points ?? 0) * 100);
}

/** Deduct redeemed points when the order is created. Idempotent per order. */
export async function redeemOrderPoints(tx: Db, order: { id: string; number: string; customerId: string }, paise: number) {
  if (paise <= 0) return;
  const existing = await tx.loyaltyLedger.findFirst({ where: { orderId: order.id, points: { lt: 0 } } });
  if (existing) return;
  await tx.loyaltyLedger.create({
    data: { customerId: order.customerId, points: -Math.round(paise / 100), reason: `Used on order ${order.number}`, orderId: order.id },
  });
}

/** Give redeemed points back when an order is cancelled, fails, is returned or refunded. Idempotent per order. */
export async function refundOrderPoints(tx: Db, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, number: true, customerId: true, pointsPaise: true } });
  if (!order || order.pointsPaise <= 0) return;
  const back = await tx.loyaltyLedger.findFirst({ where: { orderId, points: { gt: 0 }, reason: { startsWith: 'Returned' } } });
  if (back) return;
  await tx.loyaltyLedger.create({
    data: { customerId: order.customerId, points: Math.round(order.pointsPaise / 100), reason: `Returned from order ${order.number}`, orderId },
  });
}

/** Credit earned points when an order is delivered. Idempotent per order. Returns the points earned. */
export async function earnOrderPoints(
  tx: Db,
  order: { id: string; number: string; customerId: string; totalPaise: number },
  earnPercent: number,
): Promise<number> {
  const points = Math.floor((order.totalPaise * earnPercent) / 100 / 100);
  if (points <= 0) return 0;
  const existing = await tx.loyaltyLedger.findFirst({ where: { orderId: order.id, reason: { startsWith: 'Earned' } } });
  if (existing) return 0;
  await tx.loyaltyLedger.create({ data: { customerId: order.customerId, points, reason: `Earned on order ${order.number}`, orderId: order.id } });
  return points;
}
