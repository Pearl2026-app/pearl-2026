import type { Prisma, PrismaClient } from '@sahyadri/db';
import { PO_DEFAULT_GST_PERCENT, poCost } from '@sahyadri/shared';

export const num = (d: Prisma.Decimal | number | string | null | undefined) => (d == null ? null : Number(d));

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * A catalogue piece's numbers, to prefill a PO: pearl size and weight, metal and its net weight, the design's
 * photos, and the making rate of the last PO for the same design (rates are agreed per design).
 */
export async function productPrefill(db: Db, productId: string) {
  const p = await db.product.findFirst({
    where: { id: productId, archivedAt: null },
    select: { id: true, name: true, sku: true, sizes: true, metal: true, sizeMm: true, caratWeight: true, netWeight: true, images: { orderBy: { sortOrder: 'asc' }, take: 3, select: { url: true } } },
  });
  if (!p) return null;
  const last = await db.purchaseOrder.findFirst({ where: { productId, makingRatePerGramPaise: { not: null } }, orderBy: { createdAt: 'desc' }, select: { makingRatePerGramPaise: true, gstPercent: true } });
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    sizes: p.sizes,
    pearlSizeMm: num(p.sizeMm),
    pearlWeightCt: num(p.caratWeight),
    metal: p.metal,
    metalWeightG: num(p.netWeight),
    makingRatePerGramPaise: last?.makingRatePerGramPaise ?? null,
    gstPercent: last ? Number(last.gstPercent) : PO_DEFAULT_GST_PERCENT,
    imageUrls: p.images.map((i) => i.url),
  };
}

/** Computed making charge of a stored PO. */
export const costOf = (p: { metalWeightG: Prisma.Decimal | null; makingRatePerGramPaise: number | null; quantity: number; gstPercent: Prisma.Decimal | number }) =>
  poCost({ metalWeightG: num(p.metalWeightG), makingRatePerGramPaise: p.makingRatePerGramPaise, quantity: p.quantity, gstPercent: Number(p.gstPercent) });
