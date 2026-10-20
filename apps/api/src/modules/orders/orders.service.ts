import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, type OrderStatus, type PaymentMethod } from '@sahyadri/db';
import {
  canTransition,
  formatINR,
  ORDER_STATUS_LABEL,
  REASON_REQUIRED,
  splitGst,
  splitInclusive,
  type AddressInput,
} from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { orderScope } from '../../common/scope';
import {
  financialYear,
  formatInvoiceNumber,
  formatOrderNumber,
  SequenceService,
  yymm,
} from '../../common/sequence.service';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { nearestVendor } from './routing';
import { JobsService } from '../../queue/jobs.service';
import { AuthService } from '../../auth/auth.service';
import { EnquiriesService } from '../enquiries/enquiries.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PricingService } from './pricing.service';
import { StockService } from './stock.service';

type Tx = Prisma.TransactionClient;

export interface CreateOrderInput {
  source: 'CHECKOUT' | 'ENQUIRY' | 'MANUAL';
  type?: 'STANDARD' | 'CUSTOMIZED';
  customerId?: string | null;
  contact: { name: string; phone: string; email?: string | null };
  address: AddressInput;
  cityId: string;
  items: Array<{ productId: string; quantity: number; unitPricePaise?: number }>;
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  channel?: string | null;
  attribution?: Record<string, unknown> | null;
  enquiryId?: string | null;
  createdById?: string | null;
  customerNote?: string | null;
  giftWrap?: boolean;
  giftMessage?: string | null;
  internalNote?: string | null;
  franchiseId?: string | null;
  /** Business buyers: their GSTIN and registered name, printed on the tax invoice */
  buyerGstin?: string | null;
  buyerBusinessName?: string | null;
  /** COD and manual orders sell immediately; online orders hold for 15 minutes. */
  convertStock: boolean;
  /** Manual sale already paid (bank transfer, UPI to the shop…) */
  paidNow?: { method: PaymentMethod; reference?: string | null } | null;
  skipDelivery?: boolean;
  allowUnpublished?: boolean;
  /** Customized orders: a single line with an agreed price, no catalogue product */
  customLine?: { name: string; pricePaise: number; gstRateBp: number; hsnCode?: string | null } | null;
}

export const ORDER_DETAIL_INCLUDE = {
  items: true,
  events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { name: true, role: true } } } },
  payments: { orderBy: { createdAt: 'asc' }, include: { refunds: true } },
  refunds: { orderBy: { createdAt: 'asc' } },
  invoice: true,
  delivery: { include: { deliveryPartner: { select: { id: true, name: true, phone: true } } } },
  returnRequests: { orderBy: { createdAt: 'desc' } },
  customer: { include: { user: { select: { name: true, phone: true, email: true } } } },
  city: { select: { id: true, name: true } },
  vendor: { select: { id: true, name: true } },
  fulfilmentVendor: { select: { id: true, name: true, phone: true, address: true } },
  franchise: { select: { id: true, name: true } },
  manufacturer: { select: { id: true, name: true } },
  enquiry: { select: { id: true, reference: true } },
  customRequest: { select: { id: true, stage: true } },
} satisfies Prisma.OrderInclude;

export function addressSnapshot(a: AddressInput) {
  return {
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? null,
    landmark: a.landmark ?? null,
    area: a.area ?? null,
    cityName: a.cityName,
    state: a.state,
    pincode: a.pincode,
  };
}

export const formatAddress = (a: Record<string, unknown>) =>
  [a.line1, a.line2, a.landmark, a.area, `${a.cityName} ${a.pincode}`, a.state].filter(Boolean).join(', ');

