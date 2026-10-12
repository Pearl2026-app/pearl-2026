'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Card, Input, Select, Switch } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { api } from '@/lib/api';
import { inr, toPaise, toRupees } from '@/lib/format';
import { useMe } from '@/lib/session';

export interface OrderLine {
  productId: string;
  name: string;
  sku: string;
  pricePaise: number;
  priceOnRequest: boolean;
  isUnique: boolean;
  quantity: number;
  /** Rupees as typed; only head office may set it. */
  price: string;
}

export interface OrderFormValues {
  contact: { name: string; phone: string; email: string };
  address: { name: string; phone: string; line1: string; line2: string; landmark: string; area: string; cityName: string; state: string; pincode: string };
  cityId: string;
  lines: OrderLine[];
  paymentMethod: 'COD' | 'BANK_TRANSFER' | 'OTHER';
  alreadyPaid: boolean;
  paymentReference: string;
  couponCode: string;
  channel: string;
  internalNote: string;
  chargeDelivery: boolean;
}

export const emptyOrder = (): OrderFormValues => ({
  contact: { name: '', phone: '', email: '' },
  address: { name: '', phone: '', line1: '', line2: '', landmark: '', area: '', cityName: '', state: 'Maharashtra', pincode: '' },
  cityId: '',
  lines: [],
  paymentMethod: 'COD',
  alreadyPaid: false,
  paymentReference: '',
  couponCode: '',
  channel: 'phone',
  internalNote: '',
  chargeDelivery: true,
});

export const toLine = (p: any): OrderLine => ({ productId: p.id, name: p.name, sku: p.sku, pricePaise: p.pricePaise, priceOnRequest: !!p.priceOnRequest, isUnique: p.stockType === 'UNIQUE', quantity: 1, price: '' });

/** Request body shared by the manual order and the enquiry conversion endpoints. */
export function orderBody(v: OrderFormValues) {
  const blank = (s: string) => (s.trim() ? s.trim() : null);
  return {
    contact: { name: v.contact.name.trim(), phone: v.contact.phone.trim(), email: blank(v.contact.email) },
    address: { ...v.address, name: v.address.name || v.contact.name, phone: v.address.phone || v.contact.phone, line2: blank(v.address.line2), landmark: blank(v.address.landmark), area: blank(v.address.area), cityId: v.cityId },
    cityId: v.cityId,
    items: v.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, ...(l.price ? { unitPricePaise: toPaise(l.price) ?? undefined } : {}) })),
    paymentMethod: v.paymentMethod,
    alreadyPaid: v.alreadyPaid,
    paymentReference: blank(v.paymentReference),
    couponCode: blank(v.couponCode),
    channel: blank(v.channel),
    internalNote: blank(v.internalNote),
    chargeDelivery: v.chargeDelivery,
  };
}

