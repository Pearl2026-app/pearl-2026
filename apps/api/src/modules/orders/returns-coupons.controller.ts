import { Body, Controller, Get, HttpCode, Injectable, OnModuleInit, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { formatINR, paise } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { crudController } from '../../common/crud';
import { sendCsv } from '../../common/csv';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { between, listQuery, orderBy, paginate } from '../../common/list';
import { orderScope, paymentScope, returnScope } from '../../common/scope';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { AuthService } from '../../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { StockService } from './stock.service';

const RETURN_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'RECEIVED', 'REFUNDED', 'CLOSED'] as const;
const NEXT: Record<string, string[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PICKUP_SCHEDULED', 'RECEIVED', 'REFUNDED', 'CLOSED'],
  PICKUP_SCHEDULED: ['PICKED_UP', 'CLOSED'],
  PICKED_UP: ['RECEIVED'],
  RECEIVED: ['REFUNDED', 'CLOSED'],
  REFUNDED: ['CLOSED'],
  REJECTED: [],
  CLOSED: [],
};

@ApiTags('returns')
@Controller('admin/returns')
export class ReturnsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @Requires('RETURNS', 'view')
  list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>) {
    const q = listQuery.extend({ status: z.enum(RETURN_STATUSES).optional(), type: z.enum(['RETURN', 'CANCELLATION']).optional() }).parse(raw);
    const where: Prisma.ReturnRequestWhereInput = {
      AND: [returnScope(user), q.status ? { status: q.status } : {}, q.type ? { type: q.type } : {}, q.q ? { order: { number: { contains: q.q, mode: 'insensitive' } } } : {}],
    };
    return paginate(q, () => this.prisma.returnRequest.count({ where }), (skip, take) =>
      this.prisma.returnRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { id: true, number: true, status: true, paymentStatus: true, totalPaise: true, contactName: true, contactPhone: true } }, refunds: { select: { amountPaise: true, status: true } } },
      }),
    );
  }

  @Post(':id/:action')
  @HttpCode(200)
  @Requires('RETURNS', 'edit')
  async act(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('action') action: string,
    @Body(new ZodValidationPipe(z.object({ note: z.string().trim().max(1000).optional(), pickupAt: z.coerce.date().optional(), refundPaise: paise.optional() }))) dto: { note?: string; pickupAt?: Date; refundPaise?: number },
  ) {
    const ACTIONS: Record<string, (typeof RETURN_STATUSES)[number]> = { approve: 'APPROVED', reject: 'REJECTED', schedule: 'PICKUP_SCHEDULED', 'picked-up': 'PICKED_UP', receive: 'RECEIVED', refund: 'REFUNDED', close: 'CLOSED' };
    const to = ACTIONS[action];
    if (!to) throw notFound();
    const r = await this.prisma.returnRequest.findFirst({ where: { AND: [{ id }, returnScope(user)] }, include: { order: true } });
    if (!r) throw notFound('Return request');
    if (!NEXT[r.status]!.includes(to)) throw badRequest('INVALID_STEP', `A ${r.status.toLowerCase()} request cannot move to ${to.toLowerCase()}.`);
    if (to === 'REFUNDED' && user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF') throw forbidden('Only head office can issue refunds.');

    if (to === 'REFUNDED') {
      const amount = dto.refundPaise ?? r.order.totalPaise;
      if (r.order.paymentStatus === 'PAID' || r.order.paymentStatus === 'COD_COLLECTED') {
        await this.payments.refund(user, r.orderId, { amountPaise: amount, reason: `${r.type === 'RETURN' ? 'Return' : 'Cancellation'}: ${r.reason}`, returnRequestId: r.id });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.returnRequest.update({
        where: { id },
        data: { status: to, decisionNote: dto.note ?? undefined, decidedById: ['APPROVED', 'REJECTED'].includes(to) ? user.id : undefined, decidedAt: ['APPROVED', 'REJECTED'].includes(to) ? new Date() : undefined, pickupAt: dto.pickupAt },
      });
      // A received return goes back into stock (a unique piece is on sale again).
      if (to === 'RECEIVED') await this.stock.release(tx, r.orderId, 'returned', { includeConverted: true });
      await tx.orderEvent.create({ data: { orderId: r.orderId, actorId: user.id, type: 'RETURN_UPDATED', message: `${r.type === 'RETURN' ? 'Return' : 'Cancellation'} ${to.toLowerCase().replace('_', ' ')}${dto.note ? `: ${dto.note}` : ''}` } });
      await this.audit.record('ReturnRequest', id, to, { status: r.status }, { status: to, note: dto.note }, tx);
    });
    // Order status follows the request.
    if (r.type === 'CANCELLATION' && to === 'APPROVED') await this.orders.transition(user, r.orderId, 'CANCELLED', { reason: r.reason });
    if (r.type === 'RETURN' && to === 'RECEIVED' && r.order.status === 'DELIVERED') await this.orders.transition(user, r.orderId, 'RETURNED', { reason: r.reason });
    if (to === 'REFUNDED') {
      const o = await this.prisma.order.findUniqueOrThrow({ where: { id: r.orderId } });
      if ((o.status === 'RETURNED' || o.status === 'CANCELLED') && o.paymentStatus === 'REFUNDED') await this.orders.transition(user, r.orderId, 'REFUNDED', { reason: 'Refund completed' }).catch(() => undefined);
    }
    await this.notifications.send({
      templateKey: 'ORDER_STATUS',
      vars: { name: r.order.contactName.split(' ')[0], orderNumber: r.order.number, status: `${r.type === 'RETURN' ? 'return' : 'cancellation'} ${to.toLowerCase().replace('_', ' ')}`, trackUrl: this.orders.trackUrl(r.order.number) },
      to: { whatsapp: r.order.contactPhone, email: r.order.contactEmail },
      context: { orderId: r.orderId },
    });
    return this.prisma.returnRequest.findUnique({ where: { id } });
  }
}

