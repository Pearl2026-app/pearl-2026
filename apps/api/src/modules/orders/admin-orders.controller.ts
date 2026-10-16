import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { addressInput, can, email, indianMobile, paise } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { sendCsv } from '../../common/csv';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { between, listQuery, orderBy, paginate } from '../../common/list';
import { enquiryScope, orderScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { packingSlipPdf } from '../documents/pdf';
import { InvoiceService } from './invoice.service';
import { formatAddress, OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';

const STATUSES = [
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURNED',
  'REFUNDED',
] as const;
const PAY = ['PENDING', 'PAID', 'COD_PENDING', 'COD_COLLECTED', 'FAILED', 'REFUNDED'] as const;

const orderList = listQuery.extend({
  status: z.enum(STATUSES).optional(),
  paymentStatus: z.enum(PAY).optional(),
  cityId: z.string().optional(),
  vendorId: z.string().optional(),
  franchiseId: z.string().optional(),
  manufacturerId: z.string().optional(),
  deliveryPartnerId: z.string().optional(),
  source: z.enum(['CHECKOUT', 'ENQUIRY', 'MANUAL']).optional(),
  type: z.enum(['STANDARD', 'CUSTOMIZED']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minTotal: z.coerce.number().int().optional(),
  maxTotal: z.coerce.number().int().optional(),
  format: z.enum(['json', 'csv']).optional(),
});

/** Recording money marks an order paid and issues the invoice: head office with the Payments edit right only. */
function assertMayRecordMoney(user: AuthUser) {
  if (
    !['SUPER_ADMIN', 'STAFF'].includes(user.role) ||
    !can({ role: user.role, staffGrants: user.grants }, 'PAYMENTS', 'edit')
  )
    throw forbidden(
      'Only head office can record a payment. Leave "Already paid" off; head office records it on the order.',
    );
}

const manualOrder = z.object({
  contact: z.object({
    name: z.string().trim().min(2).max(120),
    phone: indianMobile,
    email: email.optional().nullable(),
  }),
  address: addressInput,
  cityId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1).max(100),
        unitPricePaise: paise.optional(),
      }),
    )
    .min(1)
    .max(30),
  // Not ONLINE: a gateway payment starts only at the customer's own checkout, so a staff-made order could never be paid that way.
  paymentMethod: z.enum(['COD', 'BANK_TRANSFER', 'OTHER']),
  alreadyPaid: z.boolean().default(false),
  paymentReference: z.string().max(120).optional().nullable(),
  couponCode: z.string().max(30).optional().nullable(),
  channel: z.string().trim().max(40).optional().nullable(),
  internalNote: z.string().max(2000).optional().nullable(),
  chargeDelivery: z.boolean().default(true),
});

export const convertInput = manualOrder.partial();

