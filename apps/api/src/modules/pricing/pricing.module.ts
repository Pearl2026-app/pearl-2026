import { Body, Controller, Get, HttpCode, Inject, Injectable, Logger, Module, OnModuleInit, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { Prisma } from '@sahyadri/db';
import { paise, suggestPrice } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { crudController } from '../../common/crud';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, forbidden } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';
import { PEARL_RATE_FEED, type PearlRateFeed } from '../../providers/types';

const DEFAULT_GST_BP = 300;
const headOffice = (u: AuthUser) => u.role === 'SUPER_ADMIN' || u.role === 'STAFF';
/** Rates and margins are money settings: only head office changes them (partners may view). */
const headOfficeWrites = (u: AuthUser) => {
  if (!headOffice(u)) throw forbidden('Only head office can change pricing.');
};

const rateBase = z.object({
  grade: z.string().trim().toUpperCase().min(1).max(20),
  farmId: z.string().optional().nullable(),
  sizeMinMm: z.number().positive().max(30),
  sizeMaxMm: z.number().positive().max(30),
  ratePerCaratPaise: paise.min(1),
  effectiveFrom: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});
const bandOk = (v: { sizeMinMm?: number; sizeMaxMm?: number }) => v.sizeMinMm == null || v.sizeMaxMm == null || v.sizeMaxMm >= v.sizeMinMm;

export const PearlRatesController = crudController({
  path: 'pearl-rates',
  tag: 'pricing',
  model: 'pearlRate',
  entity: 'PearlRate',
  module: 'PRICING',
  create: rateBase.refine(bandOk, { message: 'The largest size must be at least the smallest', path: ['sizeMaxMm'] }),
  update: rateBase.partial().refine(bandOk, { message: 'The largest size must be at least the smallest', path: ['sizeMaxMm'] }),
  searchFields: ['grade'],
  sortFields: ['grade', 'sizeMinMm', 'ratePerCaratPaise', 'effectiveFrom', 'updatedAt'],
  defaultSort: { grade: 'asc' },
  filters: { isActive: 'boolean', farmId: 'string', grade: 'string', source: 'string' },
  include: { farm: { select: { id: true, name: true } } },
  remove: 'deactivate',
  checkWrite: (u) => headOfficeWrites(u),
  toData: (input: Record<string, unknown>, mode) => ({ ...input, ...(mode === 'create' ? { source: 'MANUAL' } : {}) }),
  csv: [
    { header: 'Grade', value: (r) => r.grade },
    { header: 'Farm', value: (r) => r.farm?.name ?? 'Any farm' },
    { header: 'Size from (mm)', value: (r) => r.sizeMinMm },
    { header: 'Size to (mm)', value: (r) => r.sizeMaxMm },
    { header: 'Rate per carat (₹)', value: (r) => r.ratePerCaratPaise / 100 },
    { header: 'Source', value: (r) => r.source },
    { header: 'Effective from', value: (r) => r.effectiveFrom },
    { header: 'Active', value: (r) => r.isActive },
  ],
});

const ruleBase = z.object({
  name: z.string().trim().min(2).max(80),
  categoryId: z.string().optional().nullable(),
  grade: z.string().trim().toUpperCase().max(20).optional().nullable(),
  marginBp: z.number().int().min(0).max(100_000),
  minMarginPaise: paise.optional().nullable(),
  priority: z.number().int().min(0).max(10_000).optional(),
  isActive: z.boolean().optional(),
});
export const MarginRulesController = crudController({
  path: 'margin-rules',
  tag: 'pricing',
  model: 'marginRule',
  entity: 'MarginRule',
  module: 'PRICING',
  create: ruleBase,
  update: ruleBase.partial(),
  searchFields: ['name', 'grade'],
  sortFields: ['priority', 'name', 'marginBp'],
  defaultSort: { priority: 'asc' },
  filters: { isActive: 'boolean' },
  remove: 'deactivate',
  checkWrite: (u) => headOfficeWrites(u),
});

const calcInput = z.object({
  caratWeight: z.number().nonnegative().max(10_000),
  grade: z.string().trim().toUpperCase().min(1).max(20),
  farmId: z.string().optional().nullable(),
  sizeMm: z.number().positive().max(30).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  metalCostPaise: paise.optional(),
  labourCostPaise: paise.optional(),
  /** Use a quoted rate instead of the table (e.g. a one-off lot). */
  ratePerCaratPaise: paise.min(1).optional(),
});

