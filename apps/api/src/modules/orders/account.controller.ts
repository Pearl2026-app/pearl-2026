import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { addressInput, email, formatINR, wishlistShareText, waMeUrl } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Roles } from '../../common/decorators';
import { badRequest, conflict, notFound } from '../../common/errors';
import { listQuery, paginate } from '../../common/list';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { CARD_SELECT, toCard } from '../public/catalogue.public';
import { OrdersService } from './orders.service';

/** Everything a signed-in customer can see and do with their own data (scope: self). */
@ApiTags('account')
@Controller('me')
@Roles('CUSTOMER')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  private cid(user: AuthUser) {
    if (!user.customerId) throw notFound('Account');
    return user.customerId;
  }

  /**
   * Delete my account (required by the app stores). Personal details are erased at once and the person is
   * signed out everywhere. Past orders and their invoices are kept (with the billing name and address on
   * them) because tax law requires it. Refused while an order is still on its way: delivery needs the contact.
   */
  @Post('delete-account')
  @HttpCode(200)
  async deleteAccount(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) }))) _dto: { confirm: 'DELETE' }) {
    const customerId = this.cid(user);
    const open = await this.prisma.order.count({ where: { customerId, status: { notIn: ['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'] }, archivedAt: null } });
    if (open) throw conflict('ACTIVE_ORDERS', 'You have an order on its way. Please wait until it is delivered or cancelled, or ask us on WhatsApp.');
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { name: 'Deleted customer', email: null, phone: null, isActive: false } });
      await tx.customer.update({ where: { id: customerId }, data: { archivedAt: now } });
      await tx.address.updateMany({ where: { customerId }, data: { name: 'Deleted', phone: '', line1: '—', line2: null, landmark: null, area: null, label: null, archivedAt: now } });
      await tx.wishlistItem.deleteMany({ where: { customerId } });
      await tx.cart.updateMany({ where: { customerId }, data: { contactName: null, contactPhone: null } });
      await tx.enquiry.updateMany({ where: { customerId }, data: { contactName: null, contactPhone: null, contactEmail: null } });
      await tx.deviceToken.deleteMany({ where: { userId: user.id } });
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      if (u.email) await tx.newsletterSubscriber.deleteMany({ where: { email: u.email.toLowerCase() } });
      await this.audit.record('Customer', customerId, 'DELETE_ACCOUNT', null, { erasedAt: now }, tx);
    });
    return { deleted: true };
  }

  @Patch('profile')
  async profile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(z.object({ name: z.string().trim().min(2).max(120).optional(), email: email.optional().nullable(), cityId: z.string().nullable().optional(), preferredPaymentMethod: z.enum(['ONLINE', 'COD']).nullable().optional() })))
    dto: { name?: string; email?: string | null; cityId?: string | null; preferredPaymentMethod?: 'ONLINE' | 'COD' | null },
  ) {
    if (dto.email) {
      const taken = await this.prisma.user.findFirst({ where: { email: dto.email, NOT: { id: user.id } } });
      if (taken) throw badRequest('EMAIL_IN_USE', 'That email is already in use.', { email: 'Already in use' });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { name: dto.name, email: dto.email } });
    await this.prisma.customer.update({ where: { id: this.cid(user) }, data: { cityId: dto.cityId, preferredPaymentMethod: dto.preferredPaymentMethod } });
    return { ok: true };
  }

  // ── Addresses ──
  @Get('addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.prisma.address.findMany({ where: { customerId: this.cid(user), archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  }

  @Post('addresses')
  async addAddress(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(addressInput)) dto: z.infer<typeof addressInput>) {
    const customerId = this.cid(user);
    const count = await this.prisma.address.count({ where: { customerId, archivedAt: null } });
    if (count >= 20) throw badRequest('TOO_MANY', 'You can save up to 20 addresses.');
    const isDefault = dto.isDefault || count === 0;
    if (isDefault) await this.prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return this.prisma.address.create({ data: { ...dto, customerId, isDefault } });
  }

  @Patch('addresses/:id')
  async editAddress(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(addressInput.partial())) dto: Partial<z.infer<typeof addressInput>>) {
    const customerId = this.cid(user);
    const a = await this.prisma.address.findFirst({ where: { id, customerId, archivedAt: null } });
    if (!a) throw notFound('Address');
    if (dto.isDefault) await this.prisma.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    return this.prisma.address.update({ where: { id }, data: dto });
  }

  @Delete('addresses/:id')
  async removeAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const a = await this.prisma.address.findFirst({ where: { id, customerId: this.cid(user), archivedAt: null } });
    if (!a) throw notFound('Address');
    await this.prisma.address.update({ where: { id }, data: { archivedAt: new Date(), isDefault: false } });
    return { ok: true };
  }

  // ── Wishlist ──
  @Get('wishlist')
  async wishlist(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.wishlistItem.findMany({ where: { customerId: this.cid(user), product: { archivedAt: null, status: 'PUBLISHED' } }, include: { product: { select: CARD_SELECT } }, orderBy: { createdAt: 'desc' } });
    const items = rows.map((r) => toCard(r.product));
    const text = wishlistShareText(items.map((p) => ({ name: p.name, url: `${config().WEB_URL}/product/${p.slug}` })));
    return { items, shareText: text, shareUrl: `https://wa.me/?text=${encodeURIComponent(text)}` };
  }

  @Post('wishlist')
  async addWish(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(z.object({ productId: z.string() }))) dto: { productId: string }) {
    const p = await this.prisma.product.findFirst({ where: { id: dto.productId, status: 'PUBLISHED', archivedAt: null } });
    if (!p) throw notFound('Product');
    await this.prisma.wishlistItem.upsert({ where: { customerId_productId: { customerId: this.cid(user), productId: p.id } }, create: { customerId: this.cid(user), productId: p.id }, update: {} });
    return { ok: true };
  }

  @Delete('wishlist/:productId')
  async removeWish(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    await this.prisma.wishlistItem.deleteMany({ where: { customerId: this.cid(user), productId } });
    return { ok: true };
  }

  @Get('wishlist/ids')
  async wishIds(@CurrentUser() user: AuthUser) {
    return (await this.prisma.wishlistItem.findMany({ where: { customerId: this.cid(user) }, select: { productId: true } })).map((w) => w.productId);
  }

  // ── Referral ──
  @Get('referral')
  async referral(@CurrentUser() user: AuthUser) {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: this.cid(user) }, include: { referralsMade: { include: { referee: { include: { user: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' } } } });
    const s = await this.settings.get('referral');
    const coupons = await this.prisma.coupon.findMany({ where: { customerId: c.id, isActive: true }, select: { code: true, discountValue: true, endsAt: true, description: true, _count: { select: { redemptions: true } } } });
    const link = `${config().WEB_URL}/login?ref=${c.referralCode}`;
    const text = `I shop for pearls at Sahyadri Pearls. Use my code ${c.referralCode} on your first order${s.refereeRewardPaise ? ` and get ${formatINR(s.refereeRewardPaise, { compact: true })} off` : ''}: ${link}`;
    return {
      code: c.referralCode,
      enabled: s.enabled,
      referrerRewardPaise: s.referrerRewardPaise,
      refereeRewardPaise: s.refereeRewardPaise,
      shareText: text,
      shareUrl: waMeUrl('', text).replace('https://wa.me/?', 'https://wa.me/?'),
      referrals: c.referralsMade.map((r) => ({ name: r.referee.user.name.split(' ')[0], joinedAt: r.createdAt, rewarded: !!r.rewardedAt })),
      rewards: coupons.map((x) => ({ code: x.code, amountPaise: x.discountValue, endsAt: x.endsAt, used: x._count.redemptions > 0, description: x.description })),
    };
  }

  // ── Orders ──
  @Get('orders')
  async myOrders(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>) {
    const q = listQuery.parse(raw);
    const where = { customerId: this.cid(user), archivedAt: null };
    return paginate(q, () => this.prisma.order.count({ where }), (skip, take) =>
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip,
        take,
        select: { id: true, number: true, placedAt: true, status: true, paymentStatus: true, paymentMethod: true, totalPaise: true, items: { select: { name: true, imageUrl: true, quantity: true } } },
      }),
    );
  }

  @Get('orders/:number')
  async myOrder(@CurrentUser() user: AuthUser, @Param('number') number: string) {
    const o = await this.prisma.order.findFirst({
      where: { number, customerId: this.cid(user) },
      include: {
        items: true,
        events: { where: { toStatus: { not: null } }, orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
        invoice: { select: { number: true } },
        delivery: { select: { status: true, deliveredAt: true } },
        returnRequests: { orderBy: { createdAt: 'desc' } },
        reviews: { select: { productId: true, rating: true, status: true } },
      },
    });
    if (!o) throw notFound('Order');
    const returns = await this.settings.get('returns');
    const deliveredAt = o.deliveredAt ?? o.delivery?.deliveredAt ?? null;
    const canReturn =
      o.status === 'DELIVERED' && !!deliveredAt && Date.now() - deliveredAt.getTime() <= returns.windowDays * 86400_000 && (o.type !== 'CUSTOMIZED' || returns.customizedReturnable) && !o.returnRequests.some((r) => !['REJECTED', 'CLOSED'].includes(r.status));
    const canCancel = ['PLACED', 'CONFIRMED'].includes(o.status) && !o.returnRequests.some((r) => r.type === 'CANCELLATION' && !['REJECTED', 'CLOSED'].includes(r.status));
    const { internalNote: _i, createdById: _c, attribution: _a, ...safe } = o;
    return { ...safe, trackUrl: this.orders.trackUrl(o.number), canReturn, canCancel, returnWindowDays: returns.windowDays };
  }

  /** Returns and cancellations are requested here and handled by the team. */
  @Post('orders/:number/returns')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('photos', 4, { limits: { fileSize: 10 * 1024 * 1024, files: 4 } }))
  async requestReturn(@CurrentUser() user: AuthUser, @Param('number') number: string, @UploadedFiles() files: Express.Multer.File[] = [], @Body() body: Record<string, string>) {
    const parsed = z.object({ type: z.enum(['RETURN', 'CANCELLATION']), reason: z.string().trim().min(3).max(200), details: z.string().trim().max(2000).optional() }).safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_FAILED', 'Please check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
    const o = (await this.myOrder(user, number)) as Awaited<ReturnType<AccountController['myOrder']>>;
    if (parsed.data.type === 'RETURN' && !o.canReturn) throw badRequest('NOT_RETURNABLE', `Returns are accepted within ${o.returnWindowDays} days of delivery${o.type === 'CUSTOMIZED' ? ', and not for customized pieces' : ''}.`);
    if (parsed.data.type === 'CANCELLATION' && !o.canCancel) throw badRequest('NOT_CANCELLABLE', 'This order can no longer be cancelled online. Please contact us.');
    const photoUrls: string[] = [];
    for (const f of files) photoUrls.push((await this.media.saveImage(f, 'returns')).url);
    const r = await this.prisma.returnRequest.create({ data: { orderId: o.id, customerId: this.cid(user), ...parsed.data, photoUrls } });
    await this.prisma.orderEvent.create({ data: { orderId: o.id, type: 'RETURN_REQUESTED', message: `${parsed.data.type === 'RETURN' ? 'Return' : 'Cancellation'} requested: ${parsed.data.reason}` } });
    return r;
  }

  @Get('returns')
  returns(@CurrentUser() user: AuthUser) {
    return this.prisma.returnRequest.findMany({ where: { customerId: this.cid(user) }, orderBy: { createdAt: 'desc' }, include: { order: { select: { number: true } }, refunds: { select: { amountPaise: true, status: true } } } });
  }

  /** Reviews only for pieces actually delivered to this customer; moderated before they show. */
  @Post('reviews')
  @HttpCode(201)
  async review(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(z.object({ orderNumber: z.string(), productId: z.string(), rating: z.number().int().min(1).max(5), title: z.string().trim().max(120).optional(), body: z.string().trim().max(3000).optional() })))
    dto: { orderNumber: string; productId: string; rating: number; title?: string; body?: string },
  ) {
    const o = await this.prisma.order.findFirst({ where: { number: dto.orderNumber, customerId: this.cid(user), status: 'DELIVERED', items: { some: { productId: dto.productId } } } });
    if (!o) throw badRequest('NOT_DELIVERED', 'You can review pieces after they are delivered to you.');
    const existing = await this.prisma.review.findFirst({ where: { productId: dto.productId, customerId: this.cid(user), orderId: o.id } });
    if (existing) throw badRequest('ALREADY_REVIEWED', 'You have already reviewed this piece.');
    return this.prisma.review.create({ data: { productId: dto.productId, customerId: this.cid(user), orderId: o.id, rating: dto.rating, title: dto.title, body: dto.body } });
  }

  @Post('orders/:number/cancel-unpaid')
  @HttpCode(200)
  async cancelUnpaid(@CurrentUser() user: AuthUser, @Param('number') number: string) {
    const o = await this.prisma.order.findFirst({ where: { number, customerId: this.cid(user) } });
    if (!o) throw notFound('Order');
    if (o.status !== 'PLACED' || o.paymentStatus !== 'PENDING') throw badRequest('NOT_CANCELLABLE', 'Use a cancellation request for this order.');
    await this.orders.transition(null, o.id, 'CANCELLED', { reason: 'Cancelled by customer before payment', system: true });
    await this.audit.record('Order', o.id, 'CUSTOMER_CANCEL');
    return { ok: true };
  }
}
