import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import type { AuthUser } from '../../common/context';
import { sendCsv } from '../../common/csv';
import { CurrentUser, Requires } from '../../common/decorators';
import { forbidden } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';

const SOLD: Prisma.OrderWhereInput = { status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED', 'RETURNED'] }, archivedAt: null };

export const SEGMENTS = ['B2C', 'B2B'] as const;
export const CHANNELS = ['Website', 'WhatsApp / enquiry', 'Campaign / coupon', 'Store'] as const;

interface OrderOrigin {
  source: 'CHECKOUT' | 'ENQUIRY' | 'MANUAL';
  channel: string | null;
  couponCode: string | null;
  attribution: unknown;
  buyerGstin: string | null;
  customer: { b2bStatus: string } | null;
}

/** A business (B2B) order: placed by an approved business buyer, or with a GSTIN for a tax invoice. */
export const segmentOf = (o: OrderOrigin): (typeof SEGMENTS)[number] => (o.buyerGstin || o.customer?.b2bStatus === 'APPROVED' ? 'B2B' : 'B2C');

/**
 * Where a sale came from, from the order's own fields: enquiry-converted or WhatsApp orders, then orders with a
 * coupon or a campaign link (utm_campaign / utm_medium), then orders entered by the team (store, phone, walk-in),
 * and the rest is the website or app checkout.
 */
export function channelOf(o: OrderOrigin): (typeof CHANNELS)[number] {
  if (o.source === 'ENQUIRY' || /whats ?app/i.test(o.channel ?? '')) return 'WhatsApp / enquiry';
  const utm = (o.attribution as { utm?: Record<string, string> | null } | null)?.utm;
  if (o.couponCode || utm?.utm_campaign || utm?.utm_medium) return 'Campaign / coupon';
  if (o.source === 'MANUAL') return 'Store';
  return 'Website';
}

/**
 * Farm-wise sales (meeting of 19 Oct): how much of each farm's pearls sold, and which pieces. Head office sees every
 * farm; a farm partner's login sees only its own farm.
 */
@ApiTags('reports')
@Controller('admin/farm-sales')
export class FarmSalesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Requires('REPORTS', 'view')
  async report(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), farmId: z.string().optional(), format: z.enum(['json', 'csv']).optional() }).parse(raw);
    if (!['SUPER_ADMIN', 'STAFF', 'FARMER'].includes(user.role)) throw forbidden('Farm sales are for head office and farm partners.');
    const farmId = user.role === 'FARMER' ? (user.farmId ?? '__none__') : q.farmId;
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 30 * 24 * 3600_000);
    const where: Prisma.OrderItemWhereInput = {
      order: { ...SOLD, placedAt: { gte: from, lte: to } },
      product: farmId ? { farmId } : { farmId: { not: null } },
    };
    const items = await this.prisma.orderItem.findMany({
      where,
      select: {
        quantity: true,
        lineTotalPaise: true,
        orderId: true,
        product: { select: { id: true, name: true, sku: true, caratWeight: true, farm: { select: { id: true, name: true } } } },
        order: { select: { source: true, channel: true, couponCode: true, attribution: true, buyerGstin: true, customer: { select: { b2bStatus: true } } } },
      },
      take: 20_000,
    });
    type Split = { pieces: number; salesPaise: number; orders: Set<string> };
    const split = (): Split => ({ pieces: 0, salesPaise: 0, orders: new Set<string>() });
    const add = (s: Split, i: (typeof items)[number]) => {
      s.pieces += i.quantity;
      s.salesPaise += i.lineTotalPaise;
      s.orders.add(i.orderId);
    };
    const farms = new Map<string, { id: string; name: string; pieces: number; salesPaise: number; orders: Set<string>; bySegment: Record<string, number>; byChannel: Record<string, number> }>();
    const products = new Map<string, { id: string; name: string; sku: string; farm: string; carat: number | null; pieces: number; salesPaise: number }>();
    // Piece by piece and also by B2B / B2C and channel, for the spreadsheet.
    const csvRows = new Map<string, { farm: string; name: string; sku: string; carat: number | null; segment: string; channel: string; pieces: number; salesPaise: number }>();
    const segments = new Map<string, Split>(SEGMENTS.map((k) => [k, split()]));
    const channels = new Map<string, Split>(CHANNELS.map((k) => [k, split()]));
    for (const i of items) {
      const f = i.product?.farm;
      if (!f || !i.product) continue;
      const segment = segmentOf(i.order);
      const channel = channelOf(i.order);
      add(segments.get(segment)!, i);
      add(channels.get(channel)!, i);
      const fr = farms.get(f.id) ?? { id: f.id, name: f.name, pieces: 0, salesPaise: 0, orders: new Set<string>(), bySegment: {}, byChannel: {} };
      fr.pieces += i.quantity;
      fr.salesPaise += i.lineTotalPaise;
      fr.orders.add(i.orderId);
      fr.bySegment[segment] = (fr.bySegment[segment] ?? 0) + i.lineTotalPaise;
      fr.byChannel[channel] = (fr.byChannel[channel] ?? 0) + i.lineTotalPaise;
      farms.set(f.id, fr);
      const pr = products.get(i.product.id) ?? { id: i.product.id, name: i.product.name, sku: i.product.sku, farm: f.name, carat: i.product.caratWeight ? Number(i.product.caratWeight) : null, pieces: 0, salesPaise: 0 };
      pr.pieces += i.quantity;
      pr.salesPaise += i.lineTotalPaise;
      products.set(i.product.id, pr);
      const ck = `${i.product.id}|${segment}|${channel}`;
      const cr = csvRows.get(ck) ?? { farm: f.name, name: pr.name, sku: pr.sku, carat: pr.carat, segment, channel, pieces: 0, salesPaise: 0 };
      cr.pieces += i.quantity;
      cr.salesPaise += i.lineTotalPaise;
      csvRows.set(ck, cr);
    }
    // One farm (or all) downloads as a spreadsheet, piece by piece (client doc, 26 Oct), split by B2B / B2C and channel (4 Nov).
    if (q.format === 'csv') {
      const rows = [...csvRows.values()].sort((a, b) => a.farm.localeCompare(b.farm) || b.salesPaise - a.salesPaise);
      sendCsv(res, `farm-sales-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`, rows, [
        { header: 'Farm', value: (r) => r.farm },
        { header: 'Piece', value: (r) => r.name },
        { header: 'SR code', value: (r) => r.sku },
        { header: 'Carat', value: (r) => r.carat ?? '' },
        { header: 'B2B / B2C', value: (r) => r.segment },
        { header: 'Channel', value: (r) => r.channel },
        { header: 'Pieces sold', value: (r) => r.pieces },
        { header: 'Sales (₹)', value: (r) => r.salesPaise / 100 },
      ]);
      return;
    }
    const summarise = (m: Map<string, Split>) => [...m.entries()].map(([name, s]) => ({ name, pieces: s.pieces, salesPaise: s.salesPaise, orders: s.orders.size }));
    // Farms with no sales in the period still appear, so the list is complete.
    const all = await this.prisma.farm.findMany({ where: { archivedAt: null, ...(farmId ? { id: farmId } : {}) }, select: { id: true, name: true, _count: { select: { products: { where: { archivedAt: null } } } } } });
    return {
      from,
      to,
      farms: all
        .map((f) => {
          const s = farms.get(f.id);
          return {
            id: f.id,
            name: f.name,
            listedPieces: f._count.products,
            pieces: s?.pieces ?? 0,
            salesPaise: s?.salesPaise ?? 0,
            orders: s?.orders.size ?? 0,
            b2bPaise: s?.bySegment.B2B ?? 0,
            b2cPaise: s?.bySegment.B2C ?? 0,
            byChannel: Object.fromEntries(CHANNELS.map((c) => [c, s?.byChannel[c] ?? 0])),
          };
        })
        .sort((a, b) => b.salesPaise - a.salesPaise),
      /** Business buyers vs retail, and where the sales came from (meeting of 4 Nov) */
      segments: summarise(segments),
      channels: summarise(channels),
      topPieces: [...products.values()].sort((a, b) => b.salesPaise - a.salesPaise).slice(0, 20),
    };
  }
}
