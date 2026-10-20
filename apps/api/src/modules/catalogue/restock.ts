import { Controller, Get, Injectable, Logger, OnModuleInit, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { productScope } from '../../common/scope';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Low stock (meeting of 19 Oct): when a piece sold by quantity falls to its alert level, head office, the vendor
 * and the manufacturers hear about it, and the restock list shows what to make, with last month's sales as a guide.
 */
@Injectable()
export class LowStockAlerts implements OnModuleInit {
  private readonly log = new Logger('LowStock');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('stock.low', (d: { productId: string; before: number; after: number }) => this.check(d));
  }

  async check(d: { productId: string; before: number; after: number }) {
    const cfg = await this.settings.get('stock_alert');
    if (!cfg.enabled) return;
    const p = await this.prisma.product.findUnique({
      where: { id: d.productId },
      select: { id: true, name: true, sku: true, quantity: true, lowStockAt: true, stockType: true, vendor: { select: { name: true, email: true, phone: true } } },
    });
    if (!p || p.stockType !== 'QUANTITY') return;
    const level = p.lowStockAt ?? cfg.defaultThreshold;
    // Only when this sale crossed the level, so one piece does not send an alert on every later sale.
    if (!(d.before > level && d.after <= level)) return;
    const vars = { productName: p.name, sku: p.sku, quantity: p.quantity, level, restockUrl: `${config().ADMIN_URL}/restock` };
    const store = await this.settings.get('store');
    const [admins, makers] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true, email: { not: null } }, select: { email: true } }),
      this.prisma.manufacturer.findMany({ where: { isActive: true }, select: { email: true, phone: true } }),
    ]);
    const emails = new Set([store.email, cfg.alertEmail, p.vendor?.email, ...admins.map((a) => a.email), ...makers.map((m) => m.email)].filter((x): x is string => !!x));
    for (const email of emails) await this.notifications.send({ templateKey: 'LOW_STOCK', vars, to: { email }, context: { productId: p.id } });
    for (const m of makers) if (m.phone) await this.notifications.send({ templateKey: 'LOW_STOCK', vars, to: { whatsapp: m.phone }, context: { productId: p.id } });
    this.log.log(`${p.sku} is down to ${p.quantity} (alert level ${level}); ${emails.size} alerts sent.`);
  }
}

@ApiTags('catalogue')
@Controller('admin/restock')
export class RestockController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Pieces at or below their alert level, and sold-out pieces, with how many sold in the last 30 days. */
  @Get()
  @Requires('PRODUCTS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    const cfg = await this.settings.get('stock_alert');
    const rows = await this.prisma.product.findMany({
      where: { AND: [productScope(user), { archivedAt: null, stockType: 'QUANTITY' }] },
      select: {
        id: true,
        name: true,
        sku: true,
        quantity: true,
        lowStockAt: true,
        outOfStock: true,
        sizeMm: true,
        category: { select: { name: true } },
        farm: { select: { name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { quantity: 'asc' },
      take: 500,
    });
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const sold = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { in: rows.map((r) => r.id) }, order: { placedAt: { gte: since }, status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED', 'RETURNED'] } } },
      _sum: { quantity: true },
    });
    const soldBy = new Map(sold.map((s) => [s.productId, s._sum.quantity ?? 0]));
    const items = rows
      .map((r) => {
        const level = r.lowStockAt ?? cfg.defaultThreshold;
        const sold30 = soldBy.get(r.id) ?? 0;
        const low = r.outOfStock || r.quantity <= level;
        // Make enough to cover a month like the last one, and at least back above the alert level.
        const suggest = low ? Math.max(sold30, level + 1 - r.quantity, 1) : 0;
        return { ...r, sizeMm: r.sizeMm ? Number(r.sizeMm) : null, level, sold30, low, suggest };
      })
      .filter((r) => all === 'true' || r.low);
    return { items, defaultThreshold: cfg.defaultThreshold };
  }
}

