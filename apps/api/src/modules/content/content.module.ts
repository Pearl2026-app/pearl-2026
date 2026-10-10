import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import type { Prisma } from '@sahyadri/db';
import { slug, slugify } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { crudController } from '../../common/crud';
import { CurrentUser, Requires } from '../../common/decorators';
import { notFound } from '../../common/errors';
import { listQuery, orderBy, paginate } from '../../common/list';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';

const optStr = (max = 200) => z.string().trim().max(max).optional().nullable();
const when = z.coerce.date().optional().nullable();

const banner = z.object({
  placement: z.string().trim().min(2).max(40),
  title: optStr(120),
  subtitle: optStr(300),
  imageUrl: z.string().min(1).max(500),
  mobileImageUrl: optStr(500),
  linkUrl: optStr(500),
  ctaLabel: optStr(40),
  sortOrder: z.number().int().optional(),
  startsAt: when,
  endsAt: when,
  isActive: z.boolean().optional(),
});
export const BannersController = crudController({
  path: 'banners', tag: 'content', model: 'banner', entity: 'Banner', module: 'CONTENT',
  create: banner, update: banner.partial(),
  searchFields: ['title', 'placement'], sortFields: ['sortOrder', 'createdAt'], defaultSort: { sortOrder: 'asc' },
  filters: { placement: 'string', isActive: 'boolean' }, remove: 'delete',
});