// ── Coupons & offers ─────────────────────────────────────────────
const couponBase = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Use 3–20 letters and digits'),
  description: z.string().trim().max(300).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  discountValue: z.number().int().positive(),
  minOrderPaise: paise.optional(),
  maxDiscountPaise: paise.optional().nullable(),
  firstOrderOnly: z.boolean().optional(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  perCustomerLimit: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  showOnOffersPage: z.boolean().optional(),
  categoryIds: z.array(z.string()).optional(),
  productIds: z.array(z.string()).optional(),
  /** Area offer: valid only for deliveries in this city (empty = anywhere) */
  cityId: z.string().optional().nullable(),
});
const couponCheck = (v: { discountType?: string; discountValue?: number }) => !(v.discountType === 'PERCENT' && v.discountValue != null && v.discountValue > 10_000);
export const CouponsController = crudController({
  path: 'coupons',
  tag: 'coupons',
  model: 'coupon',
  entity: 'Coupon',
  module: 'COUPONS',
  create: couponBase.refine(couponCheck, { message: 'A percentage cannot exceed 100%', path: ['discountValue'] }),
  update: couponBase.partial().refine(couponCheck, { message: 'A percentage cannot exceed 100%', path: ['discountValue'] }),
  searchFields: ['code', 'description'],
  sortFields: ['code', 'createdAt', 'endsAt'],
  defaultSort: { createdAt: 'desc' },
  filters: { isActive: 'boolean', cityId: 'string' },
  include: { city: { select: { id: true, name: true } }, categories: { include: { category: { select: { id: true, name: true } } } }, products: { include: { product: { select: { id: true, name: true, sku: true } } } }, _count: { select: { redemptions: true } } },
  remove: 'deactivate',
  // Vendors and city managers make offers for their own area only and see only those; head office sees all.
  scope: (u: AuthUser) =>
    u.role === 'VENDOR' ? { vendorId: u.vendorId ?? '__none__' } : u.role === 'CITY_MANAGER' ? { cityId: u.cityId ?? '__none__' } : {},
  checkWrite: (u: AuthUser, data: Record<string, unknown>) => {
    if (u.role === 'CITY_MANAGER') {
      if (data.cityId && data.cityId !== u.cityId) throw forbidden('You can make offers only for your city.');
      data.cityId = u.cityId;
    }
    if (u.role === 'VENDOR') {
      if (data.vendorId && data.vendorId !== u.vendorId) throw forbidden('You can change only your own offers.');
      data.vendorId = u.vendorId;
      if (!data.cityId) throw badRequest('CITY_REQUIRED', 'Choose the city this offer is for.', { cityId: 'Required' });
    }
  },
  toData: ({ categoryIds, productIds, ...rest }: any, mode) => ({
    ...rest,
    ...(categoryIds !== undefined ? { categories: mode === 'create' ? { create: categoryIds.map((categoryId: string) => ({ categoryId })) } : { deleteMany: {}, create: categoryIds.map((categoryId: string) => ({ categoryId })) } } : {}),
    ...(productIds !== undefined ? { products: mode === 'create' ? { create: productIds.map((productId: string) => ({ productId })) } : { deleteMany: {}, create: productIds.map((productId: string) => ({ productId })) } } : {}),
  }),
});

