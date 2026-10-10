'use client';
import { useEffect, useState } from 'react';
import { WhatsAppIcon } from '@/components/icons';
import { ProductGrid } from '@/components/product-card';
import { api } from '@/lib/api';
import type { ProductCard } from '@/lib/types';

export default function Wishlist() {
  const [w, setW] = useState<{ items: ProductCard[]; shareUrl: string } | null>(null);
  const load = () => api<{ items: ProductCard[]; shareUrl: string }>('/me/wishlist').then(setW);
  useEffect(() => {
    void load();
  }, []);
  if (!w) return <p className="text-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Wishlist</h2>
        {w.items.length > 0 && (
          <a href={w.shareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 bg-whatsapp px-4 text-sm text-white">
            <WhatsAppIcon width={18} height={18} /> Share shortlist on WhatsApp
          </a>
        )}
      </div>
      {w.items.length === 0 ? (
        <p className="text-muted">Save pieces you love with the heart on any product page.</p>
      ) : (
        <>
          <ProductGrid products={w.items} />
          <ul className="flex flex-wrap gap-3 text-sm">
            {w.items.map((p) => (
              <li key={p.id}>
                <button className="text-muted underline hover:text-danger" onClick={async () => { await api(`/me/wishlist/${p.id}`, { method: 'DELETE' }); void load(); }}>Remove {p.name}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