const block = z.object({
  key: z.string().trim().regex(/^[a-z0-9_.-]{2,60}$/),
  kind: z.enum(['HERO', 'RICH_TEXT', 'TRUST_POINTS', 'FEATURED_PRODUCTS', 'FEATURED_COLLECTIONS', 'STORY', 'CTA']),
  title: optStr(160),
  data: z.record(z.unknown()),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const ContentBlocksController = crudController({
  path: 'content-blocks', tag: 'content', model: 'contentBlock', entity: 'ContentBlock', module: 'CONTENT',
  create: block, update: block.partial(),
  searchFields: ['key', 'title'], sortFields: ['key', 'sortOrder'], defaultSort: { key: 'asc' },
  filters: { kind: 'string', isActive: 'boolean' }, remove: 'deactivate',
});

const testimonial = z.object({
  name: z.string().trim().min(2).max(80), city: optStr(80), quote: z.string().trim().min(5).max(1000),
  photoUrl: optStr(500), rating: z.number().int().min(1).max(5).optional().nullable(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional(),
});
export const TestimonialsController = crudController({
  path: 'testimonials', tag: 'content', model: 'testimonial', entity: 'Testimonial', module: 'CONTENT',
  create: testimonial, update: testimonial.partial(),
  searchFields: ['name', 'quote'], sortFields: ['sortOrder', 'createdAt'], defaultSort: { sortOrder: 'asc' },
  filters: { isActive: 'boolean' }, remove: 'delete',
});

const gallery = z.object({
  title: optStr(120), caption: optStr(300), mediaUrl: z.string().min(1).max(500), mediaType: z.enum(['image', 'video']).optional(),
  tag: optStr(40), sortOrder: z.number().int().optional(), isActive: z.boolean().optional(),
});
export const GalleryController = crudController({
  path: 'gallery', tag: 'content', model: 'galleryItem', entity: 'GalleryItem', module: 'CONTENT',
  create: gallery, update: gallery.partial(),
  searchFields: ['title', 'caption', 'tag'], sortFields: ['sortOrder', 'createdAt'], defaultSort: { sortOrder: 'asc' },
  filters: { tag: 'string', isActive: 'boolean' }, remove: 'delete',
});

const faq = z.object({
  question: z.string().trim().min(5).max(300), answer: z.string().trim().min(2).max(5000), group: optStr(60),
  sortOrder: z.number().int().optional(), isActive: z.boolean().optional(),
});
export const FaqController = crudController({
  path: 'faq', tag: 'content', model: 'faq', entity: 'Faq', module: 'CONTENT',
  create: faq, update: faq.partial(),
  searchFields: ['question', 'answer', 'group'], sortFields: ['sortOrder', 'createdAt'], defaultSort: { sortOrder: 'asc' },
  filters: { group: 'string', isActive: 'boolean' }, remove: 'delete',
});

const job = z.object({
  title: z.string().trim().min(3).max(120), slug: slug.optional(), location: z.string().trim().min(2).max(120),
  description: z.string().trim().min(10).max(10000), eligibility: optStr(3000), isActive: z.boolean().optional(), closesAt: when,
});
export const JobsController = crudController({
  path: 'jobs', tag: 'content', model: 'jobOpening', entity: 'JobOpening', module: 'CAREERS',
  create: job, update: job.partial(),
  searchFields: ['title', 'location'], sortFields: ['createdAt', 'title'], defaultSort: { createdAt: 'desc' },
  filters: { isActive: 'boolean' }, remove: 'deactivate',
  include: { _count: { select: { applications: true } } },
  toData: (v: any, mode) => (mode === 'create' && !v.slug ? { ...v, slug: `${slugify(v.title)}-${slugify(v.location)}` } : v),
});

@ApiTags('content')
@Controller('admin/job-applications')
class JobApplicationsController {
  constructor(private readonly prisma: PrismaService, private readonly media: MediaService, private readonly audit: AuditService) {}

  @Get()
  @Requires('CAREERS', 'view')
  async list(@Query() raw: Record<string, string>) {
    const q = listQuery.extend({ jobOpeningId: z.string().optional(), status: z.enum(['NEW', 'SHORTLISTED', 'REJECTED', 'HIRED']).optional() }).parse(raw);
    const where: Prisma.JobApplicationWhereInput = {
      ...(q.jobOpeningId ? { jobOpeningId: q.jobOpeningId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    return paginate(q, () => this.prisma.jobApplication.count({ where }), (skip, take) =>
      this.prisma.jobApplication.findMany({ where, skip, take, orderBy: orderBy(q.sort, ['createdAt', 'name'], { createdAt: 'desc' }), include: { jobOpening: { select: { title: true, location: true } } } }),
    );
  }

  /** Resumes are private; staff get a short-lived link. Each view is audited. */
  @Get(':id/resume')
  @Requires('CAREERS', 'view')
  async resume(@Param('id') id: string) {
    const a = await this.prisma.jobApplication.findUnique({ where: { id } });
    if (!a) throw notFound('Application');
    await this.audit.record('JobApplication', id, 'VIEW_RESUME');
    return { url: await this.media.resolve(a.resumeUrl, 300) };
  }

  @Patch(':id')
  @Requires('CAREERS', 'edit')
  async update(@Param('id') id: string, @Body(new ZodValidationPipe(z.object({ status: z.enum(['NEW', 'SHORTLISTED', 'REJECTED', 'HIRED']) }))) dto: { status: 'NEW' }) {
    const before = await this.prisma.jobApplication.findUnique({ where: { id } });
    if (!before) throw notFound('Application');
    const r = await this.prisma.jobApplication.update({ where: { id }, data: { status: dto.status } });
    await this.audit.record('JobApplication', id, 'UPDATE', before, r);
    return r;
  }
}

const pageCreate = z.object({
  slug, title: z.string().trim().min(2).max(160), isLegal: z.boolean().optional(), body: z.string().min(1).max(200_000),
  seoTitle: optStr(70), seoDescription: optStr(170), isActive: z.boolean().optional(),
});
const pageUpdate = z.object({
  title: z.string().trim().min(2).max(160).optional(), seoTitle: optStr(70), seoDescription: optStr(170), isActive: z.boolean().optional(),
  /** Publishing a new body creates a new version; old versions are kept (legal history). */
  body: z.string().min(1).max(200_000).optional(),
});

@ApiTags('content')
@Controller('admin/pages')
class PagesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  @Requires('CONTENT', 'view')
  list() {
    return this.prisma.page.findMany({ orderBy: [{ isLegal: 'desc' }, { title: 'asc' }], include: { currentVersion: { select: { version: true, publishedAt: true } } } });
  }

  @Get(':id')
  @Requires('CONTENT', 'view')
  async get(@Param('id') id: string) {
    const p = await this.prisma.page.findUnique({ where: { id }, include: { currentVersion: true, versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, publishedAt: true, publishedById: true } } } });
    if (!p) throw notFound('Page');
    return p;
  }

  @Get(':id/versions/:versionId')
  @Requires('CONTENT', 'view')
  async version(@Param('id') id: string, @Param('versionId') versionId: string) {
    const v = await this.prisma.pageVersion.findFirst({ where: { id: versionId, pageId: id } });
    if (!v) throw notFound('Version');
    return v;
  }

  @Post()
  @Requires('CONTENT', 'create')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(pageCreate)) dto: z.infer<typeof pageCreate>) {
    const { body, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.page.create({ data: rest });
      const v = await tx.pageVersion.create({ data: { pageId: page.id, version: 1, body, publishedById: user.id } });
      const r = await tx.page.update({ where: { id: page.id }, data: { currentVersionId: v.id }, include: { currentVersion: true } });
      await this.audit.record('Page', page.id, 'CREATE', undefined, r, tx);
      return r;
    });
  }

  @Patch(':id')
  @Requires('CONTENT', 'edit')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(pageUpdate)) dto: z.infer<typeof pageUpdate>) {
    const before = await this.prisma.page.findUnique({ where: { id }, include: { currentVersion: true } });
    if (!before) throw notFound('Page');
    const { body, ...rest } = dto;
    return this.prisma.$transaction(async (tx) => {
      let currentVersionId = before.currentVersionId;
      if (body !== undefined && body !== before.currentVersion?.body) {
        const last = await tx.pageVersion.findFirst({ where: { pageId: id }, orderBy: { version: 'desc' } });
        const v = await tx.pageVersion.create({ data: { pageId: id, version: (last?.version ?? 0) + 1, body, publishedById: user.id } });
        currentVersionId = v.id;
      }
      const r = await tx.page.update({ where: { id }, data: { ...rest, currentVersionId }, include: { currentVersion: true } });
      await this.audit.record('Page', id, 'UPDATE', before, r, tx);
      return r;
    });
  }

  /** Make an earlier version current again (creates a new version with that text, so history stays linear). */
  @Post(':id/versions/:versionId/restore')
  @HttpCode(200)
  @Requires('CONTENT', 'edit')
  async restore(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('versionId') versionId: string) {
    const v = await this.prisma.pageVersion.findFirst({ where: { id: versionId, pageId: id } });
    if (!v) throw notFound('Version');
    return this.update(user, id, { body: v.body });
  }
}

@Module({
  controllers: [BannersController, ContentBlocksController, TestimonialsController, GalleryController, FaqController, JobsController, JobApplicationsController, PagesController],
})
export class ContentAdminModule {}
