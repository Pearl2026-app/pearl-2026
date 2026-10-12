// Shop filters → API query. Prices on screen are rupees; the API takes paise.

export const PRICE_BANDS = [
  { key: 'u10', label: 'Under ₹10,000', max: 10_000 },
  { key: '10-25', label: '₹10,000 – ₹25,000', min: 10_000, max: 25_000 },
  { key: '25-50', label: '₹25,000 – ₹50,000', min: 25_000, max: 50_000 },
  { key: 'o50', label: 'Above ₹50,000', min: 50_000 },
] as const;

export const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'newest', label: 'Newest' },
  { key: 'price_asc', label: 'Price: low to high' },
  { key: 'price_desc', label: 'Price: high to low' },
] as const;

export interface ShopFilters {
  q?: string;
  category?: string;
  collection?: string;
  colour?: string[];
  shape?: string[];
  band?: (typeof PRICE_BANDS)[number]['key'];
  sort?: (typeof SORTS)[number]['key'];
  inStock?: boolean;
}

export function toQuery(f: ShopFilters, page = 1, city?: string): Record<string, string | number> {
  const q: Record<string, string | number> = { page, pageSize: 20 };
  if (f.q?.trim()) q.q = f.q.trim();
  if (f.category) q.category = f.category;
  if (f.collection) q.collection = f.collection;
  if (f.colour?.length) q.colour = f.colour.join(',');
  if (f.shape?.length) q.shape = f.shape.join(',');
  const band = PRICE_BANDS.find((b) => b.key === f.band);
  if (band && 'min' in band) q.priceMin = band.min * 100;
  if (band && 'max' in band) q.priceMax = band.max * 100;
  if (f.sort && f.sort !== 'newest') q.sort = f.sort;
  if (f.inStock) q.inStock = 'true';
  if (city) q.city = city;
  return q;
}

/** How many filters are on (for the "Filters (3)" button); search and sort are not counted. */
export const activeCount = (f: ShopFilters) => (f.category ? 1 : 0) + (f.collection ? 1 : 0) + (f.colour?.length ?? 0) + (f.shape?.length ?? 0) + (f.band ? 1 : 0) + (f.inStock ? 1 : 0);

export const toggle = (list: string[] | undefined, v: string) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);