@ApiTags('orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly invoices: InvoiceService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Requires('ORDERS', 'view')
  async list(
    @CurrentUser() user: AuthUser,
    @Query() raw: Record<string, string>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const q = orderList.parse(raw);
    const where: Prisma.OrderWhereInput = {
      AND: [
        orderScope(user),
        { archivedAt: null },
        q.status ? { status: q.status } : {},
        q.paymentStatus ? { paymentStatus: q.paymentStatus } : {},
        q.cityId ? { cityId: q.cityId } : {},
        q.vendorId ? { OR: [{ vendorId: q.vendorId }, { fulfilmentVendorId: q.vendorId }] } : {},
        q.franchiseId ? { franchiseId: q.franchiseId } : {},
        q.manufacturerId ? { manufacturerId: q.manufacturerId } : {},
        q.deliveryPartnerId ? { delivery: { deliveryPartnerId: q.deliveryPartnerId } } : {},
        q.source ? { source: q.source } : {},
        q.type ? { type: q.type } : {},
        q.from || q.to ? { placedAt: between(q.from, q.to) } : {},
        q.minTotal != null || q.maxTotal != null
          ? {
              totalPaise: {
                ...(q.minTotal != null ? { gte: q.minTotal } : {}),
                ...(q.maxTotal != null ? { lte: q.maxTotal } : {}),
              },
            }
          : {},
        q.q
          ? {
              OR: [
                { number: { contains: q.q, mode: 'insensitive' } },
                { contactName: { contains: q.q, mode: 'insensitive' } },
                { contactPhone: { contains: q.q } },
                { items: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
              ],
            }
          : {},
      ],
    };
    const include = {
      city: { select: { name: true } },
      vendor: { select: { name: true } },
      fulfilmentVendor: { select: { name: true } },
      franchise: { select: { name: true } },
      manufacturer: { select: { name: true } },
      delivery: { select: { status: true, deliveryPartner: { select: { name: true } } } },
      _count: { select: { items: true } },
    };
    const sort = orderBy(q.sort, ['placedAt', 'totalPaise', 'number', 'status'], { placedAt: 'desc' });
    if (q.format === 'csv') {
      const rows = await this.prisma.order.findMany({ where, include, orderBy: sort, take: 100_000 });
      sendCsv(res, 'orders.csv', rows, [
        { header: 'Order', value: (r) => r.number },
        { header: 'Placed', value: (r) => r.placedAt },
        { header: 'Customer', value: (r) => r.contactName },
        { header: 'Phone', value: (r) => r.contactPhone },
        { header: 'City', value: (r) => r.city.name },
        { header: 'Source', value: (r) => r.source },
        { header: 'Channel', value: (r) => r.channel },
        { header: 'Status', value: (r) => r.status },
        { header: 'Payment', value: (r) => r.paymentStatus },
        { header: 'Method', value: (r) => r.paymentMethod },
        { header: 'Total (₹)', value: (r) => r.totalPaise / 100 },
        { header: 'GST (₹)', value: (r) => r.gstPaise / 100 },
        { header: 'Vendor', value: (r) => r.vendor?.name },
        { header: 'Franchise', value: (r) => r.franchise?.name },
        { header: 'Manufacturer', value: (r) => r.manufacturer?.name },
        { header: 'Delivery partner', value: (r) => r.delivery?.deliveryPartner?.name },
      ]);
      return;
    }
    return paginate(
      q,
      () => this.prisma.order.count({ where }),
      (skip, take) => this.prisma.order.findMany({ where, include, orderBy: sort, skip, take }),
    );
  }

  @Get(':id')
  @Requires('ORDERS', 'view')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const o = await this.orders.find(user, id);
    return { ...o, trackUrl: this.orders.trackUrl(o.number) };
  }

  /** Manual entry for a phone or Instagram sale. */
  @Post()
  @Requires('ORDERS', 'create')
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(manualOrder)) dto: z.infer<typeof manualOrder>,
  ) {
    if (user.role === 'VENDOR' || user.role === 'DELIVERY_PARTNER') throw forbidden();
    if (user.role === 'CITY_MANAGER' && dto.cityId !== user.cityId)
      throw badRequest('NOT_ALLOWED', 'You can only create orders in your city.', {
        cityId: 'Your city only',
      });
    if (user.role === 'FRANCHISE') {
      const f = await this.prisma.franchise.findUnique({ where: { id: user.franchiseId ?? '' } });
      if (dto.cityId !== f?.cityId)
        throw badRequest('NOT_ALLOWED', 'You can only create orders in your city.');
    }
    // Only head office may override catalogue prices on a manual order (money: cautious default).
    if (
      dto.items.some((i) => i.unitPricePaise != null) &&
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'STAFF'
    )
      throw forbidden('Only head office can change prices.');
    if (dto.alreadyPaid) assertMayRecordMoney(user);
    return this.orders.create({
      source: 'MANUAL',
      contact: dto.contact,
      address: dto.address,
      cityId: dto.cityId,
      items: dto.items,
      paymentMethod: dto.paymentMethod,
      couponCode: dto.couponCode,
      channel: dto.channel ?? 'phone',
      createdById: user.id,
      internalNote: dto.internalNote,
      franchiseId: user.role === 'FRANCHISE' ? user.franchiseId : undefined,
      convertStock: true,
      paidNow: dto.alreadyPaid ? { method: dto.paymentMethod, reference: dto.paymentReference } : null,
      skipDelivery: !dto.chargeDelivery,
    });
  }

  @Patch(':id')
  @Requires('ORDERS', 'edit')
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          vendorId: z.string().nullable().optional(),
          fulfilmentVendorId: z.string().nullable().optional(),
          franchiseId: z.string().nullable().optional(),
          manufacturerId: z.string().nullable().optional(),
          internalNote: z.string().max(2000).nullable().optional(),
        }),
      ),
    )
    dto: {
      vendorId?: string | null;
      fulfilmentVendorId?: string | null;
      franchiseId?: string | null;
      manufacturerId?: string | null;
      internalNote?: string | null;
    },
  ) {
    return this.orders.assignments(user, id, dto);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Requires('ORDERS', 'edit')
  status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ status: z.enum(STATUSES), reason: z.string().trim().max(500).optional().nullable() }),
      ),
    )
    dto: { status: (typeof STATUSES)[number]; reason?: string | null },
  ) {
    if (user.role === 'DELIVERY_PARTNER') throw forbidden('Use the delivery app to update deliveries.');
    // Delivered without the rider's proof: head office only, and the handover must be described for the record.
    if (dto.status === 'DELIVERED') {
      if (!['SUPER_ADMIN', 'STAFF'].includes(user.role))
        throw forbidden(
          'The rider marks the order delivered with proof. Ask head office if it was handed over another way.',
        );
      if (!dto.reason?.trim())
        throw badRequest('REASON_REQUIRED', 'Say how the order was handed over.', { reason: 'Required' });
    }
    return this.orders.transition(user, id, dto.status, { reason: dto.reason });
  }

  @Post(':id/assign-delivery')
  @HttpCode(200)
  @Requires('ORDERS', 'edit')
  assignDelivery(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ deliveryPartnerId: z.string() })))
    dto: { deliveryPartnerId: string },
  ) {
    // The vendor an order was sent to assigns its own partners (checked in the service).
    if (user.role === 'DELIVERY_PARTNER') throw forbidden();
    return this.orders.assignDelivery(user, id, dto.deliveryPartnerId);
  }

  /** Partners who may take this order, each marked available or busy, with their current job count. */
  @Get(':id/delivery-options')
  @Requires('ORDERS', 'view')
  deliveryOptions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    if (user.role === 'DELIVERY_PARTNER') throw forbidden();
    return this.orders.deliveryOptions(user, id);
  }

  /** A vendor marks one of its partners available or busy (head office may do it for anyone). */
  @Post('delivery-partners/:partnerId/availability')
  @HttpCode(200)
  @Requires('ORDERS', 'edit')
  async availability(
    @CurrentUser() user: AuthUser,
    @Param('partnerId') partnerId: string,
    @Body(new ZodValidationPipe(z.object({ isAvailable: z.boolean() }))) dto: { isAvailable: boolean },
  ) {
    const headOffice = user.role === 'SUPER_ADMIN' || user.role === 'STAFF';
    if (!headOffice && user.role !== 'VENDOR') throw forbidden();
    const dp = await this.prisma.deliveryPartner.findFirst({
      where: { id: partnerId, ...(headOffice ? {} : { vendorId: user.vendorId ?? '__none__' }) },
    });
    if (!dp) throw notFound();
    await this.prisma.deliveryPartner.update({
      where: { id: dp.id },
      data: { isAvailable: dto.isAvailable },
    });
    await this.audit.record(
      'DeliveryPartner',
      dp.id,
      'AVAILABILITY',
      { isAvailable: dp.isAvailable },
      { isAvailable: dto.isAvailable },
    );
    return { id: dp.id, isAvailable: dto.isAvailable };
  }

  @Post(':id/payments')
  @HttpCode(200)
  // Recording money marks the order paid and issues the invoice: head office with the Payments edit right only.
  @Requires('PAYMENTS', 'edit')
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          method: z.enum(['COD', 'BANK_TRANSFER', 'OTHER']),
          amountPaise: paise,
          reference: z.string().max(120).optional().nullable(),
        }),
      ),
    )
    dto: { method: 'COD'; amountPaise: number; reference?: string | null },
  ) {
    assertMayRecordMoney(user);
    return this.orders.recordPayment(user, id, dto);
  }

  @Post(':id/refunds')
  @HttpCode(200)
  @Requires('PAYMENTS', 'edit')
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({
          amountPaise: paise.min(1),
          reason: z.string().trim().min(3).max(500),
          returnRequestId: z.string().optional(),
        }),
      ),
    )
    dto: { amountPaise: number; reason: string; returnRequestId?: string },
  ) {
    return this.payments.refund(user, id, dto);
  }

  @Get(':id/packing-slip.pdf')
  @Requires('ORDERS', 'view')
  async packingSlip(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    await this.orders.find(user, id);
    const o = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    const addr = o.addressSnapshot as Record<string, unknown>;
    const buffer = await packingSlipPdf({
      orderNumber: o.number,
      placedAt: o.createdAt,
      shipTo: {
        name: String(addr.name ?? o.contactName),
        phone: String(addr.phone ?? o.contactPhone),
        address: formatAddress(addr),
      },
      lines: o.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        qty: i.quantity,
        totalPaise: i.lineTotalPaise,
      })),
      totalPaise: o.totalPaise,
      // Same rule as the delivery app: COD is due until the cash is recorded.
      codDuePaise:
        o.paymentMethod === 'COD' && o.paymentStatus !== 'COD_COLLECTED' && o.paymentStatus !== 'PAID'
          ? o.totalPaise
          : 0,
      gift: o.giftWrap ? { message: o.giftMessage } : null,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="packing-slip-${o.number}.pdf"`);
    res.send(buffer);
  }

  @Get(':id/invoice.pdf')
  @Requires('ORDERS', 'view')
  async invoice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    await this.orders.find(user, id);
    const { buffer, filename } = await this.invoices.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}

@ApiTags('orders')
@Controller('admin/enquiries')
export class EnquiryConvertController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  /** One click turns an enquiry into an order, carrying its details over. */
  @Post(':id/convert')
  @Requires('ORDERS', 'create')
  async convert(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(convertInput)) dto: z.infer<typeof convertInput>,
  ) {
    const e = await this.prisma.enquiry.findFirst({
      where: { AND: [{ id }, enquiryScope(user), { archivedAt: null }] },
      include: {
        customer: {
          include: {
            user: true,
            addresses: { where: { archivedAt: null }, orderBy: { isDefault: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!e) throw notFound('Enquiry');
    if (e.stage === 'CONVERTED') throw badRequest('ALREADY_CONVERTED', 'This enquiry is already an order.');
    if (user.role === 'VENDOR' || user.role === 'DELIVERY_PARTNER') throw forbidden();
    if (dto.alreadyPaid) assertMayRecordMoney(user);
    const contact =
      dto.contact ??
      (e.contactPhone
        ? {
            name: e.contactName ?? e.customer?.user.name ?? 'Customer',
            phone: e.contactPhone,
            email: e.contactEmail,
          }
        : null);
    if (!contact)
      throw badRequest('CONTACT_REQUIRED', 'Add the customer’s name and mobile number.', {
        'contact.phone': 'Required',
      });
    const saved = e.customer?.addresses[0];
    const address = dto.address ?? (saved ? { ...saved, label: saved.label ?? undefined } : null);
    if (!address) throw badRequest('ADDRESS_REQUIRED', 'Add a delivery address.', { address: 'Required' });
    const cityId = dto.cityId ?? e.cityId;
    if (!cityId) throw badRequest('CITY_REQUIRED', 'Choose the city.', { cityId: 'Required' });
    if (user.role === 'CITY_MANAGER' && cityId !== user.cityId)
      throw badRequest('NOT_ALLOWED', 'You can only create orders in your city.');
    if (user.role === 'FRANCHISE') {
      const f = await this.prisma.franchise.findUnique({ where: { id: user.franchiseId ?? '' } });
      if (cityId !== f?.cityId) throw badRequest('NOT_ALLOWED', 'You can only create orders in your city.');
    }
    const items = dto.items ?? (e.productId ? [{ productId: e.productId, quantity: 1 }] : []);
    if (!items.length)
      throw badRequest('ITEMS_REQUIRED', 'Choose the piece(s) for this order.', { items: 'Required' });
    if (items.some((i) => i.unitPricePaise != null) && user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF')
      throw forbidden('Only head office can change prices.');
    return this.orders.create({
      source: 'ENQUIRY',
      enquiryId: e.id,
      customerId: e.customerId,
      contact,
      address,
      cityId,
      items,
      paymentMethod: dto.paymentMethod ?? 'COD',
      couponCode: dto.couponCode,
      channel: dto.channel ?? e.source ?? 'whatsapp',
      attribution: { source: e.source, utm: e.utm, enquiryReference: e.reference },
      createdById: user.id,
      internalNote: dto.internalNote,
      franchiseId: e.franchiseId,
      convertStock: true,
      // Price-on-request pieces are sold through enquiries, so allow them here.
      allowUnpublished: false,
      paidNow: dto.alreadyPaid
        ? { method: dto.paymentMethod ?? 'OTHER', reference: dto.paymentReference }
        : null,
      skipDelivery: dto.chargeDelivery === false,
    });
  }
}
