'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, mayHaveSession } from '@/lib/api';
import { useSession } from './session';

const KEY = 'sp_last_order';
const HIDE_KEY = 'sp_order_strip_hidden';
const STEPS = ['PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;
const LABEL: Record<string, string> = {
  PLACED: 'Order placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  ASSIGNED: 'Delivery partner assigned',
  PICKED_UP: 'Picked up',
  OUT_FOR_DELIVERY: 'Out for delivery',
};
const ACTIVE = new Set(Object.keys(LABEL));

/** Called after checkout so a guest also sees the strip on their next visit. */
export function rememberOrder(number: string, token: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ number, token }));
    sessionStorage.removeItem(HIDE_KEY);
  } catch {
    /* storage can be blocked; the strip is a convenience */
  }
}

interface Active {
  number: string;
  status: string;
  href: string;
}

/**
 * "Your order is on its way": a slim strip under the header while the shopper has an order in progress, like
 * Amazon and Zomato show. Signed-in customers get their latest open order; a guest gets the one placed on this
 * device. Hidden on checkout and on the tracking pages themselves.
 */
export function OrderStrip() {
  const { me, loaded } = useSession();
  const path = usePathname();
  const [order, setOrder] = useState<Active | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    let off = false;
    try {
      setHidden(sessionStorage.getItem(HIDE_KEY) === '1');
    } catch {
      setHidden(false);
    }
    (async () => {
      if (me && mayHaveSession()) {
        const r = await api<{ order: { number: string; status: string } | null }>('/me/active-order').catch(() => null);
        if (!off && r?.order) setOrder({ ...r.order, href: `/account/orders/${encodeURIComponent(r.order.number)}` });
        if (r?.order) return;
      }
      let saved: { number: string; token: string } | null = null;
      try {
        saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      } catch {
        saved = null;
      }
      if (!saved) return;
      const t = await api<{ status: string }>(`/track/${encodeURIComponent(saved.number)}?t=${encodeURIComponent(saved.token)}`).catch(() => null);
      if (!t || !ACTIVE.has(t.status)) {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!off) setOrder({ number: saved.number, status: t.status, href: `/track/${encodeURIComponent(saved.number)}?t=${encodeURIComponent(saved.token)}` });
    })();
    return () => {
      off = true;
    };
  }, [me, loaded]);

  if (!order || hidden || !ACTIVE.has(order.status)) return null;
  if (path.startsWith('/checkout') || path.startsWith('/track') || path.startsWith('/order/') || path.startsWith('/account/orders/')) return null;
  const step = STEPS.indexOf(order.status as (typeof STEPS)[number]);

  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 lg:px-8">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-40" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
        </span>
        <Link href={order.href} className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{LABEL[order.status]}</span>
          <span className="text-muted"> · Order {order.number}</span>
          <span className="mt-1.5 flex gap-1" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-accent' : 'bg-line'}`} />
            ))}
          </span>
        </Link>
        <Link href={order.href} className="shrink-0 border border-ink px-3 py-1.5 text-xs tracking-wide hover:bg-ink hover:text-white">
          Track order
        </Link>
        <button
          type="button"
          aria-label="Hide order update"
          className="shrink-0 px-1 text-lg leading-none text-muted hover:text-ink"
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem(HIDE_KEY, '1');
            } catch {
              /* ignore */
            }
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