const bulkInput = z.object({
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, '2–10 letters and digits'),
  count: z.number().int().min(1).max(2000),
  description: z.string().trim().max(300).optional().nullable(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  discountValue: z.number().int().positive(),
  minOrderPaise: paise.optional(),
  maxDiscountPaise: paise.optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  cityId: z.string().optional().nullable(),
});

@ApiTags('coupons')
@Controller('admin/coupons')
export class CouponUsageController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Printed partner-brand coupons (meeting of 19 Oct): thousands of unique one-use codes in one go, e.g.
   * SILK-7G4K2M, handed out physically and typed in at checkout. Returns a CSV of the codes for the printer.
   */
  @Post('bulk-generate')
  @HttpCode(200)
  @Requires('COUPONS', 'create')
  async bulkGenerate(@CurrentUser() user: AuthUser, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF') throw forbidden('Only head office can generate code batches.');
    const dto = bulkInput.parse(body);
    if (dto.discountType === 'PERCENT' && dto.discountValue > 10_000) throw badRequest('INVALID_PERCENT', 'A percentage cannot exceed 100%.');
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L, so printed codes are unambiguous
    const codes = new Set<string>();
    while (codes.size < dto.count) {
      let c = `${dto.prefix}-`;
      for (let i = 0; i < 6; i++) c += alphabet[Math.floor(Math.random() * alphabet.length)];
      codes.add(c);
    }
    const data = [...codes].map((code) => ({
      code,
      description: dto.description ?? null,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      minOrderPaise: dto.minOrderPaise ?? 0,
      maxDiscountPaise: dto.maxDiscountPaise ?? null,
      endsAt: dto.endsAt ?? null,
      cityId: dto.cityId ?? null,
      usageLimit: 1,
      perCustomerLimit: 1,
      isActive: true,
    }));
    const r = await this.prisma.coupon.createMany({ data, skipDuplicates: true });
    await this.prisma.auditLog.create({ data: { actorId: user.id, entity: 'Coupon', entityId: 'bulk', action: 'BULK_GENERATE', after: { prefix: dto.prefix, count: r.count } as Prisma.InputJsonValue } });
    sendCsv(res, `coupons-${dto.prefix.toLowerCase()}.csv`, [...codes], [{ header: 'code', value: (c: string) => c }]);
  }

  /** Usage per coupon: redemptions, discount given and sales it drove. */
  @Get(':id/usage')
  @Requires('COUPONS', 'view')
  async usage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c) throw notFound('Coupon');
    // Each role sees only redemptions on orders it may see (a city manager: their city).
    const scoped = { couponId: id, order: orderScope(user) };
    const [agg, recent] = await Promise.all([
      this.prisma.couponRedemption.aggregate({ where: scoped, _count: { _all: true }, _sum: { discountPaise: true } }),
      this.prisma.couponRedemption.findMany({ where: scoped, orderBy: { createdAt: 'desc' }, take: 50, include: { order: { select: { id: true, number: true, totalPaise: true, placedAt: true, contactName: true } } } }),
    ]);
    const sales = await this.prisma.order.aggregate({ where: { AND: [{ couponRedemption: { couponId: id }, paymentStatus: { in: ['PAID', 'COD_COLLECTED'] } }, orderScope(user)] }, _sum: { totalPaise: true } });
    return { redemptions: agg._count._all, discountPaise: agg._sum.discountPaise ?? 0, salesPaise: sales._sum.totalPaise ?? 0, usageLimit: c.usageLimit, recent };
  }
}

