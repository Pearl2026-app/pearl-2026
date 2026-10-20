'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { api, errorText } from '@/lib/api';
import type { CartView } from '@/lib/types-commerce';
import { CloseIcon } from './icons';
import { PearlImage } from './pearl-image';
import { useSession } from './session';
import { useSite } from './site-context';

const cityQuery = () => {
  const city =
    typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] : undefined;
  return city ? `?city=${city}` : '';
};

/** How far the cart is from free delivery: one line and a thin bar. */
export function FreeDeliveryBar({ subtotalPaise }: { subtotalPaise: number }) {
  const site = useSite();
  const free = site.delivery.freeAbovePaise;
  if (!free) return null;
  const left = free - subtotalPaise;
  const pct = Math.min(100, Math.round((subtotalPaise / free) * 100));
  return (
    <div>
      <p className="text-sm">
        {left > 0 ? (
          <>
            Add <strong className="font-medium">{formatINR(left, { compact: true })}</strong> for free
            delivery
          </>
        ) : (
          'Free insured delivery'
        )}
      </p>
      <div
        className="mt-2 h-[3px] w-full bg-surface-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progress to free delivery"
      >
        <div
          className="h-full bg-gold transition-[width] duration-700 ease-[var(--ease-calm)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The slide-in cart. Opens after every add to cart and from the bag icon, so shoppers never leave the page they
 * are on. Esc, the backdrop or the close button shut it; it closes itself when the page changes.
 */
export function CartDrawer() {
  const { cartOpen, closeCart, setCartCount } = useSession();
  const pathname = usePathname();
  const [cart, setCart] = useState<CartView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Mounted while open or closing, so the slide-out can play.
  const [shown, setShown] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api<CartView>(`/cart${cityQuery()}`);
      setCart(c);
      setCartCount(c.count);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [setCartCount]);

  useEffect(() => {
    if (!cartOpen) return;
    setShown(true);
    void load();
    const t = setTimeout(() => closeRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCart();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [cartOpen, load, closeCart]);
  useEffect(() => {
    if (cartOpen) return;
    const t = setTimeout(() => setShown(false), 350);
    return () => clearTimeout(t);
  }, [cartOpen]);
  useEffect(() => closeCart(), [pathname, closeCart]);

  const mutate = async (fn: () => Promise<CartView>) => {
    setBusy(true);
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

  if (!shown && !cartOpen) return null;
  const items = cart?.items ?? [];
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Your cart">
      <button
        aria-label="Close cart"
        tabIndex={-1}
        onClick={closeCart}
        className={`absolute inset-0 bg-ink/35 transition-opacity duration-300 ${cartOpen ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-bg shadow-[-24px_0_48px_-24px_rgba(20,33,43,0.35)] transition-transform duration-[350ms] ease-[var(--ease-calm)] ${cartOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <h2 className="font-serif text-2xl">
            Your cart
            {cart && cart.count > 0 ? (
              <span className="ml-2 align-middle font-sans text-sm text-muted">{cart.count}</span>
            ) : null}
          </h2>
          <button
            ref={closeRef}
            onClick={closeCart}
            className="-mr-2 flex h-11 w-11 items-center justify-center"
            aria-label="Close cart"
          >
            <CloseIcon />
          </button>
        </div>

        {cart && items.length > 0 && cart.totals && (
          <div className="border-b border-line px-6 py-4">
            <FreeDeliveryBar subtotalPaise={cart.totals.subtotalPaise} />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6" aria-busy={busy}>
          {!cart && !error && <p className="py-10 text-muted">Loading…</p>}
          {error && (
            <p role="alert" className="py-4 text-sm text-danger">
              {error}
            </p>
          )}
          {cart && items.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <p className="font-serif text-2xl">Your cart is empty</p>
              <Link
                href="/jewellery"
                onClick={closeCart}
                className="inline-flex min-h-12 items-center bg-accent px-8 text-[15px] text-white hover:bg-accent-hover"
              >
                Shop jewellery
              </Link>
            </div>
          )}
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={`${i.productId}:${i.size ?? ''}`} className="fade-in flex gap-4 py-5">
                <Link href={`/product/${i.product.slug}`} onClick={closeCart} className="nacre w-20 shrink-0">
                  <PearlImage
                    image={i.product.images[0]}
                    sizes="80px"
                    className="aspect-square w-full object-cover"
                    alt={i.product.name}
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/product/${i.product.slug}`}
                      onClick={closeCart}
                      className="font-serif text-lg leading-snug hover:underline"
                    >
                      {i.product.name}
                    </Link>
                    <span className="shrink-0 text-[15px]">
                      {i.product.pricePaise != null
                        ? formatINR(i.product.pricePaise * i.quantity, { compact: true })
                        : '—'}
                    </span>
                  </div>
                  {i.size && <p className="mt-0.5 text-xs text-muted">Size {i.size}</p>}
                  {i.problem && <p className="mt-1 text-sm text-danger">{i.problem}</p>}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    {i.product.isUnique ? (
                      <span className="text-xs text-muted">One of a kind</span>
                    ) : (
                      <div
                        className="flex items-center border border-line"
                        role="group"
                        aria-label={`Quantity of ${i.product.name}`}
                      >
                        <button
                          className="h-9 w-9"
                          aria-label="Decrease"
                          disabled={busy}
                          onClick={() =>
                            mutate(() =>
                              api(`/cart/items/${i.productId}`, {
                                method: 'PATCH',
                                json: { quantity: i.quantity - 1, ...(i.size ? { size: i.size } : { size: '' }) },
                              }),
                            )
                          }
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm" aria-live="polite">
                          {i.quantity}
                        </span>
                        <button
                          className="h-9 w-9"
                          aria-label="Increase"
                          disabled={busy}
                          onClick={() =>
                            mutate(() =>
                              api(`/cart/items/${i.productId}`, {
                                method: 'PATCH',
                                json: { quantity: i.quantity + 1, ...(i.size ? { size: i.size } : { size: '' }) },
                              }),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
                    <button
                      className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                      disabled={busy}
                      onClick={() => mutate(() => api(`/cart/items/${i.productId}?size=${encodeURIComponent(i.size ?? '')}`, { method: 'DELETE' }))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {cart && items.length > 0 && cart.totals && (
          <div className="border-t border-line px-6 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Total, GST included</span>
              <span className="font-serif text-2xl">
                {formatINR(cart.totals.totalPaise, { compact: true })}
              </span>
            </div>
            <Link
              href="/checkout"
              onClick={closeCart}
              aria-disabled={cart.issues.length > 0}
              className={`mt-4 flex min-h-12 w-full items-center justify-center bg-accent text-[15px] font-medium text-white transition-colors hover:bg-accent-hover ${cart.issues.length ? 'pointer-events-none opacity-50' : ''}`}
            >
              Check out
            </Link>
            <Link
              href="/cart"
              onClick={closeCart}
              className="mt-3 block text-center text-sm text-muted underline underline-offset-4 hover:text-ink"
            >
              View cart
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
