'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { estimateDelivery, isValidPincode } from '@sahyadri/shared';
import { NECKLACE_LENGTHS, RING_SIZES } from '@/lib/guides';
import type { ProductCard, ProductDetail } from '@/lib/types';
import { CloseIcon, TruckIcon } from './icons';
import { ProductGrid } from './product-card';
import { useSite } from './site-context';

const PIN_KEY = 'sp_pincode';
const RECENT_KEY = 'sp_recent';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: nothing to remember */
  }
};

/** "Deliver to 411004 by Fri 16 Oct – Mon 19 Oct". The pincode is remembered on this device only. */
export function DeliveryCheck() {
  const site = useSite();
  const [pin, setPin] = useState('');
  const [checked, setChecked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const saved = read(PIN_KEY);
    if (saved && isValidPincode(saved)) {
      setPin(saved);
      setChecked(saved);
    }
  }, []);
  const est = checked ? estimateDelivery(new Date(), site.storefront.deliveryMinDays, site.storefront.deliveryMaxDays) : null;
  return (
    <div className="text-sm">
      <form
        className="flex items-stretch gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isValidPincode(pin)) return setError('Enter a 6-digit pincode');
          setError(null);
          setChecked(pin.trim());
          write(PIN_KEY, pin.trim());
        }}
      >
        <label className="flex flex-1 items-center gap-2 border border-line bg-surface px-3">
          <TruckIcon className="shrink-0 text-gold" width={18} height={18} />
          <span className="sr-only">Delivery pincode</span>
          <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="postal-code" placeholder="Enter pincode for delivery date" className="min-h-11 w-full bg-transparent focus:outline-none" />
        </label>
        <button type="submit" className="min-h-11 border border-ink px-4 hover:bg-ink hover:text-white">Check</button>
      </form>
      {error && <p role="alert" className="mt-1 text-danger">{error}</p>}
      {est && !error && (
        <p className="mt-2" aria-live="polite">
          Delivery to <strong>{checked}</strong> by <strong>{est.label}</strong>
          {site.delivery.freeAbovePaise != null && <span className="text-muted"> · free above ₹{(site.delivery.freeAbovePaise / 100).toLocaleString('en-IN')}</span>}
        </p>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-ink/40" onClick={onClose} aria-label="Close" />
      <div ref={box} tabIndex={-1} className="fade-in relative max-h-[85vh] w-full max-w-lg overflow-y-auto bg-bg p-6 focus:outline-none sm:p-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SizeGuide({ kind }: { kind: 'ring' | 'necklace' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-accent underline underline-offset-2">
        {kind === 'ring' ? 'Ring size guide' : 'Necklace length guide'}
      </button>
      {open && (
        <Modal title={kind === 'ring' ? 'Find your ring size' : 'Necklace lengths'} onClose={() => setOpen(false)}>
          {kind === 'ring' ? (
            <>
              <p className="mb-4 text-sm text-muted">Wrap paper around your finger, mark it, and measure in millimetres. Between sizes, choose the larger.</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted"><th className="pb-2 font-normal">Indian size</th><th className="pb-2 font-normal">Circumference</th><th className="pb-2 font-normal">Diameter</th></tr></thead>
                <tbody>{RING_SIZES.map((r) => <tr key={r.size} className="border-t border-line"><td className="py-2">{r.size}</td><td>{r.circumference} mm</td><td>{r.diameter} mm</td></tr>)}</tbody>
              </table>
            </>
          ) : (
            <ul className="flex flex-col gap-3 text-sm">
              {NECKLACE_LENGTHS.map((n) => (
                <li key={n.name} className="border-t border-line pt-3">
                  <p><strong>{n.name}</strong> · {n.cm} cm ({n.inches}″)</p>
                  <p className="text-muted">{n.sits}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/pearl-guide#${kind === 'ring' ? 'ring-size' : 'necklace-lengths'}`} className="mt-5 inline-block text-sm text-accent underline">More in the Pearl Guide</Link>
        </Modal>
      )}
    </>
  );
}

export function ShareButton({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-2 text-sm text-muted hover:text-accent"
      onClick={async () => {
        const url = location.href.split('?')[0]!;
        if (navigator.share) {
          await navigator.share({ title: name, url }).catch(() => undefined);
          return;
        }
        await navigator.clipboard?.writeText(url).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" /></svg>
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}

/** Remembers this piece and shows the others the visitor looked at recently (this device only). */
export function RecentlyViewed({ p }: { p: ProductDetail }) {
  const [items, setItems] = useState<ProductCard[]>([]);
  useEffect(() => {
    let list: ProductCard[] = [];
    try {
      list = JSON.parse(read(RECENT_KEY) ?? '[]') as ProductCard[];
    } catch {
      list = [];
    }
    setItems(list.filter((x) => x.id !== p.id).slice(0, 4));
    const card: ProductCard = {
      id: p.id, slug: p.slug, name: p.name, sku: p.sku, pricePaise: p.pricePaise, compareAtPaise: p.compareAtPaise, priceOnRequest: p.priceOnRequest,
      caratWeight: p.caratWeight, shape: p.shape, colour: p.colour, metal: p.metal, isUnique: p.isUnique, isSold: p.isSold, available: p.available,
      farm: p.farm ? { name: p.farm.name, slug: p.farm.slug } : null, collection: p.collection, category: p.category, images: p.images.slice(0, 1),
    };
    write(RECENT_KEY, JSON.stringify([card, ...list.filter((x) => x.id !== p.id)].slice(0, 8)));
  }, [p]);
  if (!items.length) return null;
  return (
    <section className="mt-20">
      <p className="eyebrow mb-2">Recently viewed</p>
      <h2 className="mb-8 font-serif text-3xl lg:text-4xl">Pieces you looked at</h2>
      <ProductGrid products={items} />
    </section>
  );
}