// ── Payments & COD reconciliation ───────────────────────────────
@ApiTags('payments')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @Requires('PAYMENTS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = listQuery
      .extend({ method: z.enum(['ONLINE', 'COD', 'BANK_TRANSFER', 'OTHER']).optional(), status: z.enum(['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(), unreconciled: z.enum(['true']).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), format: z.enum(['json', 'csv']).optional() })
      .parse(raw);
    const where: Prisma.PaymentWhereInput = {
      AND: [
        paymentScope(user),
        q.method ? { method: q.method } : {},
        q.status ? { status: q.status } : {},
        q.unreconciled ? { method: 'COD', status: 'CAPTURED', reconciledAt: null } : {},
        q.from || q.to ? { createdAt: between(q.from, q.to) } : {},
        q.q ? { OR: [{ order: { number: { contains: q.q, mode: 'insensitive' } } }, { providerPaymentId: { contains: q.q } }] } : {},
      ],
    };
    const include = { order: { select: { id: true, number: true, contactName: true, city: { select: { name: true } }, delivery: { select: { deliveryPartner: { select: { name: true } }, codCollectedPaise: true } } } }, refunds: { select: { amountPaise: true, status: true } } };
    if (q.format === 'csv') {
      const rows = await this.prisma.payment.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100_000 });
      sendCsv(res, 'payments.csv', rows, [
        { header: 'Date', value: (r) => r.createdAt },
        { header: 'Order', value: (r) => r.order.number },
        { header: 'Method', value: (r) => r.method },
        { header: 'Status', value: (r) => r.status },
        { header: 'Amount (₹)', value: (r) => r.amountPaise / 100 },
        { header: 'Gateway payment id', value: (r) => r.providerPaymentId },
        { header: 'Reconciled', value: (r) => r.reconciledAt },
      ]);
      return;
    }
    const page = await paginate(q, () => this.prisma.payment.count({ where }), (skip, take) => this.prisma.payment.findMany({ where, include, orderBy: orderBy(q.sort, ['createdAt', 'amountPaise'], { createdAt: 'desc' }), skip, take }));
    const codOutstanding = await this.prisma.payment.aggregate({ where: { AND: [paymentScope(user), { method: 'COD', status: 'CAPTURED', reconciledAt: null }] }, _sum: { amountPaise: true }, _count: { _all: true } });
    return { ...page, codOutstanding: { count: codOutstanding._count._all, amountPaise: codOutstanding._sum.amountPaise ?? 0 } };
  }

  /** Mark COD cash as received at the office. */
  @Post('reconcile')
  @HttpCode(200)
  @Requires('PAYMENTS', 'edit')
  async reconcile(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(z.object({ paymentIds: z.array(z.string()).min(1).max(500) }))) dto: { paymentIds: string[] }) {
    const r = await this.prisma.payment.updateMany({ where: { AND: [{ id: { in: dto.paymentIds } }, paymentScope(user), { method: 'COD', status: 'CAPTURED', reconciledAt: null }] }, data: { reconciledAt: new Date(), reconciledById: user.id } });
    await this.audit.record('Payment', null, 'RECONCILE', undefined, { paymentIds: dto.paymentIds, count: r.count });
    return { reconciled: r.count };
  }
}

