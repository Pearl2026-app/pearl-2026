import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { email, indianMobile } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires, Roles } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { validate } from '../../common/validate';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CARD_SELECT, toCard } from '../public/catalogue.public';

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');

/**
 * Business (B2B) buyers (meeting of 19 Oct): a shop or reseller registers, head office approves them, and from then
 * on they see business prices with a minimum order quantity, and pieces kept only for business buyers.
 */
@ApiTags('account')
@Roles('CUSTOMER')
@Controller('me/business')
export class BusinessAccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly notifications: NotificationsService,
    private readonly enquiries: EnquiriesService,
  ) {}

  private cid(user: AuthUser) {
    if (!user.customerId) throw notFound('Account');
    return user.customerId;
  }

  @Get()
  async status(@CurrentUser() user: AuthUser) {
    const c = await this.prisma.customer.findUnique({
      where: { id: this.cid(user) },
      select: {
        b2bStatus: true,
        businessName: true,
        businessGstin: true,
        b2bAppliedAt: true,
        b2bNote: true,
        shopName: true,
        shopAddress: true,
        b2bContactPhone: true,
        b2bContactEmail: true,
        user: { select: { phone: true, email: true } },
      },
    });
    if (!c) return c;
    const { user: u, ...rest } = c;
    // Defaults for the form: the account's own phone and email.
    return { ...rest, accountPhone: u.phone, accountEmail: u.email };
  }

  @Post('apply')
  @HttpCode(200)
  async apply(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const d = validate(
      z.object({
        businessName: z.string().trim().min(2).max(160),
        gstin,
        shopName: z.string().trim().min(2, 'Enter the shop name').max(160),
        shopAddress: z.string().trim().min(10, 'Enter the full shop address').max(500),
        contactPhone: indianMobile,
        contactEmail: email.optional().nullable().or(z.literal('').transform(() => null)),
        note: z.string().trim().max(500).optional().nullable(),
      }),
      body,
    );
    const id = this.cid(user);
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id }, select: { b2bStatus: true, userId: true, user: { select: { name: true, email: true } } } });
    if (c.b2bStatus === 'APPROVED') throw badRequest('ALREADY_APPROVED', 'Your business account is already approved.');
    await this.prisma.customer.update({
      where: { id },
      data: {
        b2bStatus: 'PENDING',
        businessName: d.businessName,
        businessGstin: d.gstin,
        shopName: d.shopName,
        shopAddress: d.shopAddress,
        b2bContactPhone: d.contactPhone,
        b2bContactEmail: d.contactEmail ?? null,
        b2bNote: d.note ?? null,
        b2bAppliedAt: new Date(),
      },
    });
    await this.audit.record('Customer', id, 'B2B_APPLY', undefined, { businessName: d.businessName, shopName: d.shopName });
    // Head office is emailed about every business application, with the details (client doc, 26 Oct; meeting 4 Nov).
    await this.jobs.add('customer.registered', { customerId: id, kind: 'B2B' });
    // ...and the applicant hears that we are verifying them (meeting, 4 Nov).
    const to = d.contactEmail ?? c.user.email;
    if (to) {
      await this.notifications.send({
        templateKey: 'B2B_APPLIED',
        vars: { name: c.user.name.split(' ')[0], businessName: d.businessName, shopName: d.shopName },
        to: { email: to },
        userId: c.userId,
        context: { customerId: id },
      });
    }
    return { ok: true, message: "Thanks for applying. We're verifying your details — you'll get an email once approved." };
  }

  /**
   * Asking for more than is in stock (meeting, 4 Nov): the buyer adds what there is to the cart, and the rest becomes
   * a bulk enquiry that head office follows up by phone.
   */
  @Post('request-more')
  @HttpCode(200)
  async requestMore(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const d = validate(
      z.object({
        productId: z.string().min(1).max(40),
        /** The total quantity they wanted */
        quantity: z.number().int().min(1).max(1_000_000),
        phone: indianMobile.optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      }),
      body,
    );
    const id = this.cid(user);
    const c = await this.prisma.customer.findUnique({
      where: { id },
      select: { b2bStatus: true, businessName: true, shopName: true, cityId: true, b2bContactPhone: true, b2bContactEmail: true, user: { select: { name: true, phone: true, email: true } } },
    });
    if (c?.b2bStatus !== 'APPROVED') throw forbidden('Your business account is not approved yet.');
    const p = await this.prisma.product.findFirst({
      where: { id: d.productId, status: 'PUBLISHED', archivedAt: null },
      select: { id: true, name: true, sku: true, quantity: true, stockType: true, soldAt: true, outOfStock: true },
    });
    if (!p) throw badRequest('INVALID_PRODUCT', 'That piece is not available.');
    const inStock = p.outOfStock || (p.stockType === 'UNIQUE' && p.soldAt) ? 0 : Math.max(0, p.quantity);
    const remaining = d.quantity - inStock;
    if (remaining <= 0) throw badRequest('IN_STOCK', `We have ${inStock} in stock: add them to your cart.`);
    const phone = d.phone ?? c.b2bContactPhone ?? c.user.phone;
    const who = c.shopName || c.businessName || c.user.name;
    const r = await this.enquiries.create(
      {
        type: 'BULK',
        productId: p.id,
        source: 'business-catalogue',
        pageUrl: `${config().WEB_URL}/account/business`,
        cityId: c.cityId,
        name: c.user.name,
        phone,
        email: c.b2bContactEmail ?? c.user.email,
        message: `${who} (business buyer) wants ${d.quantity} × ${p.name} (${p.sku}); ${inStock} in stock, so ${remaining} more are needed. Please call them on ${phone ?? 'the number on their account'}.${d.note ? ` Note: ${d.note}` : ''}`,
        payload: { requestedQuantity: d.quantity, availableQuantity: inStock, remainingQuantity: remaining, businessName: c.businessName, shopName: c.shopName, phone },
      },
      user,
    );
    await this.audit.record('Customer', id, 'B2B_REQUEST_MORE', undefined, { productId: p.id, requested: d.quantity, remaining, enquiry: r.reference });
    return { ok: true, reference: r.reference, remaining, message: "We'll call you about the remaining quantity." };
  }

  /** The business catalogue: pieces with a business price, and business-only pieces. Approved buyers only. */
  @Get('products')
  async products(@CurrentUser() user: AuthUser) {
    const c = await this.prisma.customer.findUnique({ where: { id: this.cid(user) }, select: { b2bStatus: true } });
    if (c?.b2bStatus !== 'APPROVED') throw forbidden('Your business account is not approved yet.');
    const rows = await this.prisma.product.findMany({
      where: {
        status: 'PUBLISHED',
        archivedAt: null,
        OR: [{ b2bPricePaise: { not: null } }, { b2bOnly: true }],
      },
      select: { ...CARD_SELECT, b2bPricePaise: true, b2bMinQty: true, b2bOnly: true },
      orderBy: [{ b2bOnly: 'desc' }, { publishedAt: 'desc' }],
      take: 200,
    });
    return {
      items: rows.map(({ b2bPricePaise, b2bMinQty, b2bOnly, ...p }) => {
        const card = toCard(p);
        return {
          ...card,
          b2bPricePaise: b2bPricePaise ?? (p.priceOnRequest ? null : p.pricePaise),
          b2bMinQty: b2bMinQty ?? 1,
          b2bOnly,
          /** Business buyers see how many there are, so they can ask for the rest (meeting, 4 Nov) */
          inStock: card.available ? (card.isUnique ? 1 : p.quantity) : 0,
        };
      }),
    };
  }

  /** The business price of one piece, for the product page (approved buyers only; others get null). */
  @Get('price/:productId')
  async price(@CurrentUser() user: AuthUser, @Param('productId') productId: string) {
    const c = await this.prisma.customer.findUnique({ where: { id: this.cid(user) }, select: { b2bStatus: true } });
    if (c?.b2bStatus !== 'APPROVED') return { price: null };
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { b2bPricePaise: true, b2bMinQty: true } });
    return { price: p?.b2bPricePaise ?? null, minQty: p?.b2bMinQty ?? 1 };
  }
}

