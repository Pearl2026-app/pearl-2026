'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { FormField, Notice, TextInput } from '@/components/form-bits';
import { CheckIcon } from '@/components/icons';
import { useSite } from '@/components/site-context';
import { PearlImage } from '@/components/pearl-image';
import { useSession } from '@/components/session';
import { TotalsTable } from '@/components/totals';
import { Container, PageTitle } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import type { CartView } from '@/lib/types-commerce';

/** How far the cart is from free delivery, shown as a short line and a bar. */
function FreeDeliveryNudge({ subtotalPaise }: { subtotalPaise: number }) {
  const site = useSite();
  const free = site.delivery.freeAbovePaise;
  if (!free) return null;
  const left = free - subtotalPaise;
  const pct = Math.min(100, Math.round((subtotalPaise / free) * 100));
  return (
    <div className="mb-5">
      <p className="text-sm">
        {left > 0 ? (
          <>
            Add <strong className="font-medium">{formatINR(left, { compact: true })}</strong> more for free insured delivery.
          </>
        ) : (
          'Your order ships free: insured and tracked to your door.'
        )}
      </p>
      <div className="mt-2 h-1 w-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress to free delivery">
        <div className="h-1 bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** What a first-time buyer wants to know before paying, next to the button that asks them to. */
function Reassurance({ cod }: { cod: boolean }) {
  const site = useSite();
  const items = [
    'Every pearl certified, with a code you can verify',
    site.returns.windowDays > 0 ? `${site.returns.windowDays}-day returns` : null,
    'Insured, tracked delivery',
    `Pay by UPI, card or net banking${cod && site.payments.codEnabled ? ', or cash on delivery' : ''}`,
  ].filter(Boolean) as string[];
  return (
    <ul className="mt-5 grid gap-2 border-t border-line pt-5 text-sm text-muted">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2">
          <CheckIcon width={18} height={18} className="mt-0.5 shrink-0 text-gold" />
          {t}
        </li>
      ))}
    </ul>
  );
}

export default function CartPage() {
  const [cart, setCart] = useState<CartView | null>(null);
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { setCartCount } = useSession();

  const load = async () => {
    const city = document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1];
    try {
      const c = await api<CartView>(`/cart${city ? `?city=${city}` : ''}`);
      setCart(c);
      setCartCount(c.count);
    } catch (e) {
      setError(errorText(e));
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = async (fn: () => Promise<CartView>) => {
    setBusy(true);
    setError(null);
    try {
      const c = await fn();
      setCart(c);
      setCartCount(c.count);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!cart) return <Container className="py-16"><p className="text-muted">{error ?? 'Loading your cart…'}</p></Container>;
  return (
    <Container>
      <PageTitle title="Your cart" />
      {cart.items.length === 0 ? (
        <div className="py-10">
          <p className="text-lg text-muted">Your cart is empty.</p>
          <Link href="/jewellery" className="mt-6 inline-flex min-h-12 items-center bg-accent px-6 text-white">Explore jewellery</Link>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <div>
            {error && <Notice tone="danger">{error}</Notice>}
            {cart.issues.length > 0 && <div className="mb-4"><Notice tone="danger">{cart.issues.join('. ')}. Remove these to check out.</Notice></div>}
            <ul className="divide-y divide-line border-y border-line" aria-busy={busy}>
              {cart.items.map((i) => (
                <li key={i.productId} className="flex gap-4 py-5">
                  <Link href={`/product/${i.product.slug}`} className="w-24 shrink-0 sm:w-28">
                    <PearlImage image={i.product.images[0]} sizes="112px" className="aspect-square w-full object-cover" alt={i.product.name} />
                  </Link>
                  <div className="flex flex-1 flex-col gap-1">
                    <Link href={`/product/${i.product.slug}`} className="font-serif text-xl hover:text-accent">{i.product.name}</Link>
                    <p className="text-xs text-muted">{[i.product.farm?.name, i.product.sku].filter(Boolean).join(' · ')}</p>
                    {i.problem && <p className="text-sm text-danger">{i.problem}</p>}
                    <div className="mt-auto flex flex-wrap items-center gap-4">
                      {i.product.isUnique ? (
                        <span className="text-xs text-muted">One of a kind</span>
                      ) : (
                        <div className="flex items-center border border-line" role="group" aria-label={`Quantity of ${i.product.name}`}>
                          <button className="h-11 w-11" aria-label="Decrease" disabled={busy} onClick={() => mutate(() => api(`/cart/items/${i.productId}`, { method: 'PATCH', json: { quantity: i.quantity - 1 } }))}>−</button>
                          <span className="w-8 text-center" aria-live="polite">{i.quantity}</span>
                          <button className="h-11 w-11" aria-label="Increase" disabled={busy} onClick={() => mutate(() => api(`/cart/items/${i.productId}`, { method: 'PATCH', json: { quantity: i.quantity + 1 } }))}>+</button>
                        </div>
                      )}
                      <button className="min-h-11 text-sm text-muted underline hover:text-danger" disabled={busy} onClick={() => mutate(() => api(`/cart/items/${i.productId}`, { method: 'DELETE' }))}>Remove</button>
                    </div>
                  </div>
                  <p className="text-right">{i.product.pricePaise != null ? formatINR(i.product.pricePaise * i.quantity, { compact: true }) : '—'}</p>
                </li>
              ))}
            </ul>
          </div>
          <aside className="h-fit bg-surface p-6 lg:sticky lg:top-28">
            <h2 className="mb-4 font-serif text-2xl">Order summary</h2>
            <FreeDeliveryNudge subtotalPaise={cart.totals?.subtotalPaise ?? 0} />
            {cart.totals && <TotalsTable t={cart.totals} couponCode={cart.coupon?.code ?? cart.couponCode} />}
            <form
              className="mt-6 flex items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                setCouponError(null);
                if (!code.trim()) return;
                try {
                  const c = await api<CartView>('/cart/coupon', { method: 'POST', json: { code } });
                  setCart(c);
                  setCode('');
                } catch (err) {
                  setCouponError(err instanceof ApiError ? err.message : errorText(err));
                }
              }}
            >
              <div className="flex-1">
                <FormField label="Coupon code" error={couponError ?? undefined}>{(id, d) => <TextInput id={id} aria-describedby={d} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" />}</FormField>
              </div>
              <button type="submit" className="min-h-12 border border-ink px-4 text-sm">Apply</button>
            </form>
            {cart.couponCode && (
              <button className="mt-2 text-sm text-accent underline" onClick={() => mutate(() => api('/cart/coupon', { method: 'DELETE' }))}>Remove coupon {cart.couponCode}</button>
            )}
            <Link
              href="/checkout"
              aria-disabled={cart.issues.length > 0}
              className={`mt-6 flex min-h-12 w-full items-center justify-center bg-accent text-white ${cart.issues.length ? 'pointer-events-none opacity-50' : 'hover:bg-accent-hover'}`}
            >
              Check out securely
            </Link>
            <Reassurance cod={cart.paymentMethods?.cod ?? true} />
          </aside>
        </div>
      )}
    </Container>
  );
}
