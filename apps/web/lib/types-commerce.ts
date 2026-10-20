import type { ProductCard } from './types';

export interface Totals {
  subtotalPaise: number;
  discountPaise: number;
  deliveryPaise: number;
  taxablePaise: number;
  gstPaise: number;
  totalPaise: number;
}

export interface CartView {
  token: string | null;
  items: Array<{ productId: string; quantity: number; size?: string | null; product: ProductCard; problem: string | null }>;
  count: number;
  couponCode: string | null;
  couponError: string | null;
  coupon?: { code: string; discountPaise: number } | null;
  totals: Totals | null;
  issues: string[];
  paymentMethods?: { online: boolean; cod: boolean; codMaxPaise: number; provider?: string };
}

export interface Tracking {
  number: string;
  placedAt: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  totalPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  gstPaise: number;
  deliveryPaise: number;
  items: Array<{ name: string; sku: string; quantity: number; size?: string | null; imageUrl: string | null; lineTotalPaise: number }>;
  timeline: Array<{ status: string; at: string }>;
  delivery: { status: string; deliveredAt: string | null; partner: string | null } | null;
  shipTo: { name: string; cityName: string; pincode: string };
  invoiceNumber: string | null;
  map?: { rider: { lat: number; lng: number; at: string; name: string | null } | null; riderKmAway: number | null } | null;
}
