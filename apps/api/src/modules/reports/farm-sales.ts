import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { forbidden } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';

const SOLD: Prisma.OrderWhereInput = { status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED', 'RETURNED'] }, archivedAt: null };

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
  async report(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>) {
    const q = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional(), farmId: z.string().optional() }).parse(raw);
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
      },
      take: 20_000,
    });
    const farms = new Map<string, { id: string; name: string; pieces: number; salesPaise: number; orders: Set<string> }>();
    const products = new Map<string, { id: string; name: string; sku: string; farm: string; carat: number | null; pieces: number; salesPaise: number }>();
    for (const i of items) {
      const f = i.product?.farm;
      if (!f || !i.product) continue;
      const fr = farms.get(f.id) ?? { id: f.id, name: f.name, pieces: 0, salesPaise: 0, orders: new Set<string>() };
      fr.pieces += i.quantity;
      fr.salesPaise += i.lineTotalPaise;
      fr.orders.add(i.orderId);
      farms.set(f.id, fr);
      const pr = products.get(i.product.id) ?? { id: i.product.id, name: i.product.name, sku: i.product.sku, farm: f.name, carat: i.product.caratWeight ? Number(i.product.caratWeight) : null, pieces: 0, salesPaise: 0 };
      pr.pieces += i.quantity;
      pr.salesPaise += i.lineTotalPaise;
      products.set(i.product.id, pr);
    }
    // Farms with no sales in the period still appear, so the list is complete.
    const all = await this.prisma.farm.findMany({ where: { archivedAt: null, ...(farmId ? { id: farmId } : {}) }, select: { id: true, name: true, _count: { select: { products: { where: { archivedAt: null } } } } } });
    return {
      from,
      to,
      farms: all
        .map((f) => {
          const s = farms.get(f.id);
          return { id: f.id, name: f.name, listedPieces: f._count.products, pieces: s?.pieces ?? 0, salesPaise: s?.salesPaise ?? 0, orders: s?.orders.size ?? 0 };
        })
        .sort((a, b) => b.salesPaise - a.salesPaise),
      topPieces: [...products.values()].sort((a, b) => b.salesPaise - a.salesPaise).slice(0, 20),
    };
  }
}
