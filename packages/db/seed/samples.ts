// The sample catalogue, shared by the seed (database rows) and draw-samples (the artwork files).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { productSvg, sceneSvg } from './art';

export type SampleProduct = [name: string, cat: string, col: string | null, farm: 'mulshi' | 'konkan', price: number, carat: number, shape: string, colour: string, extra?: Partial<{ unique: boolean; qty: number; por: boolean; sold: boolean; vendor: boolean; metal: string; featured: boolean }>];
export const SAMPLE_PRODUCTS: SampleProduct[] = [
  ['Mulshi Baroque Strand', 'necklaces', 'heritage', 'mulshi', 42500, 7.2, 'Baroque', 'Cream', { unique: true, featured: true, metal: '18k gold clasp' }],
  ['Monsoon Rain Necklace', 'necklaces', 'bridal', 'mulshi', 68000, 11.5, 'Round', 'White', { unique: true, featured: true, metal: '22k gold' }],
  ['Konkan Sunrise Choker', 'necklaces', 'bridal', 'konkan', 89000, 14.2, 'Round', 'Golden', { unique: true, metal: '22k gold' }],
  ['Everyday Single Strand', 'necklaces', 'everyday', 'mulshi', 18900, 5.4, 'Near-round', 'White', { qty: 12, metal: 'Sterling silver clasp' }],
  ['Rose Layered Necklace', 'necklaces', 'everyday', 'mulshi', 24500, 6.1, 'Button', 'Rose', { qty: 6, metal: 'Sterling silver' }],
  ['Royal Peshwai Haar', 'necklaces', 'heritage', 'konkan', 0, 22.8, 'Round', 'Cream', { unique: true, por: true, metal: '22k gold', featured: true }],
  ['Tidepool Drop Earrings', 'earrings', 'everyday', 'konkan', 8900, 2.1, 'Drop', 'Cream', { qty: 20, metal: '18k gold vermeil', featured: true }],
  ['Classic Studs 7mm', 'earrings', 'everyday', 'mulshi', 4900, 1.4, 'Round', 'White', { qty: 40, metal: 'Sterling silver' }],
  ['Bridal Jhumka Pearls', 'earrings', 'bridal', 'konkan', 32500, 4.8, 'Round', 'Golden', { unique: true, metal: '22k gold' }],
  ['Lavender Hoops', 'earrings', 'everyday', 'mulshi', 6900, 1.9, 'Button', 'Lavender', { qty: 10, metal: 'Sterling silver', vendor: true }],
  ['Black Pearl Studs', 'earrings', null, 'konkan', 12900, 1.8, 'Round', 'Black', { qty: 8, metal: '18k white gold' }],
  ['Nath Pearl Earrings', 'earrings', 'heritage', 'mulshi', 15800, 2.6, 'Rice', 'White', { qty: 5, metal: 'Gold-plated silver', vendor: true }],
  ['Solitaire Pearl Ring', 'rings', 'bridal', 'mulshi', 21500, 2.4, 'Round', 'White', { unique: true, metal: '18k gold', featured: true }],
  ['Golden Halo Ring', 'rings', 'bridal', 'konkan', 27800, 2.9, 'Round', 'Golden', { unique: true, metal: '18k gold' }],
  ['Everyday Pearl Band', 'rings', 'everyday', 'mulshi', 7900, 1.1, 'Button', 'Cream', { qty: 15, metal: 'Sterling silver' }],
  ['Baroque Statement Ring', 'rings', null, 'konkan', 16500, 3.6, 'Baroque', 'Silver', { unique: true, metal: 'Sterling silver', sold: true }],
  ['Rose Petal Ring', 'rings', 'everyday', 'mulshi', 9800, 1.5, 'Drop', 'Rose', { qty: 7, metal: '14k rose gold', vendor: true }],
  ['Black Tide Ring', 'rings', null, 'konkan', 14900, 2.2, 'Round', 'Black', { qty: 4, metal: '18k white gold' }],
  ['Single Pearl Bracelet', 'bracelets', 'everyday', 'mulshi', 5900, 1.2, 'Round', 'White', { qty: 25, metal: 'Sterling silver chain' }],
  ['Double Strand Bracelet', 'bracelets', 'bridal', 'konkan', 19800, 4.4, 'Near-round', 'Cream', { qty: 6, metal: '18k gold clasp' }],
  ['Kada Pearl Bangle', 'bracelets', 'heritage', 'konkan', 36500, 5.9, 'Round', 'Golden', { unique: true, metal: '22k gold' }],
  ['Baroque Charm Bracelet', 'bracelets', null, 'mulshi', 11200, 3.1, 'Baroque', 'Lavender', { qty: 9, metal: 'Sterling silver', vendor: true }],
  ['Teardrop Pendant', 'pendants', 'everyday', 'konkan', 9900, 2.0, 'Drop', 'Cream', { qty: 14, metal: '18k gold vermeil', featured: true }],
  ['Moonlit Pendant', 'pendants', null, 'mulshi', 12500, 2.3, 'Round', 'Silver', { qty: 8, metal: 'Sterling silver' }],
  ['Mangalsutra Pearl Pendant', 'pendants', 'heritage', 'konkan', 24800, 3.2, 'Round', 'Black', { unique: true, metal: '22k gold' }],
  ['Golden Orb Pendant', 'pendants', 'bridal', 'konkan', 18600, 2.8, 'Round', 'Golden', { qty: 3, metal: '18k gold' }],
  ['Loose Round Pair 8mm', 'loose-pearls', null, 'mulshi', 3800, 1.6, 'Round', 'White', { qty: 30 }],
  ['Loose Baroque Lot', 'loose-pearls', null, 'konkan', 6500, 9.5, 'Baroque', 'Cream', { qty: 10 }],
  ['Collector Golden Pearl 12mm', 'loose-pearls', null, 'konkan', 0, 3.9, 'Round', 'Golden', { unique: true, por: true }],
  ['Loose Rose Buttons', 'loose-pearls', null, 'mulshi', 2900, 2.4, 'Button', 'Rose', { qty: 50 }],

];

