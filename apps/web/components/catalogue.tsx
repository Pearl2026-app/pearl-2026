import Link from 'next/link';
import { get, cityFromCookie } from '@/lib/server-api';
import type { Filters, Page, ProductCard } from '@/lib/types';
import { FilterPanel, SortSelect } from './filters';
import { ProductGrid } from './product-card';

export type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** URL (rupees, friendly names) → API query (paise). */
export function apiQuery(sp: SearchParams, fixed: Record<string, string | undefined>, city?: string) {
  const p = new URLSearchParams();
  const set = (k: string, v?: string) => v && p.set(k, v);
  for (const [k, v] of Object.entries(fixed)) set(k, v);
  set('city', city);
  set('shape', one(sp.shape));
  set('colour', one(sp.colour));
  set('farm', fixed.farm ?? one(sp.farm));
  set('collection', fixed.collection ?? one(sp.collection));
  set('category', fixed.category ?? one(sp.category));
  set('caratMin', one(sp.carat_min));
  set('caratMax', one(sp.carat_max));
  const pm = one(sp.price_min);
  const px = one(sp.price_max);
  if (pm && !isNaN(+pm)) p.set('priceMin', String(Math.round(+pm * 100)));
  if (px && !isNaN(+px)) p.set('priceMax', String(Math.round(+px * 100)));
  set('q', one(sp.q));
  set('inStock', one(sp.in_stock) === '1' ? 'true' : undefined);
  set('sort', one(sp.sort));
  set('page', one(sp.page));
  p.set('pageSize', '24');
  return p;
}

export async function Catalogue({ searchParams, fixed, basePath }: { searchParams: SearchParams; fixed: Record<string, string | undefined>; basePath: string }) {
  const city = await cityFromCookie();
  const q = apiQuery(searchParams, fixed, city);
  const facetQ = new URLSearchParams();
  for (const k of ['category', 'collection', 'farm', 'city']) if (q.get(k)) facetQ.set(k, q.get(k)!);
  const [data, filters] = await Promise.all([
    get<Page<ProductCard>>(`/catalogue/products?${q}`, { revalidate: 60 }),
    get<Filters>(`/catalogue/filters?${facetQ}`, { revalidate: 300 }),
  ]);
  const page = data!;
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const href = (n: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === 'string' && k !== 'page') u.set(k, v);
    if (n > 1) u.set('page', String(n));
    const s = u.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-12">
      <FilterPanel filters={filters!} hide={Object.keys(fixed).filter((k) => fixed[k])} />
      <div>
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {page.total} {page.total === 1 ? 'piece' : 'pieces'}
          </p>
          <SortSelect />
        </div>
        {page.items.length ? (
          <ProductGrid products={page.items} priorityCount={4} />
        ) : (
          <div className="border border-dashed border-line px-6 py-16 text-center">
            <p className="font-serif text-2xl">Nothing matches those filters</p>
            <p className="mt-2 text-sm text-muted">
              Try fewer filters, or{' '}
              <Link href="/customized-jewellery" className="text-accent underline">
                ask us to make it for you
              </Link>
              .
            </p>
          </div>
        )}
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-14 flex items-center justify-center gap-2 text-sm">
            {page.page > 1 && <Link href={href(page.page - 1)} className="min-h-11 border border-line px-4 py-3">Previous</Link>}
            <span className="px-3">
              Page {page.page} of {pages}
            </span>
            {page.page < pages && <Link href={href(page.page + 1)} className="min-h-11 border border-line px-4 py-3">Next</Link>}
          </nav>
        )}
      </div>
    </div>
  );
}
