import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '@sahyadri/db';
import { Public } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';

const csvList = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []));

export const productQuery = z.object({
  category: z.string().optional(),
  collection: z.string().optional(),
  farm: z.string().optional(),
  city: z.string().optional(),
  shape: csvList,
  colour: csvList,
  caratMin: z.coerce.number().min(0).optional(),
  caratMax: z.coerce.number().min(0).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(120).optional(),
  inStock: z.enum(['true']).optional(),
  exclusive: z.enum(['true']).optional(),
  ids: csvList,
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'carat_asc', 'carat_desc', 'featured']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type ProductQuery = z.infer<typeof productQuery>;

export const CARD_SELECT = {
  id: true,
  slug: true,
  name: true,
  sku: true,
  pricePaise: true,
  compareAtPaise: true,
  priceOnRequest: true,
  caratWeight: true,
  shape: true,
  colour: true,
  metal: true,
  stockType: true,
  quantity: true,
  outOfStock: true,
  sizes: true,
  soldAt: true,
  publishedAt: true,
  isExclusive: true,
  farm: { select: { name: true, slug: true } },
  collection: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
  images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }], take: 2, select: { url: true, variants: true, alt: true, width: true, height: true } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof CARD_SELECT }>;

/** What the public sees for a product: never costs; price hidden when "price on request". */
export function toCard(p: CardRow) {
  const sold = p.stockType === 'UNIQUE' && !!p.soldAt;
  const available = !sold && !p.outOfStock && p.quantity > 0;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    sku: p.sku,
    pricePaise: p.priceOnRequest ? null : p.pricePaise,
    compareAtPaise: p.priceOnRequest ? null : p.compareAtPaise,
    priceOnRequest: p.priceOnRequest,
    caratWeight: p.caratWeight ? Number(p.caratWeight) : null,
    shape: p.shape,
    colour: p.colour,
    metal: p.metal,
    isUnique: p.stockType === 'UNIQUE',
    sizes: Array.isArray(p.sizes)
      ? (p.sizes as Array<{ label: string; quantity: number }>).map((x) => ({ label: x.label, available: x.quantity > 0 }))
      : null,
    isExclusive: p.isExclusive,
    isSold: sold,
    available,
    farm: p.farm,
    collection: p.collection,
    category: p.category,
    images: p.images,
  };
}

/** Products the public may see in a city: published, not archived, and sold in that city (no city rows = everywhere). */
export function publicWhere(cityId?: string | null): Prisma.ProductWhereInput {
  return {
    status: 'PUBLISHED',
    archivedAt: null,
    // Business-only pieces are shown to approved business buyers in their account, not in the public store.
    b2bOnly: false,
    category: { isActive: true, archivedAt: null },
    ...(cityId ? { OR: [{ cities: { none: {} } }, { cities: { some: { cityId } } }] } : {}),
  };
}

@ApiTags('catalogue (public)')
@Controller('catalogue')
export class PublicCatalogueController {
  constructor(private readonly prisma: PrismaService) {}

  private async cityId(slug?: string) {
    if (!slug) return null;
    return (await this.prisma.city.findFirst({ where: { slug, isActive: true }, select: { id: true } }))?.id ?? null;
  }

