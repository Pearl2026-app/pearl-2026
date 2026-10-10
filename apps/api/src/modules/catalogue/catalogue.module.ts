import { Body, Controller, Get, HttpCode, Param, Post, Query, Res, UploadedFile, UseInterceptors, Module } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import { Prisma } from '@sahyadri/db';
import { slugify } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { cityLinks, crudController } from '../../common/crud';
import { CurrentUser, Requires } from '../../common/decorators';
import { badRequest, notFound } from '../../common/errors';
import { listQuery, orderBy, paginate } from '../../common/list';
import { productScope } from '../../common/scope';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { certificatePdf } from '../documents/pdf';
import { MediaService } from '../media/media.service';
import { categoryCreate, categoryUpdate, collectionCreate, collectionUpdate, farmCreate, farmUpdate } from './catalogue.schemas';
import { ProductImportService } from './product-import.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

const withSlug = (v: any, mode: 'create' | 'update') => {
  const { cityIds, ...rest } = v;
  if (mode === 'create' && !rest.slug) rest.slug = slugify(rest.name);
  return { ...rest, ...cityLinks('cities', cityIds, mode) };
};
const decimals = (v: any, mode: 'create' | 'update') => {
  const out = withSlug(v, mode);
  for (const k of ['latitude', 'longitude']) if (out[k] != null) out[k] = new Prisma.Decimal(out[k]);
  return out;
};

export const CategoriesController = crudController({
  path: 'categories',
  tag: 'catalogue',
  model: 'category',
  entity: 'Category',
  module: 'CATEGORIES',
  create: categoryCreate,
  update: categoryUpdate,
  searchFields: ['name', 'slug'],
  sortFields: ['name', 'sortOrder', 'createdAt'],
  defaultSort: { sortOrder: 'asc' },
  filters: { isActive: 'boolean' },
  include: { cities: { include: { city: { select: { id: true, name: true } } } }, _count: { select: { products: true } } },
  remove: 'archive',
  toData: withSlug,
});

export const CollectionsController = crudController({
  path: 'collections',
  tag: 'catalogue',
  model: 'collection',
  entity: 'Collection',
  module: 'COLLECTIONS',
  create: collectionCreate,
  update: collectionUpdate,
  searchFields: ['name', 'slug'],
  sortFields: ['name', 'sortOrder', 'createdAt'],
  defaultSort: { sortOrder: 'asc' },
  filters: { isActive: 'boolean', isFeatured: 'boolean' },
  include: { _count: { select: { products: true } } },
  remove: 'archive',
  toData: withSlug,
});

export const FarmsController = crudController({
  path: 'farms',
  tag: 'catalogue',
  model: 'farm',
  entity: 'Farm',
  module: 'FARMS',
  create: farmCreate,
  update: farmUpdate,
  searchFields: ['name', 'location'],
  sortFields: ['name', 'sortOrder', 'createdAt'],
  defaultSort: { sortOrder: 'asc' },
  filters: { isActive: 'boolean' },
  include: { _count: { select: { products: true } } },
  remove: 'archive',
  toData: decimals,
});

const certCreate = z.object({
  productId: z.string(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,40}$/).optional(),
  issuedBy: z.string().trim().max(120).optional(),
  details: z.record(z.union([z.string(), z.number()])).optional(),
});

