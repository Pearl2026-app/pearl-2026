'use client';
// The home page's store layout: a banner at the top, a trust strip, category tiles, product rails and a few
// plain banners. Clean and simple, like the big jewellery stores: ivory ground, navy type, gold accents.
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProductCard as Card } from '@/lib/types';
import { ProductCard } from './product-card';

/** A centred section title with an optional line under it. */
export function CenterHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-8 text-center lg:mb-10">
      <h2 className="font-serif text-[28px] leading-tight text-ink lg:text-[36px]">{title}</h2>
      {sub && <p className="mt-2 text-[14px] text-muted">{sub}</p>}
      <span aria-hidden className="mx-auto mt-4 block h-px w-14 bg-gold" />
    </div>
  );
}

export function OutlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="lux-track inline-flex min-h-11 items-center border border-ink px-8 text-ink transition-colors hover:bg-ink hover:text-white"
    >
      {children}
    </Link>
  );
}

export interface StoreSlide {
  eyebrow: string;
  title: string;
  text: string;
  href: string;
  cta: string;
  image: string;
  dark?: boolean;
}

/** The top banner: words on one side, the piece on the other; moves on every 6 seconds. */
export function StoreHero({ slides }: { slides: StoreSlide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  useEffect(() => {
    if (paused || n < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), 6000);
    return () => clearTimeout(t);
  }, [i, paused, n]);
  if (!n) return null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative overflow-hidden border-b border-line"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative h-[560px] sm:h-[520px] lg:h-[540px]">
        {slides.map((s, k) => (
          <div
            key={k}
            aria-hidden={k !== i}
            className={`absolute inset-0 grid transition-opacity duration-700 sm:grid-cols-2 ${k === i ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            <div
              className={`order-2 flex flex-col justify-center px-6 py-8 sm:order-1 sm:px-12 lg:px-24 ${s.dark ? 'bg-[linear-gradient(135deg,#070e4d,#070e4d_45%,#47628a)] text-white' : 'bg-surface text-ink'}`}
            >
              <p className={`lux-track text-[12px] ${s.dark ? 'text-gold' : 'text-gold'}`}>{s.eyebrow}</p>
              {k === 0 ? (
                <h1 className="mt-3 font-serif text-[34px] leading-[1.08] lg:text-[54px]">{s.title}</h1>
              ) : (
                <h2 className="mt-3 font-serif text-[34px] leading-[1.08] lg:text-[54px]">{s.title}</h2>
              )}
              <p className={`mt-4 max-w-md text-[15px] leading-relaxed ${s.dark ? 'text-white/80' : 'text-muted'}`}>{s.text}</p>
              <div className="mt-7">
                <Link
                  href={s.href}
                  tabIndex={k === i ? 0 : -1}
                  className={`lux-track inline-flex min-h-12 items-center px-9 transition-colors ${s.dark ? 'bg-gold text-ink hover:bg-white' : 'bg-ink text-white hover:bg-gold hover:text-ink'}`}
                >
                  {s.cta}
                </Link>
              </div>
            </div>
            <Link href={s.href} tabIndex={-1} className="nacre order-1 flex items-center justify-center overflow-hidden sm:order-2">
              <img
                src={s.image}
                alt=""
                width={900}
                height={900}
                fetchPriority={k === 0 ? 'high' : 'auto'}
                className={`h-full max-h-full w-auto max-w-full object-contain p-6 mix-blend-multiply transition-transform duration-[6000ms] ease-out lg:p-10 ${k === i ? 'scale-105' : 'scale-100'}`}
              />
            </Link>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {slides.map((_, k) => (
              <button
                key={k}
                onClick={() => setI(k)}
                aria-label={`Show slide ${k + 1}`}
                aria-current={k === i}
                className={`h-1.5 rounded-full transition-all ${k === i ? 'w-7 bg-gold' : 'w-1.5 bg-ink/30'}`}
              />
            ))}
          </div>
          <button
            onClick={() => setI((i - 1 + n) % n)}
            aria-label="Previous slide"
            className="absolute top-1/2 left-3 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-sm hover:bg-white lg:flex"
          >
            ‹
          </button>
          <button
            onClick={() => setI((i + 1) % n)}
            aria-label="Next slide"
            className="absolute top-1/2 right-3 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-ink shadow-sm hover:bg-white lg:flex"
          >
            ›
          </button>
        </>
      )}
    </section>
  );
}

/** Tall picture tiles with the label on a bar at the bottom. */
export function CategoryTiles({ tiles }: { tiles: Array<{ label: string; href: string; image: string | null }> }) {
  return (
    <ul
      className={`no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:gap-6 lg:overflow-visible lg:px-0 ${tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
    >
      {tiles.map((t) => (
        <li key={t.label} className="w-[62%] shrink-0 snap-start sm:w-[40%] lg:w-auto">
          <Link href={t.href} className="group block overflow-hidden rounded-md border border-line/60">
            <span className="nacre block aspect-[4/5] overflow-hidden">
              {t.image && (
                <img
                  src={t.image}
                  alt=""
                  loading="lazy"
                  width={500}
                  height={625}
                  className="h-full w-full object-contain p-6 mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </span>
            <span className="flex items-center justify-between bg-ink px-4 py-3.5 text-white">
              <span className="lux-track text-[13px]">{t.label}</span>
              <span aria-hidden className="text-gold transition-transform group-hover:translate-x-1">→</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** One row of products that scrolls sideways, with arrows on desktop. */
export function ProductRail({ products }: { products: Card[] }) {
  const track = useRef<HTMLUListElement>(null);
  const move = (dir: number) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <div className="relative">
      <ul ref={track} className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:gap-6 lg:px-0">
        {products.map((p, k) => (
          <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[calc((100%-4.5rem)/4)]">
            <ProductCard p={p} priority={k < 2} />
          </li>
        ))}
      </ul>
      {products.length > 4 && (
        <>
          <button
            onClick={() => move(-1)}
            aria-label="Scroll back"
            className="absolute top-[38%] -left-5 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm hover:border-gold lg:flex"
          >
            ‹
          </button>
          <button
            onClick={() => move(1)}
            aria-label="Scroll on"
            className="absolute top-[38%] -right-5 hidden h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink shadow-sm hover:border-gold lg:flex"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/** Tabs (Yellow, Rose, White gold) over one product row. */
export function FinishTabs({ products }: { products: Card[] }) {
  const finishes = ['Yellow Gold', 'Rose Gold', 'White Gold'].filter((f) => products.some((p) => p.metal?.startsWith(f)));
  const [tab, setTab] = useState(finishes[0] ?? '');
  if (!finishes.length) return null;
  const shown = products.filter((p) => p.metal?.startsWith(tab)).slice(0, 8);
  return (
    <div>
      <div role="tablist" aria-label="Metal finish" className="mb-8 flex justify-center gap-2 sm:gap-6">
        {finishes.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={tab === f}
            onClick={() => setTab(f)}
            className={`lux-track min-h-10 border-b-2 px-2 text-[12px] transition-colors sm:px-4 sm:text-[13px] ${tab === f ? 'border-gold text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <ProductRail key={tab} products={shown} />
    </div>
  );
}