  /** Full-text search ids, best match first. SKU prefix matches rank first. */
  private async searchIds(q: string): Promise<string[]> {
    const sku = q.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    // Hyphens join words only inside a term ("near-round"); a term made of hyphens alone would break to_tsquery.
    const terms = q.replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().split(/\s+/).map((t) => t.replace(/^-+|-+$/g, '')).filter(Boolean).map((t) => `${t}:*`).join(' & ');
    if (!terms && !sku) return [];
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Product"
      WHERE (${sku} <> '' AND sku LIKE ${sku + '%'})
         OR (${terms} <> '' AND "searchVector" @@ to_tsquery('english', ${terms || 'x'}))
         OR (${terms} <> '' AND "searchVector" @@ to_tsquery('simple', ${terms || 'x'}))
      ORDER BY (sku LIKE ${sku + '%'}) DESC,
               ts_rank("searchVector", to_tsquery('english', ${terms || 'x'})) DESC
      LIMIT 500`;
    return rows.map((r) => r.id);
  }

  async findProducts(q: ProductQuery) {
    const cityId = await this.cityId(q.city);
    const and: Prisma.ProductWhereInput[] = [publicWhere(cityId)];
    if (q.category) and.push({ category: { slug: q.category } });
    if (q.collection) and.push({ collection: { slug: q.collection } });
    if (q.farm) {
      const farms = q.farm.split(',').map((f) => f.trim()).filter(Boolean);
      and.push({ farm: { slug: farms.length > 1 ? { in: farms } : farms[0] } });
    }
    if (q.shape.length) and.push({ shape: { in: q.shape, mode: 'insensitive' } });
    if (q.colour.length) and.push({ colour: { in: q.colour, mode: 'insensitive' } });
    if (q.caratMin != null || q.caratMax != null)
      and.push({ caratWeight: { ...(q.caratMin != null ? { gte: q.caratMin } : {}), ...(q.caratMax != null ? { lte: q.caratMax } : {}) } });
    if (q.priceMin != null || q.priceMax != null)
      and.push({ priceOnRequest: false, pricePaise: { ...(q.priceMin != null ? { gte: q.priceMin } : {}), ...(q.priceMax != null ? { lte: q.priceMax } : {}) } });
    if (q.inStock) and.push({ soldAt: null, outOfStock: false, quantity: { gt: 0 } });
    if (q.exclusive) and.push({ isExclusive: true });
    if (q.ids.length) and.push({ id: { in: q.ids } });
    let ranked: string[] | null = null;
    if (q.q) {
      ranked = await this.searchIds(q.q);
      and.push({ id: { in: ranked } });
    }
    const where: Prisma.ProductWhereInput = { AND: and };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ priceOnRequest: 'asc' }, { pricePaise: 'asc' }]
        : q.sort === 'price_desc'
          ? [{ priceOnRequest: 'asc' }, { pricePaise: 'desc' }]
          : q.sort === 'carat_asc'
            ? [{ caratWeight: { sort: 'asc', nulls: 'last' } }]
            : q.sort === 'carat_desc'
              ? [{ caratWeight: { sort: 'desc', nulls: 'last' } }]
              : q.sort === 'featured'
                ? [{ isFeatured: 'desc' }, { sortOrder: 'asc' }]
                : [{ publishedAt: 'desc' }];
    // Sold pieces go last so the grid leads with what can be bought.
    const total = await this.prisma.product.count({ where });
    let rows: CardRow[];
    if (ranked && q.sort === 'newest') {
      const all = await this.prisma.product.findMany({ where, select: CARD_SELECT });
      const pos = new Map(ranked.map((id, i) => [id, i]));
      all.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
      rows = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    } else {
      rows = await this.prisma.product.findMany({
        where,
        select: CARD_SELECT,
        orderBy: [{ soldAt: { sort: 'desc', nulls: 'first' } }, ...orderBy, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      });
    }
    return { items: rows.map(toCard), total, page: q.page, pageSize: q.pageSize };
  }

  @Public()
  @Get('products')
  products(@Query() raw: Record<string, string>) {
    return this.findProducts(productQuery.parse(raw));
  }

  /** Facet values for the filter panel, given the current category/collection/farm. */
  @Public()
  @Get('filters')
  async filters(@Query() raw: Record<string, string>) {
    const q = productQuery.parse(raw);
    const cityId = await this.cityId(q.city);
    const where: Prisma.ProductWhereInput = {
      AND: [
        publicWhere(cityId),
        q.category ? { category: { slug: q.category } } : {},
        q.collection ? { collection: { slug: q.collection } } : {},
        q.farm ? { farm: { slug: q.farm } } : {},
      ],
    };
    const [shapes, colours, agg, farms, collections, categories] = await Promise.all([
      this.prisma.product.groupBy({ by: ['shape'], where, _count: { _all: true }, orderBy: { shape: 'asc' } }),
      this.prisma.product.groupBy({ by: ['colour'], where, _count: { _all: true }, orderBy: { colour: 'asc' } }),
      this.prisma.product.aggregate({ where: { AND: [where, { priceOnRequest: false }] }, _min: { pricePaise: true, caratWeight: true }, _max: { pricePaise: true, caratWeight: true } }),
      this.prisma.product.groupBy({ by: ['farmId'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['collectionId'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
    ]);
    const [farmRows, colRows, catRows] = await Promise.all([
      this.prisma.farm.findMany({ where: { id: { in: farms.map((f) => f.farmId!).filter(Boolean) } }, select: { id: true, name: true, slug: true } }),
      this.prisma.collection.findMany({ where: { id: { in: collections.map((c) => c.collectionId!).filter(Boolean) }, isActive: true }, select: { id: true, name: true, slug: true } }),
      this.prisma.category.findMany({ where: { id: { in: categories.map((c) => c.categoryId) } }, select: { id: true, name: true, slug: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const count = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T, id: string) => rows.find((r) => r[key] === id)?._count._all ?? 0;
    return {
      shapes: shapes.filter((s) => s.shape).map((s) => ({ value: s.shape!, count: s._count._all })),
      colours: colours.filter((c) => c.colour).map((c) => ({ value: c.colour!, count: c._count._all })),
      price: { min: agg._min.pricePaise ?? 0, max: agg._max.pricePaise ?? 0 },
      carat: { min: Number(agg._min.caratWeight ?? 0), max: Number(agg._max.caratWeight ?? 0) },
      farms: farmRows.map((f) => ({ ...f, count: count(farms, 'farmId', f.id) })),
      collections: colRows.map((c) => ({ ...c, count: count(collections, 'collectionId', c.id) })),
      categories: catRows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: count(categories, 'categoryId', c.id) })),
    };
  }

  @Public()
  @Get('products/:slug')
  async product(@Param('slug') slug: string, @Query('city') citySlug?: string) {
    const p = await this.prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED', archivedAt: null },
      include: {
        images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
        farm: { select: { name: true, slug: true, location: true, summary: true, story: true, heroImageUrl: true } },
        collection: { select: { name: true, slug: true } },
        category: { select: { name: true, slug: true } },
        certificates: { where: { revokedAt: null }, select: { code: true }, take: 1 },
        relatedFrom: { where: { related: publicWhere() }, orderBy: { sortOrder: 'asc' }, include: { related: { select: CARD_SELECT } } },
        stockHolds: { where: { status: 'ACTIVE', expiresAt: { gt: new Date() } }, select: { id: true }, take: 1 },
        cities: { select: { cityId: true } },
      },
    });
    if (!p) throw notFound('Product');
    const [reviews, agg] = await Promise.all([
      this.prisma.review.findMany({
        where: { productId: p.id, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, rating: true, title: true, body: true, photoUrls: true, createdAt: true, customer: { select: { user: { select: { name: true } } } } },
      }),
      this.prisma.review.aggregate({ where: { productId: p.id, status: 'APPROVED' }, _avg: { rating: true }, _count: { _all: true } }),
    ]);
    let related: CardRow[] = p.relatedFrom.map((r) => r.related);
    if (related.length < 4) {
      const more = await this.prisma.product.findMany({
        where: { AND: [publicWhere(), { categoryId: p.categoryId }, { id: { notIn: [p.id, ...related.map((r) => r.id)] } }, { soldAt: null }] },
        select: CARD_SELECT,
        take: 4 - related.length,
        orderBy: { publishedAt: 'desc' },
      });
      related = [...related, ...more];
    }
    const cityId = await this.cityId(citySlug);
    const card = toCard(p);
    const reserved = card.available && p.stockType === 'UNIQUE' && p.stockHolds.length > 0;
    return {
      ...card,
      description: p.description,
      lustre: p.lustre,
      surface: p.surface,
      grade: p.grade,
      sizeMm: p.sizeMm ? Number(p.sizeMm) : null,
      certification: p.certification,
      netWeight: p.netWeight ? Number(p.netWeight) : null,
      grossWeight: p.grossWeight ? Number(p.grossWeight) : null,
      certificateCode: p.certificates[0]?.code ?? null,
      videoUrl: p.videoUrl,
      images: p.images.map((i) => ({ url: i.url, variants: i.variants, alt: i.alt ?? p.name, kind: i.kind, width: i.width, height: i.height })),
      farm: p.farm,
      /** A unique piece in someone else's checkout right now. */
      reserved,
      availableInCity: !cityId || p.cities.length === 0 || p.cities.some((c) => c.cityId === cityId),
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      rating: { average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null, count: agg._count._all },
      reviews: reviews.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, photoUrls: r.photoUrls, createdAt: r.createdAt, name: r.customer.user.name.split(' ')[0] })),
      related: related.map(toCard),
      updatedAt: p.updatedAt,
    };
  }

  @Public()
  @Get('categories')
  categories() {
    return this.prisma.category.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, seoTitle: true, seoDescription: true, cities: { select: { city: { select: { slug: true } } } } },
    });
  }

  @Public()
  @Get('categories/:slug')
  async category(@Param('slug') slug: string) {
    const c = await this.prisma.category.findFirst({ where: { slug, isActive: true, archivedAt: null }, select: { id: true, name: true, slug: true, description: true, imageUrl: true, seoTitle: true, seoDescription: true, updatedAt: true } });
    if (!c) throw notFound('Category');
    return c;
  }

  @Public()
  @Get('collections')
  collections() {
    return this.prisma.collection.findMany({ where: { isActive: true, archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, description: true, imageUrl: true, isFeatured: true } });
  }

  @Public()
  @Get('collections/:slug')
  async collection(@Param('slug') slug: string) {
    const c = await this.prisma.collection.findFirst({ where: { slug, isActive: true, archivedAt: null } });
    if (!c) throw notFound('Collection');
    return c;
  }

  @Public()
  @Get('farms')
  farms() {
    return this.prisma.farm.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, location: true, summary: true, heroImageUrl: true, _count: { select: { products: { where: publicWhere() } } } },
    });
  }

  @Public()
  @Get('farms/:slug')
  async farm(@Param('slug') slug: string) {
    const f = await this.prisma.farm.findFirst({ where: { slug, isActive: true, archivedAt: null } });
    if (!f) throw notFound('Farm');
    const products = await this.prisma.product.findMany({ where: { AND: [publicWhere(), { farmId: f.id }] }, select: CARD_SELECT, orderBy: [{ soldAt: { sort: 'desc', nulls: 'first' } }, { publishedAt: 'desc' }], take: 48 });
    return { ...f, latitude: f.latitude ? Number(f.latitude) : null, longitude: f.longitude ? Number(f.longitude) : null, products: products.map(toCard) };
  }
}
