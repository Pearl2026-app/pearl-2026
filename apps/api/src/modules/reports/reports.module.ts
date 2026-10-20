import { FarmSalesController } from './farm-sales';
import { Controller, Get, Module, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { sendCsv, type CsvColumn } from '../../common/csv';
import { badRequest, notFound } from '../../common/errors';
import { customerScope, enquiryScope, orderScope, productScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';

const OPEN: Prisma.EnumOrderStatusFilter['in'] = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'];
const CLOSED_BAD: Prisma.EnumOrderStatusFilter['in'] = ['CANCELLED', 'FAILED', 'RETURNED', 'REFUNDED'];
const PAID: Prisma.EnumPaymentStatusFilter['in'] = ['PAID', 'COD_COLLECTED'];
const ENQ_OPEN: Prisma.EnumEnquiryStageFilter['in'] = ['NEW', 'IN_PROGRESS', 'QUOTED'];

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['json', 'csv']).optional(),
});

/** Month key in India time, e.g. 2026-10. */
const monthKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function range(q: { from?: Date; to?: Date }, defaultDays: number) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - defaultDays * 86400_000);
  if (from > to) throw badRequest('INVALID_RANGE', 'The start date is after the end date.');
  if (to.getTime() - from.getTime() > 3 * 366 * 86400_000) throw badRequest('RANGE_TOO_LONG', 'Choose a range of up to three years.');
  return { from, to };
}

function franchiseScope(u: AuthUser): Prisma.FranchiseWhereInput {
  if (u.role === 'CITY_MANAGER') return { cityId: u.cityId ?? '__none__' };
  if (u.role === 'FRANCHISE') return { id: u.franchiseId ?? '__none__' };
  if (u.role === 'SUPER_ADMIN' || u.role === 'STAFF') return {};
  return { id: '__no_access__' };
}

/** Enquiries are not visible to vendors or riders; their reports simply show none. */
const enquiriesFor = (u: AuthUser): Prisma.EnquiryWhereInput => (u.role === 'VENDOR' || u.role === 'DELIVERY_PARTNER' ? { id: '__no_access__' } : enquiryScope(u));

