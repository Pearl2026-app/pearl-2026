'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ENQUIRY_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  type Action,
  type EnquiryType,
  type Module,
  type OrderStatus,
} from '@sahyadri/shared';
import { Card, Input, Spinner, StatusBadge } from '@sahyadri/ui';
import {
  BarChart3,
  Gem,
  ImagePlus,
  IndianRupee,
  MessageSquare,
  PackageX,
  Plus,
  Reply,
  ShoppingBag,
  X,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from './shell';
import { api, errorText, qs } from '@/lib/api';
import { ago, inr } from '@/lib/format';
import { useMe } from '@/lib/session';

interface Dash {
  cards: Record<string, number | null>;
  monthly: Array<{ month: string; orders: number; salesPaise: number }>;
  recentOrders: Array<{
    id: string;
    number: string;
    placedAt: string;
    contactName: string;
    totalPaise: number;
    status: OrderStatus;
    city: { name: string };
  }>;
  recentEnquiries: Array<{
    id: string;
    reference: string;
    type: EnquiryType;
    stage: string;
    createdAt: string;
    contactName: string | null;
    product: { name: string } | null;
    city: { name: string } | null;
  }>;
}

/** The four figures that need attention, each in its own colour. The rest live in Reports. */
const CARDS: Array<{ key: string; label: string; money?: boolean; href: string; tint: string; ink: string; icon: LucideIcon }> = [
  { key: 'salesPaise', label: 'Sales', money: true, href: '/reports', tint: '#E2F1E8', ink: '#1F5E3A', icon: IndianRupee },
  { key: 'pendingOrders', label: 'Orders to process', href: '/orders?status=PLACED', tint: '#E3EDF7', ink: '#1F4A73', icon: ShoppingBag },
  { key: 'pendingEnquiries', label: 'Open enquiries', href: '/enquiries', tint: '#FBF0DC', ink: '#7A4C0B', icon: MessageSquare },
  { key: 'outOfStock', label: 'Out of stock or sold', href: '/restock', tint: '#F8E1DF', ink: '#8C1D17', icon: PackageX },
  { key: 'stockValuePaise', label: 'Stock value (remaining)', money: true, href: '/products', tint: '#EDE9F5', ink: '#4A3B78', icon: Gem },
];

/** Shortcuts to the jobs done most often, shown only to people who may do them. */
const ACTIONS: Array<{ href: string; label: string; module: Module; action: Action; icon: LucideIcon; colour: string }> = [
  { href: '/orders/new', label: 'New order', module: 'ORDERS', action: 'create', icon: Plus, colour: '#2B5C8A' },
  { href: '/products/new', label: 'Add product', module: 'PRODUCTS', action: 'create', icon: Plus, colour: '#9A7546' },
  { href: '/enquiries', label: 'Reply to enquiries', module: 'ENQUIRIES', action: 'view', icon: Reply, colour: '#1F7A4D' },
  { href: '/banners', label: 'Change banners', module: 'CONTENT', action: 'edit', icon: ImagePlus, colour: '#1F7A4D' },
];

function Bars({
  data,
  value,
  format,
}: {
  data: Dash['monthly'];
  value: (m: Dash['monthly'][number]) => number;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map(value));
  return (
    <ol className="flex h-40 items-end gap-1" aria-label="Monthly chart">
      {data.map((m) => (
        <li
          key={m.month}
          className="flex flex-1 flex-col items-center justify-end gap-1"
          title={`${m.month}: ${format(value(m))}`}
        >
          <span className="sr-only">
            {m.month}: {format(value(m))}
          </span>
          <span
            className="w-full rounded-t-sm bg-accent/80"
            style={{ height: `${Math.max(2, (value(m) / max) * 120)}px` }}
          />
          <span className="text-[10px] text-muted">{m.month.slice(5)}</span>
        </li>
      ))}
    </ol>
  );
}

/** A dismissible alert when pieces are at or below their alert level; dismissed per browser session. */
function LowStockPopup({ count }: { count: number }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('lowStockSeen') === '1';
    } catch {
      return false;
    }
  });
  if (!count || hidden) return null;
  const dismiss = () => {
    try {
      sessionStorage.setItem('lowStockSeen', '1');
    } catch {
      /* private window */
    }
    setHidden(true);
  };
  return (
    <div role="alert" className="mb-4 flex items-center gap-3 rounded-md border border-[#E8C9C5] bg-[#F8E1DF] px-4 py-3 text-sm text-[#8C1D17]">
      <PackageX size={18} aria-hidden />
      <span className="flex-1">
        <strong>{count} {count === 1 ? 'piece is' : 'pieces are'} running low.</strong> Open the purchase orders page to see what to make.
      </span>
      <Link href="/restock" className="rounded-sm bg-white/70 px-2.5 py-1 font-medium hover:bg-white">
        See the list
      </Link>
      <button onClick={dismiss} aria-label="Dismiss" className="rounded-sm p-1 hover:bg-white/60">
        <X size={16} />
      </button>
    </div>
  );
}