@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly log = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly pricing: PricingService,
    private readonly stock: StockService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    private readonly auth: AuthService,
    private readonly enquiries: EnquiriesService,
  ) {}

  onModuleInit(): void {
    this.jobs.register(
      'orders.notify',
      (d: { orderId: string; templateKey: string; extra?: Record<string, string> }) =>
        this.notifyCustomer(d.orderId, d.templateKey, d.extra),
    );
  }

  // ── Customers ────────────────────────────────────────────────

  /** Guest checkout creates (or reuses) a customer from the phone number (DECISIONS D16). */
  async ensureCustomer(contact: { name: string; phone: string; email?: string | null }): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { phone: contact.phone },
      include: { customer: true },
    });
    if (user && user.role !== 'CUSTOMER')
      throw badRequest(
        'PHONE_IN_USE',
        'This mobile number belongs to a team account. Please use another number.',
      );
    if (user?.customer?.isBlocked) throw forbidden('This account cannot place orders. Please contact us.');
    if (user?.customer) return user.customer.id;
    if (user) {
      const c = await this.prisma.customer.create({
        data: { userId: user.id, referralCode: await this.auth.uniqueReferralCode(user.name) },
      });
      return c.id;
    }
    const emailTaken = contact.email
      ? await this.prisma.user.findUnique({ where: { email: contact.email } })
      : null;
    const created = await this.prisma.user.create({
      data: {
        role: 'CUSTOMER',
        name: contact.name,
        phone: contact.phone,
        email: emailTaken ? null : (contact.email ?? null),
        customer: { create: { referralCode: await this.auth.uniqueReferralCode(contact.name) } },
      },
      include: { customer: true },
    });
    return created.customer!.id;
  }

  // ── Creating orders ──────────────────────────────────────────

  async create(input: CreateOrderInput) {
    const city = await this.prisma.city.findFirst({ where: { id: input.cityId, isActive: true } });
    if (!city)
      throw badRequest('INVALID_CITY', 'We do not deliver to that city yet.', {
        cityId: 'Choose a city we deliver to',
      });
    if (!input.items.length && !input.customLine) throw badRequest('EMPTY_ORDER', 'Add at least one piece.');
    const customerId = input.customerId ?? (await this.ensureCustomer(input.contact));
    const franchiseId =
      input.franchiseId !== undefined
        ? input.franchiseId
        : ((await this.enquiries.route('PRODUCT', city.id)).rule?.assignFranchiseId ?? null);
    // The vendor nearest the delivery address packs and dispatches the order, and sees it in its panel.
    const fulfilment = await nearestVendor(this.prisma, input.address.pincode, city.id);
    const store = await this.settings.get('store');

    const order = await this.prisma.$transaction(
      async (tx) => {
        if (input.couponCode)
          await tx.$queryRaw`SELECT id FROM "Coupon" WHERE code = ${input.couponCode.trim().toUpperCase()} FOR UPDATE`;
        const priced = await this.pricing.price(
          {
            items: input.items,
            couponCode: input.couponCode,
            customerId,
            cityId: city.id,
            skipDelivery: input.skipDelivery,
          },
          tx,
        );
        if (input.couponCode && priced.couponError)
          throw badRequest('COUPON_INVALID', priced.couponError, { couponCode: priced.couponError });
        if (priced.lines.length !== input.items.length)
          throw badRequest('INVALID_ITEMS', 'One of the pieces is no longer available.');
        const unpriced = priced.lines.find((l) => l.priceOnRequest && !l.hasPriceOverride);
        if (unpriced)
          throw badRequest(
            'PRICE_REQUIRED',
            `${unpriced.name} is priced on request: enter the agreed price.`,
            { items: 'Enter the agreed price' },
          );

        let totals = priced.totals;
        const lines = priced.lines.map((l, i) => ({ ...l, ...totals.lines[i]! }));
        if (input.customLine) {
          const { taxablePaise, gstPaise } = splitInclusive(
            input.customLine.pricePaise,
            input.customLine.gstRateBp,
          );
          totals = {
            lines: [],
            subtotalPaise: input.customLine.pricePaise,
            discountPaise: 0,
            deliveryPaise: 0,
            taxablePaise,
            gstPaise,
            totalPaise: input.customLine.pricePaise,
          };
        }
        const vendors = [...new Set(lines.map((l) => l.vendorId).filter(Boolean))];
        const period = yymm();
        const number = formatOrderNumber(period, await this.sequences.next(`order:${period}`, tx));
        const paid = !!input.paidNow;
        const paymentStatus = paid
          ? 'PAID'
          : input.paymentMethod === 'COD'
            ? 'COD_PENDING'
            : input.paymentMethod === 'ONLINE'
              ? 'PENDING'
              : 'PENDING';
        const o = await tx.order.create({
          data: {
            number,
            source: input.source,
            type: input.type ?? 'STANDARD',
            customerId,
            cityId: city.id,
            addressSnapshot: addressSnapshot(input.address),
            contactName: input.contact.name,
            contactPhone: input.contact.phone,
            contactEmail: input.contact.email ?? null,
            buyerGstin: input.buyerGstin?.trim().toUpperCase() || null,
            buyerBusinessName: input.buyerGstin ? input.buyerBusinessName?.trim() || null : null,
            vendorId: vendors.length === 1 ? vendors[0]! : null,
            fulfilmentVendorId: fulfilment?.id ?? null,
            franchiseId,
            status: paid ? 'CONFIRMED' : 'PLACED',
            paymentStatus,
            paymentMethod: input.paymentMethod,
            subtotalPaise: totals.subtotalPaise,
            discountPaise: totals.discountPaise,
            taxablePaise: totals.taxablePaise,
            gstPaise: totals.gstPaise,
            deliveryPaise: totals.deliveryPaise,
            totalPaise: totals.totalPaise,
            couponCode: priced.coupon?.code ?? null,
            customerNote: input.customerNote ?? null,
            giftWrap: input.giftWrap ?? false,
            giftMessage: input.giftWrap ? (input.giftMessage ?? null) : null,
            internalNote: input.internalNote ?? null,
            enquiryId: input.enquiryId ?? null,
            createdById: input.createdById ?? null,
            channel: input.channel ?? null,
            attribution: (input.attribution ?? undefined) as Prisma.InputJsonValue | undefined,
            confirmedAt: paid ? new Date() : null,
            items: {
              create: input.customLine
                ? [
                    {
                      sku: 'CUSTOM',
                      name: input.customLine.name,
                      hsnCode: input.customLine.hsnCode ?? '7113',
                      quantity: 1,
                      unitPricePaise: input.customLine.pricePaise,
                      discountPaise: 0,
                      gstRateBp: input.customLine.gstRateBp,
                      gstPaise: totals.gstPaise,
                      lineTotalPaise: input.customLine.pricePaise,
                    },
                  ]
                : lines.map((l) => ({
                    productId: l.productId,
                    sku: l.sku,
                    name: l.name,
                    imageUrl: l.imageUrl,
                    hsnCode: l.hsnCode,
                    farmName: l.farmName,
                    caratWeight: l.caratWeight,
                    quantity: l.quantity,
                    unitPricePaise: l.unitPricePaise,
                    discountPaise: l.discountPaise,
                    gstRateBp: l.gstRateBp,
                    gstPaise: l.gstPaise,
                    lineTotalPaise: l.netPaise,
                  })),
            },
            events: {
              create: {
                actorId: input.createdById ?? null,
                type: 'PLACED',
                toStatus: paid ? 'CONFIRMED' : 'PLACED',
                message: `Order placed (${input.source.toLowerCase()}${input.channel ? `, ${input.channel}` : ''}). Total ${formatINR(totals.totalPaise)}.${fulfilment ? ` Sent to ${fulfilment.name}, the nearest active vendor to PIN ${input.address.pincode}${fulfilment.km != null ? ` (about ${Math.round(fulfilment.km)} km away)` : ''}.` : ''}`,
              },
            },
          },
        });
        if (lines.length)
          await this.stock.hold(
            tx,
            o.id,
            lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
            { convert: input.convertStock, allowUnpublished: input.allowUnpublished },
          );
        if (priced.coupon && input.convertStock) {
          await tx.couponRedemption.create({
            data: {
              couponId: priced.coupon.id,
              customerId,
              orderId: o.id,
              discountPaise: priced.coupon.discountPaise,
            },
          });
        }
        if (paid) {
          await tx.payment.create({
            data: {
              orderId: o.id,
              method: input.paidNow!.method,
              provider: 'manual',
              amountPaise: totals.totalPaise,
              status: 'CAPTURED',
              raw: { reference: input.paidNow!.reference ?? null },
            },
          });
          await this.issueInvoice(tx, o.id, store);
        }
        if (input.enquiryId)
          await tx.enquiry.update({
            where: { id: input.enquiryId },
            data: { stage: 'CONVERTED', closedAt: new Date() },
          });
        return o;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20_000 },
    );
    if (!input.convertStock) await this.stock.scheduleExpiry(order.id);
    await this.audit.record('Order', order.id, 'CREATE', undefined, {
      number: order.number,
      source: order.source,
      totalPaise: order.totalPaise,
    });
    if (input.paymentMethod !== 'ONLINE' || input.paidNow)
      await this.jobs.add('orders.notify', { orderId: order.id, templateKey: 'ORDER_PLACED' });
    return order;
  }

  // ── Invoices ─────────────────────────────────────────────────

  /** GST invoice numbered gap-free per financial year. Idempotent. */
  async issueInvoice(
    tx: Tx,
    orderId: string,
    store?: { state: string; gstin: string | null; invoicePrefix: string },
  ) {
    const existing = await tx.invoice.findUnique({ where: { orderId } });
    if (existing) return existing;
    const s = store ?? (await this.settings.get('store'));
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const addr = order.addressSnapshot as { state: string };
    const isInterState = addr.state.trim().toLowerCase() !== s.state.trim().toLowerCase();
    const fy = financialYear();
    const seq = await this.sequences.next(`invoice:${fy}`, tx);
    const split = splitGst(order.gstPaise, isInterState);
    return tx.invoice.create({
      data: {
        orderId,
        number: formatInvoiceNumber(s.invoicePrefix || 'SP', fy, seq),
        financialYear: fy,
        sequence: seq,
        sellerGstin: s.gstin,
        buyerGstin: order.buyerGstin,
        placeOfSupply: addr.state,
        isInterState,
        ...split,
        totalPaise: order.totalPaise,
      },
    });
  }

  // ── Reading ──────────────────────────────────────────────────

  async find(user: AuthUser, id: string) {
    const o = await this.prisma.order.findFirst({
      where: { AND: [{ id }, orderScope(user)] },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!o) throw notFound('Order');
    return o;
  }

  trackingToken(number: string): string {
    return createHmac('sha256', config().appSecret)
      .update(`track:${number}`)
      .digest('base64url')
      .slice(0, 22);
  }

  verifyTrackingToken(number: string, token: string): boolean {
    const a = Buffer.from(this.trackingToken(number));
    const b = Buffer.from(token ?? '');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  trackUrl(number: string) {
    return `${config().WEB_URL}/track/${encodeURIComponent(number)}?t=${this.trackingToken(number)}`;
  }

  // ── Status changes ───────────────────────────────────────────

  async transition(
    user: AuthUser | null,
    orderId: string,
    to: OrderStatus,
    opts: { reason?: string | null; tx?: Tx; system?: boolean } = {},
  ) {
    const run = async (tx: Tx) => {
      const order = await tx.order.findFirst({
        where: { AND: [{ id: orderId }, user && !opts.system ? orderScope(user) : {}] },
      });
      if (!order) throw notFound('Order');
      const role = opts.system || !user ? 'SUPER_ADMIN' : user.role;
      if (!canTransition(role, order.status, to)) {
        throw badRequest(
          'INVALID_TRANSITION',
          `An order that is ${ORDER_STATUS_LABEL[order.status].toLowerCase()} cannot be moved to ${ORDER_STATUS_LABEL[to].toLowerCase()}${opts.system ? '' : ' by you'}.`,
        );
      }
      if (REASON_REQUIRED.includes(to) && !opts.reason?.trim())
        throw badRequest('REASON_REQUIRED', 'Please give a reason.', { reason: 'Required' });
      if (to === 'ASSIGNED') {
        const d = await tx.delivery.findUnique({ where: { orderId } });
        if (!d?.deliveryPartnerId) throw badRequest('ASSIGN_PARTNER', 'Assign a delivery partner first.');
      }
      if (to === 'REFUNDED') {
        const refunded = await tx.refund.aggregate({
          where: { orderId, status: { in: ['PROCESSING', 'COMPLETED'] } },
          _sum: { amountPaise: true },
        });
        if (!refunded._sum.amountPaise) throw badRequest('NO_REFUND', 'Record the refund first.');
      }
      const now = new Date();
      const data: Prisma.OrderUpdateInput = { status: to };
      if (to === 'CONFIRMED') data.confirmedAt = now;
      if (to === 'DELIVERED') data.deliveredAt = now;
      if (to === 'CANCELLED') data.cancelledAt = now;
      const updated = await tx.order.update({ where: { id: orderId }, data });
      // The tax invoice is ready once the order is confirmed, so the vendor can print it and pack it with the
      // pieces; for cash on delivery it shows the amount as "to be collected".
      if (to === 'CONFIRMED' || to === 'PACKED') await this.issueInvoice(tx, orderId);
      // Stock goes back when an order is cancelled before dispatch or comes back undelivered.
      if (to === 'CANCELLED' || (to === 'RETURNED' && order.status !== 'DELIVERED')) {
        await this.stock.release(tx, orderId, to === 'CANCELLED' ? 'cancelled' : 'returned-undelivered', {
          includeConverted: true,
        });
      }
      if (to === 'CANCELLED' && order.paymentStatus === 'PENDING') {
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'FAILED' } });
      }
      // Keep the delivery record in step.
      if (['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED'].includes(to)) {
        const stamp =
          to === 'PICKED_UP'
            ? { pickedUpAt: now }
            : to === 'OUT_FOR_DELIVERY'
              ? { outForDeliveryAt: now }
              : to === 'DELIVERED'
                ? { deliveredAt: now }
                : {};
        await tx.delivery.updateMany({
          where: { orderId },
          data: {
            status: to as 'PICKED_UP',
            ...stamp,
            ...(to === 'FAILED' || to === 'RETURNED' ? { failureReason: opts.reason } : {}),
          },
        });
      }
      // A customized order's production stage follows dispatch and delivery.
      if (order.type === 'CUSTOMIZED' && (to === 'PICKED_UP' || to === 'DELIVERED')) {
        await tx.customRequest.updateMany({
          where: { orderId },
          data: { stage: to === 'DELIVERED' ? 'DELIVERED' : 'DISPATCHED' },
        });
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          actorId: user?.id ?? null,
          type: 'STATUS_CHANGED',
          fromStatus: order.status,
          toStatus: to,
          message: opts.reason ?? null,
        },
      });
      await this.audit.record(
        'Order',
        orderId,
        'STATUS_CHANGE',
        { status: order.status },
        { status: to, reason: opts.reason },
        tx,
      );
      return updated;
    };
    const updated = opts.tx ? await run(opts.tx) : await this.prisma.$transaction(run);
    await this.jobs.add('orders.notify', { orderId, templateKey: 'ORDER_STATUS' });
    if (to === 'DELIVERED') await this.jobs.add('orders.delivered', { orderId });
    return updated;
  }

  /** Order notifications at every status change (WhatsApp → email fallback, push for app users). */
  async notifyCustomer(orderId: string, templateKey: string, extra: Record<string, string> = {}) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { select: { userId: true } }, invoice: true },
    });
    if (!o) return;
    await this.notifications.send({
      templateKey,
      vars: {
        name: o.contactName.split(' ')[0],
        orderNumber: o.number,
        status: ORDER_STATUS_LABEL[o.status],
        total: formatINR(o.totalPaise, { compact: true }),
        trackUrl: this.trackUrl(o.number),
        invoiceUrl: o.invoice ? `${this.trackUrl(o.number)}&invoice=1` : 'available once paid',
        ...extra,
      },
      to: { whatsapp: o.contactPhone, email: o.contactEmail, pushUserId: o.customer.userId },
      userId: o.customer.userId,
      context: { orderId: o.id, orderNumber: o.number },
    });
  }

  async assignments(
    user: AuthUser,
    orderId: string,
    patch: {
      vendorId?: string | null;
      fulfilmentVendorId?: string | null;
      franchiseId?: string | null;
      manufacturerId?: string | null;
      internalNote?: string | null;
    },
  ) {
    const before = await this.find(user, orderId);
    if (user.role === 'VENDOR' || user.role === 'DELIVERY_PARTNER') throw forbidden();
    if (user.role === 'FRANCHISE' && (patch.franchiseId !== undefined || patch.vendorId !== undefined))
      throw forbidden('Only head office can reassign orders.');
    if (patch.fulfilmentVendorId !== undefined && user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF')
      throw forbidden('Only head office can send an order to a different vendor.');
    if (user.role === 'CITY_MANAGER' && patch.franchiseId) {
      const f = await this.prisma.franchise.findFirst({
        where: { id: patch.franchiseId, cityId: user.cityId ?? '__none__' },
      });
      if (!f) throw badRequest('NOT_ALLOWED', 'Choose a franchise in your city.');
    }
    const o = await this.prisma.$transaction(async (tx) => {
      const r = await tx.order.update({ where: { id: orderId }, data: patch });
      await tx.orderEvent.create({
        data: {
          orderId,
          actorId: user.id,
          type: 'ASSIGNED',
          message: Object.keys(patch).join(', ') + ' updated',
          data: patch as Prisma.InputJsonValue,
        },
      });
      await this.audit.record(
        'Order',
        orderId,
        'ASSIGN',
        {
          vendorId: before.vendor?.id,
          fulfilmentVendorId: before.fulfilmentVendorId,
          franchiseId: before.franchise?.id,
          manufacturerId: before.manufacturer?.id,
        },
        patch,
        tx,
      );
      return r;
    });
    return o;
  }

  /**
   * Who may deliver an order. The vendor the order was sent to chooses from its own partners who are marked available;
   * head office can also choose any active partner serving the order's city.
   */
  private partnerChoice(
    user: AuthUser,
    order: { cityId: string; fulfilmentVendorId: string | null },
  ): Prisma.DeliveryPartnerWhereInput {
    if (user.role === 'VENDOR') {
      if (!user.vendorId || order.fulfilmentVendorId !== user.vendorId)
        throw forbidden('Only the vendor this order was sent to can choose its delivery partner.');
      return { isActive: true, vendorId: user.vendorId };
    }
    return {
      isActive: true,
      OR: [
        { cities: { some: { cityId: order.cityId } } },
        ...(order.fulfilmentVendorId ? [{ vendorId: order.fulfilmentVendorId }] : []),
      ],
    };
  }

  /** The partners who may take this order, with whether each is free now and how many jobs they are on. */
  async deliveryOptions(user: AuthUser, orderId: string) {
    const order = await this.find(user, orderId);
    const partners = await this.prisma.deliveryPartner.findMany({
      where: this.partnerChoice(user, order),
      orderBy: [{ isAvailable: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        phone: true,
        vehicleInfo: true,
        isAvailable: true,
        vendor: { select: { name: true } },
        _count: {
          select: {
            deliveries: { where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'] } } },
          },
        },
      },
    });
    return partners.map(({ _count, ...p }) => ({ ...p, activeJobs: _count.deliveries }));
  }

  /** Assign a delivery partner (see partnerChoice); the order moves to Assigned when packed. */
  async assignDelivery(user: AuthUser, orderId: string, deliveryPartnerId: string) {
    const order = await this.find(user, orderId);
    const dp = await this.prisma.deliveryPartner.findFirst({
      where: { AND: [{ id: deliveryPartnerId }, this.partnerChoice(user, order)] },
      include: { user: true },
    });
    if (!dp)
      throw badRequest(
        'INVALID_PARTNER',
        user.role === 'VENDOR'
          ? 'Choose one of your active delivery partners.'
          : 'Choose an active delivery partner who serves this city.',
      );
    if (user.role === 'VENDOR' && !dp.isAvailable)
      throw badRequest(
        'PARTNER_BUSY',
        `${dp.name} is marked busy. Choose someone available, or mark them available first.`,
      );
    if (['DELIVERED', 'CANCELLED', 'REFUNDED', 'RETURNED'].includes(order.status))
      throw badRequest('ORDER_CLOSED', 'This order is closed.');
    await this.prisma.$transaction(async (tx) => {
      await tx.delivery.upsert({
        where: { orderId },
        create: { orderId, deliveryPartnerId: dp.id, status: 'ASSIGNED' },
        update: { deliveryPartnerId: dp.id, status: 'ASSIGNED', assignedAt: new Date(), failureReason: null },
      });
      await tx.orderEvent.create({
        data: {
          orderId,
          actorId: user.id,
          type: 'DELIVERY_ASSIGNED',
          message: `Delivery partner: ${dp.name}`,
        },
      });
      await this.audit.record(
        'Order',
        orderId,
        'ASSIGN_DELIVERY',
        { deliveryPartnerId: order.delivery?.deliveryPartner?.id },
        { deliveryPartnerId: dp.id },
        tx,
      );
    });
    if (order.status === 'PACKED' || order.status === 'FAILED')
      await this.transition(user, orderId, 'ASSIGNED');
    if (dp.user) {
      const addr = order.addressSnapshot as Record<string, string>;
      await this.notifications.send({
        templateKey: 'DELIVERY_ASSIGNED',
        vars: { orderNumber: order.number, area: addr.area ?? addr.cityName },
        to: { pushUserId: dp.user.id },
        userId: dp.user.id,
        context: { orderId },
      });
    }
    return this.find(user, orderId);
  }

  /** Staff record a payment received outside the gateway (bank transfer, UPI to the shop, cash). */
  async recordPayment(
    user: AuthUser,
    orderId: string,
    input: { method: PaymentMethod; amountPaise: number; reference?: string | null },
  ) {
    const order = await this.find(user, orderId);
    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'COD_COLLECTED')
      throw badRequest('ALREADY_PAID', 'This order is already paid.');
    // Customized orders are paid in parts (advance, then balance); other orders in full.
    const received = await this.prisma.payment.aggregate({
      where: { orderId, status: 'CAPTURED' },
      _sum: { amountPaise: true },
    });
    const outstanding = order.totalPaise - (received._sum.amountPaise ?? 0);
    const partAllowed = order.type === 'CUSTOMIZED';
    if (
      input.amountPaise <= 0 ||
      input.amountPaise > outstanding ||
      (!partAllowed && input.amountPaise !== outstanding)
    )
      throw badRequest('AMOUNT_MISMATCH', `The amount due is ${formatINR(outstanding)}.`, {
        amountPaise: partAllowed ? `Up to ${formatINR(outstanding)}` : 'Must equal the amount due',
      });
    const fullyPaid = input.amountPaise === outstanding;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          orderId,
          method: input.method,
          provider: 'manual',
          amountPaise: input.amountPaise,
          status: 'CAPTURED',
          collectedById: user.id,
          raw: { reference: input.reference ?? null },
        },
      });
      if (fullyPaid) {
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: order.paymentMethod === 'COD' && input.method === 'COD' ? 'COD_COLLECTED' : 'PAID',
          },
        });
        await this.stock.convert(tx, orderId);
        await this.issueInvoice(tx, orderId);
      }
      await tx.orderEvent.create({
        data: {
          orderId,
          actorId: user.id,
          type: 'PAYMENT_UPDATED',
          message: `Payment of ${formatINR(input.amountPaise)} recorded (${input.method.toLowerCase()})${input.reference ? `, ref ${input.reference}` : ''}${fullyPaid ? '' : `; ${formatINR(outstanding - input.amountPaise)} still due`}.`,
        },
      });
      await this.audit.record(
        'Order',
        orderId,
        'RECORD_PAYMENT',
        { paymentStatus: order.paymentStatus },
        input,
        tx,
      );
    });
    return this.find(user, orderId);
  }
}
