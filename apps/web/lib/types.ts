export interface ImageRef {
  url: string;
  variants?: Record<string, string> | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  sku: string;
  pricePaise: number | null;
  compareAtPaise: number | null;
  priceOnRequest: boolean;
  caratWeight: number | null;
  shape: string | null;
  colour: string | null;
  metal: string | null;
  isUnique: boolean;
  isExclusive?: boolean;
  isSold: boolean;
  available: boolean;
  farm: { name: string; slug: string } | null;
  collection: { name: string; slug: string } | null;
  category: { name: string; slug: string };
  images: ImageRef[];
}

export interface ProductDetail extends ProductCard {
  description: string | null;
  lustre: string | null;
  surface: string | null;
  grade: string | null;
  sizeMm: number | null;
  certification: string | null;
  certificateCode: string | null;
  videoUrl: string | null;
  images: Array<ImageRef & { kind: string }>;
  farm: { name: string; slug: string; location: string; summary: string | null; story: string | null; heroImageUrl: string | null } | null;
  reserved: boolean;
  availableInCity: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  rating: { average: number | null; count: number };
  reviews: Array<{ id: string; rating: number; title: string | null; body: string | null; photoUrls: string[]; createdAt: string; name: string }>;
  related: ProductCard[];
  updatedAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Site {
  demo?: boolean;
  store: { legalName: string; state: string; address: string; phone: string; email: string; whatsapp: string; mapUrl: string };
  delivery: { chargePaise: number; freeAbovePaise: number | null; promise: string };
  appLinks: { android: string; ios: string };
  seo: { titleSuffix: string; defaultDescription: string };
  returns: { windowDays: number };
  payments: { onlineEnabled: boolean; codEnabled: boolean; codMaxPaise: number };
  blocks: Record<string, { title: string | null; data: any }>;
  cities: Array<{ id: string; name: string; slug: string; state: string }>;
  categories: Array<{ name: string; slug: string; imageUrl?: string | null }>;
  farms: Array<{ name: string; slug: string }>;
  legalPages: Array<{ slug: string; title: string }>;
  whatsapp: { default: string; byCity: Record<string, string>; wholesale: string | null };
  storefront: { announcement: string; giftWrapEnabled: boolean; deliveryMinDays: number; deliveryMaxDays: number; consultationsEnabled: boolean };
  stores: Store[];
  shop: { colours: string[]; shapes: string[]; collections: Array<{ name: string; slug: string }> };
}

export interface Store {
  id: string;
  name: string;
  area: string;
  address: string;
  phone: string;
  openingHours: string | null;
  mapUrl: string | null;
  city: { name: string; slug: string };
}

export interface Filters {
  shapes: Array<{ value: string; count: number }>;
  colours: Array<{ value: string; count: number }>;
  price: { min: number; max: number };
  carat: { min: number; max: number };
  farms: Array<{ id: string; name: string; slug: string; count: number }>;
  collections: Array<{ id: string; name: string; slug: string; count: number }>;
  categories: Array<{ id: string; name: string; slug: string; count: number }>;
}
