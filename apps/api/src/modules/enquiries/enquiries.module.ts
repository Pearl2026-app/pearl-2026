import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { email, indianMobile, phoneE164, rupeesToPaise } from '@sahyadri/shared';
import type { AuthUser } from '../../common/context';
import { crudController } from '../../common/crud';
import { sendCsv } from '../../common/csv';
import { CurrentUser, Public, Requires } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { between, listQuery, orderBy, paginate } from '../../common/list';
import { enquiryScope } from '../../common/scope';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { EnquiriesService } from './enquiries.service';

const TYPES = ['PRODUCT', 'CUSTOMIZED', 'BULK', 'RING_FINDER', 'CONTACT'] as const;
const STAGES = ['NEW', 'IN_PROGRESS', 'QUOTED', 'CONVERTED', 'CLOSED'] as const;

export const enquiryInput = z
  .object({
    clientId: z.string().uuid().optional(),
    fallbackReference: z.string().max(20).optional(),
    type: z.enum(TYPES).default('PRODUCT'),
    productId: z.string().max(40).optional().nullable(),
    pageUrl: z.string().max(500).optional().nullable(),
    cityId: z.string().max(40).optional().nullable(),
    citySlug: z.string().max(60).optional().nullable(),
    source: z.string().max(80).optional().nullable(),
    utm: z.record(z.string().max(200)).optional().nullable(),
    name: z.string().trim().max(120).optional().nullable(),
    phone: phoneE164.optional().nullable(),
    email: email.optional().nullable(),
    message: z.string().trim().max(5000).optional().nullable(),
    payload: z.record(z.unknown()).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'PRODUCT' && !v.productId) ctx.addIssue({ code: 'custom', path: ['productId'], message: 'Which piece is this about?' });
    if ((v.type === 'BULK' || v.type === 'CONTACT') && !v.phone && !v.email)
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Add a phone number or email so we can reply' });
  });

const customInput = z.object({
  clientId: z.string().uuid().optional(),
  jewelleryType: z.string().trim().min(2).max(80),
  metal: z.string().trim().max(80).optional(),
  size: z.string().trim().max(40).optional(),
  designNotes: z.string().trim().max(5000).optional(),
  budgetRupees: z.coerce.number().min(0).max(100_000_000).optional(),
  extraNotes: z.string().trim().max(3000).optional(),
  name: z.string().trim().min(2).max(120),
  phone: indianMobile,
  email: email.optional().or(z.literal('').transform(() => undefined)),
  citySlug: z.string().max(60).optional(),
  cityId: z.string().max(40).optional(),
  ringFinderAnswers: z.string().max(5000).optional(),
  source: z.string().max(80).optional(),
});

@ApiTags('enquiries')
@Controller('enquiries')
class PublicEnquiriesController {
  constructor(
    private readonly enquiries: EnquiriesService,
    private readonly media: MediaService,
  ) {}

  @Public()
  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser | null, @Body(new ZodValidationPipe(enquiryInput)) dto: z.infer<typeof enquiryInput>) {
    return this.enquiries.create(dto, user);
  }

  /** Customized Jewellery form: creates a customized enquiry plus its request, with reference images. */
  @Public()
  @Post('custom')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 6, { limits: { fileSize: 15 * 1024 * 1024, files: 6 } }))
  async custom(@CurrentUser() user: AuthUser | null, @UploadedFiles() files: Express.Multer.File[] = [], @Body() body: Record<string, string>) {
    const parsed = customInput.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_FAILED', 'Please check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
    const d = parsed.data;
    const images: string[] = [];
    for (const f of files) images.push((await this.media.saveImage(f, 'custom-requests')).url);
    let answers: unknown = undefined;
    try {
      answers = d.ringFinderAnswers ? JSON.parse(d.ringFinderAnswers) : undefined;
    } catch {
      answers = undefined;
    }
    const message = [d.jewelleryType, d.metal, d.size && `size ${d.size}`, d.budgetRupees && `budget ₹${d.budgetRupees}`].filter(Boolean).join(', ');
    return this.enquiries.create(
      { clientId: d.clientId, type: 'CUSTOMIZED', name: d.name, phone: d.phone, email: d.email, cityId: d.cityId, citySlug: d.citySlug, source: d.source ?? 'customized-form', message, payload: { designNotes: d.designNotes, extraNotes: d.extraNotes } },
      user,
      {
        customRequest: {
          jewelleryType: d.jewelleryType,
          metal: d.metal,
          size: d.size,
          designNotes: d.designNotes,
          referenceImageUrls: images,
          budgetPaise: d.budgetRupees != null ? rupeesToPaise(d.budgetRupees) : null,
          extraNotes: d.extraNotes,
          ringFinderAnswers: answers as Prisma.InputJsonValue | undefined,
        },
      },
    );
  }
}

