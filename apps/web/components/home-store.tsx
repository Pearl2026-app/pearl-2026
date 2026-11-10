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
  /** Optional second link under the button */
  secondary?: { href: string; label: string };
}

/**
 * The top banner (owner's brief, 10 Nov): an editorial composition on pearl ivory: the headline beside a large
 * render of the piece on a nacre stage. Layers drift at different speeds as the page scrolls (the stage, a fine gold
 * ring, the piece), the words fade gently, and the slides change every 7 s. Phones get their own layout: the piece
 * on top, then a two-line headline and a full-width button, all within the first screen at 360 px.
 */
export function StoreHero({ slides }: { slides: StoreSlide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const piece = useRef<HTMLDivElement>(null);
  const n = slides.length;

  useEffect(() => {
    if (paused || n < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), 7000);
    return () => clearTimeout(t);
  }, [i, paused, n]);

  // Scroll: the words fade and rise a little, the piece grows a touch; the stage layers use data-depth.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = root.current;
      if (!el) return;
      const p = Math.min(1, Math.max(0, -el.getBoundingClientRect().top / Math.max(1, el.offsetHeight)));
      if (words.current) {
        words.current.style.opacity = String(1 - p * 0.9);
        words.current.style.transform = `translate3d(0, ${(-p * 36).toFixed(1)}px, 0)`;
      }
      if (piece.current) piece.current.style.transform = `scale(${(1 + p * 0.07).toFixed(3)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!n) return null;
  const s = slides[i];
  return (
    <section
      ref={root}
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative overflow-hidden border-b border-line bg-bg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="grid sm:min-h-[min(78vh,720px)] sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:items-center">
        {/* The words: below the piece on phones, on the left from tablets up. */}
        <div ref={words} className="order-2 px-5 pt-5 pb-8 will-change-transform sm:order-1 sm:py-16 sm:pr-6 sm:pl-8 lg:pl-[max(3rem,calc((100vw-80rem)/2+2rem))]">
          <div key={i} className="hero-in">
            <p className="lux-track text-[11px] text-gold sm:text-[12px]">{s.eyebrow}</p>
            {i === 0 ? (
              <h1 className="mt-3 max-w-[13ch] font-serif text-[38px] leading-[1.02] text-ink sm:text-[46px] lg:text-[64px]">{s.title}</h1>
            ) : (
              <h2 className="mt-3 max-w-[13ch] font-serif text-[38px] leading-[1.02] text-ink sm:text-[46px] lg:text-[64px]">{s.title}</h2>
            )}
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted lg:text-[16px]">{s.text}</p>
            <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-7">
              <Link href={s.href} className="lux-track inline-flex min-h-12 items-center justify-center bg-ink px-9 text-white transition-colors duration-500 hover:bg-gold hover:text-ink">
                {s.cta}
              </Link>
              {s.secondary && (
                <Link href={s.secondary.href} className="link-quiet self-center text-[14px] text-ink sm:self-auto">
                  {s.secondary.label}
                </Link>
              )}
            </div>
          </div>
          {n > 1 && (
            <div className="mt-8 flex items-center gap-3" role="group" aria-label="Choose a slide">
              {slides.map((x, k) => (
                <button
                  key={k}
                  onClick={() => setI(k)}
                  aria-label={`Show ${x.eyebrow}`}
                  aria-current={k === i}
                  className="flex h-8 items-center"
                >
                  <span className={`block h-px transition-all duration-500 ${k === i ? 'w-10 bg-ink' : 'w-5 bg-ink/25'}`} />
                </button>
              ))}
              <span className="lux-track ml-2 text-[11px] text-muted">
                {String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
              </span>
            </div>
          )}
        </div>

        {/* The stage: a nacre field, a fine gold ring and the piece, each drifting at its own depth. */}
        <Link href={s.href} tabIndex={-1} aria-hidden className="relative order-1 block h-[42svh] min-h-[250px] overflow-hidden sm:order-2 sm:h-full sm:min-h-[min(78vh,720px)]">
          <span data-depth="0.22" className="nacre absolute -inset-[12%] block" />
          <span data-depth="0.12" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="block aspect-square w-[64%] max-w-[520px] rounded-full border border-gold/45 sm:w-[58%]" />
          </span>
          <span data-depth="0.04" className="absolute inset-0 flex items-center justify-center mix-blend-multiply">
            <div ref={piece} className="flex h-full w-full items-center justify-center will-change-transform">
              {slides.map((x, k) => (
                <img
                  key={k}
                  src={x.image}
                  alt=""
                  width={900}
                  height={900}
                  fetchPriority={k === 0 ? 'high' : 'auto'}
                  loading={k === 0 ? 'eager' : 'lazy'}
                  className={`absolute h-[82%] w-auto max-w-[88%] object-contain transition-all duration-[1200ms] ease-[cubic-bezier(.22,1,.36,1)] ${k === i ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
                />
              ))}
            </div>
          </span>
        </Link>
      </div>
    </section>
  );
}

/** Tall picture tiles with the label on a bar at the bottom. */
export function CategoryTiles({ tiles }: { tiles: Array<{ label: string; href: string; image: string | null }> }) {
  return (
    <ul
      className={`no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:gap-6 lg:overflow-visible lg:px-0 ${tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
    >
      {tiles.map((t, k) => (
        <li key={t.label} data-reveal="3d" style={{ ['--reveal-delay' as string]: `${k * 90}ms` }} className="w-[62%] shrink-0 snap-start sm:w-[40%] lg:w-auto">
          <Link href={t.href} className="group block overflow-hidden rounded-md border border-line/60">
            <span className="nacre block aspect-[4/5] overflow-hidden">
              {t.image && (
                <span data-depth="0.06" className="block h-full w-full mix-blend-multiply">
                <img
                  src={t.image}
                  alt=""
                  loading="lazy"
                  width={500}
                  height={625}
                  className="h-full w-full object-contain p-6 mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                />
                </span>
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
          <li key={p.id} data-reveal="3d" style={{ ['--reveal-delay' as string]: `${(k % 4) * 80}ms` }} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[calc((100%-4.5rem)/4)]">
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
