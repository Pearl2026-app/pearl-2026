import type { MetadataRoute } from 'next';
import { abs } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';

// Read per request: whether this is the demo site comes from the API, which is not running at build time.
export const dynamic = 'force-dynamic';

/** Pages that are private to a shopper or are app/admin screens: never crawled. */
const PRIVATE = ['/cart', '/checkout', '/account', '/login', '/track', '/order', '/pay', '/search', '/verify/', '/newsletter/', '/api/', '/admin', '/apps/'];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await get<Site>('/site', { revalidate: 300 }).catch(() => null);
  // The demo site (sample products, sign-in code 123456) must not be indexed: it would compete with the real shop.
  if (site?.demo) return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE }],
    sitemap: abs('/sitemap.xml'),
  };
}
