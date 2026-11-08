import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import sharp from 'sharp';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { can, formatINR, normalisePoStage, paise, PO_DEFAULT_GST_PERCENT, PO_DONE_STAGES, PO_HEAD_OFFICE_STAGES, PO_WORK_STAGES, poBillMismatch, poCost, type PoStage } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { config } from '../../config/config';
import { listQuery, orderBy, paginate } from '../../common/list';
import { sendCsv } from '../../common/csv';
import { purchaseOrderScope } from '../../common/scope';
import { formatPoNumber, SequenceService } from '../../common/sequence.service';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { purchaseOrderPdf } from '../documents/pdf';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { costOf, num, productPrefill } from './po-specs';

const PO_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'IN_PRODUCTION', 'RECEIVED', 'CLOSED'] as const;
const PO_NEXT: Record<string, string[]> = { DRAFT: ['SENT', 'CLOSED'], SENT: ['ACCEPTED', 'CLOSED'], ACCEPTED: ['IN_PRODUCTION', 'CLOSED'], IN_PRODUCTION: ['RECEIVED'], RECEIVED: ['CLOSED'], CLOSED: [] };
/** What the manufacturer may do itself; everything else is head office. */
const MAKER_STATUSES = ['ACCEPTED', 'IN_PRODUCTION'];
const headOffice = (u: AuthUser) => u.role === 'SUPER_ADMIN' || u.role === 'STAFF';

/** CAD formats jewellers use (Rhino, JewelCAD, Matrix, STL/OBJ/STEP/IGES, DXF/DWG), plus PDF and images. */
const CAD_EXTENSIONS = ['3dm', 'stl', 'obj', 'step', 'stp', 'igs', 'iges', 'dxf', 'dwg', 'jcd', 'mgx', 'zip', 'pdf', 'jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGES = 10;

/** A real calendar date (typing slips like "15/11" or "123" are refused), this century. */
const poDate = z.coerce
  .date({ errorMap: () => ({ message: 'Enter a date like 2026-12-31' }) })
  .refine((d) => d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2100, 'Enter a date like 2026-12-31');
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
/** How head office paid the manufacturer. */
const PO_PAY_METHODS = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'OTHER'] as const;
const poPaymentInput = z.object({
  amountPaise: paise.min(1, 'Enter the amount paid'),
  method: z.enum(PO_PAY_METHODS).default('BANK_TRANSFER'),
  reference: z.string().trim().max(80).optional().nullable(),
  paidOn: poDate.optional(),
  note: z.string().trim().max(300).optional().nullable(),
});
interface PoPayment {
  id: string;
  amountPaise: number;
  method: (typeof PO_PAY_METHODS)[number];
  reference: string | null;
  paidOn: string;
  note: string | null;
  at: string;
  by: string;
}
const paymentsOf = (p: { manufacturerPayments?: Prisma.JsonValue | null }): PoPayment[] => (Array.isArray(p.manufacturerPayments) ? (p.manufacturerPayments as unknown as PoPayment[]) : []);
const paidOf = (p: { manufacturerPayments?: Prisma.JsonValue | null }) => paymentsOf(p).reduce((sum, x) => sum + (x.amountPaise ?? 0), 0);
/** What is owed for a PO: the bill once uploaded, otherwise the expected making charge (or the agreed cost). */
const owedOf = (p: Parameters<typeof costOf>[0] & { agreedCostPaise: number; billAmountPaise: number | null }) => p.billAmountPaise ?? costOf(p)?.totalPaise ?? p.agreedCostPaise;
/** Paying a manufacturer is money going out: head office with the Payments edit right (D63). */
function assertMayPay(user: AuthUser) {
  if (!headOffice(user) || !can({ role: user.role, staffGrants: user.grants }, 'PAYMENTS', 'edit')) throw forbidden('Only head office with the Payments right records payments to a manufacturer.');
}
const decimal = (max: number) => z.number().positive().max(max).nullable().optional();
/** The exact numbers for this piece; the same SR-coded design differs piece to piece (meeting of 31 Oct). */
const specInput = {
  pearlSizeMm: decimal(100),
  pearlWeightCt: decimal(100_000),
  metal: z.string().trim().max(40).nullable().optional(),
  metalWeightG: decimal(100_000),
  ringSize: z.string().trim().max(12).nullable().optional(),
  makingRatePerGramPaise: paise.max(10_000_000).nullable().optional(),
  gstPercent: z.number().min(0).max(28).optional(),
};
const poInput = z.object({
  manufacturerId: z.string().min(1),
  orderId: z.string().optional().nullable(),
  customRequestId: z.string().optional().nullable(),
  /** Pick a catalogue piece; its numbers fill the specification and stay editable. */
  productId: z.string().optional().nullable(),
  size: z.string().trim().max(12).optional().nullable(),
  /** "Other notes / specification" */
  specification: z.string().trim().max(5000).optional(),
  quantity: z.number().int().min(1).max(10_000).default(1),
  /** Defaults to the computed making charge (weight × rate × quantity + GST). */
  agreedCostPaise: paise.min(1).optional(),
  dueDate: poDate,
  notes: z.string().trim().max(2000).optional().nullable(),
  ...specInput,
});
type PoInput = z.infer<typeof poInput>;
const updateInput = poInput.omit({ orderId: true, customRequestId: true, quantity: true }).extend({ quantity: z.number().int().min(1).max(10_000).optional() }).partial();

