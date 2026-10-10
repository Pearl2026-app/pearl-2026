import type { MetadataRoute } from 'next';
import { abs } from '@/lib/seo';
import { get } from '@/lib/server-api';

type Row = { slug: string; updatedAt: string };
interface Data { products: Row[]; categories: Row[]; collections: Row[]; farms: Row[]; pages: Row[]; jobs: Row[] }


export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const d = await get<Data>('/seo/sitemap', { revalidate: 3600 });
  const fixed = ['', '/jewellery', '/our-farm', '/customized-jewellery', '/ring-finder', '/contact', '/faq', '/careers', '/offers', '/bulk-buying', '/gallery'].map((p) => ({ url: abs(p || '/'), changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.6 }));
  if (!d) return fixed;
  const rows = (prefix: string, list: Row[], priority: number) => list.map((r) => ({ url: abs(`${prefix}/${r.slug}`), lastModified: r.updatedAt, priority }));
  return [
    ...fixed,
    ...rows('/product', d.products, 0.9),
    ...rows('/jewellery', d.categories, 0.8),
    ...rows('/collections', d.collections, 0.7),
    ...rows('/our-farm', d.farms, 0.7),
    ...rows('', d.pages, 0.3),
    ...rows('/careers', d.jobs, 0.3),
  ];
}