export const sampleSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CATEGORY_SLUGS = ['necklaces', 'earrings', 'rings', 'bracelets', 'pendants', 'loose-pearls'] as const;
const COLLECTIONS = [
  ['Bridal', 'bridal'],
  ['Everyday', 'everyday'],
  ['Heritage', 'heritage'],
] as const;

/**
 * Writes every sample image the seed refers to, without touching the database. The demo API runs this before it
 * starts serving, so each instance has every file on its own disk (the seed alone draws them in the background).
 * Keep the names and arguments in step with seed.ts.
 */
export function drawSamples(storageDir: string): number {
  let n = 0;
  const write = (rel: string, svg: string) => {
    const file = join(storageDir, 'public', 'samples', rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, svg);
    n++;
  };
  for (const slug of CATEGORY_SLUGS) write(`category-${slug}.svg`, productSvg(slug === 'loose-pearls' ? 'loose' : slug, 'White'));
  write('farm-mulshi.svg', sceneSvg('Mulshi Lake Farm', 'water'));
  write('farm-mulshi-2.svg', sceneSvg('Harvest at Mulshi', 'farm'));
  write('farm-konkan.svg', sceneSvg('Konkan Coast Farm', 'farm'));
  write('farm-konkan-2.svg', sceneSvg('Grading at Konkan', 'craft'));
  for (const [i, [name, slug]] of COLLECTIONS.entries()) write(`collection-${slug}.svg`, sceneSvg(name, i === 0 ? 'craft' : 'water'));
  for (const [name, cat, , , , , , colour] of SAMPLE_PRODUCTS) {
    const slug = sampleSlug(name);
    const kind = cat === 'loose-pearls' ? 'loose' : cat;
    write(`products/${slug}-1.svg`, productSvg(kind, colour, 0));
    write(`products/${slug}-2.svg`, productSvg(kind, colour === 'White' ? 'Cream' : 'White', 1));
  }
  write('banner-hero.svg', sceneSvg('Pearls with a birthplace', 'water'));
  write('banner-custom.svg', sceneSvg('Made for you', 'craft'));
  return n;
}
