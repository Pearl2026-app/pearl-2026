// The client's own collection (shared Drive folder, 4 Nov): earrings and women's/men's rings by design code
// (SP-JRP-ER-01…, SP-JRP-01…), each in up to three variants with photos and a short video. The photos and
// videos live in seed/collection (pulled in by scripts/import-drive-collection.mjs) and are copied to the
// instance's storage on every start, like the other bundled media. Products are created once and never
// overwritten, so prices and names edited in the admin stay.
import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';

interface Variant {
  design: string;
  variant: string;
  category: string;
  gender: string | null;
  images: string[];
  video: string | null;
  /** Metal colour of the render: Yellow Gold, Rose Gold or White Gold. */
  finish?: string;
}

const SRC = join(__dirname, 'collection');

/** Copies the collection media to <storage>/public/collection (served at /media/collection). */
export function copyCollectionMedia(storageDir: string): boolean {
  if (!existsSync(join(SRC, 'manifest.json'))) return false;
  cpSync(SRC, join(storageDir, 'public', 'collection'), { recursive: true });
  return true;
}

/** Design names, from the renders (4 Nov). Edit freely in the admin; the seed never overwrites names. */
const DESIGN_NAME: Record<string, string> = {
  'SP-JRP-01': 'Filigree Crown Pearl Ring',
  'SP-JRP-02': 'Crossover Pearl Solitaire',
  'SP-JRP-03': 'Textured Leaf Dome Ring',
  'SP-JRP-04': 'Scallop Shell Pearl Ring',
  'SP-JRP-05': 'Wire-Wrapped Pearl Ring',
  'SP-JRP-06': 'Four-Prong Pearl Ring',
  'SP-JRP-07': 'Bypass Pearl Ring',
  'SP-JRP-08': 'Ribbed Dome Pearl Ring',
  'SP-JRP-09': 'Wave Pearl Ring',
  'SP-JRP-10': 'Almond Eye Pearl Ring',
  'SP-JRP-ER-01': 'Teardrop Hoop Pearl Drops',
  'SP-JRP-ER-02': 'Halo Pearl Studs',
  'SP-JRP-ER-03': 'Swirl Bezel Pearl Studs',
  'SP-JRP-ER-04': 'Classic Pearl Studs',
  'SP-JRP-ER-05': 'Teardrop Loop Pearl Earrings',
  'SP-JRP-ER-06': 'Crescent Pearl Studs',
  'SP-JRP-ER-07': 'Pearl Huggie Drops',
};

function nameFor(v: Variant): string {
  const base = DESIGN_NAME[v.design] ?? `Pearl ${/earring/i.test(v.category) ? 'Earrings' : 'Ring'} ${v.design.replace(/^SP-JRP-/, '')}`;
  const forHim = !/earring/i.test(v.category) && !!v.gender && /^male$/i.test(v.gender);
  return `${forHim ? "Men's " : ''}${base}${v.finish ? ` · ${v.finish}` : ` · ${v.variant}`}`;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function importClientCollection(prisma: PrismaClient, storageDir: string): Promise<void> {
  try {
    if (!copyCollectionMedia(storageDir)) return;
    const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8')) as Variant[];
    const cats = new Map((await prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
    const collection = await prisma.collection.upsert({
      where: { slug: 'signature' },
      update: {},
      create: {
        name: 'The Signature Collection',
        slug: 'signature',
        description: 'Our own designs in cultured pearl: earrings and rings for her and for him.',
        isFeatured: true,
        sortOrder: -1,
        imageUrl: manifest[0]?.images[0] ? `/media/collection/${manifest[0].images[0]}` : null,
      },
    });
    // Pieces imported by the first version of this seed were single pieces; the designs are made to order.
    await prisma.product.updateMany({
      where: { collectionId: collection.id, stockType: 'UNIQUE', quantity: 1, soldAt: null, sku: { startsWith: 'SP-JRP-' } },
      data: { stockType: 'QUANTITY', quantity: 10 },
    });
    // The first text said "hand-set", which nobody has confirmed (brief, 10 Nov: no invented making claims).
    await prisma.$executeRaw`UPDATE "Product" SET description = replace(description, 'A cultured pearl, hand-set', 'A cultured pearl') WHERE "collectionId" = ${collection.id} AND description LIKE '%hand-set%'`;
    const now = new Date();
    let made = 0;
    for (const [i, v] of manifest.entries()) {
      if (!v.images.length) continue;
      const categoryId = /earring/i.test(v.category) ? cats.get('earrings') : cats.get('rings');
      if (!categoryId) continue;
      const sku = `${v.design}-${v.variant}`;
      if (await prisma.product.findUnique({ where: { sku }, select: { id: true } })) continue;
      const name = nameFor(v);
      const isRing = !/earring/i.test(v.category);
      const p = await prisma.product.create({
        data: {
          sku,
          name,
          slug: slugify(`${name}-${sku}`),
          description: `From the Sahyadri Pearls signature collection (design ${v.design}${v.finish ? `, ${v.finish.toLowerCase()} finish` : ''}). A cultured pearl${isRing ? ', made to your ring size' : ''}. Also available in ${['Yellow Gold', 'Rose Gold', 'White Gold'].filter((f) => f !== v.finish).join(' and ').toLowerCase()}. Ask us for the price.`,
          status: 'PUBLISHED',
          publishedAt: new Date(now.getTime() - i * 60_000),
          categoryId,
          collectionId: collection.id,
          priceOnRequest: true,
          pricePaise: 0,
          // Designs made to order in any of the three finishes, not single pieces.
          stockType: 'QUANTITY',
          quantity: 10,
          isFeatured: v.variant === '1',
          isExclusive: true,
          colour: 'White',
          metal: v.finish ? `${v.finish} finish` : null,
          videoUrl: v.video ? `/media/collection/${v.video}` : null,
        },
        select: { id: true },
      });
      await prisma.productImage.createMany({
        data: v.images.map((img, n) => ({
          productId: p.id,
          url: `/media/collection/${img}`,
          kind: n === 0 ? ('MAIN' as const) : ('CAROUSEL' as const),
          alt: `${name}, view ${n + 1}`,
          sortOrder: n,
        })),
      });
      made++;
    }
    if (made) console.log(`Imported ${made} pieces from the client's signature collection.`);
  } catch (e) {
    // Never stop the rest of the seed.
    console.error('Signature collection import failed:', e);
  }
}