const dec3 = (n: number | null | undefined) => (n == null ? n : Number(n.toFixed(3)));
/** "purchase-orders/<id>/cad/1a2b3c4d-ring_v2.3dm" → "ring_v2.3dm" */
const fileNameOf = (url: string | null) => (url ? (url.split('/').pop() ?? '').replace(/^[0-9a-f]{8}-/, '') : null);
const safeName = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-80) || 'file';

const LOAD_INCLUDE = {
  manufacturer: true,
  product: { select: { id: true, name: true, sku: true, sizes: true } },
  order: { select: { id: true, number: true, customRequest: { select: { id: true, stage: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

@ApiTags('purchase orders')
@Controller('admin/purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: SequenceService,
    private readonly settings: SettingsService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async load(user: AuthUser, id: string) {
    const p = await this.prisma.purchaseOrder.findFirst({ where: { AND: [{ id }, purchaseOrderScope(user)] }, include: LOAD_INCLUDE });
    if (!p) throw notFound('Purchase order');
    return p;
  }

  /** The PO with its computed making charge, the bill check and links that open (private files are signed). */
  private async present(user: AuthUser, id: string) {
    const p = await this.load(user, id);
    const cost = costOf(p);
    const expected = cost?.totalPaise ?? p.agreedCostPaise;
    const [images, cadLink, billLink] = await Promise.all([Promise.all(p.imageUrls.map(async (u) => ({ stored: u, url: await this.media.resolve(u, 3600) }))), this.media.resolve(p.cadUrl, 3600), this.media.resolve(p.billUrl, 3600)]);
    return {
      ...p,
      stage: normalisePoStage(p.stage),
      cost,
      images,
      cad: p.cadUrl ? { name: fileNameOf(p.cadUrl), url: cadLink } : null,
      bill: p.billUrl ? { url: billLink, amountPaise: p.billAmountPaise, uploadedAt: p.billUploadedAt, mismatch: poBillMismatch(p.billAmountPaise, expected), expectedPaise: expected } : null,
      payments: paymentsOf(p),
      paidPaise: paidOf(p),
      owedPaise: owedOf(p),
      balancePaise: owedOf(p) - paidOf(p),
    };
  }

  private async renderPdf(id: string) {
    const p = await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { manufacturer: { include: { city: true } }, order: true, product: { select: { name: true, sku: true } } } });
    const cost = costOf(p);
    const images: Buffer[] = [];
    for (const u of p.imageUrls.slice(0, 4)) {
      const raw = await this.media.read(u);
      if (!raw) continue;
      try {
        images.push(await sharp(raw, { limitInputPixels: 48_000_000 }).rotate().resize(360, 360, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer());
      } catch {
        // Not an image we can read: left out of the PDF.
      }
    }
    const buffer = await purchaseOrderPdf({
      store: await this.settings.get('store'),
      number: p.number,
      createdAt: p.createdAt,
      dueDate: p.dueDate,
      manufacturer: { name: p.manufacturer.name, contactName: p.manufacturer.contactName, phone: p.manufacturer.phone, email: p.manufacturer.email, city: p.manufacturer.city?.name },
      orderNumber: p.order?.number,
      piece: p.product ? `${p.product.name} (${p.product.sku})` : null,
      specs: {
        pearlSizeMm: p.pearlSizeMm?.toString() ?? null,
        pearlWeightCt: p.pearlWeightCt?.toString() ?? null,
        metal: p.metal,
        metalWeightG: p.metalWeightG?.toString() ?? null,
        ringSize: p.ringSize ?? p.size,
      },
      specification: p.specification,
      quantity: p.quantity,
      agreedCostPaise: p.agreedCostPaise,
      making: cost && p.makingRatePerGramPaise ? { ratePerGramPaise: p.makingRatePerGramPaise, gstPercent: String(Number(p.gstPercent)), ...cost } : null,
      pearlsSentAt: p.pearlsSentAt,
      images,
      cadFileName: fileNameOf(p.cadUrl),
      notes: p.notes,
    });
    const stored = await this.media.putBuffer(`purchase-orders/${p.number}.pdf`, buffer, 'application/pdf', 'private');
    await this.prisma.purchaseOrder.update({ where: { id }, data: { pdfUrl: stored.url } });
    return buffer;
  }

  private history(p: { stageHistory: Prisma.JsonValue }, entry: { stage: string; note?: string | null }, user: AuthUser): Prisma.InputJsonValue {
    const list = Array.isArray(p.stageHistory) ? (p.stageHistory as Prisma.JsonArray) : [];
    return [...list, { stage: entry.stage, ...(entry.note ? { note: entry.note } : {}), at: new Date().toISOString(), by: user.name }];
  }

  /** Every work update goes to head office by email. */
  private async tellHeadOffice(p: { id: string; number: string; manufacturer: { name: string } }, stage: string) {
    const admins = await this.prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true, email: { not: null } }, select: { email: true } });
    const vars = { number: p.number, manufacturer: p.manufacturer.name, stage, poUrl: `${config().ADMIN_URL}/purchase-orders/${p.id}` };
    for (const a of admins) await this.notifications.send({ templateKey: 'PO_STAGE', vars, to: { email: a.email! }, context: { purchaseOrderId: p.id } });
  }

  /** The customized order's production stage follows its PO. */
  private async followCustom(p: Awaited<ReturnType<PurchaseOrdersController['load']>>, status: string, user: AuthUser) {
    const c = p.order?.customRequest;
    const follow: Record<string, [string, string]> = { IN_PRODUCTION: ['PO_RAISED', 'IN_MANUFACTURING'], RECEIVED: ['IN_MANUFACTURING', 'QUALITY_CHECK'] };
    if (!c || !follow[status] || c.stage !== follow[status]![0]) return;
    const full = await this.prisma.customRequest.findUniqueOrThrow({ where: { id: c.id } });
    const history = Array.isArray(full.stageHistory) ? (full.stageHistory as Prisma.JsonArray) : [];
    await this.prisma.customRequest.update({ where: { id: c.id }, data: { stage: follow[status]![1] as 'IN_MANUFACTURING', stageHistory: [...history, { stage: follow[status]![1], at: new Date().toISOString(), by: user.name, note: `${p.number} ${status.toLowerCase().replace('_', ' ')}` }] } });
  }

  @Get()
  @Requires('PURCHASE_ORDERS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = listQuery.extend({ status: z.enum(PO_STATUSES).optional(), manufacturerId: z.string().optional(), format: z.enum(['json', 'csv']).optional() }).parse(raw);
    const where: Prisma.PurchaseOrderWhereInput = {
      AND: [
        purchaseOrderScope(user),
        q.status ? { status: q.status } : {},
        q.manufacturerId ? { manufacturerId: q.manufacturerId } : {},
        q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { specification: { contains: q.q, mode: 'insensitive' } }, { metal: { contains: q.q, mode: 'insensitive' } }, { order: { number: { contains: q.q, mode: 'insensitive' } } }, { product: { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } }] } : {},
      ],
    };
    const include = { manufacturer: { select: { id: true, name: true } }, product: { select: { id: true, name: true, sku: true } }, order: { select: { id: true, number: true } } };
    if (q.format === 'csv') {
      const rows = await this.prisma.purchaseOrder.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 50_000 });
      sendCsv(res, 'purchase-orders.csv', rows, [
        { header: 'PO', value: (r) => r.number },
        { header: 'Date', value: (r) => r.createdAt },
        { header: 'Manufacturer', value: (r) => r.manufacturer.name },
        { header: 'Order', value: (r) => r.order?.number },
        { header: 'SR code', value: (r) => r.product?.sku },
        { header: 'Pearl size (mm)', value: (r) => num(r.pearlSizeMm) },
        { header: 'Pearl weight (ct)', value: (r) => num(r.pearlWeightCt) },
        { header: 'Metal', value: (r) => r.metal },
        { header: 'Metal weight (g)', value: (r) => num(r.metalWeightG) },
        { header: 'Ring size', value: (r) => r.ringSize ?? r.size },
        { header: 'Quantity', value: (r) => r.quantity },
        { header: 'Making rate (₹/g)', value: (r) => (r.makingRatePerGramPaise == null ? '' : r.makingRatePerGramPaise / 100) },
        { header: 'Making + GST (₹)', value: (r) => (costOf(r)?.totalPaise ?? 0) / 100 || '' },
        { header: 'Agreed cost (₹)', value: (r) => r.agreedCostPaise / 100 },
        { header: 'Bill (₹)', value: (r) => (r.billAmountPaise == null ? '' : r.billAmountPaise / 100) },
        { header: 'Paid to manufacturer (₹)', value: (r) => paidOf(r) / 100 },
        { header: 'Balance (₹)', value: (r) => (r.status === 'DRAFT' ? '' : (owedOf(r) - paidOf(r)) / 100) },
        { header: 'Due', value: (r) => r.dueDate },
        { header: 'Status', value: (r) => r.status },
        { header: 'Stage', value: (r) => normalisePoStage(r.stage) },
      ]);
      return;
    }
    const page = await paginate(q, () => this.prisma.purchaseOrder.count({ where }), (skip, take) => this.prisma.purchaseOrder.findMany({ where, include, orderBy: orderBy(q.sort, ['createdAt', 'dueDate', 'agreedCostPaise'], { createdAt: 'desc' }), skip, take }));
    return {
      ...page,
      items: page.items.map((r) => {
        const cost = costOf(r);
        return { ...r, stage: normalisePoStage(r.stage), cost, billMismatch: poBillMismatch(r.billAmountPaise, cost?.totalPaise ?? r.agreedCostPaise), paidPaise: paidOf(r), balancePaise: owedOf(r) - paidOf(r) };
      }),
    };
  }

  /**
   * The manufacturer's earnings at a glance (head office sees the same for everyone, or one manufacturer):
   * work completed (ready for pickup or received), the amount due on it, and bills uploaded.
   */
  @Get('summary')
  @Requires('PURCHASE_ORDERS', 'view')
  async summary(@CurrentUser() user: AuthUser, @Query('manufacturerId') manufacturerId?: string) {
    const rows = await this.prisma.purchaseOrder.findMany({
      where: { AND: [purchaseOrderScope(user), manufacturerId ? { manufacturerId } : {}, { status: { not: 'DRAFT' } }] },
      select: { status: true, stage: true, quantity: true, agreedCostPaise: true, metalWeightG: true, makingRatePerGramPaise: true, gstPercent: true, billAmountPaise: true, billUploadedAt: true, manufacturerPayments: true },
    });
    const done = (r: (typeof rows)[number]) => r.status === 'RECEIVED' || PO_DONE_STAGES.includes(normalisePoStage(r.stage) as PoStage) || (r.status === 'CLOSED' && r.billUploadedAt != null);
    const completed = rows.filter(done);
    const due = (r: (typeof rows)[number]) => costOf(r)?.totalPaise ?? r.agreedCostPaise;
    const bills = rows.filter((r) => r.billUploadedAt);
    return {
      inProgress: rows.filter((r) => ['SENT', 'ACCEPTED', 'IN_PRODUCTION'].includes(r.status) && !done(r)).length,
      completed: { count: completed.length, pieces: completed.reduce((s, r) => s + r.quantity, 0) },
      amountDuePaise: completed.reduce((s, r) => s + due(r), 0),
      bills: { count: bills.length, amountPaise: bills.reduce((s, r) => s + (r.billAmountPaise ?? 0), 0), mismatches: bills.filter((r) => poBillMismatch(r.billAmountPaise, due(r))).length },
      awaitingBill: completed.filter((r) => !r.billUploadedAt).length,
      paidPaise: rows.reduce((sum, r) => sum + paidOf(r), 0),
      /** Still to pay on completed work: the bill (or expected amount) less what has been paid. */
      outstandingPaise: completed.reduce((sum, r) => sum + Math.max(0, owedOf(r) - paidOf(r)), 0),
    };
  }

  /** A catalogue piece's numbers, photos and last making rate, to fill a new PO. */
  @Get('prefill')
  @Requires('PURCHASE_ORDERS', 'create')
  async prefill(@Query('productId') productId: string) {
    const p = productId ? await productPrefill(this.prisma, productId) : null;
    if (!p) throw notFound('Product');
    return { ...p, images: await Promise.all(p.imageUrls.map(async (u) => ({ stored: u, url: await this.media.resolve(u, 3600) }))) };
  }

  @Get(':id')
  @Requires('PURCHASE_ORDERS', 'view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.present(user, id);
  }

  /** Choose a manufacturer and generate a numbered PO PDF. Linking a customized order moves it to PO Raised. */
  @Post()
  @Requires('PURCHASE_ORDERS', 'create')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(poInput)) dto: PoInput) {
    if (!headOffice(user)) throw forbidden('Only head office raises purchase orders.');
    const m = await this.prisma.manufacturer.findFirst({ where: { id: dto.manufacturerId, isActive: true } });
    if (!m) throw badRequest('INVALID_MANUFACTURER', 'Choose an active manufacturer.', { manufacturerId: 'Inactive or missing' });
    let orderId = dto.orderId ?? null;
    let custom: { id: string; stage: string; stageHistory: Prisma.JsonValue; referenceImageUrls: string[] } | null = null;
    if (dto.customRequestId) {
      const c = await this.prisma.customRequest.findFirst({ where: { id: dto.customRequestId }, select: { id: true, stage: true, stageHistory: true, orderId: true, referenceImageUrls: true } });
      if (!c) throw notFound('Customized order');
      if (!c.orderId) throw badRequest('ADVANCE_FIRST', 'Record the advance (which creates the order) before raising a PO.');
      orderId = c.orderId;
      custom = c;
    }
    if (orderId && !(await this.prisma.order.findUnique({ where: { id: orderId } }))) throw notFound('Order');
    // A catalogue piece fills in the numbers it has; anything typed wins (each piece differs).
    const prod = dto.productId ? await productPrefill(this.prisma, dto.productId) : null;
    if (dto.productId && !prod) throw notFound('Product');
    const pick = <K extends 'pearlSizeMm' | 'pearlWeightCt' | 'metalWeightG' | 'makingRatePerGramPaise'>(k: K) => (dto[k] !== undefined ? dto[k] : (prod?.[k] ?? null));
    const spec = {
      pearlSizeMm: dec3(pick('pearlSizeMm')),
      pearlWeightCt: dec3(pick('pearlWeightCt')),
      metal: dto.metal !== undefined ? dto.metal || null : (prod?.metal ?? null),
      metalWeightG: dec3(pick('metalWeightG')),
      ringSize: dto.ringSize || dto.size || null,
      makingRatePerGramPaise: pick('makingRatePerGramPaise'),
      gstPercent: dto.gstPercent ?? prod?.gstPercent ?? PO_DEFAULT_GST_PERCENT,
    };
    const specification = dto.specification ?? '';
    if (!prod && specification.length < 5 && !spec.metal) throw badRequest('SPEC_REQUIRED', 'Pick a piece from the catalogue, or fill in the metal and the specification.', { specification: 'Required' });
    const cost = poCost({ ...spec, quantity: dto.quantity });
    const agreedCostPaise = dto.agreedCostPaise ?? cost?.totalPaise;
    if (!agreedCostPaise) throw badRequest('COST_REQUIRED', 'Enter the metal weight and making rate, or the agreed cost.', { agreedCostPaise: 'Required' });
    const year = new Date().getFullYear();
    const po = await this.prisma.$transaction(async (tx) => {
      const n = await this.sequences.next(`po:${year}`, tx);
      const created = await tx.purchaseOrder.create({
        data: {
          number: formatPoNumber(year, n),
          manufacturerId: m.id,
          orderId,
          productId: prod?.id ?? null,
          size: dto.size ?? null,
          specification,
          quantity: dto.quantity,
          agreedCostPaise,
          dueDate: dto.dueDate,
          notes: dto.notes,
          createdById: user.id,
          ...spec,
          // The design's photos (or the customer's reference photos) go with the PO, so the manufacturer needs no SR code.
          imageUrls: (prod?.imageUrls ?? custom?.referenceImageUrls ?? []).slice(0, MAX_IMAGES),
        },
      });
      if (orderId) {
        await tx.order.update({ where: { id: orderId }, data: { manufacturerId: m.id } });
        await tx.orderEvent.create({ data: { orderId, actorId: user.id, type: 'ASSIGNED', message: `Purchase order ${created.number} raised with ${m.name}` } });
      }
      if (custom && custom.stage === 'ADVANCE_PAID') {
        const history = Array.isArray(custom.stageHistory) ? (custom.stageHistory as Prisma.JsonArray) : [];
        await tx.customRequest.update({ where: { id: custom.id }, data: { stage: 'PO_RAISED', stageHistory: [...history, { stage: 'PO_RAISED', at: new Date().toISOString(), by: user.name, note: created.number }] } });
      }
      await this.audit.record('PurchaseOrder', created.id, 'CREATE', undefined, { number: created.number, manufacturerId: m.id, agreedCostPaise }, tx);
      return created;
    });
    await this.renderPdf(po.id);
    return this.present(user, po.id);
  }

  /** A draft can change; the agreed cost follows the computed making charge unless it was set by hand. */
  @Patch(':id')
  @Requires('PURCHASE_ORDERS', 'edit')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(updateInput)) dto: z.infer<typeof updateInput>) {
    if (!headOffice(user)) throw forbidden('Only head office changes a purchase order.');
    const p = await this.load(user, id);
    if (p.status !== 'DRAFT') throw badRequest('PO_LOCKED', 'Only a draft purchase order can be changed. Close it and raise a new one.');
    if (dto.manufacturerId && !(await this.prisma.manufacturer.findFirst({ where: { id: dto.manufacturerId, isActive: true } }))) throw badRequest('INVALID_MANUFACTURER', 'Choose an active manufacturer.', { manufacturerId: 'Inactive or missing' });
    if (dto.productId && !(await this.prisma.product.findFirst({ where: { id: dto.productId, archivedAt: null } }))) throw notFound('Product');
    const data: Prisma.PurchaseOrderUncheckedUpdateInput = {
      ...dto,
      ...(dto.pearlSizeMm !== undefined ? { pearlSizeMm: dec3(dto.pearlSizeMm) } : {}),
      ...(dto.pearlWeightCt !== undefined ? { pearlWeightCt: dec3(dto.pearlWeightCt) } : {}),
      ...(dto.metalWeightG !== undefined ? { metalWeightG: dec3(dto.metalWeightG) } : {}),
    };
    if (dto.agreedCostPaise === undefined) {
      const before = costOf(p);
      const after = poCost({
        metalWeightG: dto.metalWeightG !== undefined ? dto.metalWeightG : num(p.metalWeightG),
        makingRatePerGramPaise: dto.makingRatePerGramPaise !== undefined ? dto.makingRatePerGramPaise : p.makingRatePerGramPaise,
        quantity: dto.quantity ?? p.quantity,
        gstPercent: dto.gstPercent ?? Number(p.gstPercent),
      });
      const followed = !before || before.totalPaise === p.agreedCostPaise;
      if (after && followed) data.agreedCostPaise = after.totalPaise;
    }
    await this.prisma.purchaseOrder.update({ where: { id }, data });
    await this.audit.record('PurchaseOrder', id, 'UPDATE', { agreedCostPaise: p.agreedCostPaise, dueDate: p.dueDate }, dto);
    await this.renderPdf(id);
    return this.present(user, id);
  }

  /**
   * Draft → Sent → Accepted (by the manufacturer, with the deadline, once the pearls are received) → In production →
   * Received → Closed. The manufacturer can only accept and start; everything else is head office.
   */
  @Post(':id/status')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  async status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ status: z.enum(PO_STATUSES), note: z.string().trim().max(500).optional(), dueDate: poDate.optional() })))
    dto: { status: (typeof PO_STATUSES)[number]; note?: string; dueDate?: Date },
  ) {
    const p = await this.load(user, id);
    if (!headOffice(user) && !MAKER_STATUSES.includes(dto.status)) throw forbidden('Only head office can do this step.');
    if (!PO_NEXT[p.status]!.includes(dto.status)) throw badRequest('INVALID_STEP', `A ${p.status.toLowerCase().replace('_', ' ')} PO cannot move to ${dto.status.toLowerCase().replace('_', ' ')}.`);
    // Pearls first (meeting of 31 Oct): the manufacturer accepts only after confirming the pearls arrived.
    if (dto.status === 'ACCEPTED' && !p.pearlsReceivedAt) throw badRequest('PEARLS_FIRST', 'Confirm “Pearls received” before accepting the purchase order.');
    if (dto.status === 'ACCEPTED' && dto.dueDate && dto.dueDate < startOfToday()) throw badRequest('DUE_IN_PAST', 'The deadline cannot be in the past.', { dueDate: 'In the past' });
    const dueDate = dto.status === 'ACCEPTED' && dto.dueDate ? dto.dueDate : p.dueDate;
    let stamp: Prisma.PurchaseOrderUpdateInput = {};
    if (dto.status === 'SENT' && !p.stage) stamp = { stage: 'Received PO', stageHistory: this.history(p, { stage: 'Received PO', note: dto.note ?? `Sent to ${p.manufacturer.name}` }, user) };
    if (dto.status === 'ACCEPTED') stamp = { stageHistory: this.history(p, { stage: 'Accepted', note: `Due ${dueDate.toLocaleDateString('en-IN')}${dto.note ? ` — ${dto.note}` : ''}` }, user) };
    await this.prisma.purchaseOrder.update({ where: { id }, data: { status: dto.status, dueDate, ...stamp } });
    await this.audit.record('PurchaseOrder', id, 'STATUS', { status: p.status }, dto);
    // Head office hears when the manufacturer accepts or starts.
    if (user.role === 'MANUFACTURER') await this.tellHeadOffice(p, dto.status === 'ACCEPTED' ? `accepted — due ${dueDate.toLocaleDateString('en-IN')}` : dto.status.toLowerCase().replace('_', ' '));
    await this.followCustom(p, dto.status, user);
    if (dto.status === 'SENT' && p.manufacturer.email) {
      await this.renderPdf(id);
      const link = await this.media.resolve((await this.prisma.purchaseOrder.findUniqueOrThrow({ where: { id } })).pdfUrl, 7 * 86400);
      await this.notifications.send({ templateKey: 'PO_SENT', vars: { manufacturer: p.manufacturer.name, number: p.number, dueDate: p.dueDate.toLocaleDateString('en-IN'), pdfUrl: link ?? '' }, to: { email: p.manufacturer.email }, context: { purchaseOrderId: id } });
    }
    return this.present(user, id);
  }

  /** Head office marks the pearls sent; the manufacturer confirms they arrived, which unlocks "Accept". */
  @Post(':id/pearls')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  async pearls(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ step: z.enum(['SENT', 'RECEIVED']), note: z.string().trim().max(500).optional() }))) dto: { step: 'SENT' | 'RECEIVED'; note?: string }) {
    const p = await this.load(user, id);
    if (dto.step === 'SENT') {
      if (!headOffice(user)) throw forbidden('Head office marks the pearls sent.');
      if (!['DRAFT', 'SENT'].includes(p.status)) throw badRequest('INVALID_STEP', 'Pearls are sent before the PO is accepted.');
      if (p.pearlsSentAt) throw badRequest('ALREADY_DONE', 'The pearls are already marked sent.');
      await this.prisma.purchaseOrder.update({ where: { id }, data: { pearlsSentAt: new Date(), stageHistory: this.history(p, { stage: 'Pearls sent', note: dto.note }, user) } });
      await this.audit.record('PurchaseOrder', id, 'PEARLS_SENT', undefined, dto);
      if (p.manufacturer.email)
        await this.notifications.send({ templateKey: 'PO_STAGE', vars: { number: p.number, manufacturer: p.manufacturer.name, stage: `pearls sent${dto.note ? ` — ${dto.note}` : ''}. Please confirm “Pearls received”, then accept with your deadline`, poUrl: `${config().ADMIN_URL}/purchase-orders/${id}` }, to: { email: p.manufacturer.email }, context: { purchaseOrderId: id } });
    } else {
      if (!p.pearlsSentAt) throw badRequest('PEARLS_NOT_SENT', 'Head office has not marked the pearls sent yet.');
      if (p.status !== 'SENT') throw badRequest('INVALID_STEP', 'Pearls are received after the PO is sent and before it is accepted.');
      if (p.pearlsReceivedAt) throw badRequest('ALREADY_DONE', 'The pearls are already marked received.');
      await this.prisma.purchaseOrder.update({ where: { id }, data: { pearlsReceivedAt: new Date(), stage: 'Pearls received', stageHistory: this.history(p, { stage: 'Pearls received', note: dto.note }, user) } });
      await this.audit.record('PurchaseOrder', id, 'STAGE', { stage: p.stage }, { stage: 'Pearls received', note: dto.note });
      await this.tellHeadOffice(p, `Pearls received${dto.note ? ` — ${dto.note}` : ''}`);
    }
    return this.present(user, id);
  }

  /**
   * The manufacturer's work stages (meeting of 31 Oct): Casting → Filing & finishing → Polishing → Rhodium → Pearl
   * setting → Hallmark → Quality check (manufacturer) → Ready for pickup; then head office's quality check at pickup.
   * Head office is emailed on every update.
   */
  @Post(':id/stage')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  async stage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ stage: z.string().trim().min(1).max(60), note: z.string().trim().max(500).optional() }))) dto: { stage: string; note?: string },
  ) {
    const stage = normalisePoStage(dto.stage) as PoStage;
    if (stage === 'Received PO' || stage === 'Pearls received') throw badRequest('USE_FLOW', stage === 'Received PO' ? 'This is set when the PO is sent.' : 'Use “Pearls received”.');
    if (!PO_WORK_STAGES.includes(stage)) throw badRequest('INVALID_STAGE', 'Choose one of the work stages.', { stage: 'Unknown stage' });
    const p = await this.load(user, id);
    const atPickup = PO_HEAD_OFFICE_STAGES.includes(stage);
    if (atPickup && !headOffice(user)) throw forbidden('The quality check at pickup is done by head office.');
    if (!(atPickup ? ['ACCEPTED', 'IN_PRODUCTION', 'RECEIVED'] : ['ACCEPTED', 'IN_PRODUCTION']).includes(p.status)) throw badRequest('NOT_IN_WORK', 'Work stages can be updated once the PO is accepted and until it is received.');
    // The first work stage after acceptance moves the PO into production automatically.
    const start = p.status === 'ACCEPTED';
    await this.prisma.purchaseOrder.update({ where: { id }, data: { stage, stageHistory: this.history(p, { stage, note: dto.note }, user), ...(start ? { status: 'IN_PRODUCTION' } : {}) } });
    await this.audit.record('PurchaseOrder', id, 'STAGE', { stage: p.stage }, { stage, note: dto.note });
    await this.tellHeadOffice(p, stage + (dto.note ? ` — ${dto.note}` : ''));
    if (start) await this.followCustom(p, 'IN_PRODUCTION', user);
    return this.present(user, id);
  }

  /**
   * Files on a PO: the CAD design and photos (head office), and the manufacturer's bill with its amount.
   * Field `kind` is cad, image or bill; a bill also needs `amountPaise`.
   */
  @Post(':id/files')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 6, { limits: { fileSize: 25 * 1024 * 1024, files: 6 } }))
  async files(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFiles() files: Express.Multer.File[] = [], @Body() body: Record<string, string> = {}) {
    const kind = z.enum(['cad', 'image', 'bill']).safeParse(body.kind);
    if (!kind.success) throw badRequest('INVALID_KIND', 'kind must be cad, image or bill.');
    const p = await this.load(user, id);
    if (!files.length) throw badRequest('NO_FILES', 'Choose a file.');
    if (p.status === 'CLOSED' && kind.data !== 'bill') throw badRequest('PO_LOCKED', 'This purchase order is closed.');

    if (kind.data === 'bill') {
      const amount = paise.min(1).safeParse(Number(body.amountPaise));
      if (!amount.success) throw badRequest('AMOUNT_REQUIRED', 'Enter the bill amount.', { amountPaise: 'Required' });
      if (['DRAFT', 'SENT'].includes(p.status)) throw badRequest('NOT_IN_WORK', 'Upload the bill once the PO is accepted.');
      const saved = await this.media.saveDocument(files[0]!, `purchase-orders/${p.id}/bill`, 'private', true);
      await this.prisma.purchaseOrder.update({ where: { id }, data: { billUrl: saved.url, billAmountPaise: amount.data, billUploadedAt: new Date(), stageHistory: this.history(p, { stage: 'Bill uploaded', note: formatINR(amount.data) }, user) } });
      await this.audit.record('PurchaseOrder', id, 'BILL', { billAmountPaise: p.billAmountPaise }, { billAmountPaise: amount.data });
      const expected = costOf(p)?.totalPaise ?? p.agreedCostPaise;
      const mismatch = poBillMismatch(amount.data, expected);
      await this.tellHeadOffice(p, `bill uploaded for ${formatINR(amount.data)}${mismatch ? ` — differs from the expected ${formatINR(expected)}` : ''}`);
      return this.present(user, id);
    }

    if (!headOffice(user)) throw forbidden('Head office adds the CAD file and photos.');
    if (kind.data === 'cad') {
      const f = files[0]!;
      const ext = (f.originalname.split('.').pop() ?? '').toLowerCase();
      if (!CAD_EXTENSIONS.includes(ext)) throw badRequest('UNSUPPORTED_FILE', `Upload a CAD file (${CAD_EXTENSIONS.join(', ')}).`);
      const name = safeName(f.originalname.replace(/\.[^.]+$/, ''));
      const stored = await this.media.putBuffer(`purchase-orders/${p.id}/cad/${randomUUID().slice(0, 8)}-${name}.${ext}`, f.buffer, 'application/octet-stream', 'private');
      await this.prisma.purchaseOrder.update({ where: { id }, data: { cadUrl: stored.url } });
      await this.audit.record('PurchaseOrder', id, 'CAD', { cadUrl: p.cadUrl }, { cadUrl: stored.url });
    } else {
      if (p.imageUrls.length + files.length > MAX_IMAGES) throw badRequest('TOO_MANY', `Up to ${MAX_IMAGES} photos per purchase order.`);
      const saved: string[] = [];
      for (const f of files) {
        if (!f.mimetype.startsWith('image/')) throw badRequest('UNSUPPORTED_FILE', 'Upload JPG, PNG or WebP photos.');
        saved.push((await this.media.saveDocument(f, `purchase-orders/${p.id}/images`, 'private', true)).url);
      }
      await this.prisma.purchaseOrder.update({ where: { id }, data: { imageUrls: { push: saved } } });
    }
    await this.renderPdf(id);
    return this.present(user, id);
  }

  /** Take a photo or the CAD file off the PO (head office). */
  @Post(':id/files/remove')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  async removeFile(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ kind: z.enum(['cad', 'image']), url: z.string().optional() }))) dto: { kind: 'cad' | 'image'; url?: string }) {
    if (!headOffice(user)) throw forbidden('Head office manages the CAD file and photos.');
    const p = await this.load(user, id);
    if (p.status === 'CLOSED') throw badRequest('PO_LOCKED', 'This purchase order is closed.');
    if (dto.kind === 'cad') await this.prisma.purchaseOrder.update({ where: { id }, data: { cadUrl: null } });
    else await this.prisma.purchaseOrder.update({ where: { id }, data: { imageUrls: p.imageUrls.filter((u) => u !== dto.url) } });
    await this.audit.record('PurchaseOrder', id, 'REMOVE_FILE', { cadUrl: p.cadUrl, imageUrls: p.imageUrls }, dto);
    await this.renderPdf(id);
    return this.present(user, id);
  }

  /**
   * Record money paid to the manufacturer for this PO (bank transfer, UPI, cash, cheque), in parts if needed.
   * The PO shows what was paid and the balance against the bill (or the expected making charge).
   */
  @Post(':id/payments')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  async addPayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(poPaymentInput)) dto: z.infer<typeof poPaymentInput>) {
    assertMayPay(user);
    const p = await this.load(user, id);
    if (p.status === 'DRAFT') throw badRequest('NOT_SENT', 'Send the purchase order before paying the manufacturer.');
    const paidOn = dto.paidOn ?? new Date();
    if (paidOn > new Date(Date.now() + 86_400_000)) throw badRequest('PAID_IN_FUTURE', 'The payment date cannot be in the future.', { paidOn: 'In the future' });
    const entry: PoPayment = { id: randomUUID(), amountPaise: dto.amountPaise, method: dto.method, reference: dto.reference || null, paidOn: paidOn.toISOString(), note: dto.note || null, at: new Date().toISOString(), by: user.name };
    const list = [...paymentsOf(p), entry];
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { manufacturerPayments: list as unknown as Prisma.InputJsonValue, stageHistory: this.history(p, { stage: 'Payment made', note: `${formatINR(dto.amountPaise)} by ${dto.method.toLowerCase().replace('_', ' ')}${dto.reference ? ` (${dto.reference})` : ''}` }, user) },
    });
    await this.audit.record('PurchaseOrder', id, 'MANUFACTURER_PAYMENT', { paidPaise: paidOf(p) }, entry);
    if (p.manufacturer.email)
      await this.notifications.send({ templateKey: 'PO_STAGE', vars: { number: p.number, manufacturer: p.manufacturer.name, stage: `payment of ${formatINR(dto.amountPaise)} made${dto.reference ? ` (reference ${dto.reference})` : ''}`, poUrl: `${config().ADMIN_URL}/purchase-orders/${id}` }, to: { email: p.manufacturer.email }, context: { purchaseOrderId: id } });
    return this.present(user, id);
  }

  /** Take back a payment entered by mistake (kept in the audit log). */
  @Post(':id/payments/:paymentId/remove')
  @HttpCode(200)
  @Requires('PURCHASE_ORDERS', 'edit')
  async removePayment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('paymentId') paymentId: string, @Body(new ZodValidationPipe(z.object({ reason: z.string().trim().min(3, 'Say why').max(300) }))) dto: { reason: string }) {
    assertMayPay(user);
    const p = await this.load(user, id);
    const list = paymentsOf(p);
    const gone = list.find((x) => x.id === paymentId);
    if (!gone) throw notFound('Payment');
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { manufacturerPayments: list.filter((x) => x.id !== paymentId) as unknown as Prisma.InputJsonValue, stageHistory: this.history(p, { stage: 'Payment removed', note: `${formatINR(gone.amountPaise)} — ${dto.reason}` }, user) },
    });
    await this.audit.record('PurchaseOrder', id, 'MANUFACTURER_PAYMENT_REMOVED', gone, { reason: dto.reason });
    return this.present(user, id);
  }

  @Get(':id/pdf')
  @Requires('PURCHASE_ORDERS', 'view')
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const p = await this.load(user, id);
    const buffer = await this.renderPdf(p.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${p.number}.pdf"`);
    res.end(buffer);
  }
}