const inboxQuery = listQuery.extend({
  stage: z.enum(STAGES).optional(),
  type: z.enum(TYPES).optional(),
  cityId: z.string().optional(),
  ownerId: z.string().optional(),
  franchiseId: z.string().optional(),
  source: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  mine: z.enum(['true']).optional(),
  format: z.enum(['json', 'csv']).optional(),
});

@ApiTags('enquiries')
@Controller('admin/enquiries')
class EnquiryInboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enquiries: EnquiriesService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @Requires('ENQUIRIES', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = inboxQuery.parse(raw);
    const where: Prisma.EnquiryWhereInput = {
      AND: [
        enquiryScope(user),
        { archivedAt: null },
        q.stage ? { stage: q.stage } : {},
        q.type ? { type: q.type } : {},
        q.cityId ? { cityId: q.cityId } : {},
        q.ownerId ? { ownerId: q.ownerId } : {},
        q.mine ? { ownerId: user.id } : {},
        q.franchiseId ? { franchiseId: q.franchiseId } : {},
        q.source ? { source: q.source } : {},
        q.from || q.to ? { createdAt: between(q.from, q.to) } : {},
        q.q
          ? { OR: [{ reference: { contains: q.q, mode: 'insensitive' } }, { payload: { path: ['altReference'], equals: q.q.toUpperCase() } }, { contactName: { contains: q.q, mode: 'insensitive' } }, { contactPhone: { contains: q.q } }, { product: { sku: { contains: q.q, mode: 'insensitive' } } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }] }
          : {},
      ],
    };
    const include = {
      product: { select: { name: true, sku: true } },
      city: { select: { name: true } },
      owner: { select: { name: true } },
      franchise: { select: { name: true } },
      convertedOrder: { select: { number: true } },
    };
    const sort = orderBy(q.sort, ['createdAt', 'stage', 'firstResponseAt'], { createdAt: 'desc' });
    const target = (await this.settings.get('enquiry')).responseTargetMinutes;
    const withTimer = <T extends { createdAt: Date; firstResponseAt: Date | null; stage: string }>(e: T) => {
      const end = e.firstResponseAt ?? new Date();
      const minutes = Math.round((end.getTime() - e.createdAt.getTime()) / 60000);
      return { ...e, responseMinutes: minutes, overdue: !e.firstResponseAt && e.stage === 'NEW' && minutes > target };
    };
    if (q.format === 'csv') {
      const rows = (await this.prisma.enquiry.findMany({ where, include, orderBy: sort, take: 50_000 })).map(withTimer);
      sendCsv(res, 'enquiries.csv', rows, [
        { header: 'Reference', value: (r) => r.reference },
        { header: 'Created', value: (r) => r.createdAt },
        { header: 'Type', value: (r) => r.type },
        { header: 'Stage', value: (r) => r.stage },
        { header: 'Product', value: (r) => r.product?.name },
        { header: 'SKU', value: (r) => r.product?.sku },
        { header: 'City', value: (r) => r.city?.name },
        { header: 'Source', value: (r) => r.source },
        { header: 'Name', value: (r) => r.contactName },
        { header: 'Phone', value: (r) => r.contactPhone },
        { header: 'Owner', value: (r) => r.owner?.name },
        { header: 'Franchise', value: (r) => r.franchise?.name },
        { header: 'First response (min)', value: (r) => (r.firstResponseAt ? r.responseMinutes : '') },
        { header: 'Order', value: (r) => r.convertedOrder?.number },
      ]);
      return;
    }
    const page = await paginate(q, () => this.prisma.enquiry.count({ where }), (skip, take) => this.prisma.enquiry.findMany({ where, include, orderBy: sort, skip, take }));
    const counts = await this.prisma.enquiry.groupBy({ by: ['stage'], where: { AND: [enquiryScope(user), { archivedAt: null }] }, _count: { _all: true } });
    return { ...page, items: page.items.map(withTimer), stageCounts: Object.fromEntries(counts.map((c) => [c.stage, c._count._all])), responseTargetMinutes: target };
  }

  @Get(':id')
  @Requires('ENQUIRIES', 'view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.enquiries.find(user, id);
  }

  @Patch(':id')
  @Requires('ENQUIRIES', 'edit')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(z.object({ stage: z.enum(STAGES).optional(), ownerId: z.string().nullable().optional(), franchiseId: z.string().nullable().optional(), cityId: z.string().nullable().optional() })))
    dto: { stage?: (typeof STAGES)[number]; ownerId?: string | null; franchiseId?: string | null; cityId?: string | null },
  ) {
    return this.enquiries.update(user, id, dto);
  }

  @Post(':id/notes')
  @Requires('ENQUIRIES', 'edit')
  note(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ body: z.string().trim().min(1).max(3000) }))) dto: { body: string }) {
    return this.enquiries.addNote(user, id, dto.body);
  }

  /** Team members an enquiry can be assigned to (scoped). */
  @Get('meta/owners')
  @Requires('ENQUIRIES', 'view')
  async owners(@CurrentUser() user: AuthUser) {
    const items = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'FRANCHISE'] },
        ...(user.role === 'CITY_MANAGER' ? { cityId: user.cityId } : user.role === 'FRANCHISE' ? { franchiseId: user.franchiseId } : {}),
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    return { items };
  }
}

