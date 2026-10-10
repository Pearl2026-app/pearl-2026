'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ENQUIRY_TYPE_LABEL, ORDER_STATUS_LABEL, type EnquiryType, type OrderStatus } from '@sahyadri/shared';
import { Card, Input, Spinner, StatusBadge } from '@sahyadri/ui';
import { PageHeader } from './shell';
import { api, qs } from '@/lib/api';
import { ago, inr } from '@/lib/format';
import { useMe } from '@/lib/session';

interface Dash {
  cards: Record<string, number | null>;
  monthly: Array<{ month: string; orders: number; salesPaise: number }>;
  recentOrders: Array<{ id: string; number: string; placedAt: string; contactName: string; totalPaise: number; status: OrderStatus; city: { name: string } }>;
  recentEnquiries: Array<{ id: string; reference: string; type: EnquiryType; stage: string; createdAt: string; contactName: string | null; product: { name: string } | null; city: { name: string } | null }>;
}

const CARDS: Array<{ key: string; label: string; money?: boolean; href?: string }> = [
  { key: 'salesPaise', label: 'Sales (paid, net of refunds)', money: true, href: '/reports' },
  { key: 'orders', label: 'Orders', href: '/orders' },
  { key: 'pendingOrders', label: 'Orders in progress', href: '/orders?status=PLACED' },
  { key: 'completedOrders', label: 'Delivered', href: '/orders?status=DELIVERED' },
  { key: 'cancelledOrders', label: 'Cancelled / failed / returned' },
  { key: 'pendingEnquiries', label: 'Open enquiries', href: '/enquiries' },
  { key: 'convertedEnquiries', label: 'Converted enquiries' },
  { key: 'customers', label: 'Customers', href: '/customers' },
  { key: 'franchises', label: 'Franchises / stores', href: '/franchises' },
  { key: 'products', label: 'Products', href: '/products' },
  { key: 'outOfStock', label: 'Out of stock or sold', href: '/products' },
];

function Bars({ data, value, format }: { data: Dash['monthly']; value: (m: Dash['monthly'][number]) => number; format: (n: number) => string }) {
  const max = Math.max(1, ...data.map(value));
  return (
    <ol className="flex h-40 items-end gap-1" aria-label="Monthly chart">
      {data.map((m) => (
        <li key={m.month} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${m.month}: ${format(value(m))}`}>
          <span className="sr-only">{m.month}: {format(value(m))}</span>
          <span className="w-full rounded-t-sm bg-accent/80" style={{ height: `${Math.max(2, (value(m) / max) * 120)}px` }} />
          <span className="text-[10px] text-muted">{m.month.slice(5)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Cards, monthly summaries and recent activity; the date range applies to the whole page. */
export function Dashboard() {
  const { data: me } = useMe();
  const [range, setRange] = useState({ from: '', to: '' });
  const params = { from: range.from ? new Date(range.from).toISOString() : undefined, to: range.to ? new Date(range.to + 'T23:59:59').toISOString() : undefined };
  const { data, isLoading } = useQuery({ queryKey: ['/admin/dashboard', params], queryFn: () => api<Dash>(`/admin/dashboard${qs(params)}`) });
  return (
    <div>
      <PageHeader
        title={`Welcome, ${me?.name ?? ''}`}
        description={me?.city ? `Figures for ${me.city.name}.` : me?.vendor ? `Figures for ${me.vendor.name}.` : me?.franchise ? `Figures for ${me.franchise.name}.` : 'Figures across all cities.'}
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Input type="date" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            <span>to</span>
            <Input type="date" aria-label="To" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </div>
        }
      />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <ul className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {CARDS.filter((c) => data.cards[c.key] != null).map((c) => {
              const body = (
                <>
                  <span className="block text-xs text-muted">{c.label}</span>
                  <span className="mt-1 block font-serif text-2xl">{c.money ? inr(data.cards[c.key]!) : data.cards[c.key]!.toLocaleString('en-IN')}</span>
                </>
              );
              return (
                <li key={c.key} className="rounded-sm border border-line bg-surface p-3">
                  {c.href ? <Link href={c.href} className="block hover:text-accent">{body}</Link> : body}
                </li>
              );
            })}
          </ul>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-semibold">Monthly sales</h2>
              <Bars data={data.monthly} value={(m) => m.salesPaise} format={(n) => inr(n)} />
            </Card>
            <Card>
              <h2 className="mb-2 font-semibold">Monthly orders</h2>
              <Bars data={data.monthly} value={(m) => m.orders} format={(n) => `${n} orders`} />
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 font-semibold">Recent orders</h2>
              <ul className="text-sm">
                {data.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 border-t border-line py-2">
                    <span><Link className="text-accent underline" href={`/orders/${o.id}`}>{o.number}</Link> · {o.contactName}<span className="block text-xs text-muted">{o.city.name} · {ago(o.placedAt)}</span></span>
                    <span className="text-right">{inr(o.totalPaise)}<br /><StatusBadge status={o.status} label={ORDER_STATUS_LABEL[o.status]} /></span>
                  </li>
                ))}
                {!data.recentOrders.length && <li className="text-muted">No orders yet.</li>}
              </ul>
            </Card>
            {me?.role !== 'VENDOR' && (
              <Card>
                <h2 className="mb-2 font-semibold">Recent enquiries</h2>
                <ul className="text-sm">
                  {data.recentEnquiries.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 border-t border-line py-2">
                      <span><Link className="text-accent underline" href={`/enquiries/${e.id}`}>{e.reference}</Link> · {e.contactName ?? '—'}<span className="block text-xs text-muted">{ENQUIRY_TYPE_LABEL[e.type]}{e.product ? ` · ${e.product.name}` : ''}{e.city ? ` · ${e.city.name}` : ''} · {ago(e.createdAt)}</span></span>
                      <StatusBadge status={e.stage} />
                    </li>
                  ))}
                  {!data.recentEnquiries.length && <li className="text-muted">No enquiries yet.</li>}
                </ul>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
