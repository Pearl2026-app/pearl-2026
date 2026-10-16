'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Slide {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
}

/**
 * The home page banners, one at a time. Swipe on phones, dots everywhere; moves on by itself every 6 seconds
 * unless the shopper is hovering, focused inside it, or prefers reduced motion.
 */
export function HeroCarousel({ slides }: { slides: Slide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const n = (i + slides.length) % slides.length;
      el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    },
    [slides.length],
  );

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setTimeout(() => go(index + 1), 6000);
    return () => clearTimeout(t);
  }, [index, paused, slides.length, go]);

  return (
    <section
      className="relative bg-ink"
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
        {slides.map((s, i) => {
          // The first banner's title is the page's main heading.
          const Title = i === 0 ? 'h1' : 'h2';
          return (
            <div
              key={s.id}
              className="relative isolate w-full shrink-0 snap-center overflow-hidden"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
            >
              <picture>
                {s.mobileImageUrl && <source media="(max-width: 767px)" srcSet={s.mobileImageUrl} />}
                <img
                  src={s.imageUrl}
                  alt=""
                  width={1600}
                  height={900}
                  fetchPriority={i === 0 ? 'high' : undefined}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="absolute inset-0 -z-10 h-full w-full object-cover object-right"
                />
              </picture>
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/35 to-transparent md:bg-gradient-to-r md:from-ink/80 md:via-ink/30 md:to-transparent" />
              <div className="mx-auto flex min-h-[72vh] max-w-7xl flex-col justify-end px-4 pt-24 pb-16 md:min-h-[78vh] md:justify-center md:pb-24 lg:px-8">
                <div className="max-w-xl text-white">
                  {s.title && (
                    <Title className="font-serif text-[44px] leading-[1.02] md:text-[76px]">{s.title}</Title>
                  )}
                  {s.subtitle && <p className="mt-5 max-w-md text-lg text-white/85">{s.subtitle}</p>}
                  <Link
                    href={s.linkUrl ?? '/jewellery'}
                    className="mt-9 inline-flex min-h-12 items-center bg-white px-9 text-[15px] tracking-wide text-ink transition-colors hover:bg-orient"
                  >
                    {s.ctaLabel ?? 'Shop now'}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="absolute inset-x-0 bottom-5 flex justify-center gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              aria-label={`Show banner ${i + 1}`}
              aria-current={i === index}
              className="flex h-6 items-center px-1"
            >
              <span
                className={`block h-[3px] rounded-full bg-white transition-all duration-500 ${i === index ? 'w-8 opacity-100' : 'w-4 opacity-50'}`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