@ApiTags('reports')
@Controller('admin')
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  /** One page of numbers, limited to what the signed-in role may see (a City Manager sees their city). */
  @Get('dashboard')
  @Requires('DASHBOARD', 'view')
  async dashboard(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>) {
    const { from, to } = range(rangeQuery.parse(raw), 365);
    const o = orderScope(user);
    const inRange = { placedAt: { gte: from, lte: to } };
    const e = enquiriesFor(user);
    const eRange = { createdAt: { gte: from, lte: to } };
    const canCustomers = ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'FRANCHISE'].includes(user.role);
    const [customers, orders, sales, refunds, franchises, products, outOfStock, pending, completed, cancelled, enqOpen, enqConverted, monthly, recentOrders, recentEnquiries] = await Promise.all([
      canCustomers ? this.prisma.customer.count({ where: customerScope(user) }) : Promise.resolve(null),
      this.prisma.order.count({ where: { AND: [o, inRange] } }),
      this.prisma.order.aggregate({ where: { AND: [o, inRange, { paymentStatus: { in: PAID } }] }, _sum: { totalPaise: true } }),
      this.prisma.refund.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: from, lte: to }, order: o }, _sum: { amountPaise: true } }),
      this.prisma.franchise.count({ where: { AND: [franchiseScope(user), { isActive: true }] } }),
      this.prisma.product.count({ where: { AND: [productScope(user), { archivedAt: null }] } }),
      this.prisma.product.count({ where: { AND: [productScope(user), { archivedAt: null, status: 'PUBLISHED' }, { OR: [{ outOfStock: true }, { quantity: { lte: 0 } }, { soldAt: { not: null } }] }] } }),
      this.prisma.order.count({ where: { AND: [o, inRange, { status: { in: OPEN } }] } }),
      this.prisma.order.count({ where: { AND: [o, inRange, { status: 'DELIVERED' }] } }),
      this.prisma.order.count({ where: { AND: [o, inRange, { status: { in: CLOSED_BAD } }] } }),
      this.prisma.enquiry.count({ where: { AND: [e, eRange, { stage: { in: ENQ_OPEN }, archivedAt: null }] } }),
      this.prisma.enquiry.count({ where: { AND: [e, eRange, { stage: 'CONVERTED' }] } }),
      this.prisma.order.findMany({ where: { AND: [o, inRange] }, select: { placedAt: true, totalPaise: true, paymentStatus: true } }),
      this.prisma.order.findMany({ where: o, orderBy: { placedAt: 'desc' }, take: 8, select: { id: true, number: true, placedAt: true, contactName: true, totalPaise: true, status: true, paymentStatus: true, city: { select: { name: true } } } }),
      this.prisma.enquiry.findMany({ where: { AND: [e, { archivedAt: null }] }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, reference: true, type: true, stage: true, createdAt: true, contactName: true, source: true, product: { select: { name: true } }, city: { select: { name: true } } } }),
    ]);
    const months = new Map<string, { month: string; orders: number; salesPaise: number }>();
    // Every month in the range appears, even with no orders.
    let [y, m] = monthKey(from).split('-').map(Number) as [number, number];
    for (let k = monthKey(from); k <= monthKey(to); k = `${y}-${String(m).padStart(2, '0')}`) {
      months.set(k, { month: k, orders: 0, salesPaise: 0 });
      [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    }
    for (const r of monthly) {
      const k = monthKey(r.placedAt);
      const m = months.get(k) ?? { month: k, orders: 0, salesPaise: 0 };
      m.orders++;
      if (PAID!.includes(r.paymentStatus)) m.salesPaise += r.totalPaise;
      months.set(k, m);
    }
    return {
      range: { from, to },
      cards: {
        customers,
        orders,
        salesPaise: (sales._sum.totalPaise ?? 0) - (refunds._sum.amountPaise ?? 0),
        franchises,
        products,
        outOfStock,
        pendingOrders: pending,
        completedOrders: completed,
        cancelledOrders: cancelled,
        pendingEnquiries: user.role === 'VENDOR' ? null : enqOpen,
        convertedEnquiries: user.role === 'VENDOR' ? null : enqConverted,
      },
      monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      recentOrders,
      recentEnquiries: user.role === 'VENDOR' ? [] : recentEnquiries,
    };
  }

  @Get('reports/:kind')
  @Requires('REPORTS', 'view')
  async report(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = rangeQuery.parse(raw);
    const { from, to } = range(q, 30);
    const build: Record<string, () => Promise<{ rows: Record<string, unknown>[]; columns: CsvColumn<Record<string, unknown>>[]; summary?: Record<string, unknown> }>> = {
      sales: () => this.sales(user, from, to),
      gst: () => this.gst(user, from, to),
      enquiries: () => this.enquiries(user, from, to),
      whatsapp: () => this.whatsapp(user, from, to),
      partners: () => this.partners(user, from, to),
      products: () => this.products(user, from, to),
    };
    if (!build[kind]) throw notFound('Report');
    if (kind === 'gst' && user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF' && user.role !== 'CITY_MANAGER') throw notFound('Report');
    const r = await build[kind]!();
    if (q.format === 'csv') {
      sendCsv(res, `${kind}-${dayKey(from)}-to-${dayKey(to)}.csv`, r.rows, r.columns);
      return;
    }
    return { range: { from, to }, columns: r.columns.map((c) => c.header), rows: r.rows, summary: r.summary ?? null };
  }

  /** Paid sales by day: orders, gross, discounts, GST, refunds and net. */
  private async sales(user: AuthUser, from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: { AND: [orderScope(user), { placedAt: { gte: from, lte: to }, paymentStatus: { in: [...PAID!, 'REFUNDED'] } }] },
      select: { placedAt: true, totalPaise: true, discountPaise: true, gstPaise: true, deliveryPaise: true },
    });
    const refunds = await this.prisma.refund.findMany({ where: { status: 'COMPLETED', createdAt: { gte: from, lte: to }, order: orderScope(user) }, select: { createdAt: true, amountPaise: true } });
    const days = new Map<string, { day: string; orders: number; grossPaise: number; discountPaise: number; deliveryPaise: number; gstPaise: number; refundsPaise: number; netPaise: number }>();
    const get = (k: string) => days.get(k) ?? days.set(k, { day: k, orders: 0, grossPaise: 0, discountPaise: 0, deliveryPaise: 0, gstPaise: 0, refundsPaise: 0, netPaise: 0 }).get(k)!;
    for (const o of orders) {
      const d = get(dayKey(o.placedAt));
      d.orders++;
      d.grossPaise += o.totalPaise;
      d.discountPaise += o.discountPaise;
      d.deliveryPaise += o.deliveryPaise;
      d.gstPaise += o.gstPaise;
    }
    for (const r of refunds) get(dayKey(r.createdAt)).refundsPaise += r.amountPaise;
    const rows = [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({ ...d, netPaise: d.grossPaise - d.refundsPaise }));
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
    return {
      rows,
      summary: { orders: sum('orders'), grossPaise: sum('grossPaise'), refundsPaise: sum('refundsPaise'), netPaise: sum('netPaise'), averageOrderPaise: sum('orders') ? Math.round(sum('grossPaise') / sum('orders')) : 0 },
      columns: [
        { header: 'Day', value: (r: any) => r.day },
        { header: 'Paid orders', value: (r: any) => r.orders },
        { header: 'Gross (₹)', value: (r: any) => r.grossPaise / 100 },
        { header: 'Discounts (₹)', value: (r: any) => r.discountPaise / 100 },
        { header: 'Delivery (₹)', value: (r: any) => r.deliveryPaise / 100 },
        { header: 'GST (₹)', value: (r: any) => r.gstPaise / 100 },
        { header: 'Refunds (₹)', value: (r: any) => r.refundsPaise / 100 },
        { header: 'Net (₹)', value: (r: any) => r.netPaise / 100 },
      ],
    };
  }

  /** Invoice register for GST filing. */
  private async gst(user: AuthUser, from: Date, to: Date) {
    const inv = await this.prisma.invoice.findMany({ where: { issuedAt: { gte: from, lte: to }, order: orderScope(user) }, orderBy: [{ financialYear: 'asc' }, { sequence: 'asc' }], include: { order: { select: { number: true, contactName: true } } } });
    const rows = inv.map((i) => ({ number: i.number, date: dayKey(i.issuedAt), order: i.order.number, customer: i.order.contactName, buyerGstin: i.buyerGstin ?? '', placeOfSupply: i.placeOfSupply, taxablePaise: i.totalPaise - i.cgstPaise - i.sgstPaise - i.igstPaise, cgstPaise: i.cgstPaise, sgstPaise: i.sgstPaise, igstPaise: i.igstPaise, totalPaise: i.totalPaise }));
    const sum = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
    return {
      rows,
      summary: { invoices: rows.length, taxablePaise: sum('taxablePaise'), cgstPaise: sum('cgstPaise'), sgstPaise: sum('sgstPaise'), igstPaise: sum('igstPaise'), totalPaise: sum('totalPaise') },
      columns: [
        { header: 'Invoice', value: (r: any) => r.number },
        { header: 'Date', value: (r: any) => r.date },
        { header: 'Order', value: (r: any) => r.order },
        { header: 'Customer', value: (r: any) => r.customer },
        { header: 'Buyer GSTIN', value: (r: any) => r.buyerGstin },
        { header: 'Place of supply', value: (r: any) => r.placeOfSupply },
        { header: 'Taxable (₹)', value: (r: any) => r.taxablePaise / 100 },
        { header: 'CGST (₹)', value: (r: any) => r.cgstPaise / 100 },
        { header: 'SGST (₹)', value: (r: any) => r.sgstPaise / 100 },
        { header: 'IGST (₹)', value: (r: any) => r.igstPaise / 100 },
        { header: 'Total (₹)', value: (r: any) => r.totalPaise / 100 },
      ],
    };
  }

  /** Enquiries by type: count, converted, conversion and median first response. */
  private async enquiries(user: AuthUser, from: Date, to: Date) {
    const list = await this.prisma.enquiry.findMany({ where: { AND: [enquiriesFor(user), { createdAt: { gte: from, lte: to } }] }, select: { type: true, stage: true, createdAt: true, firstResponseAt: true } });
    const by = new Map<string, { type: string; enquiries: number; open: number; converted: number; closed: number; responseMins: number[] }>();
    for (const e of list) {
      const r = by.get(e.type) ?? by.set(e.type, { type: e.type, enquiries: 0, open: 0, converted: 0, closed: 0, responseMins: [] }).get(e.type)!;
      r.enquiries++;
      if (e.stage === 'CONVERTED') r.converted++;
      else if (e.stage === 'CLOSED') r.closed++;
      else r.open++;
      if (e.firstResponseAt) r.responseMins.push((e.firstResponseAt.getTime() - e.createdAt.getTime()) / 60_000);
    }
    const median = (xs: number[]) => (xs.length ? Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!) : null);
    const rows = [...by.values()].map(({ responseMins, ...r }) => ({ ...r, conversionPct: pct(r.converted, r.enquiries), medianResponseMins: median(responseMins) }));
    const total = rows.reduce((s, r) => s + r.enquiries, 0);
    const converted = rows.reduce((s, r) => s + r.converted, 0);
    return {
      rows,
      summary: { enquiries: total, converted, conversionPct: pct(converted, total) },
      columns: [
        { header: 'Type', value: (r: any) => r.type },
        { header: 'Enquiries', value: (r: any) => r.enquiries },
        { header: 'Open', value: (r: any) => r.open },
        { header: 'Converted', value: (r: any) => r.converted },
        { header: 'Closed', value: (r: any) => r.closed },
        { header: 'Conversion %', value: (r: any) => r.conversionPct },
        { header: 'Median first response (min)', value: (r: any) => r.medianResponseMins ?? '' },
      ],
    };
  }

  /** WhatsApp analytics: which products, cities and sources produce enquiries and orders, and how they convert. */
  private async whatsapp(user: AuthUser, from: Date, to: Date) {
    const list = await this.prisma.enquiry.findMany({
      where: { AND: [enquiriesFor(user), { createdAt: { gte: from, lte: to } }] },
      select: { source: true, stage: true, product: { select: { name: true, sku: true } }, city: { select: { name: true } }, whatsAppNumber: { select: { label: true } }, convertedOrder: { select: { totalPaise: true, paymentStatus: true } } },
    });
    // Field order matches the columns, so the admin table lines up.
    const rows: Array<{ dimension: string; value: string; enquiries: number; orders: number; conversionPct: number; salesPaise: number }> = [];
    const group = (dimension: string, keyOf: (e: (typeof list)[number]) => string) => {
      const m = new Map<string, { enquiries: number; orders: number; salesPaise: number }>();
      for (const e of list) {
        const k = keyOf(e);
        const r = m.get(k) ?? m.set(k, { enquiries: 0, orders: 0, salesPaise: 0 }).get(k)!;
        r.enquiries++;
        if (e.convertedOrder) {
          r.orders++;
          if (PAID!.includes(e.convertedOrder.paymentStatus)) r.salesPaise += e.convertedOrder.totalPaise;
        }
      }
      for (const [value, r] of [...m.entries()].sort((a, b) => b[1].enquiries - a[1].enquiries)) rows.push({ dimension, value, enquiries: r.enquiries, orders: r.orders, conversionPct: pct(r.orders, r.enquiries), salesPaise: r.salesPaise });
    };
    group('Product', (e) => (e.product ? `${e.product.name} (${e.product.sku})` : 'No product (general)'));
    group('City', (e) => e.city?.name ?? 'Unknown city');
    group('Source', (e) => e.source || 'Direct');
    group('WhatsApp number', (e) => e.whatsAppNumber?.label ?? 'Not routed');
    const orders = list.filter((e) => e.convertedOrder).length;
    return {
      rows,
      summary: { enquiries: list.length, orders, conversionPct: pct(orders, list.length) },
      columns: [
        { header: 'By', value: (r: any) => r.dimension },
        { header: 'Value', value: (r: any) => r.value },
        { header: 'Enquiries', value: (r: any) => r.enquiries },
        { header: 'Orders', value: (r: any) => r.orders },
        { header: 'Conversion %', value: (r: any) => r.conversionPct },
        { header: 'Paid sales (₹)', value: (r: any) => r.salesPaise / 100 },
      ],
    };
  }

  /** Franchise and vendor performance (each partner sees only their own row). */
  private async partners(user: AuthUser, from: Date, to: Date) {
    const orders = await this.prisma.order.findMany({
      where: { AND: [orderScope(user), { placedAt: { gte: from, lte: to } }] },
      select: { status: true, paymentStatus: true, totalPaise: true, vendor: { select: { name: true } }, franchise: { select: { name: true } } },
    });
    const rows: Array<{ kind: string; name: string; orders: number; delivered: number; cancelled: number; salesPaise: number }> = [];
    for (const [kind, keyOf] of [['Franchise', (o: (typeof orders)[number]) => o.franchise?.name], ['Vendor', (o: (typeof orders)[number]) => o.vendor?.name]] as const) {
      const m = new Map<string, { orders: number; delivered: number; cancelled: number; salesPaise: number }>();
      for (const o of orders) {
        const k = keyOf(o);
        if (!k) continue;
        const r = m.get(k) ?? m.set(k, { orders: 0, delivered: 0, cancelled: 0, salesPaise: 0 }).get(k)!;
        r.orders++;
        if (o.status === 'DELIVERED') r.delivered++;
        if (CLOSED_BAD!.includes(o.status)) r.cancelled++;
        if (PAID!.includes(o.paymentStatus)) r.salesPaise += o.totalPaise;
      }
      for (const [name, r] of [...m.entries()].sort((a, b) => b[1].salesPaise - a[1].salesPaise)) rows.push({ kind, name, ...r });
    }
    return {
      rows,
      columns: [
        { header: 'Partner', value: (r: any) => r.kind },
        { header: 'Name', value: (r: any) => r.name },
        { header: 'Orders', value: (r: any) => r.orders },
        { header: 'Delivered', value: (r: any) => r.delivered },
        { header: 'Cancelled / failed / returned', value: (r: any) => r.cancelled },
        { header: 'Paid sales (₹)', value: (r: any) => r.salesPaise / 100 },
      ],
    };
  }

  /** Best-selling pieces in paid orders. */
  private async products(user: AuthUser, from: Date, to: Date) {
    const items = await this.prisma.orderItem.groupBy({
      by: ['sku', 'name'],
      where: { order: { AND: [orderScope(user), { placedAt: { gte: from, lte: to }, paymentStatus: { in: PAID } }] } },
      _sum: { quantity: true, lineTotalPaise: true },
      _count: { _all: true },
      orderBy: { _sum: { lineTotalPaise: 'desc' } },
      take: 200,
    });
    const rows = items.map((i) => ({ sku: i.sku, name: i.name, orders: i._count._all, quantity: i._sum.quantity ?? 0, salesPaise: i._sum.lineTotalPaise ?? 0 }));
    return {
      rows,
      columns: [
        { header: 'SKU', value: (r: any) => r.sku },
        { header: 'Piece', value: (r: any) => r.name },
        { header: 'Orders', value: (r: any) => r.orders },
        { header: 'Quantity', value: (r: any) => r.quantity },
        { header: 'Sales (₹)', value: (r: any) => r.salesPaise / 100 },
      ],
    };
  }
}

@Module({ controllers: [ReportsController, FarmSalesController] })
export class ReportsModule {}
