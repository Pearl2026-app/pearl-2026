import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@sahyadri/db';
import { conflict } from '../../common/errors';
import { refundOrderPoints } from './loyalty';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';

export const HOLD_MINUTES = 15;

type Tx = Prisma.TransactionClient;

export interface HoldLine {
  productId: string;
  quantity: number;
  size?: string | null;
}

/**
 * Rule 2: a one-of-a-kind piece can be sold only once.
 * - Holds are taken inside the order transaction after SELECT … FOR UPDATE on each product row
 *   (rows locked in id order to avoid deadlocks).
 * - Quantity stock is decremented when held and given back when the hold is released.
 * - A partial unique index refuses a second ACTIVE/CONVERTED hold on a unique piece, even if code is wrong.
 */
@Injectable()
export class StockService implements OnModuleInit {
  private readonly log = new Logger('Stock');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('stock.expire', async (d: { orderId?: string }) => {
      await this.expireHolds(d.orderId);
    });
    this.jobs.repeat('stock.expire', 60_000);
  }

  private async lockProducts(tx: Tx, ids: string[]) {
    const sorted = [...new Set(ids)].sort();
    return tx.$queryRaw<
      Array<{ id: string; name: string; sku: string; status: string; archivedAt: Date | null; stockType: 'UNIQUE' | 'QUANTITY'; quantity: number; outOfStock: boolean; soldAt: Date | null; sizes: unknown }>
    >`SELECT id, name, sku, status, "archivedAt", "stockType", quantity, "outOfStock", "soldAt", sizes
      FROM "Product" WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE`;
  }

  /**
   * Hold stock for an order. `convert` = sell immediately (COD and manual orders); otherwise the hold
   * lasts HOLD_MINUTES while the customer pays online.
   */
  async hold(tx: Tx, orderId: string, lines: HoldLine[], opts: { convert: boolean; allowUnpublished?: boolean }) {
    const locked = await this.lockProducts(tx, lines.map((l) => l.productId));
    const now = new Date();
    for (const line of lines) {
      const p = locked.find((x) => x.id === line.productId);
      const unavailable = (why: string) => conflict('OUT_OF_STOCK', `${p?.name ?? 'A piece in your cart'} ${why}`);
      if (!p || p.archivedAt || (!opts.allowUnpublished && p.status !== 'PUBLISHED')) throw unavailable('is no longer available.');
      if (p.outOfStock) throw unavailable('is out of stock.');
      if (p.stockType === 'UNIQUE') {
        if (line.quantity !== 1) throw conflict('INVALID_QUANTITY', `${p.name} is one of a kind.`);
        if (p.soldAt) throw unavailable('has just been sold.');
        // Release any expired hold on this piece first, then make sure nobody else holds it.
        await this.releaseExpiredForProduct(tx, p.id, now);
        const active = await tx.stockHold.findFirst({ where: { productId: p.id, isUnique: true, status: { in: ['ACTIVE', 'CONVERTED'] } } });
        if (active) throw unavailable('is reserved in another checkout. Please try again in a few minutes.');
      } else {
        const sizes = Array.isArray(p.sizes) ? (p.sizes as Array<{ label: string; quantity: number }>) : null;
        if (sizes?.length) {
          // Rings and bangles: stock is held per size (meeting of 19 Oct), so the manufacturer knows which sizes sold.
          const entry = line.size ? sizes.find((x) => x.label === line.size) : null;
          if (!entry) throw conflict('SIZE_REQUIRED', `${p.name}: please choose a size.`);
          if (entry.quantity < line.quantity) throw unavailable(entry.quantity > 0 ? `has only ${entry.quantity} left in size ${line.size}.` : `is out of stock in size ${line.size}.`);
          const next = sizes.map((x) => (x.label === line.size ? { ...x, quantity: x.quantity - line.quantity } : x));
          await tx.product.update({ where: { id: p.id }, data: { quantity: { decrement: line.quantity }, sizes: next } });
        } else {
          if (p.quantity < line.quantity) throw unavailable(p.quantity > 0 ? `has only ${p.quantity} left.` : 'is out of stock.');
          await tx.product.update({ where: { id: p.id }, data: { quantity: { decrement: line.quantity } } });
        }
        // Stock just fell to the alert level or below: tell head office, the vendor and the manufacturers.
        await this.jobs.add('stock.low', { productId: p.id, before: p.quantity, after: p.quantity - line.quantity }, { delayMs: 5_000 });
      }
      try {
        await tx.stockHold.create({
          data: {
            productId: p.id,
            orderId,
            quantity: line.quantity,
            size: line.size ?? null,
            isUnique: p.stockType === 'UNIQUE',
            status: opts.convert ? 'CONVERTED' : 'ACTIVE',
            expiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000),
          },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw unavailable('has just been reserved by someone else.');
        throw e;
      }
      if (opts.convert && p.stockType === 'UNIQUE') await tx.product.update({ where: { id: p.id }, data: { soldAt: now, quantity: 0 } });
    }
  }

  /** Payment succeeded: holds become sales. Returns false if any hold is no longer active (late payment). */
  async convert(tx: Tx, orderId: string): Promise<boolean> {
    const holds = await tx.stockHold.findMany({ where: { orderId } });
    if (!holds.length) return true;
    if (holds.every((h) => h.status === 'CONVERTED')) return true;
    const locked = await this.lockProducts(tx, holds.map((h) => h.productId));
    for (const h of holds) {
      if (h.status === 'CONVERTED') continue;
      if (h.status !== 'ACTIVE') return false;
      const p = locked.find((x) => x.id === h.productId)!;
      if (h.isUnique && p.soldAt) return false;
    }
    const now = new Date();
    for (const h of holds) {
      if (h.status !== 'ACTIVE') continue;
      await tx.stockHold.update({ where: { id: h.id }, data: { status: 'CONVERTED' } });
      if (h.isUnique) await tx.product.update({ where: { id: h.productId }, data: { soldAt: now, quantity: 0 } });
    }
    return true;
  }

  /** Give stock back: payment failed, expired, order cancelled before dispatch, or return received. */
  async release(tx: Tx, orderId: string, reason: string, opts: { includeConverted?: boolean } = {}) {
    const holds = await tx.stockHold.findMany({ where: { orderId, status: { in: opts.includeConverted ? ['ACTIVE', 'CONVERTED'] : ['ACTIVE'] } } });
    if (!holds.length) return 0;
    const locked = await this.lockProducts(tx, holds.map((h) => h.productId));
    for (const h of holds) {
      await tx.stockHold.update({ where: { id: h.id }, data: { status: 'RELEASED', releasedReason: reason } });
      if (h.isUnique) {
        if (h.status === 'CONVERTED') await tx.product.update({ where: { id: h.productId }, data: { soldAt: null, quantity: 1 } });
      } else {
        const p = locked.find((x) => x.id === h.productId);
        const sizes = Array.isArray(p?.sizes) ? (p!.sizes as Array<{ label: string; quantity: number }>) : null;
        if (h.size && sizes?.length) {
          const next = sizes.some((x) => x.label === h.size)
            ? sizes.map((x) => (x.label === h.size ? { ...x, quantity: x.quantity + h.quantity } : x))
            : [...sizes, { label: h.size, quantity: h.quantity }];
          await tx.product.update({ where: { id: h.productId }, data: { quantity: { increment: h.quantity }, sizes: next } });
          // Keep the locked copy in step in case two holds touch the same piece.
          (p as { sizes: unknown }).sizes = next;
        } else {
          await tx.product.update({ where: { id: h.productId }, data: { quantity: { increment: h.quantity } } });
        }
      }
    }
    return holds.length;
  }

  private async releaseExpiredForProduct(tx: Tx, productId: string, now: Date) {
    const expired = await tx.stockHold.findMany({ where: { productId, status: 'ACTIVE', expiresAt: { lte: now } }, select: { orderId: true } });
    for (const e of expired) await this.expireOrder(tx, e.orderId);
  }

  /** An unpaid online order ran out of time: release its holds and fail the order. */
  private async expireOrder(tx: Tx, orderId: string) {
    const released = await this.release(tx, orderId, 'expired');
    if (!released) return;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (order && order.status === 'PLACED' && order.paymentStatus === 'PENDING') {
      await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED', paymentStatus: 'FAILED' } });
      await refundOrderPoints(tx, orderId);
      await tx.orderEvent.create({ data: { orderId, type: 'STATUS_CHANGED', fromStatus: 'PLACED', toStatus: 'FAILED', message: `Payment was not completed within ${HOLD_MINUTES} minutes; the pieces were released.` } });
    }
  }

  /**
   * The same cart checked out again before paying: the earlier unpaid order gives its pieces back,
   * otherwise the customer would be blocked by their own hold. A late payment on it is refunded automatically.
   */
  async supersede(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== 'PLACED' || order.paymentStatus !== 'PENDING') return;
      await this.release(tx, orderId, 'superseded');
      await tx.order.update({ where: { id: orderId }, data: { status: 'FAILED', paymentStatus: 'FAILED' } });
      await refundOrderPoints(tx, orderId);
      await tx.orderEvent.create({ data: { orderId, type: 'STATUS_CHANGED', fromStatus: 'PLACED', toStatus: 'FAILED', message: 'Replaced by a new checkout from the same cart; the pieces were released.' } });
    });
  }

  /** Background sweep (every minute) and per-order delayed job. Also safe to call anytime. */
  async expireHolds(orderId?: string): Promise<number> {
    const due = await this.prisma.stockHold.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date() }, ...(orderId ? { orderId } : {}) },
      select: { orderId: true },
      distinct: ['orderId'],
    });
    for (const d of due) {
      try {
        await this.prisma.$transaction((tx) => this.expireOrder(tx, d.orderId));
      } catch (e) {
        this.log.warn(`Could not expire holds for order ${d.orderId}: ${(e as Error).message}`);
      }
    }
    return due.length;
  }

  scheduleExpiry(orderId: string) {
    return this.jobs.add('stock.expire', { orderId }, { delayMs: HOLD_MINUTES * 60_000 + 5_000, jobId: `expire-${orderId}` });
  }
}
