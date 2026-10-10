import { Body, Controller, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { Public } from '../../common/decorators';
import { config, limit } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NoopRanker } from '../../providers/ai';
import { AI_RANKER, type AiRanker, type RankCandidate } from '../../providers/types';
import { CARD_SELECT, publicWhere, toCard } from './catalogue.public';

export const METALS = ['yellow-gold', 'rose-gold', 'white-gold', 'silver', 'any'] as const;
const answersInput = z.object({
  occasion: z.string().trim().max(60).optional(),
  budgetMaxPaise: z.number().int().positive().max(1_000_000_000).optional(),
  style: z.string().trim().max(60).optional(),
  metal: z.enum(METALS).default('any'),
  colour: z.string().trim().max(30).optional(),
  shape: z.string().trim().max(30).optional(),
  ringSize: z.string().trim().max(10).optional(),
  citySlug: z.string().trim().max(60).optional(),
});
export type RingAnswers = z.infer<typeof answersInput>;

const metalWhere = (m: RingAnswers['metal']): Prisma.ProductWhereInput => {
  switch (m) {
    case 'rose-gold':
      return { metal: { contains: 'rose', mode: 'insensitive' } };
    case 'white-gold':
      return { metal: { contains: 'white gold', mode: 'insensitive' } };
    case 'silver':
      return { metal: { contains: 'silver', mode: 'insensitive' } };
    case 'yellow-gold':
      return { AND: [{ metal: { contains: 'gold', mode: 'insensitive' } }, { NOT: { metal: { contains: 'rose', mode: 'insensitive' } } }, { NOT: { metal: { contains: 'white', mode: 'insensitive' } } }] };
    default:
      return {};
  }
};
const eq = (field: 'colour' | 'shape', v?: string): Prisma.ProductWhereInput => (v && v.toLowerCase() !== 'any' ? { [field]: { equals: v, mode: 'insensitive' } } : {});

/**
 * Ring Finder. Recommends only real, in-stock rings: the catalogue is filtered first, then the AI
 * ranks and explains. When the AI is off, slow or failing, the filtered list is returned with plain reasons.
 */
@ApiTags('catalogue (public)')
@Controller('ring-finder')
export class RingFinderController {
  private readonly log = new Logger('RingFinder');
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_RANKER) private readonly ai: AiRanker,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: limit(30), ttl: 60_000 } })
  async find(@Body(new ZodValidationPipe(answersInput)) a: RingAnswers) {
    const city = a.citySlug ? await this.prisma.city.findFirst({ where: { slug: a.citySlug, isActive: true }, select: { id: true } }) : null;
    const base: Prisma.ProductWhereInput = {
      AND: [
        publicWhere(city?.id),
        { category: { slug: 'rings' } },
        { outOfStock: false, quantity: { gt: 0 }, soldAt: null, priceOnRequest: false },
        a.budgetMaxPaise ? { pricePaise: { lte: a.budgetMaxPaise } } : {},
      ],
    };
    // Strictest first; loosen one preference at a time until something fits, and say what was loosened.
    const attempts: Array<{ relaxed: string[]; where: Prisma.ProductWhereInput }> = [
      { relaxed: [], where: { AND: [base, metalWhere(a.metal), eq('colour', a.colour), eq('shape', a.shape)] } },
      { relaxed: ['shape'], where: { AND: [base, metalWhere(a.metal), eq('colour', a.colour)] } },
      { relaxed: ['shape', 'pearl colour'], where: { AND: [base, metalWhere(a.metal)] } },
      { relaxed: ['shape', 'pearl colour', 'metal'], where: base },
    ];
    let rows: Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>[] = [];
    let relaxed: string[] = [];
    for (const t of attempts) {
      rows = await this.prisma.product.findMany({ where: t.where, select: CARD_SELECT, orderBy: [{ isFeatured: 'desc' }, { pricePaise: 'desc' }], take: 12 });
      relaxed = t.relaxed;
      if (rows.length) break;
    }
    if (!rows.length) return { results: [], relaxed: [], ranker: 'none', handoff: true };

    const candidates: RankCandidate[] = rows.map((p) => ({ id: p.id, name: p.name, pricePaise: p.pricePaise, shape: p.shape, colour: p.colour, metal: p.metal, caratWeight: p.caratWeight ? Number(p.caratWeight) : null, farm: p.farm?.name ?? null, collection: p.collection?.name ?? null }));
    // Only the answers and product facts go to the AI, never personal data (rule 9).
    const answers = { occasion: a.occasion, budgetMaxRupees: a.budgetMaxPaise ? a.budgetMaxPaise / 100 : undefined, style: a.style, metal: a.metal, colour: a.colour, shape: a.shape };
    let ranked = await new NoopRanker().rank(answers, candidates);
    let ranker = 'none';
    if (this.ai.enabled) {
      try {
        ranked = await Promise.race([this.ai.rank(answers, candidates), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), config().AI_TIMEOUT_MS + 500))]);
        ranker = this.ai.name;
      } catch (e) {
        this.log.warn(`AI ranking unavailable, using filtered order: ${(e as Error).message}`);
      }
    }
    const byId = new Map(rows.map((p) => [p.id, p]));
    const results = ranked
      .filter((r) => byId.has(r.id))
      .slice(0, 6)
      .map((r) => ({ product: toCard(byId.get(r.id)!), reason: r.reason }));
    return { results, relaxed, ranker, handoff: false };
  }
}
