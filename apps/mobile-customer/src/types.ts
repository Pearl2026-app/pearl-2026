export interface ImageRef {
  url: string;
  variants?: Record<string, string> | null;
  alt?: string | null;
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
  farm: { name: string; slug: string; location: string; summary: string | null } | null;
  reserved: boolean;
  availableInCity: boolean;
  rating: { average: number | null; count: number };
  reviews: Array<{ id: string; rating: number; title: string | null; body: string | null; name: string; createdAt: string }>;
  related: ProductCard[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Filters {
  shapes: Array<{ value: string; count: number }>;
  colours: Array<{ value: string; count: number }>;
  categories: Array<{ name: string; slug: string; count: number }>;
  collections: Array<{ name: string; slug: string; count: number }>;
}

export interface CartLine {
  productId: string;
  quantity: number;
  product: ProductCard;
  problem: string | null;
}
export interface Cart {
  token: string | null;
  items: CartLine[];
  count: number;
  couponCode: string | null;
  couponError: string | null;
  totals: { subtotalPaise: number; discountPaise: number; deliveryPaise: number; gstPaise: number; totalPaise: number } | null;
  issues: string[];
  paymentMethods?: { online: boolean; cod: boolean; codMaxPaise: number };
}

export interface Site {
  store: { phone: string; email: string; whatsapp: string };
  delivery: { chargePaise: number; freeAbovePaise: number | null; promise: string };
  returns: { windowDays: number };
  storefront: { giftWrapEnabled: boolean; consultationsEnabled: boolean };
  cities: Array<{ id: string; name: string; slug: string; state: string }>;
  categories: Array<{ name: string; slug: string }>;
  whatsapp: { default: string };
}

export interface Home {
  banners: Array<{ id: string; title: string | null; subtitle: string | null; imageUrl: string; linkUrl: string | null; ctaLabel: string | null }>;
  collections: Array<{ name: string; slug: string; description: string | null; imageUrl: string | null }>;
  featured: ProductCard[];
  newest: ProductCard[];
}

export interface Tracking {
  number: string;
  placedAt: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalPaise: number;
  items: Array<{ name: string; sku: string; quantity: number; imageUrl: string | null; lineTotalPaise: number }>;
  timeline: Array<{ status: string; at: string }>;
  delivery: { status: string; deliveredAt: string | null; partner: string | null } | null;
  shipTo: { name: string; cityName: string; pincode: string };
}

export interface OrderSummary {
  id: string;
  number: string;
  placedAt: string;
  status: string;
  paymentStatus: string;
  totalPaise: number;
  items: Array<{ name: string; imageUrl: string | null; quantity: number }>;
}