@ApiTags('customers')
@Controller('admin/business-buyers')
export class BusinessBuyersAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get()
  @Requires('USERS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    if (!['SUPER_ADMIN', 'STAFF'].includes(user.role)) throw forbidden('Head office only.');
    const rows = await this.prisma.customer.findMany({
      where: { b2bStatus: status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status : { not: 'NONE' } },
      select: {
        id: true,
        b2bStatus: true,
        businessName: true,
        businessGstin: true,
        b2bNote: true,
        b2bAppliedAt: true,
        shopName: true,
        shopAddress: true,
        b2bContactPhone: true,
        b2bContactEmail: true,
        user: { select: { name: true, phone: true, email: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { b2bAppliedAt: 'desc' },
      take: 200,
    });
    return { items: rows };
  }

  /** What business buyers see: every piece with a business price or kept for the trade, with its minimum quantity. */
  @Get('price-list')
  @Requires('PRODUCTS', 'view')
  async priceList(@CurrentUser() user: AuthUser, @Query('q') q?: string, @Query('page') page = '1') {
    if (!['SUPER_ADMIN', 'STAFF'].includes(user.role)) throw forbidden('Head office only.');
    const pageSize = 50;
    const p = Math.max(1, Number(page) || 1);
    const where = {
      status: 'PUBLISHED' as const,
      archivedAt: null,
      OR: [{ b2bPricePaise: { not: null } }, { b2bOnly: true }],
      ...(q ? { AND: [{ OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { sku: { contains: q, mode: 'insensitive' as const } }] }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: { id: true, name: true, sku: true, pricePaise: true, b2bPricePaise: true, b2bMinQty: true, b2bOnly: true, quantity: true, category: { select: { name: true } } },
        orderBy: [{ b2bOnly: 'desc' }, { publishedAt: 'desc' }],
        skip: (p - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items: rows.map((r) => ({ ...r, b2bMinQty: r.b2bMinQty ?? 1 })), total, page: p, pageSize };
  }

  @Post(':customerId/:decision')
  @HttpCode(200)
  @Requires('USERS', 'edit')
  async decide(@CurrentUser() user: AuthUser, @Param('customerId') id: string, @Param('decision') decision: string) {
    if (!['SUPER_ADMIN', 'STAFF'].includes(user.role)) throw forbidden('Head office only.');
    if (decision !== 'approve' && decision !== 'reject') throw notFound('Action');
    const c = await this.prisma.customer.findUnique({
      where: { id },
      select: { b2bStatus: true, businessName: true, shopName: true, b2bContactEmail: true, userId: true, user: { select: { name: true, email: true } } },
    });
    if (!c || c.b2bStatus === 'NONE') throw notFound('Business application');
    const b2bStatus = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    await this.prisma.customer.update({ where: { id }, data: { b2bStatus } });
    await this.audit.record('Customer', id, decision === 'approve' ? 'B2B_APPROVE' : 'B2B_REJECT', { b2bStatus: c.b2bStatus }, { b2bStatus });
    // The buyer is told they are registered, with a link to the business catalogue (meeting, 4 Nov).
    const to = c.b2bContactEmail ?? c.user.email;
    if (decision === 'approve' && c.b2bStatus !== 'APPROVED' && to) {
      await this.notifications.send({
        templateKey: 'B2B_APPROVED',
        vars: { name: c.user.name.split(' ')[0], businessName: c.businessName ?? c.shopName ?? '', catalogueUrl: `${config().WEB_URL}/account/business` },
        to: { email: to },
        userId: c.userId,
        context: { customerId: id },
      });
    }
    return { ok: true };
  }
}