@Injectable()
export class PearlPricingService implements OnModuleInit {
  private readonly log = new Logger('PearlPricing');
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    @Inject(PEARL_RATE_FEED) private readonly feed: PearlRateFeed,
  ) {}

  onModuleInit() {
    this.jobs.register('pricing.feed-sync', async () => {
      if (this.feed.configured) await this.syncFeed(null).catch((e) => this.log.warn(`Pearl rate feed failed: ${(e as Error).message}`));
    });
    if (this.feed.configured) this.jobs.repeat('pricing.feed-sync', 6 * 3600_000);
  }

  /**
   * The rate for a grade, farm and size: farm-specific rows win over "any farm" rows, manual rows over
   * feed rows, and the latest effective row wins after that.
   */
  async findRate(grade: string, farmId?: string | null, sizeMm?: number | null) {
    const rows = await this.prisma.pearlRate.findMany({
      where: {
        grade,
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ farmId: farmId ?? undefined }, { farmId: null }],
        ...(sizeMm != null ? { sizeMinMm: { lte: new Prisma.Decimal(sizeMm) }, sizeMaxMm: { gte: new Prisma.Decimal(sizeMm) } } : {}),
      },
      include: { farm: { select: { name: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const score = (r: (typeof rows)[number]) => (farmId && r.farmId === farmId ? 2 : 0) + (r.source === 'MANUAL' ? 1 : 0);
    return rows.sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  /** The most specific active rule: lowest priority number among rules whose category and grade match (empty = any). */
  async findMargin(categoryId?: string | null, grade?: string | null) {
    const rules = await this.prisma.marginRule.findMany({ where: { isActive: true }, orderBy: { priority: 'asc' } });
    return rules.find((r) => (!r.categoryId || r.categoryId === categoryId) && (!r.grade || r.grade === grade)) ?? null;
  }

  async calculate(input: z.infer<typeof calcInput>) {
    const rate = input.ratePerCaratPaise ? null : await this.findRate(input.grade, input.farmId, input.sizeMm);
    const ratePerCaratPaise = input.ratePerCaratPaise ?? rate?.ratePerCaratPaise;
    if (!ratePerCaratPaise)
      throw badRequest('NO_RATE', `No active rate for grade ${input.grade}${input.sizeMm ? ` at ${input.sizeMm} mm` : ''}. Add one under Pearl rates or enter a rate.`, { grade: 'No rate found' });
    const rule = await this.findMargin(input.categoryId, input.grade);
    const category = input.categoryId ? await this.prisma.category.findUnique({ where: { id: input.categoryId }, select: { gstRateBp: true, name: true } }) : null;
    const gstRateBp = category?.gstRateBp ?? DEFAULT_GST_BP;
    const result = suggestPrice({ caratWeight: input.caratWeight, ratePerCaratPaise, metalCostPaise: input.metalCostPaise, labourCostPaise: input.labourCostPaise, marginBp: rule?.marginBp ?? 0, minMarginPaise: rule?.minMarginPaise, gstRateBp });
    return {
      ...result,
      ratePerCaratPaise,
      gstRateBp,
      rate: rate ? { id: rate.id, grade: rate.grade, farm: rate.farm?.name ?? 'Any farm', sizeMinMm: Number(rate.sizeMinMm), sizeMaxMm: Number(rate.sizeMaxMm), source: rate.source } : null,
      marginRule: rule ? { id: rule.id, name: rule.name, marginBp: rule.marginBp, minMarginPaise: rule.minMarginPaise } : null,
    };
  }

  /** Replace feed rows with the latest feed. Manual rows are never touched (they are the guaranteed source). */
  async syncFeed(user: AuthUser | null) {
    if (!this.feed.configured) throw badRequest('FEED_OFF', 'The live rate feed is off until a market source is confirmed. Rates come from the table.');
    const rows = await this.feed.fetch();
    if (!rows.length) throw badRequest('FEED_EMPTY', 'The rate feed returned no usable rates; nothing was changed.');
    const farms = await this.prisma.farm.findMany({ select: { id: true, slug: true } });
    const farmId = (slug?: string | null) => (slug ? (farms.find((f) => f.slug === slug)?.id ?? null) : null);
    const now = new Date();
    const count = await this.prisma.$transaction(async (tx) => {
      await tx.pearlRate.updateMany({ where: { source: 'FEED', isActive: true }, data: { isActive: false } });
      const r = await tx.pearlRate.createMany({
        data: rows.map((x) => ({ grade: x.grade.toUpperCase(), farmId: farmId(x.farmSlug), sizeMinMm: new Prisma.Decimal(x.sizeMinMm), sizeMaxMm: new Prisma.Decimal(x.sizeMaxMm), ratePerCaratPaise: x.ratePerCaratPaise, source: 'FEED', effectiveFrom: now })),
      });
      await this.audit.record('PearlRate', null, 'FEED_SYNC', undefined, { rows: r.count, feed: this.feed.name, by: user?.id ?? 'schedule' }, tx);
      return r.count;
    });
    return { imported: count };
  }

  get feedStatus() {
    return { name: this.feed.name, configured: this.feed.configured };
  }
}

@ApiTags('pricing')
@Controller('admin/pricing')
export class PricingCalcController {
  constructor(private readonly pricing: PearlPricingService) {}

  /** Carat, grade and farm in → suggested price out, with the rate and margin rule that produced it. */
  @Post('calculate')
  @HttpCode(200)
  @Requires('PRICING', 'view')
  calculate(@Body(new ZodValidationPipe(calcInput)) dto: z.infer<typeof calcInput>) {
    return this.pricing.calculate(dto);
  }

  @Get('feed/status')
  @Requires('PRICING', 'view')
  status() {
    return this.pricing.feedStatus;
  }

  @Post('feed/sync')
  @HttpCode(200)
  @Requires('PRICING', 'edit')
  sync(@CurrentUser() user: AuthUser) {
    headOfficeWrites(user);
    return this.pricing.syncFeed(user);
  }
}

@Module({
  controllers: [PearlRatesController, MarginRulesController, PricingCalcController],
  providers: [PearlPricingService],
  exports: [PearlPricingService],
})
export class PearlPricingModule {}
