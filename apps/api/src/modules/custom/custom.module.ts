import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { addressInput, email, formatINR, indianMobile, paise, quoteCustom } from '@sahyadri/shared';
import { AuthModule } from '../../auth/auth.module';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { listQuery, orderBy, paginate } from '../../common/list';
import { sendCsv } from '../../common/csv';
import { customRequestScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaModule } from '../media/media.module';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersModule } from '../orders/orders.module';
import { OrdersService } from '../orders/orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';

export const STAGES = ['REQUIREMENT', 'QUOTED', 'ADVANCE_PAID', 'PO_RAISED', 'IN_MANUFACTURING', 'QUALITY_CHECK', 'READY', 'DISPATCHED', 'DELIVERED'] as const;
type Stage = (typeof STAGES)[number];
/** Customized jewellery: GST 3%, HSN 7113 (D10). */
const CUSTOM_GST_BP = 300;
const headOffice = (u: AuthUser) => u.role === 'SUPER_ADMIN' || u.role === 'STAFF';

const details = z.object({
  jewelleryType: z.string().trim().min(2).max(80),
  metal: z.string().trim().max(80).optional().nullable(),
  size: z.string().trim().max(40).optional().nullable(),
  weightGrams: z.number().nonnegative().max(10_000).optional().nullable(),
  pearlDetails: z.string().trim().max(1000).optional().nullable(),
  designNotes: z.string().trim().max(5000).optional().nullable(),
  budgetPaise: paise.optional().nullable(),
  extraNotes: z.string().trim().max(2000).optional().nullable(),
});
const costs = z.object({ metalCostPaise: paise, labourCostPaise: paise, pearlCostPaise: paise, marginPaise: paise });
const createInput = details.extend({
  enquiryId: z.string().optional().nullable(),
  contact: z.object({ name: z.string().trim().min(2).max(120), phone: indianMobile, email: email.optional().nullable() }).optional(),
  cityId: z.string().optional().nullable(),
});
const updateInput = details.partial().extend({ costs: costs.optional() });
const stageInput = z.object({
  stage: z.enum(STAGES),
  note: z.string().trim().max(1000).optional().nullable(),
  // Advance Paid creates the order: the advance, how it was paid, and where it goes.
  advance: z
    .object({
      amountPaise: paise.min(1),
      method: z.enum(['BANK_TRANSFER', 'OTHER', 'COD']),
      reference: z.string().trim().max(120).optional().nullable(),
      address: addressInput,
    })
    .optional(),
});

const DETAIL_INCLUDE = {
  enquiry: { select: { id: true, reference: true, contactName: true, contactPhone: true, contactEmail: true, source: true } },
  customer: { select: { id: true, user: { select: { name: true, phone: true, email: true } } } },
  city: { select: { id: true, name: true } },
  order: { select: { id: true, number: true, status: true, paymentStatus: true, totalPaise: true, payments: { where: { status: 'CAPTURED' }, select: { amountPaise: true } }, purchaseOrders: { orderBy: { createdAt: 'desc' }, include: { manufacturer: { select: { id: true, name: true } } } } } },
} satisfies Prisma.CustomRequestInclude;

/** Costs are commercially sensitive (D38): only head office sees the breakdown. */
function present<T extends Record<string, unknown>>(user: AuthUser, r: T) {
  if (headOffice(user)) return r;
  const { metalCostPaise: _m, labourCostPaise: _l, pearlCostPaise: _p, marginPaise: _g, ...rest } = r;
  return rest;
}

