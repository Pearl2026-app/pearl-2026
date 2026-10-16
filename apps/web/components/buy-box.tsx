'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cx } from '@sahyadri/ui';
import { api, errorText } from '@/lib/api';
import type { ProductDetail } from '@/lib/types';
import { HeartIcon } from './icons';
import { useSession } from './session';
import { EnquireButton } from './whatsapp';

export function AddToCart({ p, className }: { p: ProductDetail; className?: string }) {
  const { setCartCount, openCart } = useSession();
  const [state, setState] = useState<'idle' | 'busy' | 'added'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setError(null);
          try {
            const r = await api<{ count: number }>('/cart/items', {
              method: 'POST',
              json: { productId: p.id, quantity: 1 },
            });
            setCartCount(r.count);
            setState('added');
            openCart();
            setTimeout(() => setState('idle'), 2000);
          } catch (e) {
            setError(errorText(e));
            setState('idle');
          }
        }}
        className="inline-flex min-h-12 w-full items-center justify-center bg-accent px-5 text-[15px] font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-70"
      >
        {state === 'busy' ? 'Adding…' : state === 'added' ? 'Added' : 'Add to cart'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The two actions. Inline on desktop; fixed within thumb reach on phones (SPEC Part 5). */
export function BuyActions({ p }: { p: ProductDetail }) {
  const canBuy = p.available && !p.priceOnRequest && !p.reserved && p.availableInCity;
  const enquiry = p.isSold
    ? {
        type: 'PRODUCT' as const,
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        message: 'I would like a similar piece.',
      }
    : { type: 'PRODUCT' as const, productId: p.id, productName: p.name, sku: p.sku };
  const label = p.isSold ? 'Enquire about a similar piece' : 'Enquire on WhatsApp';
  return (
    <>
      <div className="hidden flex-col gap-3 lg:flex">
        {canBuy && <AddToCart p={p} />}
        <EnquireButton enquiry={enquiry} label={label} variant={canBuy ? 'outline' : 'solid'} />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-bg/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur lg:hidden">
        {canBuy && <AddToCart p={p} className="flex-1" />}
        <EnquireButton
          enquiry={enquiry}
          label={canBuy ? 'Enquire' : label}
          variant={canBuy ? 'outline' : 'solid'}
          className={cx(canBuy ? 'flex-1' : 'w-full')}
        />
      </div>
    </>
  );
}

export function WishlistButton({ productId }: { productId: string }) {
  const { me } = useSession();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (me)
      api<string[]>('/me/wishlist/ids')
        .then((ids) => setSaved(ids.includes(productId)))
        .catch(() => undefined);
  }, [me, productId]);
  if (!me)
    return (
      <Link
        href={`/login?next=${encodeURIComponent(typeof window !== 'undefined' ? location.pathname : '/')}`}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-accent"
      >
        <HeartIcon /> Save to wishlist
      </Link>
    );
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(saved ? `/me/wishlist/${productId}` : '/me/wishlist', {
            method: saved ? 'DELETE' : 'POST',
            json: saved ? undefined : { productId },
          });
          setSaved(!saved);
        } finally {
          setBusy(false);
        }
      }}
      aria-pressed={saved}
      className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-accent"
    >
      <HeartIcon filled={saved} className={saved ? 'text-danger' : ''} />{' '}
      {saved ? 'Saved to wishlist' : 'Save to wishlist'}
    </button>
  );
}
