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
}

const SRC = join(__dirname, 'collection');

/** Copies the collection media to <storage>/public/collection (served at /media/collection). */
export function copyCollectionMedia(storageDir: string): boolean {
  if (!existsSync(join(SRC, 'manifest.json'))) return false;
  cpSync(SRC, join(storageDir, 'public', 'collection'), { recursive: true });
  return true;
}

const VARIANT_NAME: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III' };

function nameFor(v: Variant): string {
  const code = v.design.replace(/^SP-JRP-/, '');
  const kind = /earring/i.test(v.category) ? 'Pearl Earrings' : v.gender && /^male$/i.test(v.gender) ? "Men's Pearl Ring" : 'Pearl Ring';
  return `Sahyadri ${kind} ${code} · ${VARIANT_NAME[v.variant] ?? v.variant}`;
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
          description: `Design ${v.design}, variant ${v.variant}, from the Sahyadri Pearls signature collection. Cultured pearls, hand-set. Ask us for the price, metal options and ${isRing ? 'your ring size' : 'matching pieces'}.`,
          status: 'PUBLISHED',
          publishedAt: new Date(now.getTime() - i * 60_000),
          categoryId,
          collectionId: collection.id,
          priceOnRequest: true,
          pricePaise: 0,
          stockType: 'UNIQUE',
          quantity: 1,
          isFeatured: v.variant === '1',
          isExclusive: true,
          colour: 'White',
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