@ApiTags('custom orders')
@Controller('admin/custom-orders')
export class CustomOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async load(user: AuthUser, id: string) {
    const r = await this.prisma.customRequest.findFirst({ where: { AND: [{ id }, customRequestScope(user), { archivedAt: null }] }, include: DETAIL_INCLUDE });
    if (!r) throw notFound('Customized order');
    return r;
  }

  private contactOf(r: Awaited<ReturnType<CustomOrdersController['load']>>) {
    const name = r.customer?.user.name ?? r.enquiry?.contactName ?? null;
    const phone = r.customer?.user.phone ?? r.enquiry?.contactPhone ?? null;
    const mail = r.customer?.user.email ?? r.enquiry?.contactEmail ?? null;
    return { name, phone, email: mail };
  }

  @Get()
  @Requires('CUSTOM_ORDERS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = listQuery.extend({ stage: z.enum(STAGES).optional(), cityId: z.string().optional(), format: z.enum(['json', 'csv']).optional() }).parse(raw);
    const where: Prisma.CustomRequestWhereInput = {
      AND: [
        customRequestScope(user),
        { archivedAt: null },
        q.stage ? { stage: q.stage } : {},
        q.cityId ? { cityId: q.cityId } : {},
        q.q
          ? { OR: [{ jewelleryType: { contains: q.q, mode: 'insensitive' } }, { enquiry: { reference: { contains: q.q, mode: 'insensitive' } } }, { order: { number: { contains: q.q, mode: 'insensitive' } } }, { customer: { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } } }, { enquiry: { contactPhone: { contains: q.q } } }] }
          : {},
      ],
    };
    const include = { enquiry: { select: { reference: true, contactName: true, contactPhone: true } }, customer: { select: { user: { select: { name: true, phone: true } } } }, city: { select: { name: true } }, order: { select: { id: true, number: true } } };
    if (q.format === 'csv') {
      const rows = await this.prisma.customRequest.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 50_000 });
      sendCsv(res, 'customized-orders.csv', rows, [
        { header: 'Created', value: (r) => r.createdAt },
        { header: 'Enquiry', value: (r) => r.enquiry?.reference },
        { header: 'Order', value: (r) => r.order?.number },
        { header: 'Customer', value: (r) => r.customer?.user.name ?? r.enquiry?.contactName },
        { header: 'Phone', value: (r) => r.customer?.user.phone ?? r.enquiry?.contactPhone },
        { header: 'City', value: (r) => r.city?.name },
        { header: 'Type', value: (r) => r.jewelleryType },
        { header: 'Stage', value: (r) => r.stage },
        { header: 'Quoted (₹)', value: (r) => (r.quotedPaise == null ? '' : r.quotedPaise / 100) },
      ]);
      return;
    }
    const page = await paginate(q, () => this.prisma.customRequest.count({ where }), (skip, take) => this.prisma.customRequest.findMany({ where, include, orderBy: orderBy(q.sort, ['createdAt', 'updatedAt', 'quotedPaise'], { updatedAt: 'desc' }), skip, take }));
    const stages = await this.prisma.customRequest.groupBy({ by: ['stage'], where: { AND: [customRequestScope(user), { archivedAt: null }] }, _count: { _all: true } });
    return { ...page, items: page.items.map((r) => present(user, r)), stageCounts: Object.fromEntries(stages.map((s) => [s.stage, s._count._all])) };
  }

  @Get(':id')
  @Requires('CUSTOM_ORDERS', 'view')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const r = await this.load(user, id);
    const [referenceImages, designFiles] = await Promise.all([Promise.all(r.referenceImageUrls.map((u) => this.media.resolve(u))), Promise.all(r.designFileUrls.map((u) => this.media.resolve(u)))]);
    const paid = r.order?.payments.reduce((s, p) => s + p.amountPaise, 0) ?? 0;
    return { ...present(user, r), contact: this.contactOf(r), referenceImages, designFiles, paidPaise: paid, gstRateBp: CUSTOM_GST_BP };
  }

  /** The team fills a customized order themselves (phone or walk-in), or starts one from any enquiry. */
  @Post()
  @Requires('CUSTOM_ORDERS', 'create')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createInput)) dto: z.infer<typeof createInput>) {
    const { enquiryId, contact, cityId, ...rest } = dto;
    let customerId: string | null = null;
    let city = cityId ?? null;
    if (enquiryId) {
      const e = await this.prisma.enquiry.findFirst({ where: { id: enquiryId, ...(user.role === 'CITY_MANAGER' ? { cityId: user.cityId ?? '__none__' } : {}) }, include: { customRequest: true } });
      if (!e) throw notFound('Enquiry');
      if (e.customRequest) throw badRequest('ALREADY_STARTED', 'This enquiry already has a customized order.');
      customerId = e.customerId;
      city ??= e.cityId;
    }
    if (contact) customerId = await this.orders.ensureCustomer(contact);
    if (!customerId && !enquiryId) throw badRequest('CONTACT_REQUIRED', 'Add the customer’s name and mobile number.', { 'contact.phone': 'Required' });
    if (user.role === 'CITY_MANAGER') {
      if (city && city !== user.cityId) throw badRequest('NOT_ALLOWED', 'You can only create customized orders in your city.');
      city = user.cityId ?? null;
    }
    const r = await this.prisma.customRequest.create({
      data: { ...rest, enquiryId: enquiryId ?? null, customerId, cityId: city, referenceImageUrls: [], designFileUrls: [], stageHistory: [{ stage: 'REQUIREMENT', at: new Date().toISOString(), by: user.name }] },
    });
    await this.audit.record('CustomRequest', r.id, 'CREATE', undefined, { jewelleryType: r.jewelleryType, enquiryId });
    return this.get(user, r.id);
  }

  /** Details anyone with edit can change; the cost breakdown and quote are head office only. */
  @Patch(':id')
  @Requires('CUSTOM_ORDERS', 'edit')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateInput)) dto: z.infer<typeof updateInput>) {
    const before = await this.load(user, id);
    const { costs: c, ...rest } = dto;
    const data: Prisma.CustomRequestUpdateInput = { ...rest };
    if (c) {
      if (!headOffice(user)) throw forbidden('Only head office can set costs and the quote.');
      if (!['REQUIREMENT', 'QUOTED'].includes(before.stage)) throw badRequest('QUOTE_LOCKED', 'The quote cannot change after the advance is paid.');
      const q = quoteCustom({ ...c, gstRateBp: CUSTOM_GST_BP });
      Object.assign(data, c, { quotedPaise: q.quotedPaise });
    }
    await this.prisma.customRequest.update({ where: { id }, data });
    await this.audit.record('CustomRequest', id, 'UPDATE', { quotedPaise: before.quotedPaise }, dto);
    return this.get(user, id);
  }

  @Post(':id/files')
  @HttpCode(200)
  @Requires('CUSTOM_ORDERS', 'edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 6, { limits: { fileSize: 10 * 1024 * 1024, files: 6 } }))
  async files(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFiles() files: Express.Multer.File[] = []) {
    const r = await this.load(user, id);
    if (!files.length) throw badRequest('NO_FILES', 'Choose at least one file.');
    const saved = [];
    for (const f of files) saved.push((await this.media.saveDocument(f, `custom/${r.id}`, 'private', true)).url);
    await this.prisma.customRequest.update({ where: { id }, data: { designFileUrls: { push: saved } } });
    return this.get(user, id);
  }

  /**
   * Production stages move forward one step at a time (one step back is allowed to correct a mistake).
   * Quoted needs a quote; Advance Paid records the advance and creates the order; PO Raised needs a PO.
   */
  @Post(':id/stage')
  @HttpCode(200)
  @Requires('CUSTOM_ORDERS', 'edit')
  async stage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(stageInput)) dto: z.infer<typeof stageInput>) {
    const r = await this.load(user, id);
    const from = STAGES.indexOf(r.stage as Stage);
    const to = STAGES.indexOf(dto.stage);
    if (to !== from + 1 && to !== from - 1) throw badRequest('INVALID_STAGE', `Move one stage at a time (next: ${STAGES[from + 1]?.replace(/_/g, ' ').toLowerCase() ?? 'none'}).`);
    if (to < from && from >= STAGES.indexOf('ADVANCE_PAID') && to < STAGES.indexOf('ADVANCE_PAID')) throw badRequest('INVALID_STAGE', 'An order with a paid advance cannot go back to quoting.');
    if (dto.stage === 'DISPATCHED' || dto.stage === 'DELIVERED') throw badRequest('USE_DELIVERY', 'Dispatch and delivery follow the order’s delivery steps.');
    if (dto.stage === 'QUOTED' && !r.quotedPaise) throw badRequest('QUOTE_REQUIRED', 'Enter the cost breakdown to produce a quote first.');
    if (dto.stage === 'PO_RAISED' && !r.order?.purchaseOrders.length) throw badRequest('PO_REQUIRED', 'Raise a purchase order with a manufacturer first.');

    let orderId = r.orderId;
    if (dto.stage === 'ADVANCE_PAID') {
      // Recording the advance is recording money: head office only, like every other payment.
      if (!headOffice(user)) throw forbidden('Only head office can record the advance.');
      if (!dto.advance) throw badRequest('ADVANCE_REQUIRED', 'Record the advance payment.', { advance: 'Required' });
      if (dto.advance.amountPaise > r.quotedPaise!) throw badRequest('ADVANCE_TOO_HIGH', `The advance cannot exceed the quote of ${formatINR(r.quotedPaise!)}.`, { 'advance.amountPaise': 'Too high' });
      const contact = this.contactOf(r);
      if (!contact.name || !contact.phone) throw badRequest('CONTACT_REQUIRED', 'The customer’s name and mobile number are missing.');
      const cityId = r.cityId ?? dto.advance.address.cityId;
      if (!cityId) throw badRequest('CITY_REQUIRED', 'Choose the city.', { 'advance.address.cityId': 'Required' });
      const order = await this.orders.create({
        source: r.enquiryId ? 'ENQUIRY' : 'MANUAL',
        type: 'CUSTOMIZED',
        enquiryId: r.enquiryId,
        customerId: r.customerId,
        contact: { name: contact.name, phone: contact.phone, email: contact.email },
        address: dto.advance.address,
        cityId,
        items: [],
        customLine: { name: `Customized ${r.jewelleryType}${r.metal ? ` in ${r.metal}` : ''}`, pricePaise: r.quotedPaise!, gstRateBp: CUSTOM_GST_BP, hsnCode: '7113' },
        paymentMethod: dto.advance.method === 'COD' ? 'COD' : dto.advance.method,
        channel: r.enquiry?.source ?? 'custom',
        createdById: user.id,
        convertStock: true,
      });
      orderId = order.id;
      await this.prisma.customRequest.update({ where: { id }, data: { orderId, advancePaise: dto.advance.amountPaise } });
      await this.orders.recordPayment(user, orderId, { method: dto.advance.method, amountPaise: dto.advance.amountPaise, reference: dto.advance.reference ?? 'Advance' });
      await this.prisma.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      await this.prisma.orderEvent.create({ data: { orderId, actorId: user.id, type: 'STATUS_CHANGED', fromStatus: 'PLACED', toStatus: 'CONFIRMED', message: `Advance ${formatINR(dto.advance.amountPaise)} received; production can start.` } });
    }
    if (dto.stage === 'READY' && orderId) {
      const o = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      if (o.status === 'CONFIRMED') await this.orders.transition(user, orderId, 'PACKED', { reason: 'Customized piece ready' });
    }

    const history = Array.isArray(r.stageHistory) ? (r.stageHistory as Prisma.JsonArray) : [];
    await this.prisma.customRequest.update({ where: { id }, data: { stage: dto.stage, stageHistory: [...history, { stage: dto.stage, at: new Date().toISOString(), by: user.name, note: dto.note ?? null }] } });
    await this.audit.record('CustomRequest', id, 'STAGE', { stage: r.stage }, { stage: dto.stage, note: dto.note });
    const c = this.contactOf(r);
    if (to > from && c.phone && ['QUOTED', 'ADVANCE_PAID', 'IN_MANUFACTURING', 'READY'].includes(dto.stage)) {
      await this.notifications.send({
        templateKey: 'CUSTOM_STAGE',
        vars: { name: (c.name ?? '').split(' ')[0] ?? '', item: r.jewelleryType, stage: dto.stage.replace(/_/g, ' ').toLowerCase(), quote: dto.stage === 'QUOTED' && r.quotedPaise ? `Quoted price: ${formatINR(r.quotedPaise)} (GST included).` : '' },
        to: { whatsapp: c.phone, email: c.email },
        context: { customRequestId: id },
      });
    }
    return this.get(user, id);
  }
}

@Module({
  imports: [AuthModule, MediaModule, OrdersModule],
  controllers: [CustomOrdersController, PurchaseOrdersController],
})
export class CustomModule {}