/** After delivery: ask for a review later, and reward referrals on the first delivered order. */
@Injectable()
export class AfterDeliveryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('orders.delivered', (d: { orderId: string }) => this.delivered(d.orderId));
    this.jobs.register('reviews.request', (d: { orderId: string }) => this.requestReview(d.orderId));
  }

  async delivered(orderId: string) {
    const rr = await this.settings.get('review_request');
    if (rr.enabled) await this.jobs.add('reviews.request', { orderId }, { delayMs: rr.delayDays * 86400_000, jobId: `review-${orderId}` });
    await this.rewardReferral(orderId);
  }

  async requestReview(orderId: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: { where: { productId: { not: null } }, take: 1 }, customer: { select: { userId: true } } } });
    if (!o || o.status !== 'DELIVERED' || !o.items[0]) return;
    await this.notifications.send({
      templateKey: 'REVIEW_REQUEST',
      vars: { name: o.contactName.split(' ')[0], productName: o.items[0].name, reviewUrl: `${config().WEB_URL}/account/orders/${encodeURIComponent(o.number)}#review` },
      to: { whatsapp: o.contactPhone, email: o.contactEmail },
      userId: o.customer.userId,
      context: { orderId },
    });
  }

  /** Personal coupons for both sides once the referred customer's first order is delivered. */
  async rewardReferral(orderId: string) {
    const s = await this.settings.get('referral');
    if (!s.enabled) return;
    const o = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!o) return;
    const referral = await this.prisma.referral.findUnique({ where: { refereeId: o.customerId }, include: { referrer: { include: { user: true } }, referee: { include: { user: true } } } });
    if (!referral || referral.rewardedAt) return;
    const delivered = await this.prisma.order.count({ where: { customerId: o.customerId, status: 'DELIVERED' } });
    if (delivered !== 1) return;
    const endsAt = new Date(Date.now() + s.rewardValidDays * 86400_000);
    const make = async (customerId: string, amount: number, label: string) => {
      if (!amount) return null;
      const code = `REF${(await this.auth.uniqueReferralCode(null)).slice(0, 7)}`;
      return this.prisma.coupon.create({ data: { code, customerId, description: label, discountType: 'FLAT', discountValue: amount, usageLimit: 1, perCustomerLimit: 1, endsAt, showOnOffersPage: false } });
    };
    const claimed = await this.prisma.referral.updateMany({ where: { id: referral.id, rewardedAt: null }, data: { rewardedAt: new Date(), qualifyingOrderId: orderId, referrerRewardPaise: s.referrerRewardPaise, refereeRewardPaise: s.refereeRewardPaise } });
    if (claimed.count !== 1) return;
    const a = await make(referral.referrerId, s.referrerRewardPaise, `Referral reward: ${referral.referee.user.name.split(' ')[0]} made their first purchase`);
    const b = await make(referral.refereeId, s.refereeRewardPaise, 'Welcome reward for joining through a referral');
    await this.audit.record('Referral', referral.id, 'REWARD', undefined, { referrerCoupon: a?.code, refereeCoupon: b?.code });
    for (const [c, who] of [[a, referral.referrer], [b, referral.referee]] as const) {
      if (!c) continue;
      await this.notifications.send({ templateKey: 'REFERRAL_REWARD', vars: { name: who.user.name.split(' ')[0], code: c.code, amount: formatINR(c.discountValue, { compact: true }) }, to: { email: who.user.email }, userId: who.userId });
    }
  }
}