// ── WhatsApp numbers, templates, routing (WhatsApp CRM settings) ─────
const waNumber = z.object({ label: z.string().trim().min(2).max(80), phone: phoneE164, cityId: z.string().optional().nullable(), isDefault: z.boolean().optional(), isActive: z.boolean().optional() });
export const WhatsAppNumbersController = crudController({
  path: 'whatsapp-numbers', tag: 'enquiries', model: 'whatsAppNumber', entity: 'WhatsAppNumber', module: 'WHATSAPP_SETTINGS',
  create: waNumber, update: waNumber.partial(), searchFields: ['label', 'phone'], sortFields: ['label'], defaultSort: { label: 'asc' },
  filters: { isActive: 'boolean' }, include: { city: { select: { name: true } } }, remove: 'deactivate',
});
const template = z.object({
  key: z.string().trim().regex(/^[A-Z_]{2,40}$/), channel: z.enum(['WHATSAPP', 'EMAIL', 'SMS', 'PUSH']), language: z.string().trim().min(2).max(5).optional(),
  body: z.string().min(1).max(4000), subject: z.string().max(200).optional().nullable(), providerTemplateName: z.string().max(120).optional().nullable(), isActive: z.boolean().optional(),
});
export const TemplatesController = crudController({
  path: 'message-templates', tag: 'enquiries', model: 'messageTemplate', entity: 'MessageTemplate', module: 'WHATSAPP_SETTINGS',
  create: template, update: template.partial(), searchFields: ['key', 'body'], sortFields: ['key', 'channel'], defaultSort: { key: 'asc' },
  filters: { channel: 'string', isActive: 'boolean' }, remove: 'deactivate',
});
const rule = z.object({
  name: z.string().trim().min(2).max(120), priority: z.number().int().min(0).max(100000).optional(), cityId: z.string().optional().nullable(),
  enquiryType: z.enum(TYPES).optional().nullable(), whatsAppNumberId: z.string().min(1), assignOwnerId: z.string().optional().nullable(),
  assignFranchiseId: z.string().optional().nullable(), isActive: z.boolean().optional(),
});
export const RoutingRulesController = crudController({
  path: 'routing-rules', tag: 'enquiries', model: 'routingRule', entity: 'RoutingRule', module: 'WHATSAPP_SETTINGS',
  create: rule, update: rule.partial(), searchFields: ['name'], sortFields: ['priority', 'name'], defaultSort: { priority: 'asc' },
  filters: { isActive: 'boolean' }, include: { city: { select: { name: true } }, whatsAppNumber: { select: { label: true, phone: true } } }, remove: 'deactivate',
});


@Module({
  controllers: [PublicEnquiriesController, EnquiryInboxController, WhatsAppNumbersController, TemplatesController, RoutingRulesController],
  providers: [EnquiriesService],
  exports: [EnquiriesService],
})
export class EnquiriesModule {}
