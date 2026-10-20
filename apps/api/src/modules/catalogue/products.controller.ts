import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { Prisma } from '@sahyadri/db';
import type { AuthUser } from '../../common/context';
import { CurrentUser, Requires } from '../../common/decorators';
import { sendCsv } from '../../common/csv';
import { badRequest, forbidden } from '../../common/errors';
import { listQuery, orderBy, paginate } from '../../common/list';
import { productScope } from '../../common/scope';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { imageOrder, imagePatch, productCreate, productUpdate, rejectInput } from './catalogue.schemas';
import { ProductImportService } from './product-import.service';
import { ProductsService, redactCosts } from './products.service';

const filters = listQuery.extend({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']).optional(),
  categoryId: z.string().optional(),
  collectionId: z.string().optional(),
  farmId: z.string().optional(),
  vendorId: z.string().optional(),
  stockType: z.enum(['UNIQUE', 'QUANTITY']).optional(),
  outOfStock: z.enum(['true', 'false']).optional(),
  pendingApproval: z.enum(['true']).optional(),
  format: z.enum(['json', 'csv']).optional(),
});

const memory = (maxMb: number, max = 50) => ({ limits: { fileSize: maxMb * 1024 * 1024, files: max } });

@ApiTags('catalogue')
@Controller('admin/products')
export class ProductsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly importer: ProductImportService,
  ) {}

  @Get()
  @Requires('PRODUCTS', 'view')
  async list(@CurrentUser() user: AuthUser, @Query() raw: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const q = filters.parse(raw);
    const where: Prisma.ProductWhereInput = {
      AND: [
        productScope(user),
        q.status ? { status: q.status } : { archivedAt: null },
        q.categoryId ? { categoryId: q.categoryId } : {},
        q.collectionId ? { collectionId: q.collectionId } : {},
        q.farmId ? { farmId: q.farmId } : {},
        q.vendorId ? { vendorId: q.vendorId } : {},
        q.stockType ? { stockType: q.stockType } : {},
        q.outOfStock === 'true' ? { OR: [{ outOfStock: true }, { quantity: 0 }] } : q.outOfStock === 'false' ? { outOfStock: false, quantity: { gt: 0 } } : {},
        q.pendingApproval ? { OR: [{ status: 'PENDING_APPROVAL' }, { NOT: { pendingChanges: { equals: Prisma.DbNull } } }] } : {},
        q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }] } : {},
      ],
    };
    const sort = orderBy(q.sort, ['name', 'sku', 'pricePaise', 'createdAt', 'updatedAt', 'quantity', 'sortOrder'], { updatedAt: 'desc' });
    const include = {
      images: { where: { kind: 'MAIN' as const }, take: 1 },
      category: { select: { id: true, name: true } },
      farm: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    };
    if (q.format === 'csv') {
      const rows = await this.prisma.product.findMany({ where, orderBy: sort, include, take: 50_000 });
      const costs = user.role !== 'FRANCHISE' && user.role !== 'CITY_MANAGER';
      sendCsv(res, 'products.csv', rows, [
        { header: 'SKU', value: (r) => r.sku },
        { header: 'Name', value: (r) => r.name },
        { header: 'Status', value: (r) => r.status },
        { header: 'Category', value: (r) => r.category.name },
        { header: 'Farm', value: (r) => r.farm?.name },
        { header: 'Vendor', value: (r) => r.vendor?.name },
        { header: 'Price (₹)', value: (r) => r.pricePaise / 100 },
        { header: 'Price on request', value: (r) => (r.priceOnRequest ? 'yes' : 'no') },
        ...(costs
          ? [
              { header: 'Metal cost (₹)', value: (r: typeof rows[number]) => (r.metalCostPaise ?? 0) / 100 },
              { header: 'Labour cost (₹)', value: (r: typeof rows[number]) => (r.labourCostPaise ?? 0) / 100 },
              { header: 'Pearl cost (₹)', value: (r: typeof rows[number]) => (r.pearlCostPaise ?? 0) / 100 },
            ]
          : []),
        { header: 'Carat', value: (r) => r.caratWeight?.toString() },
        { header: 'Stock type', value: (r) => r.stockType },
        { header: 'Quantity', value: (r) => r.quantity },
        { header: 'Out of stock', value: (r) => (r.outOfStock || r.quantity === 0 ? 'yes' : 'no') },
      ]);
      return;
    }
    const page = await paginate(
      q,
      () => this.prisma.product.count({ where }),
      (skip, take) => this.prisma.product.findMany({ where, orderBy: sort, include, skip, take }),
    );
    return { ...page, items: page.items.map((p) => redactCosts(user, p)) };
  }

  @Get('import/template')
  @Requires('PRODUCTS', 'create')
  template(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"');
    res.send(this.importer.template());
  }

  @Post('import')
  @HttpCode(200)
  @Requires('PRODUCTS', 'create')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', memory(10, 1)))
  import(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Query('dryRun') dryRun?: string) {
    if (!file) throw badRequest('NO_FILE', 'Choose a CSV file.');
    return this.importer.run(user, file.buffer.toString('utf8'), dryRun !== 'false');
  }

  @Post('bulk-images')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 200, memory(25, 200)))
  bulkImages(@CurrentUser() user: AuthUser, @UploadedFiles() files: Express.Multer.File[]) {
    return this.products.bulkImages(user, files ?? []);
  }

  /**
   * Festival and clearance offers on chosen pieces: "X% off" sets the old price as the struck-through price and
   * lowers the selling price; "end offer" puts the old price back. Works on picked pieces or a whole category,
   * farm or collection. Head office only.
   */
  @Post('discount')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  async discount(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'STAFF') throw forbidden('Only head office can run offers.');
    const dto = z
      .object({
        action: z.enum(['apply', 'remove']),
        percent: z.number().min(1).max(90).optional(),
        productIds: z.array(z.string()).max(500).optional(),
        categoryId: z.string().optional(),
        farmId: z.string().optional(),
        collectionId: z.string().optional(),
      })
      .parse(body);
    if (dto.action === 'apply' && !dto.percent) throw badRequest('PERCENT_REQUIRED', 'Enter the discount %.', { percent: 'Required' });
    const scope: Prisma.ProductWhereInput[] = [];
    if (dto.productIds?.length) scope.push({ id: { in: dto.productIds } });
    if (dto.categoryId) scope.push({ categoryId: dto.categoryId });
    if (dto.farmId) scope.push({ farmId: dto.farmId });
    if (dto.collectionId) scope.push({ collectionId: dto.collectionId });
    if (!scope.length) throw badRequest('NO_SCOPE', 'Pick pieces, a category, a farm or a collection.');
    const rows = await this.prisma.product.findMany({
      where: { AND: [{ archivedAt: null, priceOnRequest: false }, ...scope] },
      select: { id: true, pricePaise: true, compareAtPaise: true },
    });
    let changed = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const p of rows) {
        if (dto.action === 'apply') {
          // The original price is kept as the struck-through price, so a second offer works from it, not from the
          // already-discounted price.
          const base = p.compareAtPaise && p.compareAtPaise > p.pricePaise ? p.compareAtPaise : p.pricePaise;
          const price = Math.round((base * (100 - dto.percent!)) / 100 / 100) * 100;
          await tx.product.update({ where: { id: p.id }, data: { compareAtPaise: base, pricePaise: price } });
          changed++;
        } else if (p.compareAtPaise && p.compareAtPaise > p.pricePaise) {
          await tx.product.update({ where: { id: p.id }, data: { pricePaise: p.compareAtPaise, compareAtPaise: null } });
          changed++;
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          entity: 'Product',
          entityId: 'bulk',
          action: dto.action === 'apply' ? 'OFFER_APPLY' : 'OFFER_REMOVE',
          after: { ...dto, changed } as Prisma.InputJsonValue,
        },
      });
    });
    return { changed, matched: rows.length };
  }

  @Get(':id')
  @Requires('PRODUCTS', 'view')
  async get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return redactCosts(user, await this.products.find(user, id));
  }

  @Post()
  @Requires('PRODUCTS', 'create')
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(productCreate)) dto: z.infer<typeof productCreate>) {
    this.products.assertCanEdit(user);
    return this.products.create(user, dto);
  }

  @Patch(':id')
  @Requires('PRODUCTS', 'edit')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(productUpdate)) dto: z.infer<typeof productUpdate>) {
    this.products.assertCanEdit(user);
    return this.products.update(user, id, dto);
  }

  @Put(':id/related')
  @Requires('PRODUCTS', 'edit')
  related(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(z.object({ ids: z.array(z.string()).max(24) }))) dto: { ids: string[] }) {
    this.products.assertCanEdit(user);
    return this.products.update(user, id, { relatedIds: dto.ids });
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.adminOnly(user);
    return this.products.setStatus(user, id, 'PUBLISHED');
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  unpublish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.adminOnly(user);
    return this.products.setStatus(user, id, 'UNPUBLISHED');
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.adminOnly(user);
    return this.products.approve(user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(rejectInput)) dto: { reason: string }) {
    this.adminOnly(user);
    return this.products.reject(user, id, dto.reason);
  }

  @Post(':id/restock')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  restock(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.adminOnly(user);
    return this.products.restock(user, id);
  }

  @Delete(':id')
  @Requires('PRODUCTS', 'delete')
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.adminOnly(user);
    return this.products.archive(user, id, true);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Requires('PRODUCTS', 'edit')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.adminOnly(user);
    return this.products.archive(user, id, false);
  }

  @Post(':id/images')
  @Requires('PRODUCTS', 'edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 30, memory(25, 30)))
  addImages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('kind') kind?: 'MAIN' | 'CAROUSEL' | 'LIFESTYLE',
  ) {
    this.products.assertCanEdit(user);
    if (kind && !['MAIN', 'CAROUSEL', 'LIFESTYLE'].includes(kind)) throw badRequest('INVALID_KIND', 'Unknown image kind');
    return this.products.addImages(user, id, files ?? [], kind);
  }

  @Patch(':id/images/order')
  @Requires('PRODUCTS', 'edit')
  reorder(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(imageOrder)) dto: { ids: string[] }) {
    this.products.assertCanEdit(user);
    return this.products.reorderImages(user, id, dto.ids);
  }

  @Patch(':id/images/:imageId')
  @Requires('PRODUCTS', 'edit')
  updateImage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('imageId') imageId: string, @Body(new ZodValidationPipe(imagePatch)) dto: z.infer<typeof imagePatch>) {
    this.products.assertCanEdit(user);
    return this.products.updateImage(user, id, imageId, dto as { alt?: string | null; kind?: 'MAIN' });
  }

  @Delete(':id/images/:imageId')
  @Requires('PRODUCTS', 'edit')
  removeImage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('imageId') imageId: string) {
    this.products.assertCanEdit(user);
    return this.products.removeImage(user, id, imageId);
  }

  @Post(':id/video')
  @Requires('PRODUCTS', 'edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', memory(config().MAX_UPLOAD_MB, 1)))
  video(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    this.products.assertCanEdit(user);
    if (!file) throw badRequest('NO_FILE', 'Choose a video file.');
    return this.products.setVideo(user, id, file);
  }

  @Delete(':id/video')
  @Requires('PRODUCTS', 'edit')
  removeVideo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    this.products.assertCanEdit(user);
    return this.products.setVideo(user, id, null);
  }

  private adminOnly(user: AuthUser) {
    if (user.role === 'VENDOR') throw forbidden('Head office publishes and approves products.');
    this.products.assertCanEdit(user);
  }
}
