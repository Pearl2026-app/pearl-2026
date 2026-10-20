import { Injectable } from '@nestjs/common';
import { Prisma } from '@sahyadri/db';
import { rupeesToPaise, slugify } from '@sahyadri/shared';
import { AuditService } from '../../common/audit.service';
import type { AuthUser } from '../../common/context';
import { parseCsv, toCsv } from '../../common/csv';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { productCreate } from './catalogue.schemas';

export const IMPORT_COLUMNS = [
  'sku',
  'name',
  'category',
  'collection',
  'farm',
  'vendor',
  'description',
  'price_rupees',
  'price_on_request',
  'metal_cost_rupees',
  'labour_cost_rupees',
  'pearl_cost_rupees',
  'carat',
  'shape',
  'colour',
  'lustre',
  'surface',
  'grade',
  'size_mm',
  'metal',
  'certification',
  'stock_type',
  'quantity',
  'out_of_stock',
  'status',
  'cities',
] as const;

const yes = (v: string | undefined) => ['1', 'yes', 'true', 'y'].includes((v ?? '').trim().toLowerCase());
const num = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : Number(v.replace(/,/g, '')));
const money = (v: string | undefined) => {
  const n = num(v);
  return n === undefined ? undefined : rupeesToPaise(n);
};

export interface ImportRowResult {
  row: number;
  sku: string;
  action: 'create' | 'update' | 'error';
  errors?: string[];
}

