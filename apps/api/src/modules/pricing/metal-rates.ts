import { Body, Controller, Get, HttpCode, Injectable, Logger, OnModuleInit, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { b2bPriceFrom, METAL_RATE_KEYS, METAL_RATE_LABEL, metalRateKeyFor, metalRatePrice, type MetalMargin, type MetalRateKey } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, forbidden } from '../../common/errors';
import { SettingsService } from '../../common/settings.service';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { JobsService } from '../../queue/jobs.service';

type Db = PrismaService | Prisma.TransactionClient;
type RateRow = { metal: string; ratePerGramPaise: number; effectiveDate: Date; source: string };

/** Today's date in India, as the UTC-midnight Date that a DATE column stores. */
export const indiaDay = (d = new Date()) => new Date(`${d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00.000Z`);

const rateInput = z.object({
  /** Defaults to today (India time) */
  date: z.coerce.date().optional(),
  rates: z
    .array(z.object({ metal: z.enum(METAL_RATE_KEYS), ratePerGramPaise: z.number().int().positive().max(100_000_000) }))
    .min(1)
    .max(METAL_RATE_KEYS.length),
});
const marginsInput = z.object({
  margins: z.record(z.enum(METAL_RATE_KEYS), z.object({ percent: z.number().min(0).max(500), perGramPaise: z.number().int().min(0).max(100_000_000) })),
  /** Optional daily feed (https, JSON); used when METAL_RATE_FEED_URL is not set. Empty switches it off. */
  feedUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'Use an https:// link, or leave it empty')
    .optional(),
});

const headOffice = (u: AuthUser) => {
  if (u.role !== 'SUPER_ADMIN' && u.role !== 'STAFF') throw forbidden('Only head office can change metal rates.');
};

/** Reads a feed: [{metal, ratePerGramPaise}] / [{metal, ratePerGram}] (₹) / {GOLD_22K: 6500, …} (₹) / {rates: {…}}. */
export function parseMetalFeed(body: unknown): Array<{ metal: MetalRateKey; ratePerGramPaise: number }> {
  const out = new Map<MetalRateKey, number>();
  const put = (metal: unknown, paise: number) => {
    const k = String(metal ?? '').toUpperCase() as MetalRateKey;
    if ((METAL_RATE_KEYS as readonly string[]).includes(k) && Number.isFinite(paise) && paise > 0 && paise < 100_000_000) out.set(k, Math.round(paise));
  };
  const obj = body && typeof body === 'object' && !Array.isArray(body) && 'rates' in body ? (body as { rates: unknown }).rates : body;
  if (Array.isArray(obj)) {
    for (const r of obj as Array<Record<string, unknown>>) {
      if (!r || typeof r !== 'object') continue;
      if (typeof r.ratePerGramPaise === 'number') put(r.metal, r.ratePerGramPaise);
      else if (typeof r.ratePerGram === 'number') put(r.metal, r.ratePerGram * 100);
    }
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === 'number') put(k, v * 100);
  }
  return [...out.entries()].map(([metal, ratePerGramPaise]) => ({ metal, ratePerGramPaise }));
}

/**
 * Daily gold and silver rates (meeting of 4 Nov). Head office enters today's rate per gram, or a feed fills it in
 * once a day when METAL_RATE_FEED_URL is set. Products that opt in ("price follows the daily metal rate") are
 * re-priced whenever a rate or a margin changes; every other product keeps its own price.
 */
