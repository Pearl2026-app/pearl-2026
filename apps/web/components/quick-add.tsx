'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { BagIcon, CheckIcon } from './icons';
import { useSession } from './session';

/**
 * Add straight from a product grid. Always visible on phones; on larger screens it appears when the card is hovered
 * or focused. Opens the cart drawer, so the shopper stays on the page they are browsing.
 */
export function QuickAdd({ productId, slug, name }: { productId: string; slug: string; name: string }) {
  const { setCartCount, openCart } = useSession();
  const [state, setState] = useState<'idle' | 'busy' | 'added'>('idle');
  return (
    <button
      type="button"
      aria-label={`Add ${name} to cart`}
      disabled={state === 'busy'}
      onClick={async () => {
        setState('busy');
        try {
          const r = await api<{ count: number }>('/cart/items', {
            method: 'POST',
            json: { productId, quantity: 1 },
          });
          setCartCount(r.count);
          setState('added');
          openCart();
          setTimeout(() => setState('idle'), 1800);
        } catch {
          // Out of stock or held by someone else: the product page explains; send the shopper there.
          setState('idle');
          location.href = `/product/${encodeURIComponent(slug)}`;
        }
      }}
      className="pointer-events-auto absolute right-3 bottom-3 flex h-10 items-center gap-2 rounded-full bg-surface/95 px-3 text-sm text-ink shadow-[0_6px_20px_-8px_rgba(20,33,43,0.45)] backdrop-blur transition-all duration-300 ease-[var(--ease-calm)] hover:bg-ink hover:text-white focus-visible:opacity-100 disabled:opacity-70 lg:translate-y-2 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100"
    >
      {state === 'added' ? <CheckIcon width={18} height={18} /> : <BagIcon width={18} height={18} />}
      <span className="hidden lg:inline">
        {state === 'added' ? 'Added' : state === 'busy' ? 'Adding…' : 'Add'}
      </span>
    </button>
  );
}