/** CSV bulk import: upsert by SKU, validated row by row, with a dry run. */
@Injectable()
export class ProductImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  template(): string {
    return toCsv(
      [
        {
          sku: 'SP-NE-0101',
          name: 'Sample Strand',
          category: 'necklaces',
          collection: 'everyday',
          farm: 'mulshi-lake-farm',
          vendor: '',
          description: 'A sample row',
          price_rupees: '18900',
          price_on_request: 'no',
          metal_cost_rupees: '2000',
          labour_cost_rupees: '1500',
          pearl_cost_rupees: '6000',
          carat: '5.4',
          shape: 'Round',
          colour: 'White',
          lustre: 'High',
          surface: 'Clean',
          grade: 'AA',
          size_mm: '7',
          metal: 'Sterling silver',
          certification: 'Sahyadri Pearls Certificate of Authenticity',
          stock_type: 'QUANTITY',
          quantity: '10',
          out_of_stock: 'no',
          status: 'DRAFT',
          cities: 'pune;mumbai',
        },
      ],
      IMPORT_COLUMNS.map((c) => ({ header: c, value: (r: Record<string, string>) => r[c] })),
    );
  }

  async run(user: AuthUser, csvText: string, dryRun: boolean) {
    const rows = parseCsv(csvText);
    if (rows.length < 2) throw badRequest('EMPTY_FILE', 'The file has no data rows.');
    const header = rows[0]!.map((h) => h.trim().toLowerCase());
    const missing = ['sku', 'name', 'category', 'price_rupees'].filter((c) => !header.includes(c));
    if (missing.length) throw badRequest('MISSING_COLUMNS', `Missing columns: ${missing.join(', ')}`);
    if (rows.length > 5001) throw badRequest('TOO_MANY_ROWS', 'Import at most 5,000 rows at a time.');

    const [cats, cols, farms, vendors, cities] = await Promise.all([
      this.prisma.category.findMany({ select: { id: true, slug: true, name: true } }),
      this.prisma.collection.findMany({ select: { id: true, slug: true, name: true } }),
      this.prisma.farm.findMany({ select: { id: true, slug: true, name: true } }),
      this.prisma.vendor.findMany({ select: { id: true, name: true } }),
      this.prisma.city.findMany({ select: { id: true, slug: true, name: true } }),
    ]);
    const bySlugOrName = <T extends { slug?: string; name: string }>(list: T[], v: string) =>
      list.find((x) => x.slug === slugify(v) || x.name.toLowerCase() === v.trim().toLowerCase());

    const results: ImportRowResult[] = [];
    const valid: Array<{ sku: string; data: Prisma.ProductUncheckedCreateInput; cityIds: string[] }> = [];
    const seen = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const r = Object.fromEntries(header.map((h, j) => [h, rows[i]![j]?.trim() ?? ''])) as Record<string, string>;
      const errors: string[] = [];
      const cat = r.category ? bySlugOrName(cats, r.category) : undefined;
      if (!cat) errors.push(`Unknown category "${r.category}"`);
      const col = r.collection ? bySlugOrName(cols, r.collection) : undefined;
      if (r.collection && !col) errors.push(`Unknown collection "${r.collection}"`);
      const farm = r.farm ? bySlugOrName(farms, r.farm) : undefined;
      if (r.farm && !farm) errors.push(`Unknown farm "${r.farm}"`);
      const vendor = r.vendor ? vendors.find((v) => v.name.toLowerCase() === r.vendor!.toLowerCase()) : undefined;
      if (r.vendor && !vendor) errors.push(`Unknown vendor "${r.vendor}"`);
      if (user.role === 'VENDOR' && vendor && vendor.id !== user.vendorId) errors.push('You can only import your own products');
      const cityIds: string[] = [];
      for (const c of (r.cities ?? '').split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
        const city = bySlugOrName(cities, c);
        if (city) cityIds.push(city.id);
        else errors.push(`Unknown city "${c}"`);
      }
      const stockType = (r.stock_type || 'QUANTITY').toUpperCase();
      const parsed = productCreate.safeParse({
        sku: r.sku,
        name: r.name,
        description: r.description || null,
        categoryId: cat?.id ?? 'x',
        collectionId: col?.id ?? null,
        farmId: farm?.id ?? null,
        vendorId: user.role === 'VENDOR' ? user.vendorId : (vendor?.id ?? null),
        pricePaise: money(r.price_rupees) ?? 0,
        priceOnRequest: yes(r.price_on_request),
        metalCostPaise: money(r.metal_cost_rupees) ?? null,
        labourCostPaise: money(r.labour_cost_rupees) ?? null,
        pearlCostPaise: money(r.pearl_cost_rupees) ?? null,
        caratWeight: num(r.carat) ?? null,
        shape: r.shape || null,
        colour: r.colour || null,
        lustre: r.lustre || null,
        surface: r.surface || null,
        grade: r.grade || null,
        sizeMm: num(r.size_mm) ?? null,
        metal: r.metal || null,
        certification: r.certification || null,
        stockType,
        quantity: stockType === 'UNIQUE' ? 1 : (num(r.quantity) ?? 0),
        outOfStock: yes(r.out_of_stock),
        status: user.role === 'VENDOR' ? undefined : ((r.status || 'DRAFT').toUpperCase() as 'DRAFT'),
      });
      if (!parsed.success) for (const iss of parsed.error.issues) errors.push(`${iss.path.join('.')}: ${iss.message}`);
      const sku = (r.sku ?? '').toUpperCase();
      if (seen.has(sku)) errors.push('Duplicate SKU in this file');
      seen.add(sku);
      const existing = sku ? await this.prisma.product.findUnique({ where: { sku }, select: { id: true, vendorId: true, status: true } }) : null;
      if (existing && user.role === 'VENDOR' && existing.vendorId !== user.vendorId) errors.push('This SKU belongs to another vendor');
      // A vendor's changes to a live piece wait for head office approval, which import cannot do.
      if (existing && user.role === 'VENDOR' && (existing.status === 'PUBLISHED' || existing.status === 'UNPUBLISHED'))
        errors.push('This piece is live: change it from its product page, where changes wait for approval');
      if (errors.length || !parsed.success) {
        results.push({ row: i + 1, sku, action: 'error', errors });
        continue;
      }
      const { cityIds: _c, relatedIds: _r, caratWeight, sizeMm, sizes: _sz, ...rest } = parsed.data;
      const data: Prisma.ProductUncheckedCreateInput = {
        ...rest,
        slug: slugify(rest.name),
        caratWeight: caratWeight == null ? null : new Prisma.Decimal(caratWeight),
        sizeMm: sizeMm == null ? null : new Prisma.Decimal(sizeMm),
        status: user.role === 'VENDOR' ? 'PENDING_APPROVAL' : (rest.status ?? 'DRAFT'),
      };
      valid.push({ sku, data, cityIds });
      results.push({ row: i + 1, sku, action: existing ? 'update' : 'create' });
    }

    const summary = {
      dryRun,
      total: results.length,
      create: results.filter((r) => r.action === 'create').length,
      update: results.filter((r) => r.action === 'update').length,
      errors: results.filter((r) => r.action === 'error').length,
      results,
    };
    if (dryRun || summary.errors > 0) return { ...summary, applied: false };

    await this.prisma.$transaction(
      async (tx) => {
        for (const v of valid) {
          const existing = await tx.product.findUnique({ where: { sku: v.sku } });
          let id: string;
          if (existing) {
            const { slug: _s, status, ...upd } = v.data;
            const p = await tx.product.update({
              where: { id: existing.id },
              data: { ...upd, status: user.role === 'VENDOR' ? existing.status : status },
            });
            id = p.id;
          } else {
            let slug = v.data.slug!;
            for (let n = 2; await tx.product.findUnique({ where: { slug } }); n++) slug = `${v.data.slug}-${n}`;
            const p = await tx.product.create({ data: { ...v.data, slug, publishedAt: v.data.status === 'PUBLISHED' ? new Date() : null } });
            id = p.id;
          }
          if (v.cityIds.length) {
            await tx.productCity.deleteMany({ where: { productId: id } });
            await tx.productCity.createMany({ data: v.cityIds.map((cityId) => ({ productId: id, cityId })) });
          }
        }
        await this.audit.record('Product', null, 'IMPORT', undefined, { create: summary.create, update: summary.update, skus: valid.map((v) => v.sku) }, tx);
      },
      { timeout: 120_000 },
    );
    return { ...summary, applied: true };
  }
}
