import { Injectable } from '@nestjs/common';
import { Prisma } from '@sahyadri/db';
import { slugify } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { badRequest, forbidden, notFound } from '../../common/errors';
import { productScope } from '../../common/scope';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService, type IncomingFile } from '../media/media.service';
import { ADMIN_ONLY_FIELDS, COST_FIELDS, VENDOR_DIRECT_FIELDS, type ProductInput } from './catalogue.schemas';

export const PRODUCT_DETAIL_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' } },
  category: { select: { id: true, name: true, slug: true, gstRateBp: true, hsnCode: true } },
  collection: { select: { id: true, name: true, slug: true } },
  farm: { select: { id: true, name: true, slug: true } },
  vendor: { select: { id: true, name: true } },
  cities: { include: { city: { select: { id: true, name: true } } } },
  relatedFrom: { orderBy: { sortOrder: 'asc' }, include: { related: { select: { id: true, name: true, sku: true, slug: true } } } },
  certificates: { where: { revokedAt: null }, select: { id: true, code: true, issuedAt: true } },
} satisfies Prisma.ProductInclude;

/** Hide costs from roles that should not see margins. */
export function redactCosts<T extends Record<string, unknown>>(user: AuthUser, p: T): T {
  if (!['FRANCHISE', 'CITY_MANAGER', 'FARMER', 'MANUFACTURER'].includes(user.role)) return p;
  const copy: Record<string, unknown> = { ...p };
  for (const f of COST_FIELDS) delete copy[f];
  delete copy.pendingChanges;
  return copy as T;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async find(user: AuthUser, id: string) {
    const p = await this.prisma.product.findFirst({ where: { AND: [{ id }, productScope(user)] }, include: PRODUCT_DETAIL_INCLUDE });
    if (!p) throw notFound('Product');
    return p;
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'piece';
    for (let i = 1; i < 200; i++) {
      const candidate = i === 1 ? root : `${root}-${i}`;
      const hit = await this.prisma.product.findFirst({ where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
      if (!hit) return candidate;
    }
    return `${root}-${Date.now()}`;
  }

  private toData(input: Partial<ProductInput>): Prisma.ProductUncheckedUpdateInput {
    const { cityIds: _c, relatedIds: _r, caratWeight, sizeMm, sizes: _sz, ...rest } = input;
    const data: Prisma.ProductUncheckedUpdateInput = { ...rest };
    if (caratWeight !== undefined) data.caratWeight = caratWeight === null ? null : new Prisma.Decimal(caratWeight);
    if (sizeMm !== undefined) data.sizeMm = sizeMm === null ? null : new Prisma.Decimal(sizeMm);
    if (input.stockType === 'UNIQUE' && input.quantity === undefined) data.quantity = 1;
    if (input.sizes !== undefined) {
      // Per-size stock: the plain quantity is always the sum, so holds, alerts and lists keep working.
      data.sizes = input.sizes === null ? Prisma.DbNull : (input.sizes as unknown as Prisma.InputJsonValue);
      if (input.sizes) data.quantity = input.sizes.reduce((a, b) => a + b.quantity, 0);
    }
    return data;
  }

  private async writeLinks(tx: Prisma.TransactionClient, productId: string, input: Partial<ProductInput>) {
    if (input.cityIds) {
      await tx.productCity.deleteMany({ where: { productId } });
      if (input.cityIds.length) await tx.productCity.createMany({ data: input.cityIds.map((cityId) => ({ productId, cityId })) });
    }
    if (input.relatedIds) {
      await tx.relatedProduct.deleteMany({ where: { productId } });
      const ids = input.relatedIds.filter((r) => r !== productId);
      if (ids.length) await tx.relatedProduct.createMany({ data: ids.map((relatedId, i) => ({ productId, relatedId, sortOrder: i })) });
    }
  }

  async create(user: AuthUser, input: ProductInput) {
    const isVendor = user.role === 'VENDOR';
    if (isVendor) for (const f of ADMIN_ONLY_FIELDS) delete (input as Record<string, unknown>)[f];
    const data = this.toData(input) as Prisma.ProductUncheckedCreateInput;
    data.slug = await this.uniqueSlug(input.slug ?? input.name);
    if (isVendor) {
      data.vendorId = user.vendorId;
      data.status = 'PENDING_APPROVAL';
    } else {
      data.status = input.status ?? 'DRAFT';
      if (data.status === 'PUBLISHED') data.publishedAt = new Date();
    }
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.product.create({ data });
      await this.writeLinks(tx, p.id, input);
      await this.audit.record('Product', p.id, 'CREATE', undefined, { ...p, cityIds: input.cityIds }, tx);
      return tx.product.findUniqueOrThrow({ where: { id: p.id }, include: PRODUCT_DETAIL_INCLUDE });
    });
  }

  async update(user: AuthUser, id: string, input: Partial<ProductInput>) {
    const before = await this.find(user, id);
    if (before.archivedAt) throw badRequest('ARCHIVED', 'Restore this product before editing it.');
    if (user.role === 'VENDOR') return this.vendorUpdate(user, before, input);
    const data = this.toData(input);
    if (input.slug || (input.name && input.name !== before.name && !input.slug && before.status !== 'PUBLISHED')) {
      data.slug = await this.uniqueSlug(input.slug ?? input.name!, id);
    }
    if (input.status === 'PUBLISHED' && !before.publishedAt) data.publishedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.product.update({ where: { id }, data });
      await this.writeLinks(tx, id, input);
      await this.audit.record('Product', id, 'UPDATE', before, { ...p, cityIds: input.cityIds, relatedIds: input.relatedIds }, tx);
      return tx.product.findUniqueOrThrow({ where: { id }, include: PRODUCT_DETAIL_INCLUDE });
    });
  }

  /** Vendors change stock directly; everything else on a live product waits for approval. */
  private async vendorUpdate(user: AuthUser, before: Awaited<ReturnType<ProductsService['find']>>, input: Partial<ProductInput>) {
    for (const f of ADMIN_ONLY_FIELDS) delete (input as Record<string, unknown>)[f];
    const direct: Record<string, unknown> = {};
    const pending: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if ((VENDOR_DIRECT_FIELDS as readonly string[]).includes(k)) direct[k] = v;
      else pending[k] = v;
    }
    const live = before.status === 'PUBLISHED' || before.status === 'UNPUBLISHED';
    return this.prisma.$transaction(async (tx) => {
      let data: Prisma.ProductUncheckedUpdateInput = { ...direct };
      if (Object.keys(pending).length) {
        if (live) {
          data.pendingChanges = { ...((before.pendingChanges as object) ?? {}), ...pending } as Prisma.InputJsonValue;
        } else {
          data = { ...data, ...this.toData(pending as Partial<ProductInput>), status: 'PENDING_APPROVAL' };
          await this.writeLinks(tx, before.id, pending as Partial<ProductInput>);
        }
      }
      const p = await tx.product.update({ where: { id: before.id }, data });
      await this.audit.record('Product', before.id, live && Object.keys(pending).length ? 'SUBMIT_CHANGES' : 'UPDATE', before, p, tx);
      return tx.product.findUniqueOrThrow({ where: { id: before.id }, include: PRODUCT_DETAIL_INCLUDE });
    });
  }

  async approve(user: AuthUser, id: string) {
    const before = await this.find(user, id);
    const pending = (before.pendingChanges as Partial<ProductInput> | null) ?? null;
    if (!pending && before.status !== 'PENDING_APPROVAL') throw badRequest('NOTHING_TO_APPROVE', 'There is nothing waiting for approval.');
    if (before.status === 'PENDING_APPROVAL' && !before.images.length) throw badRequest('NO_IMAGES', 'Add at least one image before publishing.');
    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.ProductUncheckedUpdateInput = pending ? { ...this.toData(pending), pendingChanges: Prisma.DbNull } : {};
      if (before.status === 'PENDING_APPROVAL') {
        data.status = 'PUBLISHED';
        data.publishedAt = before.publishedAt ?? new Date();
      }
      if (pending) await this.writeLinks(tx, id, pending);
      const p = await tx.product.update({ where: { id }, data });
      await this.audit.record('Product', id, 'APPROVE', before, p, tx);
      return p;
    });
  }

  async reject(user: AuthUser, id: string, reason: string) {
    const before = await this.find(user, id);
    const data: Prisma.ProductUncheckedUpdateInput = { pendingChanges: Prisma.DbNull };
    if (before.status === 'PENDING_APPROVAL') data.status = 'DRAFT';
    const p = await this.prisma.$transaction(async (tx) => {
      const r = await tx.product.update({ where: { id }, data });
      await this.audit.record('Product', id, 'REJECT', before, { ...r, reason }, tx);
      return r;
    });
    return p;
  }

  async setStatus(user: AuthUser, id: string, status: 'PUBLISHED' | 'UNPUBLISHED') {
    const before = await this.find(user, id);
    if (before.archivedAt) throw badRequest('ARCHIVED', 'Restore this product first.');
    if (status === 'PUBLISHED' && !before.images.length) throw badRequest('NO_IMAGES', 'Add at least one image before publishing.');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id },
        data: { status, publishedAt: status === 'PUBLISHED' ? (before.publishedAt ?? new Date()) : before.publishedAt },
      });
      await this.audit.record('Product', id, status === 'PUBLISHED' ? 'PUBLISH' : 'UNPUBLISH', before, p, tx);
      return p;
    });
  }

  async archive(user: AuthUser, id: string, archived: boolean) {
    const before = await this.prisma.product.findFirst({ where: { AND: [{ id }, productScope(user)] } });
    if (!before) throw notFound('Product');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id },
        data: archived ? { archivedAt: new Date(), status: 'ARCHIVED' } : { archivedAt: null, status: 'UNPUBLISHED' },
      });
      await this.audit.record('Product', id, archived ? 'ARCHIVE' : 'RESTORE', before, p, tx);
      return p;
    });
  }

  /** Put a sold unique piece back on sale (e.g. after a return). Releases its converted hold. */
  async restock(user: AuthUser, id: string) {
    const before = await this.find(user, id);
    if (before.stockType !== 'UNIQUE' || !before.soldAt) throw badRequest('NOT_SOLD', 'Only a sold unique piece can be restocked.');
    return this.prisma.$transaction(async (tx) => {
      await tx.stockHold.updateMany({
        where: { productId: id, isUnique: true, status: { in: ['ACTIVE', 'CONVERTED'] } },
        data: { status: 'RELEASED', releasedReason: 'restocked' },
      });
      const p = await tx.product.update({ where: { id }, data: { soldAt: null, quantity: 1, outOfStock: false } });
      await this.audit.record('Product', id, 'RESTOCK', before, p, tx);
      return p;
    });
  }

  // ── Images & video ─────────────────────────────────────────────

  async addImages(user: AuthUser, id: string, files: IncomingFile[], kind?: 'MAIN' | 'CAROUSEL' | 'LIFESTYLE') {
    const p = await this.find(user, id);
    this.assertMediaEditable(user, p);
    if (!files?.length) throw badRequest('NO_FILES', 'Choose at least one image.');
    let order = p.images.length;
    const hasMain = p.images.some((i) => i.kind === 'MAIN');
    const created = [];
    for (const [i, f] of files.entries()) {
      const img = await this.media.saveImage(f, `products/${p.id}`, { square: true });
      const k = kind ?? (!hasMain && i === 0 ? 'MAIN' : 'CAROUSEL');
      created.push(
        await this.prisma.productImage.create({
          data: { productId: p.id, kind: k, url: img.url, variants: img.variants, width: img.width, height: img.height, sortOrder: order++, alt: p.name },
        }),
      );
    }
    await this.audit.record('Product', id, 'ADD_IMAGES', undefined, { images: created.map((c) => c.url) });
    return created;
  }

  async reorderImages(user: AuthUser, id: string, ids: string[]) {
    const p = await this.find(user, id);
    this.assertMediaEditable(user, p);
    const own = new Set(p.images.map((i) => i.id));
    if (ids.some((x) => !own.has(x))) throw badRequest('INVALID_IMAGES', 'Those images do not belong to this product.');
    await this.prisma.$transaction(ids.map((imgId, i) => this.prisma.productImage.update({ where: { id: imgId }, data: { sortOrder: i } })));
    await this.audit.record('Product', id, 'REORDER_IMAGES', p.images.map((i) => i.id), ids);
    return this.find(user, id);
  }

  async updateImage(user: AuthUser, id: string, imageId: string, patch: { alt?: string | null; kind?: 'MAIN' | 'CAROUSEL' | 'LIFESTYLE' }) {
    const p = await this.find(user, id);
    this.assertMediaEditable(user, p);
    const img = p.images.find((i) => i.id === imageId);
    if (!img) throw notFound('Image');
    return this.prisma.$transaction(async (tx) => {
      if (patch.kind === 'MAIN') await tx.productImage.updateMany({ where: { productId: id, kind: 'MAIN' }, data: { kind: 'CAROUSEL' } });
      const r = await tx.productImage.update({ where: { id: imageId }, data: patch });
      await this.audit.record('ProductImage', imageId, 'UPDATE', img, r, tx);
      return r;
    });
  }

  async removeImage(user: AuthUser, id: string, imageId: string) {
    const p = await this.find(user, id);
    this.assertMediaEditable(user, p);
    const img = p.images.find((i) => i.id === imageId);
    if (!img) throw notFound('Image');
    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.audit.record('ProductImage', imageId, 'DELETE', img);
    return { ok: true };
  }

  async setVideo(user: AuthUser, id: string, file: IncomingFile | null) {
    const before = await this.find(user, id);
    this.assertMediaEditable(user, before);
    const stored = file ? await this.media.saveVideo(file, `products/${id}`) : null;
    const p = await this.prisma.product.update({ where: { id }, data: { videoUrl: stored?.url ?? null } });
    await this.audit.record('Product', id, file ? 'SET_VIDEO' : 'REMOVE_VIDEO', { videoUrl: before.videoUrl }, { videoUrl: p.videoUrl });
    return p;
  }

  /** Bulk upload: files named by SKU ("SP-NE-0001.jpg" or "SP-NE-0001_2.jpg") are attached to that product. */
  async bulkImages(user: AuthUser, files: IncomingFile[]) {
    const report: Array<{ file: string; sku: string | null; ok: boolean; message?: string }> = [];
    for (const f of files) {
      const sku = f.originalname.replace(/\.[^.]+$/, '').replace(/[_\s](\d+)$/, '').toUpperCase();
      const product = await this.prisma.product.findFirst({ where: { AND: [{ sku }, productScope(user)] } });
      if (!product) {
        report.push({ file: f.originalname, sku, ok: false, message: 'No product with this SKU' });
        continue;
      }
      try {
        await this.addImages(user, product.id, [f]);
        report.push({ file: f.originalname, sku, ok: true });
      } catch (e) {
        report.push({ file: f.originalname, sku, ok: false, message: (e as { message?: string }).message ?? 'Failed' });
      }
    }
    return { uploaded: report.filter((r) => r.ok).length, failed: report.filter((r) => !r.ok).length, report };
  }

  /** A vendor's changes to a live piece wait for approval; photos and video cannot wait, so on a live piece head office changes them. */
  private assertMediaEditable(user: AuthUser, p: { status: string }) {
    if (user.role === 'VENDOR' && p.status === 'PUBLISHED') throw forbidden('Photos and video on a live piece are changed by head office. Ask them to make the change.');
  }

  assertCanEdit(user: AuthUser) {
    if (user.role === 'FRANCHISE' || user.role === 'CITY_MANAGER') throw forbidden();
  }
}
