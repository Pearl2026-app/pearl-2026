import type { Metadata } from 'next';
import { formatINR } from '@sahyadri/shared';
import type { ProductDetail } from './types';

/**
 * The public address used in canonical links, Open Graph, JSON-LD, robots.txt and the sitemap. On Vercel, when neither
 * NEXT_PUBLIC_SITE_URL nor WEB_URL is set, Vercel's own production address (the custom domain once one is connected)
 * is used, so search engines are never sent to localhost.
 */
const vercelSite = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.WEB_URL || vercelSite || 'http://localhost:3000').replace(/\/+$/, '');
export const abs = (path: string) => (path.startsWith('http') ? path : `${SITE_URL}${path}`);

export function meta(opts: { title: string; description?: string | null; path: string; image?: string | null; noindex?: boolean }): Metadata {
  const description = opts.description ? clip(opts.description.replace(/\s+/g, ' ').trim(), 170) : undefined;
  return {
    title: opts.title,
    description,
    // A page kept out of search results gets no canonical link (the two signals would contradict each other).
    alternates: opts.noindex ? undefined : { canonical: opts.path },
    openGraph: { title: opts.title, description, url: opts.path, siteName: 'Sahyadri Pearls', type: 'website', images: opts.image ? [{ url: abs(opts.image) }] : undefined, locale: 'en_IN' },
    twitter: { card: opts.image ? 'summary_large_image' : 'summary', title: opts.title, description },
    // Left out entirely when indexable, so the site-wide rule in the root layout (noindex on the demo) still applies.
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Cut text at a word boundary so a meta description never ends mid-word. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,.;:·-]+$/, '')}…`;
}

/**
 * The product's description for search results: the one the admin wrote, otherwise one built from the piece's own
 * facts (SPEC Part 5). It claims only what the data shows: "certified" only with a certificate, the farm only when
 * one is linked.
 */
export function productDescription(p: ProductDetail): string {
  const written = p.description?.replace(/\s+/g, ' ').trim();
  if (written) return written;
  const bits = [p.caratWeight ? `${p.caratWeight} ct` : null, p.colour?.toLowerCase(), p.shape?.toLowerCase(), 'pearls', p.farm ? `from ${p.farm.name}` : null].filter(Boolean).join(' ');
  const price = p.priceOnRequest || p.pricePaise == null ? ' Price on request.' : ` ${formatINR(p.pricePaise, { compact: true })}.`;
  const facts = [p.certificateCode || p.certificateNumber || p.certification ? 'Certified' : null, p.farm ? 'farm-traced' : null].filter(Boolean).join(', ');
  return `${p.name}: ${bits}.${price}${facts ? ` ${facts}.` : ''}`;
}

/** schema.org availability from the piece's real state. */
const availability = (p: ProductDetail) =>
  p.isSold ? 'https://schema.org/SoldOut' : p.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

export function productJsonLd(p: ProductDetail) {
  const image = p.images.map((i) => abs(i.url));
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    image,
    description: productDescription(p),
    url: abs(`/product/${p.slug}`),
    brand: { '@type': 'Brand', name: 'Sahyadri Pearls' },
    category: p.category.name,
    material: p.metal ? `Pearl, ${p.metal}` : 'Pearl',
    ...(p.rating.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count } } : {}),
    // Price on request: no Offer at all, rather than a made-up price.
    ...(p.pricePaise != null && !p.priceOnRequest
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'INR',
            price: (p.pricePaise / 100).toFixed(2),
            availability: availability(p),
            url: abs(`/product/${p.slug}`),
            seller: { '@type': 'Organization', name: 'Sahyadri Pearls' },
          },
        }
      : {}),
  };
}

export const breadcrumbJsonLd = (items: Array<{ name: string; path: string }>) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.name, item: abs(i.path) })),
});

export function JsonLd({ data }: { data: unknown }) {
  // JSON-LD is data, not markup: escape "<" so text cannot close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
