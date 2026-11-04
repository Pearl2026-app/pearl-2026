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

export function CinematicHero({ piece, fallbackImage }: { piece: ProductCard | null; fallbackImage?: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null);
  const [y, setY] = useState(0);
  const reduce = useReducedMotion();

  // Scroll: the film eases back and the caption lifts as you leave the hero.
  useEffect(() => {
    if (reduce) return;
    const on = () => {
      const h = section.current?.offsetHeight ?? 1;
      setY(Math.min(1, Math.max(0, window.scrollY / h)));
    };
    on();
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, [reduce]);

  const still = piece?.images[0]?.url ?? fallbackImage ?? null;
  return (
    <section
      ref={section}
      data-parallax-root
      className="relative mx-2 mt-3 h-[86svh] min-h-[540px] overflow-hidden rounded-3xl bg-ink lg:mx-5"
      aria-label="Sahyadri Pearls"
    >
      <div className="absolute -inset-6" data-depth="24">
      <div className="h-full w-full" style={{ transform: `scale(${1.04 + y * 0.08})` }}>
        {piece?.videoUrl && !reduce ? (
          <video
            ref={video}
            src={piece.videoUrl}
            poster={still ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover opacity-90"
          />
        ) : still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt="" className="h-full w-full object-cover opacity-90" />
        ) : null}
      </div>
      </div>
      {/* Navy wash so the type reads on any frame. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_80%,rgb(7_14_77/0.85),transparent_60%),linear-gradient(to_top,rgb(7_14_77/0.7),transparent_45%)]" />
      {/* Floating pearls of light, on their own parallax depths. */}
      <span aria-hidden data-depth="60" className="absolute top-[18%] right-[14%] h-40 w-40 rounded-full bg-[radial-gradient(circle,rgb(184_144_66/0.45),transparent_65%)] blur-xl" />
      <span aria-hidden data-depth="90" className="absolute bottom-[22%] left-[46%] h-24 w-24 rounded-full bg-[radial-gradient(circle,rgb(255_255_255/0.35),transparent_65%)] blur-lg" />

      <div className="relative mx-auto flex h-full max-w-7xl items-end px-4 pb-16 lg:px-8 lg:pb-24">
        <div data-depth="-14">
        <div
          className="glass-dark max-w-xl rounded-3xl p-7 lg:p-10"
          style={{ transform: `translateY(${-y * 60}px)`, opacity: 1 - y * 0.6 }}
        >
          <p className="eyebrow !text-[#d9b56a]">Farm-traced cultured pearls</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.08] text-white lg:text-6xl">
            Pearls with a <span className="gold-text">story</span>, set to be worn.
          </h1>
          <p className="mt-4 max-w-md text-white/80">
            Every piece traced to the farm it grew in, with a certificate you can verify.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/collections/signature"
              data-magnetic
              className="lux-track shine inline-flex min-h-12 items-center rounded-full bg-gold px-7 text-ink"
            >
              Explore the collection
            </Link>
            {piece && (
              <Link
                href={`/product/${piece.slug}`}
                data-magnetic
                data-cursor="View"
                className="lux-track inline-flex min-h-12 items-center rounded-full border border-white/40 px-7 text-white hover:bg-white/10"
              >
                See this piece
              </Link>
            )}
          </div>
        </div>
        </div>
      </div>
      <div aria-hidden className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[10px] tracking-[0.3em] text-white/70 uppercase lg:flex">
        Scroll
        <span className="h-10 w-px animate-pulse bg-white/60" />
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
    <section ref={wrap} className="relative" style={{ height: reduce ? 'auto' : `${n * 100 + 40}vh` }} aria-label={title}>
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
            <div aria-hidden className="absolute inset-x-[12%] bottom-[6%] h-[14%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(7_14_77/0.22),transparent)] blur-md" />
            <div className="glass absolute inset-[6%] rounded-[40%]" />
            {steps.map((s, i) => {
              const on = i === active;
              const rot = on ? (local - 0.5) * 24 : i < active ? -30 : 30;
              const scale = on ? 0.92 + local * 0.12 : 0.8;
              return (
                <Link
                  key={s.id}
                  href={`/product/${s.slug}`}
                  data-cursor="View"
                  className="absolute inset-[10%] transition-[opacity,transform] duration-700 ease-[var(--ease-silk)]"
                  style={{ opacity: on ? 1 : 0, transform: `rotate(${rot}deg) scale(${scale})`, pointerEvents: on ? 'auto' : 'none' }}
                  tabIndex={on ? 0 : -1}
                  aria-hidden={!on}
                >
                  <PearlImage image={s.images[1] ?? s.images[0]} alt={s.name} sizes="(min-width: 1024px) 45vw, 90vw" className="h-full w-full rounded-[36%] object-cover drop-shadow-[0_30px_40px_rgb(7_14_77/0.25)]" />
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
                  <PearlImage image={p.images[0]} alt={p.name} sizes="(min-width: 1024px) 12vw, 40vw" className="img-zoom aspect-[3/4] w-full object-cover" />
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
