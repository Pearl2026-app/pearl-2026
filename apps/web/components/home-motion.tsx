'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ProductCard } from '@/lib/types';
import { PearlImage } from './pearl-image';
import { Price } from './product-card';

/**
 * Home page motion pieces (client references, 4 Nov):
 * - CinematicHero: a full-bleed film of a real piece, layered parallax that follows the cursor, a glass caption.
 * - ScrollShowcase: a pinned stage; as you scroll, the piece turns, grows and changes, with progress dots
 *   (the "ring on a pedestal, then on the hand" reference).
 * - HangingLine: pieces hang from a gold thread and swing away as the cursor passes (the motion layer swings
 *   every .hang); clicking one opens it.
 */

export function CinematicHero({ piece, floats = [] }: { piece: ProductCard | null; floats?: ProductCard[]; fallbackImage?: string | null }) {
  const section = useRef<HTMLElement>(null);
  const [y, setY] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const on = () => setY(Math.min(1, Math.max(0, window.scrollY / (section.current?.offsetHeight || 1))));
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, [reduce]);

  const still = piece?.images[0]?.url ?? null;
  const [a, b] = floats;
  return (
    <section ref={section} data-parallax-root className="relative overflow-hidden" aria-label="Sahyadri Pearls">
      <div className="mx-auto grid min-h-[calc(100svh-120px)] max-w-7xl items-center gap-10 px-5 pt-8 pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:px-8 lg:pt-4">
        <div className="relative z-10" style={{ transform: `translateY(${-y * 40}px)`, opacity: 1 - y * 0.7 }}>
          <p className="eyebrow fade-in">Farm-traced cultured pearls</p>
          <h1 className="fade-in mt-5 font-serif text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-ink sm:text-6xl lg:text-[84px]">
            Pearls, grown
            <br />
            in the <span className="gold-text">Sahyadris.</span>
          </h1>
          <p className="fade-in mt-6 max-w-md text-[17px] leading-relaxed text-muted">
            Hand-set rings and earrings in yellow, rose and white gold, each pearl traced to the farm it grew in.
          </p>
          <div className="fade-in mt-9 flex flex-wrap items-center gap-3">
            <Link href="/collections/signature" data-magnetic className="lux-track shine inline-flex min-h-[52px] items-center rounded-full bg-ink px-8 text-white">
              Explore the collection
            </Link>
            <Link href="/customized-jewellery" data-magnetic className="lux-track inline-flex min-h-[52px] items-center rounded-full border border-ink/25 px-7 text-ink hover:border-ink">
              Design your own
            </Link>
          </div>
          <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-[13px] text-muted">
            {['Farm-traced', 'Certified & verifiable', 'Insured delivery'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto aspect-[4/5] w-full max-w-[520px]">
          {/* The arch: a glass niche with a soft pearl glow behind the piece. */}
          <div data-depth="10" className="absolute inset-0">
            <div className="absolute inset-0 rounded-t-[999px] rounded-b-[44px] bg-[radial-gradient(80%_60%_at_50%_45%,#fffdf8,#efe6d2_70%,#e6d6b4)] shadow-[0_40px_80px_-40px_rgb(7_14_77/0.45)]" />
            <div className="absolute inset-3 rounded-t-[999px] rounded-b-[36px] border border-white/80" />
          </div>
          <Link
            href={piece ? `/product/${piece.slug}` : '/collections/signature'}
            data-cursor="View"
            data-depth="-18"
            className="absolute inset-[9%] top-[14%] flex items-center justify-center"
          >
            {piece?.videoUrl && !reduce ? (
              <video src={piece.videoUrl} poster={still ?? undefined} autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-contain mix-blend-multiply" style={{ transform: `scale(${1 + y * 0.12})` }} />
            ) : still ? (
              <img src={still} alt={piece?.name ?? ''} className="h-full w-full object-contain mix-blend-multiply" />
            ) : null}
          </Link>
          {/* Two more pieces floating at their own depths. */}
          {a && (
            <Link href={`/product/${a.slug}`} data-depth="46" data-cursor="View" className="glass absolute -left-4 bottom-[10%] hidden w-[34%] rounded-3xl p-2 sm:block lg:-left-14">
              <PearlImage image={a.images[0]} alt={a.name} sizes="180px" className="aspect-square w-full rounded-2xl object-contain mix-blend-multiply" />
            </Link>
          )}
          {b && (
            <Link href={`/product/${b.slug}`} data-depth="70" data-cursor="View" className="glass absolute -right-3 top-[6%] hidden w-[28%] rounded-3xl p-2 sm:block lg:-right-10">
              <PearlImage image={b.images[0]} alt={b.name} sizes="150px" className="aspect-square w-full rounded-2xl object-contain mix-blend-multiply" />
            </Link>
          )}
          {piece && (
            <div data-depth="-30" className="glass absolute right-[6%] bottom-[4%] rounded-2xl px-4 py-3 text-left">
              <p className="text-[11px] tracking-[0.16em] text-muted uppercase">Now showing</p>
              <p className="mt-0.5 max-w-[200px] truncate text-sm font-medium text-ink">{piece.name}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function ScrollShowcase({ pieces, title = 'Turn it in the light' }: { pieces: ProductCard[]; title?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const reduce = useReducedMotion();
  const steps = pieces.slice(0, 3);

  useEffect(() => {
    if (reduce) return;
    const on = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = el.offsetHeight - innerHeight;
      setP(Math.min(1, Math.max(0, -r.top / Math.max(1, total))));
    };
    on();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => {
      removeEventListener('scroll', on);
      removeEventListener('resize', on);
    };
  }, [reduce]);

  if (!steps.length) return null;
  const n = steps.length;
  const active = Math.min(n - 1, Math.floor(p * n));
  const local = p * n - active; // 0..1 within the active step

  return (
    <section ref={wrap} className="relative" style={{ height: reduce ? 'auto' : `${n * 70 + 60}vh` }} aria-label={title}>
      <div className={reduce ? 'py-20' : 'sticky top-0 flex h-[100svh] items-center overflow-hidden'}>
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 lg:grid-cols-[1fr_1.1fr] lg:px-8">
          <div className="order-2 lg:order-1">
            <p className="eyebrow">The signature collection</p>
            <h2 className="mt-3 font-serif text-4xl text-ink lg:text-6xl">{title}</h2>
            <div className="relative mt-8 min-h-[190px]">
              {steps.map((s, i) => (
                <div
                  key={s.id}
                  className="absolute inset-0 transition-all duration-700 ease-[var(--ease-silk)]"
                  style={{ opacity: i === active ? 1 : 0, transform: `translateY(${(i - active) * 24}px)`, pointerEvents: i === active ? 'auto' : 'none' }}
                >
                  <p className="font-serif text-2xl text-ink">{s.name}</p>
                  <p className="mt-2 text-muted">
                    {s.category.name}
                    {s.metal ? ` · ${s.metal}` : ''}
                  </p>
                  <Price p={s} className="price mt-3 block text-lg text-gold" />
                  <Link
                    href={`/product/${s.slug}`}
                    data-magnetic
                    className="lux-track mt-6 inline-flex min-h-12 items-center rounded-full bg-accent px-7 text-white hover:bg-accent-hover"
                  >
                    View the piece
                  </Link>
                </div>
              ))}
            </div>
          </div>
          <div className="relative order-1 aspect-square w-full lg:order-2">
            {/* The pedestal. */}
            <div aria-hidden className="absolute inset-x-[16%] bottom-[4%] h-[10%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(7_14_77/0.25),transparent)] blur-md" />
            <div className="absolute inset-[4%] rounded-t-[999px] rounded-b-[40px] bg-[radial-gradient(80%_60%_at_50%_45%,#fffdf8,#efe6d2_70%,#e6d6b4)]" />
            <div className="absolute inset-[6%] rounded-t-[999px] rounded-b-[34px] border border-white/80" />
            {steps.map((s, i) => {
              const on = i === active;
              const rot = on ? (local - 0.5) * 10 : i < active ? -14 : 14;
              const scale = on ? 0.94 + local * 0.08 : 0.86;
              // Motion sits on the image itself, so its white background still blends into the arch.
              return (
                <Link
                  key={s.id}
                  href={`/product/${s.slug}`}
                  data-cursor="View"
                  className="absolute inset-[14%]"
                  style={{ pointerEvents: on ? 'auto' : 'none', visibility: on || reduce ? 'visible' : 'hidden' }}
                  tabIndex={on ? 0 : -1}
                  aria-hidden={!on}
                >
                  <PearlImage
                    image={s.images[1] ?? s.images[0]}
                    alt={s.name}
                    sizes="(min-width: 1024px) 45vw, 90vw"
                    className="h-full w-full object-contain mix-blend-multiply transition-[opacity,transform] duration-700 ease-[var(--ease-silk)]"
                    style={{ opacity: on ? 1 : 0, transform: `rotate(${rot}deg) scale(${scale})` }}
                  />
                </Link>
              );
            })}
            {/* Progress dots, like a scroll rail. */}
            <ol aria-hidden className="absolute top-1/2 -right-1 flex -translate-y-1/2 flex-col gap-3 lg:-right-6">
              {steps.map((s, i) => (
                <li key={s.id} className={`h-2 w-2 rounded-full transition-all duration-500 ${i === active ? 'h-6 bg-gold' : 'bg-ink/20'}`} />
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

export function HangingLine({ pieces, title = 'Hand-picked, hanging in the light' }: { pieces: ProductCard[]; title?: string }) {
  if (!pieces.length) return null;
  return (
    <section className="relative overflow-hidden py-20 lg:py-28" aria-label={title}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <p className="eyebrow text-center">Move your cursor across</p>
        <h2 data-reveal className="mt-3 text-center font-serif text-4xl text-ink lg:text-5xl">{title}</h2>
      </div>
      {/* The thread. */}
      <div className="relative mt-16">
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />
        <ul className="no-scrollbar mx-auto flex max-w-[1500px] snap-x gap-6 overflow-x-auto px-6 pt-10 pb-6 lg:justify-center lg:gap-10 lg:overflow-visible">
          {pieces.slice(0, 7).map((p, i) => (
            <li key={p.id} className="hang relative w-[42vw] shrink-0 snap-center sm:w-[30vw] lg:w-[11.5vw]" style={{ animationDelay: `${i * 120}ms` }}>
              <Link href={`/product/${p.slug}`} data-cursor="View" className="glass group block rounded-2xl p-2">
                <span className="nacre block overflow-hidden rounded-xl">
                  <PearlImage image={p.images[0]} alt={p.name} sizes="(min-width: 1024px) 12vw, 40vw" className="img-zoom aspect-[3/4] w-full object-contain p-2 mix-blend-multiply" />
                </span>
                <span className="mt-2 block truncate px-1 text-center text-[12px] text-ink">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => setR(matchMedia('(prefers-reduced-motion: reduce)').matches), []);
  return r;
}
