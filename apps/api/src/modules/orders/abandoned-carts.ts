import { Controller, Get, HttpCode, Injectable, Logger, OnModuleInit, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { formatINR } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires, Roles } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { listQuery, paginate } from '../../common/list';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Carts older than this are not chased. */
const MAX_AGE_DAYS = 7;

const CART_INCLUDE = {
  items: { include: { product: { select: { name: true, sku: true, pricePaise: true, priceOnRequest: true } } } },
  customer: { select: { user: { select: { name: true, phone: true, email: true } } } },
} satisfies Prisma.CartInclude;
type CartRow = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;

const contactOf = (c: CartRow) => ({ name: c.customer?.user.name ?? c.contactName ?? null, phone: c.customer?.user.phone ?? c.contactPhone ?? null, email: c.customer?.user.email ?? null });
const valueOf = (c: CartRow) => c.items.reduce((s, i) => s + (i.product.priceOnRequest ? 0 : i.product.pricePaise * i.quantity), 0);

/** One WhatsApp (and email) reminder with a link back to the cart, after the delay set in Settings. */
@Injectable()
export class AbandonedCartService implements OnModuleInit {
  private readonly log = new Logger('AbandonedCarts');
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('carts.remind', async () => {
      await this.sweep();
    });
    this.jobs.repeat('carts.remind', 10 * 60_000);
  }

  /** A guest cart is reopened by its token; an account's cart appears after sign-in. */
  cartUrl(c: { guestToken: string | null; customerId: string | null }) {
    const web = config().WEB_URL;
    return !c.customerId && c.guestToken ? `${web}/cart/restore?c=${encodeURIComponent(c.guestToken)}` : `${web}/cart`;
  }

  dueWhere(delayMinutes: number, now = new Date()): Prisma.CartWhereInput {
    return {
      convertedOrderId: null,
      reminderSentAt: null,
      items: { some: {} },
      lastActivityAt: { lte: new Date(now.getTime() - delayMinutes * 60_000), gte: new Date(now.getTime() - MAX_AGE_DAYS * 86400_000) },
      OR: [{ contactPhone: { not: null } }, { customer: { user: { phone: { not: null } } } }],
    };
  }

  async sweep(now = new Date()): Promise<number> {
    const s = await this.settings.get('cart_reminder');
    if (!s.enabled) return 0;
    const carts = await this.prisma.cart.findMany({ where: this.dueWhere(s.delayMinutes, now), include: CART_INCLUDE, take: 200 });
    let sent = 0;
    for (const c of carts) {
      try {
        if (await this.remind(c)) sent++;
      } catch (e) {
        this.log.warn(`Cart reminder ${c.id} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  /** Returns false when the shopper already ordered since (no reminder then). */
  async remind(c: CartRow, opts: { force?: boolean } = {}) {
    const contact = contactOf(c);
    if (!contact.phone) throw badRequest('NO_CONTACT', 'This cart has no phone number to remind.');
    // Claim the cart first, so two workers never send twice.
    const claimed = await this.prisma.cart.updateMany({ where: { id: c.id, ...(opts.force ? {} : { reminderSentAt: null }) }, data: { reminderSentAt: new Date() } });
    if (!claimed.count) return false;
    const orderedSince = await this.prisma.order.count({ where: { contactPhone: contact.phone, placedAt: { gte: c.lastActivityAt }, status: { notIn: ['FAILED', 'CANCELLED'] } } });
    if (orderedSince && !opts.force) return false;
    await this.notifications.send({
      templateKey: 'CART_REMINDER',
      vars: { name: (contact.name ?? 'there').split(' ')[0]!, cartUrl: this.cartUrl(c), items: c.items.map((i) => i.product.name).join(', '), total: formatINR(valueOf(c), { compact: true }) },
      to: { whatsapp: contact.phone, email: contact.email },
      context: { cartId: c.id },
    });
    return true;
  }
}

@ApiTags('orders')
@Controller('admin/abandoned-carts')
@Roles('SUPER_ADMIN', 'STAFF')
export class AbandonedCartsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: AbandonedCartService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Requires('ORDERS', 'view')
  async list(@Query() raw: Record<string, string>) {
    const q = listQuery.extend({ reminded: z.enum(['true', 'false']).optional() }).parse(raw);
    const where: Prisma.CartWhereInput = {
      convertedOrderId: null,
      items: { some: {} },
      lastActivityAt: { lte: new Date(Date.now() - 30 * 60_000), gte: new Date(Date.now() - 30 * 86400_000) },
      ...(q.reminded === 'true' ? { reminderSentAt: { not: null } } : q.reminded === 'false' ? { reminderSentAt: null } : {}),
    };
    const page = await paginate(q, () => this.prisma.cart.count({ where }), (skip, take) => this.prisma.cart.findMany({ where, include: CART_INCLUDE, orderBy: { lastActivityAt: 'desc' }, skip, take }));
    return {
      ...page,
      items: page.items.map((c) => ({ id: c.id, lastActivityAt: c.lastActivityAt, reminderSentAt: c.reminderSentAt, contact: contactOf(c), valuePaise: valueOf(c), items: c.items.map((i) => ({ name: i.product.name, sku: i.product.sku, quantity: i.quantity })), isGuest: !c.customerId })),
    };
  }

  @Post(':id/remind')
  @HttpCode(200)
  @Requires('ORDERS', 'edit')
  async remind(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.cart.findFirst({ where: { id, convertedOrderId: null, items: { some: {} } }, include: CART_INCLUDE });
    if (!c) throw notFound('Cart');
    await this.carts.remind(c, { force: true });
    await this.audit.record('Cart', id, 'REMIND', undefined, { by: user.id });
    return { sent: true };
  }
}
