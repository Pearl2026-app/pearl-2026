import { Controller, Get, Injectable, Logger, OnModuleInit, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { productScope } from '../../common/scope';
import { formatPoNumber, SequenceService } from '../../common/sequence.service';
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
    private readonly sequences: SequenceService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('stock.low', (d: { productId: string; before: number; after: number }) => this.check(d));
  }

  async check(d: { productId: string; before: number; after: number }) {
    const cfg = await this.settings.get('stock_alert');
    if (!cfg.enabled) return;
    const p = await this.prisma.product.findUnique({
      where: { id: d.productId },
      select: { id: true, name: true, sku: true, quantity: true, lowStockAt: true, stockType: true, labourCostPaise: true, metal: true, sizeMm: true, vendor: { select: { name: true, email: true, phone: true } } },
    });
    if (!p || p.stockType !== 'QUANTITY') return;
    // Below the auto-PO level, a draft purchase order is raised by itself (client doc, 26 Oct).
    if (cfg.autoPoBelow > 0 && d.after < cfg.autoPoBelow && d.before >= cfg.autoPoBelow) await this.autoPo(p, cfg.autoPoBelow);
    const level = p.lowStockAt ?? cfg.defaultThreshold;
    // Only when this sale crossed the level, so one piece does not send an alert on every later sale.
    if (!(d.before > level && d.after <= level)) return;
    const vars = { productName: p.name, sku: p.sku, quantity: p.quantity, level, restockUrl: `${config().ADMIN_URL}/restock` };
    const store = await this.settings.get('store');
    const cities = await this.prisma.productCity.findMany({ where: { productId: p.id }, select: { cityId: true } });
    const [admins, makers, franchises] = await Promise.all([
      this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true, email: { not: null } }, select: { email: true } }),
      this.prisma.manufacturer.findMany({ where: { isActive: true }, select: { email: true, phone: true } }),
      // Franchises selling in the piece's cities (every franchise when the piece is sold everywhere).
      this.prisma.franchise.findMany({
        where: { isActive: true, email: { not: null }, ...(cities.length ? { OR: [{ cityId: { in: cities.map((c) => c.cityId) } }, { cities: { some: { cityId: { in: cities.map((c) => c.cityId) } } } }] } : {}) },
        select: { email: true },
      }),
    ]);
    const emails = new Set(
      [store.email, cfg.alertEmail, p.vendor?.email, ...admins.map((a) => a.email), ...makers.map((m) => m.email), ...franchises.map((f) => f.email)].filter(
        (x): x is string => !!x,
      ),
    );
    for (const email of emails) await this.notifications.send({ templateKey: 'LOW_STOCK', vars, to: { email }, context: { productId: p.id } });
    for (const m of makers) if (m.phone) await this.notifications.send({ templateKey: 'LOW_STOCK', vars, to: { whatsapp: m.phone }, context: { productId: p.id } });
    this.log.log(`${p.sku} is down to ${p.quantity} (alert level ${level}); ${emails.size} alerts sent.`);
  }

  /** Raise a draft PO for the piece — once; a PO already open for it (auto or manual) means nothing to do. */
  private async autoPo(p: { id: string; name: string; sku: string; quantity: number; labourCostPaise: number | null; metal: string | null; sizeMm: unknown }, below: number) {
    try {
      const open = await this.prisma.purchaseOrder.findFirst({ where: { productId: p.id, status: { in: ['DRAFT', 'SENT', 'ACCEPTED', 'IN_PRODUCTION'] } }, select: { id: true } });
      if (open) return;
      const maker = await this.prisma.manufacturer.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
      const admin = await this.prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true }, orderBy: { createdAt: 'asc' } });
      if (!maker || !admin) return;
      const qty = Math.max(below - p.quantity, 1);
      const year = new Date().getFullYear();
      const dueDate = new Date(Date.now() + 14 * 24 * 3600_000);
      const po = await this.prisma.$transaction(async (tx) => {
        const n = await this.sequences.next(`po:${year}`, tx);
        return tx.purchaseOrder.create({
          data: {
            number: formatPoNumber(year, n),
            manufacturerId: maker.id,
            productId: p.id,
            specification: `${qty} × ${p.name} (${p.sku})${p.metal ? `\nMetal: ${p.metal}` : ''}${p.sizeMm ? `\nPearl: ${Number(p.sizeMm)} mm` : ''}\nRaised automatically — stock fell below ${below}. As per the catalogue specification.`,
            quantity: qty,
            agreedCostPaise: (p.labourCostPaise ?? 0) * qty,
            dueDate,
            status: 'DRAFT',
            autoGenerated: true,
            createdById: admin.id,
            notes: 'Auto-generated by the low-stock watcher. Review the cost and send it.',
          },
        });
      });
      const admins = await this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true, email: { not: null } }, select: { email: true } });
      const vars = { number: po.number, productName: p.name, sku: p.sku, quantity: qty, manufacturer: maker.name, poUrl: `${config().ADMIN_URL}/purchase-orders/${po.id}` };
      for (const a of admins) await this.notifications.send({ templateKey: 'PO_AUTO', vars, to: { email: a.email! }, context: { purchaseOrderId: po.id } });
      this.log.log(`Auto-PO ${po.number} raised for ${p.sku} (${qty} pcs) with ${maker.name}.`);
    } catch (e) {
      this.log.error(`Auto-PO for ${p.sku} failed: ${(e as Error).message}`);
    }
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
        sizes: true,
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
      by: ['productId', 'size'],
      where: { productId: { in: rows.map((r) => r.id) }, order: { placedAt: { gte: since }, status: { notIn: ['CANCELLED', 'FAILED', 'REFUNDED', 'RETURNED'] } } },
      _sum: { quantity: true },
    });
    const soldBy = new Map<string, number>();
    const soldBySize = new Map<string, number>();
    for (const x of sold) {
      soldBy.set(x.productId!, (soldBy.get(x.productId!) ?? 0) + (x._sum.quantity ?? 0));
      if (x.size) soldBySize.set(`${x.productId}:${x.size}`, (soldBySize.get(`${x.productId}:${x.size}`) ?? 0) + (x._sum.quantity ?? 0));
    }
    const items = rows
      .map((r) => {
        const level = r.lowStockAt ?? cfg.defaultThreshold;
        const sold30 = soldBy.get(r.id) ?? 0;
        const low = r.outOfStock || r.quantity <= level;
        // Make enough to cover a month like the last one, and at least back above the alert level.
        const suggest = low ? Math.max(sold30, level + 1 - r.quantity, 1) : 0;
        // Rings and bangles: what to make per size (meeting of 19 Oct).
        const perSize = Array.isArray(r.sizes)
          ? (r.sizes as Array<{ label: string; quantity: number }>).map((x) => {
              const sSold = soldBySize.get(`${r.id}:${x.label}`) ?? 0;
              return { label: x.label, quantity: x.quantity, sold30: sSold, suggest: low ? Math.max(sSold, x.quantity === 0 ? 1 : 0) : 0 };
            })
          : null;
        return { ...r, sizes: undefined, sizeMm: r.sizeMm ? Number(r.sizeMm) : null, level, sold30, low, suggest, perSize };
      })
      .filter((r) => all === 'true' || r.low);
    return { items, defaultThreshold: cfg.defaultThreshold };
  }
}