/** Cards, monthly summaries and recent activity; the date range applies to the whole page. */
export function Dashboard() {
  const { data: me } = useMe();
  const [range, setRange] = useState({ from: '', to: '' });
  const params = {
    from: range.from ? new Date(range.from).toISOString() : undefined,
    to: range.to ? new Date(range.to + 'T23:59:59').toISOString() : undefined,
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ['/admin/dashboard', params],
    queryFn: () => api<Dash>(`/admin/dashboard${qs(params)}`),
  });
  return (
    <div>
      <PageHeader
        title={`Welcome, ${me?.name ?? ''}`}
        description={
          me?.city
            ? `Figures for ${me.city.name}.`
            : me?.vendor
              ? `Figures for ${me.vendor.name}.`
              : me?.franchise
                ? `Figures for ${me.franchise.name}.`
                : 'Figures across all cities.'
        }
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="From"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
            <span>to</span>
            <Input
              type="date"
              aria-label="To"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </div>
        }
      />
      {error ? (
        <p className="text-sm text-danger">The dashboard could not be loaded: {errorText(error)}</p>
      ) : isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          {/* Low-stock pop-up (client doc, 26 Oct): shows once per sign-in until dismissed. */}
          <LowStockPopup count={data.cards.lowStock ?? 0} />
          <ul className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
            {CARDS.filter((c) => data.cards[c.key] != null).map((c) => (
              <li key={c.key}>
                <Link
                  href={c.href}
                  className="block rounded-lg p-4 transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: c.tint, color: c.ink }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70" aria-hidden>
                      <c.icon size={18} />
                    </span>
                  </span>
                  <span className="mt-1 block text-3xl font-semibold tabular-nums">
                    {c.money ? inr(data.cards[c.key]!) : data.cards[c.key]!.toLocaleString('en-IN')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {(() => {
            const can = ACTIONS.filter((a) => me?.permissions[a.module]?.includes(a.action));
            return can.length ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {can.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium hover:border-ink"
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: `${a.colour}1A`, color: a.colour }} aria-hidden>
                      <a.icon size={15} />
                    </span>
                    {a.label}
                  </Link>
                ))}
              </div>
            ) : null;
          })()}
          <Card className="mb-5">
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <BarChart3 size={18} className="text-[#B4532A]" aria-hidden /> Sales by month
            </h2>
            <Bars data={data.monthly} value={(m) => m.salesPaise} format={(n) => inr(n)} />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 flex items-center gap-2 font-semibold">
                <ShoppingBag size={18} className="text-[#2B5C8A]" aria-hidden /> Recent orders
              </h2>
              <ul className="text-sm">
                {data.recentOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-2 border-t border-line py-2"
                  >
                    <span>
                      <Link className="text-accent underline" href={`/orders/${o.id}`}>
                        {o.number}
                      </Link>{' '}
                      · {o.contactName}
                      <span className="block text-xs text-muted">
                        {o.city.name} · {ago(o.placedAt)}
                      </span>
                    </span>
                    <span className="text-right">
                      {inr(o.totalPaise)}
                      <br />
                      <StatusBadge status={o.status} label={ORDER_STATUS_LABEL[o.status]} />
                    </span>
                  </li>
                ))}
                {!data.recentOrders.length && <li className="text-muted">No orders yet.</li>}
              </ul>
            </Card>
            {me?.role !== 'VENDOR' && (
              <Card>
                <h2 className="mb-2 flex items-center gap-2 font-semibold">
                  <MessageSquare size={18} className="text-[#1F7A4D]" aria-hidden /> Recent enquiries
                </h2>
                <ul className="text-sm">
                  {data.recentEnquiries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 border-t border-line py-2"
                    >
                      <span>
                        <Link className="text-accent underline" href={`/enquiries/${e.id}`}>
                          {e.reference}
                        </Link>{' '}
                        · {e.contactName ?? '—'}
                        <span className="block text-xs text-muted">
                          {ENQUIRY_TYPE_LABEL[e.type]}
                          {e.product ? ` · ${e.product.name}` : ''}
                          {e.city ? ` · ${e.city.name}` : ''} · {ago(e.createdAt)}
                        </span>
                      </span>
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
