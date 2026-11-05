import Link from 'next/link';
import { formatINR } from '@sahyadri/shared';
import type { ProductCard as Card } from '@/lib/types';
import { PearlImage } from './pearl-image';
import { QuickAdd } from './quick-add';

export function Price({
  p,
  className,
}: {
  p: Pick<Card, 'pricePaise' | 'priceOnRequest' | 'compareAtPaise'>;
  className?: string;
}) {
  if (p.priceOnRequest || p.pricePaise == null) return <span className={className}>Price on request</span>;
  return (
    <span className={className}>
      {formatINR(p.pricePaise, { compact: true })}
      {p.compareAtPaise && p.compareAtPaise > p.pricePaise ? (
        <s className="ml-2 text-sm text-muted">{formatINR(p.compareAtPaise, { compact: true })}</s>
      ) : null}
    </span>
  );
}

export function ProductCard({ p, priority }: { p: Card; priority?: boolean }) {
  const quickAdd = p.available && !p.isSold && !p.priceOnRequest && p.pricePaise != null;
  return (
    <div className="group relative">
      <Link href={`/product/${p.slug}`} className="flex flex-col gap-3 focus-visible:outline-offset-4">
        {/* A plain store card: the piece on ivory, a second view on hover, then the name and price. */}
        <div className="nacre relative overflow-hidden rounded-md border border-line/60 transition-shadow duration-300 group-hover:shadow-[0_14px_30px_-18px_rgb(7_14_77/0.35)]">
          <PearlImage
            image={p.images[0]}
            alt={p.images[0]?.alt ?? p.name}
            priority={priority}
            className={`aspect-square w-full object-contain p-4 mix-blend-multiply transition-transform duration-500 group-hover:scale-[1.04] ${p.isSold ? 'opacity-60' : ''}`}
          />
          {p.images[1] && !p.isSold && (
            <PearlImage
              image={p.images[1]}
              alt=""
              className="absolute inset-0 aspect-square h-full w-full object-contain p-4 opacity-0 mix-blend-multiply transition-opacity duration-500 group-hover:opacity-100"
            />
          )}
          {p.isSold && <span className="absolute top-2.5 left-2.5 rounded-sm bg-ink px-2 py-0.5 text-[11px] text-white">Sold</span>}
          {!p.isSold && p.isExclusive && (
            <span className="lux-track absolute top-3 left-3 text-[10px] text-gold">Exclusive</span>
          )}
          {!p.isSold && !p.isExclusive && p.isUnique && (
            <span className="absolute top-2.5 left-2.5 rounded-sm bg-gold px-2 py-0.5 text-[11px] text-ink">One of a kind</span>
          )}
        </div>
        <div className="flex flex-col gap-1 px-0.5">
          <h3 className="line-clamp-2 text-[13px] leading-snug text-ink lg:text-[14px]">{p.name}</h3>
          <Price p={p} className={`price text-[14px] font-medium ${p.priceOnRequest ? 'text-muted' : 'text-ink'}`} />
        </div>
      </Link>
      {quickAdd && (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
          <QuickAdd productId={p.id} slug={p.slug} name={p.name} />
        </div>
      )}
    </div>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Card[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-12">
      {products.map((p, i) => (
        <li key={p.id} data-reveal style={{ ['--reveal-delay' as string]: `${(i % 4) * 70}ms` }}>
          <ProductCard p={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
