import { z } from 'zod';
import { basisPoints, paise, slug } from '@sahyadri/shared';

const optStr = (max = 200) => z.string().trim().max(max).optional().nullable();
const seo = { seoTitle: optStr(70), seoDescription: optStr(170) };

export const categoryCreate = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  description: optStr(1000),
  imageUrl: optStr(500),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  gstRateBp: basisPoints.optional(),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/, 'HSN code is 4–8 digits').optional().nullable(),
  cityIds: z.array(z.string()).optional(),
  ...seo,
});
export const categoryUpdate = categoryCreate.partial();

export const collectionCreate = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  description: optStr(1000),
  imageUrl: optStr(500),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  ...seo,
});
export const collectionUpdate = collectionCreate.partial();

export const farmCreate = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slug.optional(),
  location: z.string().trim().min(2).max(200),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  summary: optStr(500),
  story: optStr(20000),
  heroImageUrl: optStr(500),
  galleryUrls: z.array(z.string().max(500)).max(40).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  ...seo,
});
export const farmUpdate = farmCreate.partial();

const productFields = {
  name: z.string().trim().min(2).max(160),
  slug: slug.optional(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'SKU: letters, digits and hyphens'),
  description: optStr(10000),
  categoryId: z.string().min(1),
  collectionId: z.string().optional().nullable(),
  farmId: z.string().optional().nullable(),
  vendorId: z.string().optional().nullable(),
  pricePaise: paise.max(2_000_000_000),
  compareAtPaise: paise.optional().nullable(),
  metalCostPaise: paise.optional().nullable(),
  labourCostPaise: paise.optional().nullable(),
  pearlCostPaise: paise.optional().nullable(),
  priceOnRequest: z.boolean().optional(),
  caratWeight: z.number().min(0).max(100000).optional().nullable(),
  shape: optStr(40),
  colour: optStr(40),
  lustre: optStr(40),
  surface: optStr(60),
  grade: optStr(20),
  sizeMm: z.number().min(0).max(1000).optional().nullable(),
  metal: optStr(80),
  certification: optStr(200),
  stockType: z.enum(['UNIQUE', 'QUANTITY']).optional(),
  quantity: z.number().int().min(0).max(1_000_000).optional(),
  outOfStock: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isExclusive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED']).optional(),
  cityIds: z.array(z.string()).optional(),
  relatedIds: z.array(z.string()).max(24).optional(),
  ...seo,
};
export const productCreate = z.object(productFields);
export const productUpdate = z.object(productFields).partial();
export type ProductInput = z.infer<typeof productCreate>;

/** Fields a vendor may change directly without approval. */
export const VENDOR_DIRECT_FIELDS = ['quantity', 'outOfStock'] as const;
/** Fields only head office may set. */
export const ADMIN_ONLY_FIELDS = ['vendorId', 'status', 'isFeatured', 'isExclusive', 'sortOrder'] as const;
/** Cost fields hidden from franchise and city-manager responses. */
export const COST_FIELDS = ['metalCostPaise', 'labourCostPaise', 'pearlCostPaise'] as const;

export const imageOrder = z.object({ ids: z.array(z.string()).min(1).max(100) });
export const imagePatch = z.object({ alt: optStr(200), kind: z.enum(['MAIN', 'CAROUSEL', 'LIFESTYLE']).optional() });
export const rejectInput = z.object({ reason: z.string().trim().min(3).max(500) });
