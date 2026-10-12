export interface Job {
  id: string;
  number: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalPaise: number;
  contactName: string;
  contactPhone: string;
  addressSnapshot: Record<string, string>;
  customerNote: string | null;
  items: Array<{ name: string; sku: string; quantity: number }>;
  delivery: { id: string; status: string; failureReason: string | null; codCollectedPaise: number | null } | null;
  codDuePaise: number;
  otpRequired: boolean;
}

export interface JobList {
  items: Job[];
  cashInHand: { count: number; amountPaise: number };
}

export const addressLine = (a: Record<string, string>) => [a.line1, a.line2, a.landmark, a.area, `${a.cityName ?? ''} ${a.pincode ?? ''}`.trim()].filter(Boolean).join(', ');
export const mapsUrl = (a: Record<string, string>) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine(a))}`;
