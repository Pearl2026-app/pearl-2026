import { config, limit } from '../../config/config';
import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { email, indianMobile } from '@sahyadri/shared';
import { Public } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { CARD_SELECT, publicWhere, toCard } from './catalogue.public';

const live = () => {
  const now = new Date();
  return { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] };
};

const applySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  phone: indianMobile,
  coverNote: z.string().trim().max(3000).optional(),
});

@ApiTags('content (public)')
@Controller()
export class PublicContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly media: MediaService,
  ) {}

  /** Everything the site shell needs: settings, nav, footer, WhatsApp numbers. Cached by the web app. */
  @Public()
  @Get('site')
  async site() {
    const [store, delivery, appLinks, seo, returns, payments, storefront, stores, blocks, cities, categories, farms, wa, legal] = await Promise.all([
      this.settings.get('store'),
      this.settings.get('delivery'),
      this.settings.get('app_links'),
      this.settings.get('seo'),
      this.settings.get('returns'),
      this.settings.get('payments'),
      this.settings.get('storefront'),
      this.prisma.franchise.findMany({
        where: { isActive: true, showInStoreList: true },
        orderBy: [{ city: { sortOrder: 'asc' } }, { name: 'asc' }],
        select: { id: true, name: true, area: true, address: true, phone: true, openingHours: true, mapUrl: true, city: { select: { name: true, slug: true } } },
      }),
      this.prisma.contentBlock.findMany({ where: { isActive: true, key: { in: ['footer.about', 'contact.info', 'product.trust', 'bulk.intro'] } } }),
      this.prisma.city.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true, state: true } }),
      this.prisma.category.findMany({ where: { isActive: true, archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true, imageUrl: true } }),
      this.prisma.farm.findMany({ where: { isActive: true, archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true } }),
      this.prisma.whatsAppNumber.findMany({ where: { isActive: true }, select: { phone: true, label: true, isDefault: true, cityId: true } }),
      this.prisma.page.findMany({ where: { isLegal: true, isActive: true }, select: { slug: true, title: true } }),
    ]);
    // Facets for the menu: only values that have something on sale.
    const [colours, shapes, collections] = await Promise.all([
      this.prisma.product.groupBy({ by: ['colour'], where: { AND: [publicWhere(), { soldAt: null, colour: { not: null } }] }, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['shape'], where: { AND: [publicWhere(), { soldAt: null, shape: { not: null } }] }, _count: { _all: true } }),
      this.prisma.collection.findMany({ where: { isActive: true, archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true } }),
    ]);
    const facet = (rows: Array<{ _count: { _all: number } } & Record<string, unknown>>, key: string) =>
      rows.filter((r) => r[key]).sort((a, b) => b._count._all - a._count._all).slice(0, 8).map((r) => String(r[key]));
    const wholesale = await this.prisma.routingRule.findFirst({ where: { isActive: true, enquiryType: 'BULK' }, orderBy: { priority: 'asc' }, include: { whatsAppNumber: true } });
    const { gstin: _g, ...publicStore } = store;
    return {
      demo: config().demoMode,
      store: publicStore,
      delivery,
      appLinks,
      seo,
      returns,
      storefront,
      stores,
      payments: { onlineEnabled: payments.onlineEnabled, codEnabled: payments.codEnabled, codMaxPaise: payments.codMaxPaise },
      blocks: Object.fromEntries(blocks.map((b) => [b.key, { title: b.title, data: b.data }])),
      cities,
      categories,
      farms,
      legalPages: legal,
      shop: { colours: facet(colours, 'colour'), shapes: facet(shapes, 'shape'), collections },
      whatsapp: {
        default: wa.find((w) => w.isDefault)?.phone ?? store.whatsapp,
        byCity: Object.fromEntries(wa.filter((w) => w.cityId).map((w) => [w.cityId!, w.phone])),
        wholesale: wholesale?.whatsAppNumber.phone ?? null,
      },
    };
  }

  @Public()
  @Get('content/home')
  async home() {
    const [banners, blocks, collections, featured, testimonials, gallery, newest] = await Promise.all([
      this.prisma.banner.findMany({ where: { placement: { in: ['HOME_HERO', 'HOME_SECONDARY'] }, ...live() }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.contentBlock.findMany({ where: { isActive: true, key: { startsWith: 'home.' } }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.collection.findMany({ where: { isActive: true, isFeatured: true, archivedAt: null }, orderBy: { sortOrder: 'asc' }, select: { name: true, slug: true, description: true, imageUrl: true } }),
      this.prisma.product.findMany({ where: { AND: [publicWhere(), { isFeatured: true }] }, select: CARD_SELECT, orderBy: [{ soldAt: { sort: 'desc', nulls: 'first' } }, { sortOrder: 'asc' }], take: 8 }),
      this.prisma.testimonial.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 6 }),
      this.prisma.galleryItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, take: 6 }),
      this.prisma.product.findMany({ where: { AND: [publicWhere(), { soldAt: null }] }, select: CARD_SELECT, orderBy: { publishedAt: 'desc' }, take: 8 }),
    ]);
    return {
      banners,
      blocks: Object.fromEntries(blocks.map((b) => [b.key, { title: b.title, kind: b.kind, data: b.data }])),
      collections,
      featured: (featured.length ? featured : newest).map(toCard),
      newest: newest.map(toCard),
      testimonials,
      gallery,
    };
  }

  @Public()
  @Get('content/pages/:slug')
  async page(@Param('slug') slug: string) {
    const p = await this.prisma.page.findFirst({ where: { slug, isActive: true }, include: { currentVersion: { select: { body: true, version: true, publishedAt: true } } } });
    if (!p || !p.currentVersion) throw notFound('Page');
    return { slug: p.slug, title: p.title, isLegal: p.isLegal, body: p.currentVersion.body, version: p.currentVersion.version, updatedAt: p.currentVersion.publishedAt, seoTitle: p.seoTitle, seoDescription: p.seoDescription };
  }

  @Public()
  @Get('content/faq')
  faq() {
    return this.prisma.faq.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }], select: { id: true, question: true, answer: true, group: true } });
  }

  @Public()
  @Get('content/gallery')
  gallery() {
    return this.prisma.galleryItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  @Public()
  @Get('content/testimonials')
  testimonials() {
    return this.prisma.testimonial.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  /** Active public offers and coupons (personal referral coupons are never listed). */
  @Public()
  @Get('offers')
  async offers() {
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: {
        isActive: true,
        showOnOffersPage: true,
        customerId: null,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      include: { categories: { select: { category: { select: { name: true, slug: true } } } }, _count: { select: { redemptions: true } } },
    });
    const banners = await this.prisma.banner.findMany({ where: { placement: 'OFFERS', ...live() }, orderBy: { sortOrder: 'asc' } });
    return {
      banners,
      coupons: coupons
        .filter((c) => c.usageLimit == null || c._count.redemptions < c.usageLimit)
        .map((c) => ({
          code: c.code,
          description: c.description,
          discountType: c.discountType,
          discountValue: c.discountValue,
          minOrderPaise: c.minOrderPaise,
          maxDiscountPaise: c.maxDiscountPaise,
          firstOrderOnly: c.firstOrderOnly,
          endsAt: c.endsAt,
          categories: c.categories.map((x) => x.category),
        })),
    };
  }

  @Public()
  @Get('careers')
  careers() {
    return this.prisma.jobOpening.findMany({
      where: { isActive: true, OR: [{ closesAt: null }, { closesAt: { gte: new Date() } }] },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, title: true, location: true, description: true, eligibility: true, closesAt: true, createdAt: true },
    });
  }

  @Public()
  @Get('careers/:slug')
  async career(@Param('slug') slug: string) {
    const j = await this.prisma.jobOpening.findFirst({ where: { slug, isActive: true }, select: { id: true, slug: true, title: true, location: true, description: true, eligibility: true, closesAt: true, createdAt: true } });
    if (!j) throw notFound('Job opening');
    return j;
  }

  @Public()
  @Post('careers/:slug/apply')
  @Throttle({ default: { limit: limit(5), ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('resume', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async apply(@Param('slug') slug: string, @UploadedFile() resume: Express.Multer.File, @Body() body: Record<string, string>) {
    const job = await this.prisma.jobOpening.findFirst({ where: { slug, isActive: true } });
    if (!job || (job.closesAt && job.closesAt < new Date())) throw notFound('Job opening');
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_FAILED', 'Please check the highlighted fields.', Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
    if (!resume) throw badRequest('VALIDATION_FAILED', 'Attach your resume.', { resume: 'Attach a PDF or Word file' });
    const stored = await this.media.saveDocument(resume, 'resumes', 'private');
    await this.prisma.jobApplication.create({ data: { jobOpeningId: job.id, ...parsed.data, resumeUrl: stored.url } });
    return { ok: true };
  }

  /** QR target on a certificate: confirms the piece and its farm of origin. */
  @Public()
  @Get('verify/:code')
  async verify(@Param('code') code: string) {
    const c = await this.prisma.certificate.findUnique({
      where: { code: code.toUpperCase() },
      include: { product: { select: { name: true, slug: true, sku: true, status: true, images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } }, farm: { select: { name: true, slug: true, location: true } } } } },
    });
    if (!c) throw notFound('Certificate');
    return {
      code: c.code,
      valid: !c.revokedAt,
      issuedAt: c.issuedAt,
      issuedBy: c.issuedBy,
      details: c.details,
      product: { name: c.product.name, sku: c.product.sku, slug: c.product.status === 'PUBLISHED' ? c.product.slug : null, imageUrl: c.product.images[0]?.url ?? null },
      farm: c.product.farm,
    };
  }

  /** Data for the XML sitemap. */
  @Public()
  @Get('seo/sitemap')
  async sitemap() {
    const [products, categories, collections, farms, pages, jobs] = await Promise.all([
      this.prisma.product.findMany({ where: publicWhere(), select: { slug: true, updatedAt: true } }),
      this.prisma.category.findMany({ where: { isActive: true, archivedAt: null }, select: { slug: true, updatedAt: true } }),
      this.prisma.collection.findMany({ where: { isActive: true, archivedAt: null }, select: { slug: true, updatedAt: true } }),
      this.prisma.farm.findMany({ where: { isActive: true, archivedAt: null }, select: { slug: true, updatedAt: true } }),
      this.prisma.page.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
      this.prisma.jobOpening.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    ]);
    return { products, categories, collections, farms, pages, jobs };
  }
}
