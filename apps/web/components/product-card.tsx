import Link from 'next/link';
import { formatINR } from '@sahyadri/shared';
import type { ProductCard as Card } from '@/lib/types';
import { PearlImage } from './pearl-image';

export function Price({ p, className }: { p: Pick<Card, 'pricePaise' | 'priceOnRequest' | 'compareAtPaise'>; className?: string }) {
  if (p.priceOnRequest || p.pricePaise == null) return <span className={className}>Price on request</span>;
  return (
    <span className={className}>
      {formatINR(p.pricePaise, { compact: true })}
      {p.compareAtPaise && p.compareAtPaise > p.pricePaise ? <s className="ml-2 text-sm text-muted">{formatINR(p.compareAtPaise, { compact: true })}</s> : null}
    </span>
  );
}

export function ProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  return (
    <Link href={`/product/${p.slug}`} className="group flex flex-col gap-3 focus-visible:outline-offset-4">
      <div className="relative overflow-hidden bg-surface">
        <PearlImage image={p.images[0]} alt={p.images[0]?.alt ?? p.name} priority={priority} className={`img-zoom aspect-square w-full object-cover ${p.isSold ? 'opacity-60' : ''}`} />
        {p.isSold && <span className="absolute top-3 left-3 bg-ink/85 px-2 py-1 text-[11px] tracking-widest text-white uppercase">Sold</span>}
        {!p.isSold && p.isUnique && <span className="absolute top-3 left-3 bg-surface/90 px-2 py-1 text-[11px] tracking-widest text-ink uppercase">One of a kind</span>}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="font-serif text-lg leading-snug text-ink group-hover:text-accent">{p.name}</h3>
        <p className="text-xs text-muted">
          {[p.farm?.name, p.caratWeight ? `${p.caratWeight} ct` : null, p.shape].filter(Boolean).join(' · ')}
        </p>
        <Price p={p} className={`mt-1 text-[15px] ${p.priceOnRequest ? 'text-muted italic' : 'text-ink'}`} />
      </div>
    </Link>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard p={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
