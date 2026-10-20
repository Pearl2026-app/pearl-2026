import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires, Roles } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
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
  ) {}

  private cid(user: AuthUser) {
    if (!user.customerId) throw notFound('Account');
    return user.customerId;
  }

  @Get()
  async status(@CurrentUser() user: AuthUser) {
    const c = await this.prisma.customer.findUnique({
      where: { id: this.cid(user) },
      select: { b2bStatus: true, businessName: true, businessGstin: true, b2bAppliedAt: true, b2bNote: true },
    });
    return c;
  }

  @Post('apply')
  @HttpCode(200)
  async apply(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const d = z
      .object({ businessName: z.string().trim().min(2).max(160), gstin, note: z.string().trim().max(500).optional().nullable() })
      .parse(body);
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: this.cid(user) }, select: { b2bStatus: true } });
    if (c.b2bStatus === 'APPROVED') throw badRequest('ALREADY_APPROVED', 'Your business account is already approved.');
    await this.prisma.customer.update({
      where: { id: this.cid(user) },
      data: { b2bStatus: 'PENDING', businessName: d.businessName, businessGstin: d.gstin, b2bNote: d.note ?? null, b2bAppliedAt: new Date() },
    });
    await this.audit.record('Customer', this.cid(user), 'B2B_APPLY', undefined, { businessName: d.businessName });
    return { ok: true };
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
      items: rows.map(({ b2bPricePaise, b2bMinQty, b2bOnly, ...p }) => ({
        ...toCard(p),
        b2bPricePaise: b2bPricePaise ?? (p.priceOnRequest ? null : p.pricePaise),
        b2bMinQty: b2bMinQty ?? 1,
        b2bOnly,
      })),
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
        user: { select: { name: true, phone: true, email: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { b2bAppliedAt: 'desc' },
      take: 200,
    });
    return { items: rows };
  }

  @Post(':customerId/:decision')
  @HttpCode(200)
  @Requires('USERS', 'edit')
  async decide(@CurrentUser() user: AuthUser, @Param('customerId') id: string, @Param('decision') decision: string) {
    if (!['SUPER_ADMIN', 'STAFF'].includes(user.role)) throw forbidden('Head office only.');
    if (decision !== 'approve' && decision !== 'reject') throw notFound('Action');
    const c = await this.prisma.customer.findUnique({ where: { id }, select: { b2bStatus: true } });
    if (!c || c.b2bStatus === 'NONE') throw notFound('Business application');
    const b2bStatus = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    await this.prisma.customer.update({ where: { id }, data: { b2bStatus } });
    await this.audit.record('Customer', id, decision === 'approve' ? 'B2B_APPROVE' : 'B2B_REJECT', { b2bStatus: c.b2bStatus }, { b2bStatus });
    return { ok: true };
  }
}