@ApiTags('catalogue')
@Controller('admin/certificates')
class CertificatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Requires('PRODUCTS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>) {
    const q = listQuery.extend({ productId: z.string().optional() }).parse(raw);
    const where: Prisma.CertificateWhereInput = {
      product: productScope(user),
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { product: { sku: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    return paginate(
      q,
      () => this.prisma.certificate.count({ where }),
      (skip, take) =>
        this.prisma.certificate.findMany({ where, orderBy: orderBy(q.sort, ['issuedAt', 'code'], { issuedAt: 'desc' }), skip, take, include: { product: { select: { id: true, name: true, sku: true } } } }),
    );
  }

  @Post()
  @Requires('PRODUCTS', 'edit')
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(certCreate)) dto: z.infer<typeof certCreate>) {
    const product = await this.prisma.product.findFirst({ where: { AND: [{ id: dto.productId }, productScope(user)] }, include: { farm: true } });
    if (!product) throw notFound('Product');
    const code = dto.code ?? `CERT-${product.sku}-${Date.now().toString(36).toUpperCase()}`;
    const cert = await this.prisma.certificate.create({
      data: {
        code,
        productId: product.id,
        issuedBy: dto.issuedBy ?? 'Sahyadri Pearls Grading Desk',
        details: (dto.details ?? {
          grade: product.grade,
          caratWeight: product.caratWeight?.toString(),
          shape: product.shape,
          colour: product.colour,
          lustre: product.lustre,
          surface: product.surface,
          sizeMm: product.sizeMm?.toString(),
          farm: product.farm?.name,
        }) as Prisma.InputJsonValue,
      },
    });
    await this.audit.record('Certificate', cert.id, 'CREATE', undefined, cert);
    return cert;
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const c = await this.prisma.certificate.findFirst({ where: { id, product: productScope(user) } });
    if (!c) throw notFound('Certificate');
    const r = await this.prisma.certificate.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.audit.record('Certificate', id, 'REVOKE', c, r);
    return r;
  }

  @Get(':id/pdf')
  @Requires('PRODUCTS', 'view')
  async pdf(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const c = await this.prisma.certificate.findFirst({ where: { id, product: productScope(user) }, include: { product: { include: { farm: true } } } });
    if (!c) throw notFound('Certificate');
    const buf = await certificatePdf({
      code: c.code,
      verifyUrl: `${config().WEB_URL}/verify/${encodeURIComponent(c.code)}`,
      productName: c.product.name,
      sku: c.product.sku,
      details: (c.details as Record<string, string>) ?? {},
      farmName: c.product.farm?.name ?? null,
      issuedAt: c.issuedAt,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${c.code}.pdf"`);
    res.send(buf);
  }
}

@ApiTags('catalogue')
@Controller('admin/reviews')
class ReviewsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Requires('REVIEWS', 'view')
  list(@Query() raw: Record<string, string>) {
    const q = listQuery.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }).parse(raw);
    const where: Prisma.ReviewWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q ? { OR: [{ body: { contains: q.q, mode: 'insensitive' } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    return paginate(
      q,
      () => this.prisma.review.count({ where }),
      (skip, take) =>
        this.prisma.review.findMany({
          where,
          skip,
          take,
          orderBy: orderBy(q.sort, ['createdAt', 'rating'], { createdAt: 'desc' }),
          include: { product: { select: { id: true, name: true, sku: true } }, customer: { include: { user: { select: { name: true, phone: true } } } } },
        }),
    );
  }

  @Post(':id/:decision')
  @HttpCode(200)
  @Requires('REVIEWS', 'edit')
  async moderate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('decision') decision: string) {
    if (decision !== 'approve' && decision !== 'reject') throw notFound();
    const before = await this.prisma.review.findUnique({ where: { id } });
    if (!before) throw notFound('Review');
    const r = await this.prisma.review.update({
      where: { id },
      data: { status: decision === 'approve' ? 'APPROVED' : 'REJECTED', moderatedById: user.id, moderatedAt: new Date() },
    });
    await this.audit.record('Review', id, decision.toUpperCase(), before, r);
    return r;
  }
}

/** Generic image/document upload for banners, categories, farms, gallery, pages. */
@ApiTags('media')
@Controller('admin/uploads')
class UploadsController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @Requires('CONTENT', 'create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config().MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Body('kind') kind = 'image', @Body('folder') folder = 'content') {
    if (!file) throw badRequest('NO_FILE', 'Choose a file.');
    const safeFolder = ['content', 'banners', 'categories', 'collections', 'farms', 'gallery', 'pages'].includes(folder) ? folder : 'content';
    if (kind === 'image') return this.media.saveImage(file, safeFolder, { square: safeFolder === 'categories' });
    if (kind === 'video') return this.media.saveVideo(file, safeFolder);
    if (kind === 'document') return this.media.saveDocument(file, safeFolder, 'public');
    throw badRequest('INVALID_KIND', 'kind must be image, video or document');
  }
}

@Module({
  controllers: [CategoriesController, CollectionsController, FarmsController, ProductsController, CertificatesController, ReviewsAdminController, UploadsController],
  providers: [ProductsService, ProductImportService],
  exports: [ProductsService],
})
export class CatalogueModule {}