function ProductPicker({ onPick }: { onPick: (p: any) => void }) {
  const [q, setQ] = useState('');
  const { data } = useQuery({
    queryKey: ['/admin/products', 'pick', q],
    queryFn: () => api<{ items: any[] }>(`/admin/products?status=PUBLISHED&pageSize=8&q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  return (
    <div className="relative">
      <Input aria-label="Find a piece" placeholder="Find a piece by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && data && (
        <ul className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-sm border border-line bg-surface shadow">
          {data.items.length === 0 && <li className="p-2 text-sm text-muted">No published piece matches.</li>}
          {data.items.map((p) => {
            const gone = !!p.soldAt || p.outOfStock || p.quantity <= 0;
            return (
              <li key={p.id}>
                <button type="button" disabled={gone} className="flex w-full justify-between gap-2 p-2 text-left text-sm hover:bg-surface-muted disabled:opacity-50" onClick={() => { onPick(p); setQ(''); }}>
                  <span>{p.name} <span className="text-xs text-muted">{p.sku}</span></span>
                  <span>{gone ? 'Sold' : p.priceOnRequest ? 'On request' : inr(p.pricePaise)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function OrderForm({ initial, submitLabel, onSubmit, busy, error }: { initial: OrderFormValues; submitLabel: string; onSubmit: (v: OrderFormValues) => void; busy?: boolean; error?: string | null }) {
  const { data: me } = useMe();
  const [v, setV] = useState(initial);
  const cities = useRefOptions({ path: '/admin/cities', query: { isActive: 'true' } });
  const headOffice = me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF';
  const set = <K extends keyof OrderFormValues>(k: K, val: OrderFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setLine = (i: number, patch: Partial<OrderLine>) => set('lines', v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const missingPrice = v.lines.some((l) => l.priceOnRequest && !l.price);
  const estimate = v.lines.reduce((s, l) => s + (l.price ? (toPaise(l.price) ?? 0) : l.pricePaise) * l.quantity, 0);
  const contact = (k: keyof OrderFormValues['contact']) => ({ value: v.contact[k], onChange: (e: { target: { value: string } }) => set('contact', { ...v.contact, [k]: e.target.value }) });
  const addr = (k: keyof OrderFormValues['address']) => ({ value: v.address[k], onChange: (e: { target: { value: string } }) => set('address', { ...v.address, [k]: e.target.value }) });

  return (
    <form
      className="flex max-w-4xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">Pieces</h2>
        <ProductPicker onPick={(p) => !v.lines.some((l) => l.productId === p.id) && set('lines', [...v.lines, toLine(p)])} />
        {v.lines.length === 0 && <p className="text-sm text-muted">Add at least one piece.</p>}
        {v.lines.map((l, i) => (
          <div key={l.productId} className="grid items-center gap-2 border-t border-line pt-2 text-sm md:grid-cols-[1fr_90px_160px_auto]">
            <span>{l.name} <span className="text-xs text-muted">{l.sku} · {l.priceOnRequest ? 'price on request' : inr(l.pricePaise)}</span></span>
            <Input aria-label={`Quantity of ${l.name}`} type="number" min={1} max={l.isUnique ? 1 : 100} disabled={l.isUnique} value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
            {headOffice ? (
              <Input aria-label={`Agreed price for ${l.name}`} inputMode="decimal" placeholder={l.priceOnRequest ? 'Agreed price ₹ (required)' : `₹ ${toRupees(l.pricePaise)}`} value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
            ) : (
              <span className="text-muted">{l.priceOnRequest ? 'Head office sets the price' : inr(l.pricePaise)}</span>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => set('lines', v.lines.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
        {v.lines.length > 0 && <p className="text-right text-sm">Pieces: {inr(estimate)} <span className="text-xs text-muted">(GST included; delivery and coupon are added when the order is created)</span></p>}
        {missingPrice && <Alert tone="warning">{headOffice ? 'Enter the agreed price for every price-on-request piece.' : 'A price-on-request piece needs head office to set the agreed price.'}</Alert>}
      </Card>
      <Card className="grid gap-3 md:grid-cols-3">
        <h2 className="font-semibold md:col-span-3">Customer</h2>
        <Input aria-label="Customer name" placeholder="Name" required {...contact('name')} />
        <Input aria-label="Customer mobile" placeholder="Mobile (+91…)" required {...contact('phone')} />
        <Input aria-label="Customer email" placeholder="Email (optional)" type="email" {...contact('email')} />
      </Card>
      <Card className="grid gap-3 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Delivery address</h2>
        <Select aria-label="City" required value={v.cityId} onChange={(e) => { const c = cities.data?.items.find((x) => x.id === e.target.value); setV((s) => ({ ...s, cityId: e.target.value, address: { ...s.address, cityName: c ? String(c.name) : s.address.cityName, state: c?.state ? String(c.state) : s.address.state } })); }}>
          <option value="">Choose the city</option>
          {cities.data?.items.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
        </Select>
        <Input aria-label="Pincode" placeholder="Pincode" required inputMode="numeric" {...addr('pincode')} />
        <Input aria-label="Address line 1" placeholder="House / flat, building, street" required className="md:col-span-2" {...addr('line1')} />
        <Input aria-label="Address line 2" placeholder="Line 2 (optional)" {...addr('line2')} />
        <Input aria-label="Landmark" placeholder="Landmark (optional)" {...addr('landmark')} />
        <Input aria-label="Area" placeholder="Area / locality" {...addr('area')} />
        <Input aria-label="State" placeholder="State" required {...addr('state')} />
        <Input aria-label="Recipient name" placeholder="Recipient name (if different)" {...addr('name')} />
        <Input aria-label="Recipient phone" placeholder="Recipient phone (if different)" {...addr('phone')} />
      </Card>
      <Card className="grid gap-3 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">Payment and notes</h2>
        <Select aria-label="Payment method" value={v.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as OrderFormValues['paymentMethod'])}>
          <option value="COD">Cash on delivery</option>
          <option value="BANK_TRANSFER">Bank transfer / UPI to shop</option>
          <option value="OTHER">Other</option>
        </Select>
        <Input aria-label="Order channel" placeholder="Channel (phone, walk-in, instagram…)" value={v.channel} onChange={(e) => set('channel', e.target.value)} />
        {/* Only head office records money (D63); anyone else leaves it to head office to record on the order. */}
        {v.paymentMethod !== 'COD' && (me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF') && !!me.permissions.PAYMENTS?.includes('edit') && (
          <>
            <Switch checked={v.alreadyPaid} onChange={(c) => set('alreadyPaid', c)} label="Already paid" />
            {v.alreadyPaid && <Input aria-label="Payment reference" placeholder="Bank / UPI reference" value={v.paymentReference} onChange={(e) => set('paymentReference', e.target.value)} />}
          </>
        )}
        <Input aria-label="Coupon code" placeholder="Coupon code (optional)" value={v.couponCode} onChange={(e) => set('couponCode', e.target.value.toUpperCase())} />
        <Switch checked={v.chargeDelivery} onChange={(c) => set('chargeDelivery', c)} label="Charge delivery as per settings" />
        <Input aria-label="Internal note" placeholder="Internal note (not shown to the customer)" className="md:col-span-2" value={v.internalNote} onChange={(e) => set('internalNote', e.target.value)} />
      </Card>
      <div>
        <Button type="submit" loading={busy} disabled={v.lines.length === 0 || missingPrice || !v.cityId}>{submitLabel}</Button>
      </div>
    </form>
  );
}