@Injectable()
export class MetalRatesService implements OnModuleInit {
  private readonly log = new Logger('MetalRates');
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('pricing.metal-feed', async () => {
      if (!(await this.feedUrl())) return;
      // Once a day: skip when today's rates are already in (entered by hand or fetched earlier).
      const today = await this.prisma.metalRate.count({ where: { effectiveDate: indiaDay() } });
      if (today) return;
      await this.fetchFeed(null).catch((e) => this.log.warn(`Metal rate feed failed: ${(e as Error).message}`));
    });
    // Every 3 hours; the job does nothing without a feed or once today's rates are in.
    this.jobs.repeat('pricing.metal-feed', 3 * 3600_000);
  }

  /** The feed: METAL_RATE_FEED_URL, else the link saved on the Metal rates page (Settings → metal_pricing). */
  async feedUrl(): Promise<{ url: string; fromEnv: boolean } | null> {
    const env = config().METAL_RATE_FEED_URL;
    if (env) return { url: env, fromEnv: true };
    const saved = (await this.settings.get('metal_pricing')).feedUrl.trim();
    return saved ? { url: saved, fromEnv: false } : null;
  }

  /** The latest rate per metal on or before the given day. */
  async latest(day = indiaDay(), db: Db = this.prisma): Promise<Map<string, RateRow>> {
    const rows = await db.metalRate.findMany({ where: { effectiveDate: { lte: day } }, orderBy: { effectiveDate: 'desc' }, distinct: ['metal'], select: { metal: true, ratePerGramPaise: true, effectiveDate: true, source: true } });
    return new Map(rows.map((r) => [r.metal, r]));
  }

  async margins(): Promise<Record<string, MetalMargin>> {
    return (await this.settings.get('metal_pricing')).margins;
  }

  async today() {
    const day = indiaDay();
    const [latest, feed] = await Promise.all([this.latest(day), this.feedUrl()]);
    return {
      date: day.toISOString().slice(0, 10),
      feed: { configured: !!feed, fromEnv: feed?.fromEnv ?? false, url: feed && !feed.fromEnv ? feed.url : null },
      rates: METAL_RATE_KEYS.map((k) => {
        const r = latest.get(k);
        return { metal: k, label: METAL_RATE_LABEL[k], ratePerGramPaise: r?.ratePerGramPaise ?? null, effectiveDate: r ? r.effectiveDate.toISOString().slice(0, 10) : null, isToday: !!r && r.effectiveDate.getTime() === day.getTime(), source: r?.source ?? null };
      }),
    };
  }

  async setRates(user: AuthUser | null, input: z.infer<typeof rateInput>, source: 'MANUAL' | 'FEED' = 'MANUAL') {
    const day = indiaDay(input.date ?? new Date());
    if (day.getTime() > indiaDay().getTime() + 86400_000) throw badRequest('FUTURE_DATE', 'Rates can be entered for today or earlier (or tomorrow at the latest).');
    for (const r of input.rates) {
      await this.prisma.metalRate.upsert({
        where: { metal_effectiveDate: { metal: r.metal, effectiveDate: day } },
        create: { metal: r.metal, ratePerGramPaise: r.ratePerGramPaise, effectiveDate: day, source, createdById: user?.id ?? null },
        update: { ratePerGramPaise: r.ratePerGramPaise, source, createdById: user?.id ?? null },
      });
    }
    await this.audit.record('MetalRate', day.toISOString().slice(0, 10), source === 'FEED' ? 'FEED_SYNC' : 'SET_RATES', undefined, { rates: input.rates, by: user?.id ?? 'feed' });
    const repriced = await this.repriceAll();
    return { date: day.toISOString().slice(0, 10), saved: input.rates.length, ...repriced };
  }

  async setMargins(input: z.infer<typeof marginsInput>) {
    const before = await this.settings.get('metal_pricing');
    const value = { ...before, margins: input.margins, ...(input.feedUrl !== undefined ? { feedUrl: input.feedUrl } : {}) };
    await this.prisma.setting.upsert({ where: { key: 'metal_pricing' }, create: { key: 'metal_pricing', value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
    this.settings.invalidate('metal_pricing');
    await this.audit.record('Setting', 'metal_pricing', 'UPDATE', before, value);
    return { margins: value.margins, feedUrl: value.feedUrl, ...(await this.repriceAll()) };
  }

  async fetchFeed(user: AuthUser | null) {
    const feed = await this.feedUrl();
    if (!feed) throw badRequest('FEED_OFF', 'No metal rate feed is set up. Enter today’s rates by hand.');
    const url = feed.url;
    // The API key is for the feed configured on the server only, never sent to a link typed into the admin.
    const key = feed.fromEnv ? config().METAL_RATE_FEED_API_KEY : undefined;
    const res = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw badRequest('FEED_FAILED', `The rate feed answered ${res.status}; nothing was changed.`);
    const rates = parseMetalFeed(await res.json().catch(() => null));
    if (!rates.length) throw badRequest('FEED_EMPTY', 'The rate feed returned no usable rates; nothing was changed.');
    return this.setRates(user, { rates }, 'FEED');
  }

  /**
   * Work out a following product's price from the latest rates. Returns null with a reason when it cannot
   * (no weight, metal not recognised, no rate yet), in which case the product keeps its price.
   */
  compute(
    p: { metal: string | null; metalRateKey: string | null; netWeight: unknown; labourCostPaise: number | null; pearlCostPaise: number | null },
    rates: Map<string, RateRow>,
    margins: Record<string, MetalMargin>,
  ): { pricePaise: number; metalValuePaise: number; rateKey: string } | { reason: string } {
    const key = (p.metalRateKey as MetalRateKey | null) ?? metalRateKeyFor(p.metal);
    if (!key) return { reason: 'Choose which metal rate it follows' };
    const weight = p.netWeight == null ? 0 : Number(p.netWeight);
    if (!(weight > 0)) return { reason: 'Enter the net (metal) weight' };
    const rate = rates.get(key);
    if (!rate) return { reason: `No ${METAL_RATE_LABEL[key]} rate entered yet` };
    const r = metalRatePrice({ weightGrams: weight, ratePerGramPaise: rate.ratePerGramPaise, margin: margins[key], makingPaise: p.labourCostPaise, pearlPaise: p.pearlCostPaise });
    return { pricePaise: r.pricePaise, metalValuePaise: r.metalValuePaise, rateKey: key };
  }

  /**
   * Re-price one product if it follows the metal rate (called after a product is saved, inside its transaction).
   * The metal cost is kept in step with the rate, and the business price follows the B2B discount setting.
   */
  async repriceOne(db: Db, productId: string, opts: { strict?: boolean } = {}) {
    const p = await db.product.findUnique({ where: { id: productId }, select: { id: true, sku: true, pricePaise: true, b2bPricePaise: true, priceFollowsMetalRate: true, metal: true, metalRateKey: true, netWeight: true, labourCostPaise: true, pearlCostPaise: true } });
    if (!p?.priceFollowsMetalRate) return null;
    const [rates, margins, b2b] = await Promise.all([this.latest(indiaDay(), db), this.margins(), this.settings.get('b2b')]);
    const c = this.compute(p, rates, margins);
    if ('reason' in c) {
      // A weight or metal the price cannot be worked out from is a mistake on the form; a missing rate is not.
      if (opts.strict && !c.reason.startsWith('No ')) throw badRequest('METAL_PRICE', `This piece follows the daily metal rate: ${c.reason.toLowerCase()}.`, { netWeight: c.reason });
      return null;
    }
    const data: Prisma.ProductUncheckedUpdateInput = { pricePaise: c.pricePaise, metalCostPaise: c.metalValuePaise };
    if (b2b.discountPercent > 0) data.b2bPricePaise = b2bPriceFrom(c.pricePaise, b2b.discountPercent);
    if (p.pricePaise === c.pricePaise && (data.b2bPricePaise === undefined || data.b2bPricePaise === p.b2bPricePaise)) return { changed: false, pricePaise: c.pricePaise };
    await db.product.update({ where: { id: p.id }, data });
    return { changed: true, pricePaise: c.pricePaise, before: p.pricePaise };
  }

  /** Re-price every product that follows the metal rate. */
  async repriceAll() {
    const ids = await this.prisma.product.findMany({ where: { priceFollowsMetalRate: true, archivedAt: null }, select: { id: true } });
    let repriced = 0;
    for (const { id } of ids) {
      const r = await this.repriceOne(this.prisma, id).catch((e) => {
        this.log.warn(`Re-pricing ${id} failed: ${(e as Error).message}`);
        return null;
      });
      if (r?.changed) repriced++;
    }
    if (repriced) await this.audit.record('Product', null, 'METAL_REPRICE', undefined, { following: ids.length, repriced });
    return { following: ids.length, repriced };
  }

  /** The products that follow the rate, with today's worked-out price or why it cannot be worked out. */
  async following() {
    const [rows, rates, margins] = await Promise.all([
      this.prisma.product.findMany({
        where: { priceFollowsMetalRate: true, archivedAt: null },
        select: { id: true, sku: true, name: true, metal: true, metalRateKey: true, netWeight: true, labourCostPaise: true, pearlCostPaise: true, pricePaise: true, b2bPricePaise: true },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
      this.latest(),
      this.margins(),
    ]);
    return rows.map((p) => {
      const c = this.compute(p, rates, margins);
      return { id: p.id, sku: p.sku, name: p.name, metal: p.metal, rateKey: 'rateKey' in c ? c.rateKey : (p.metalRateKey ?? metalRateKeyFor(p.metal)), netWeight: p.netWeight == null ? null : Number(p.netWeight), pricePaise: p.pricePaise, b2bPricePaise: p.b2bPricePaise, problem: 'reason' in c ? c.reason : null };
    });
  }

  async history(days: number) {
    const since = new Date(indiaDay().getTime() - days * 86400_000);
    return this.prisma.metalRate.findMany({ where: { effectiveDate: { gte: since } }, orderBy: [{ effectiveDate: 'desc' }, { metal: 'asc' }], take: 2000 });
  }
}

@ApiTags('pricing')
@Controller('admin/metal-rates')
export class MetalRatesController {
  constructor(private readonly rates: MetalRatesService) {}

  /** Today's rates for the dashboard tile; anyone who sees the dashboard may read them. */
  @Get('today')
  @Requires('DASHBOARD', 'view')
  today() {
    return this.rates.today();
  }

  @Get()
  @Requires('PRICING', 'view')
  async list(@Query('days') days?: string) {
    const n = Math.min(366, Math.max(1, Number(days) || 30));
    const [today, history, margins, following] = await Promise.all([this.rates.today(), this.rates.history(n), this.rates.margins(), this.rates.following()]);
    return { ...today, history, margins, following };
  }

  /** Enter (or correct) the rates for a day; following products are re-priced straight away. */
  @Post()
  @HttpCode(200)
  @Requires('PRICING', 'edit')
  set(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(rateInput)) dto: z.infer<typeof rateInput>) {
    headOffice(user);
    return this.rates.setRates(user, dto);
  }

  @Put('margins')
  @Requires('PRICING', 'edit')
  margins(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(marginsInput)) dto: z.infer<typeof marginsInput>) {
    headOffice(user);
    return this.rates.setMargins(dto);
  }

  @Post('fetch')
  @HttpCode(200)
  @Requires('PRICING', 'edit')
  fetch(@CurrentUser() user: AuthUser) {
    headOffice(user);
    return this.rates.fetchFeed(user);
  }

  @Post('reprice')
  @HttpCode(200)
  @Requires('PRICING', 'edit')
  reprice(@CurrentUser() user: AuthUser) {
    headOffice(user);
    return this.rates.repriceAll();
  }
}
