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
      <Link href={`/product/${p.slug}`} className="flex flex-col gap-4 focus-visible:outline-offset-4">
        <div className="nacre relative overflow-hidden">
          <PearlImage
            image={p.images[0]}
            alt={p.images[0]?.alt ?? p.name}
            priority={priority}
            className={`img-zoom aspect-square w-full object-cover ${p.isSold ? 'opacity-60' : ''}`}
          />
          {/* The second photograph, revealed on hover where a pointer exists. */}
          {p.images[1] && !p.isSold && (
            <PearlImage
              image={p.images[1]}
              alt=""
              className="absolute inset-0 aspect-square h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-[var(--ease-calm)] group-hover:opacity-100"
            />
          )}
          {p.isSold && (
            <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1 text-xs text-white">
              Sold
            </span>
          )}
          {!p.isSold && p.isUnique && (
            <span className="absolute top-3 left-3 rounded-full bg-surface/95 px-3 py-1 text-xs text-ink">
              One of a kind
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 px-0.5">
          <h3 className="font-serif text-[19px] leading-snug text-ink underline-offset-4 group-hover:underline">
            {p.name}
          </h3>
          <p className="text-[13px] text-muted">
            {[p.farm?.name, p.caratWeight ? `${p.caratWeight} ct` : null, p.shape].filter(Boolean).join(', ')}
          </p>
          <Price
            p={p}
            className={`mt-1 text-[15px] font-medium tracking-wide ${p.priceOnRequest ? 'font-normal text-muted italic' : 'text-ink'}`}
          />
        </div>
      </Link>
      {/* Over the image's corner, outside the link (a button cannot sit inside a link). */}
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
    <ul className="grid grid-cols-2 gap-x-3 gap-y-12 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard p={p} priority={i < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
