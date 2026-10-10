import type { Metadata } from 'next';
import { formatINR } from '@sahyadri/shared';
import type { ProductDetail } from './types';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const abs = (path: string) => (path.startsWith('http') ? path : `${SITE_URL}${path}`);

export function meta(opts: { title: string; description?: string | null; path: string; image?: string | null; noindex?: boolean }): Metadata {
  const description = opts.description?.slice(0, 170) ?? undefined;
  return {
    title: opts.title,
    description,
    alternates: { canonical: opts.path },
    openGraph: { title: opts.title, description, url: opts.path, siteName: 'Sahyadri Pearls', type: 'website', images: opts.image ? [{ url: abs(opts.image) }] : undefined, locale: 'en_IN' },
    twitter: { card: opts.image ? 'summary_large_image' : 'summary', title: opts.title, description },
    robots: opts.noindex ? { index: false, follow: true } : undefined,
  };
}

/** Auto-generated product description when the admin has not written one (SPEC Part 5). */
export function productDescription(p: ProductDetail): string {
  const bits = [p.caratWeight ? `${p.caratWeight} ct` : null, p.colour?.toLowerCase(), p.shape?.toLowerCase(), 'pearls', p.farm ? `from ${p.farm.name}` : null].filter(Boolean).join(' ');
  const price = p.pricePaise != null ? ` ${formatINR(p.pricePaise, { compact: true })}.` : ' Price on request.';
  return `${p.name}: ${bits}.${price} Certified, farm-traced, insured delivery across India.`;
}

export function productJsonLd(p: ProductDetail) {
  const image = p.images.map((i) => abs(i.url));
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.sku,
    image,
    description: p.description ?? productDescription(p),
    brand: { '@type': 'Brand', name: 'Sahyadri Pearls' },
    category: p.category.name,
    material: 'Pearl',
    ...(p.rating.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating.average, reviewCount: p.rating.count } } : {}),
    ...(p.pricePaise != null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'INR',
            price: (p.pricePaise / 100).toFixed(2),
            availability: p.available ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
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
