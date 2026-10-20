'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cx } from '@sahyadri/ui';
import { api, errorText } from '@/lib/api';
import type { ProductDetail } from '@/lib/types';
import { HeartIcon } from './icons';
import { useSession } from './session';
import { EnquireButton } from './whatsapp';

export function AddToCart({ p, size, onNeedSize, className }: { p: ProductDetail; size?: string; onNeedSize?: () => void; className?: string }) {
  const { setCartCount, openCart } = useSession();
  const [state, setState] = useState<'idle' | 'busy' | 'added'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={async () => {
          if (p.sizes?.length && !size) return onNeedSize?.();
          setState('busy');
          setError(null);
          try {
            const r = await api<{ count: number }>('/cart/items', {
              method: 'POST',
              json: { productId: p.id, quantity: 1, ...(size ? { size } : {}) },
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

/** Puts the piece in the cart and goes straight to checkout. */
export function BuyNow({ p, size, onNeedSize, className }: { p: ProductDetail; size?: string; onNeedSize?: () => void; className?: string }) {
  const router = useRouter();
  const { setCartCount } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (p.sizes?.length && !size) return onNeedSize?.();
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ count: number }>('/cart/items', {
              method: 'POST',
              json: { productId: p.id, quantity: 1, ...(size ? { size } : {}) },
            });
            setCartCount(r.count);
            router.push('/checkout');
          } catch (e) {
            // Already in the cart counts as success here; anything else is shown.
            const msg = errorText(e);
            if (/already/i.test(msg)) router.push('/checkout');
            else setError(msg);
            setBusy(false);
          }
        }}
        className="inline-flex min-h-12 w-full items-center justify-center border border-ink px-5 text-[15px] font-medium text-ink transition-colors hover:bg-ink hover:text-white disabled:opacity-70"
      >
        {busy ? 'One moment…' : 'Buy now'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The actions. Inline on desktop; Add to cart and Buy now fixed within thumb reach on phones (SPEC Part 5). */
export function BuyActions({ p }: { p: ProductDetail }) {
  const canBuy = p.available && !p.priceOnRequest && !p.reserved && p.availableInCity;
  const [size, setSize] = useState('');
  const [sizeNudge, setSizeNudge] = useState(false);
  const needSize = () => setSizeNudge(true);
  const sizePicker = (p.sizes?.length ?? 0) > 0 && canBuy && (
    <fieldset className={`border p-3 ${sizeNudge && !size ? 'border-danger' : 'border-line'}`}>
      <legend className="px-1 text-sm">
        Size {sizeNudge && !size && <span className="text-danger">· please choose</span>}
      </legend>
      <div className="flex flex-wrap gap-2">
        {p.sizes!.map((x) => (
          <button
            key={x.label}
            type="button"
            disabled={!x.available}
            aria-pressed={size === x.label}
            onClick={() => {
              setSize(x.label);
              setSizeNudge(false);
            }}
            className={cx(
              'min-h-10 min-w-11 border px-3 text-sm transition-colors',
              size === x.label ? 'border-accent bg-accent text-white' : 'border-line bg-surface hover:border-ink',
              !x.available && 'cursor-not-allowed opacity-40 line-through',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
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
        {sizePicker}
        {canBuy && (
          <div className="grid grid-cols-2 gap-3">
            <AddToCart p={p} size={size} onNeedSize={needSize} />
            <BuyNow p={p} size={size} onNeedSize={needSize} />
          </div>
        )}
        <EnquireButton
          enquiry={enquiry}
          label={label}
          variant={canBuy ? 'outline' : 'solid'}
          className={canBuy ? 'border-line' : undefined}
        />
      </div>
      {/* Phones: WhatsApp stays in the page; the sticky bar below holds the buying actions. */}
      {canBuy && (
        <div className="flex flex-col gap-3 lg:hidden">
          {sizePicker}
          <EnquireButton enquiry={enquiry} label={label} variant="outline" className="border-line" />
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-bg/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur lg:hidden">
        {canBuy ? (
          <>
            <AddToCart p={p} size={size} onNeedSize={needSize} className="flex-1" />
            <BuyNow p={p} size={size} onNeedSize={needSize} className="flex-1" />
          </>
        ) : (
          <EnquireButton enquiry={enquiry} label={label} variant="solid" className={cx('w-full')} />
        )}
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
