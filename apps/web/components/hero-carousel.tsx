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
      className="relative bg-surface-muted"
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
            <Link
              key={s.id}
              href={s.linkUrl ?? '/jewellery'}
              className="relative block w-full shrink-0 snap-center overflow-hidden"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}: ${s.title ?? s.ctaLabel ?? 'Shop now'}`}
            >
              {s.title && <Title className="sr-only">{s.title}</Title>}
              <picture>
                {s.mobileImageUrl && <source media="(max-width: 767px)" srcSet={s.mobileImageUrl} />}
                <img
                  src={s.imageUrl}
                  alt=""
                  width={1600}
                  height={900}
                  fetchPriority={i === 0 ? 'high' : undefined}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="block aspect-[4/3] w-full object-cover object-[72%_center] md:aspect-[16/7] md:object-center"
                />
              </picture>
            </Link>
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
                className={`block h-[3px] rounded-full bg-white shadow-[0_0_4px_rgba(0,0,0,0.4)] transition-all duration-500 ${i === index ? 'w-8 opacity-100' : 'w-4 opacity-50'}`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
