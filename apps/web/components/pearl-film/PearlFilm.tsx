'use client';
// The first thing on the home page (owner, 10 Nov): the photograph of a pink scallop with a pearl on turquoise water,
// brought to life. The water moves at once; scrolling moves a camera in on the pearl, takes it under the surface into
// sunlit water, and shows the real Filigree Crown ring turning in a pool of light, then a glass card with the piece.
// The picture is drawn by one small WebGL shader (engine.ts, loaded after the page); GSAP ScrollTrigger scrubs the story
// and Framer Motion moves the words. Reduced motion or no WebGL: the still photograph with the words and the buttons.
import { AnimatePresence, LazyMotion, domAnimation, m, useMotionValue } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { preload } from 'react-dom';
import type { FilmState } from './engine';

export interface FilmProduct {
  name: string;
  href: string;
  collection: string;
  text: string;
  finishes: string[];
  priceLabel: string;
  enquireHref: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const enter = {
  initial: { opacity: 0, y: 22, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE } },
  exit: { opacity: 0, y: -14, filter: 'blur(6px)', transition: { duration: 0.5, ease: EASE } },
};

const LINES: Array<{ eyebrow?: string; first: string; second: string } | null> = [
  { eyebrow: 'Sahyadri Pearls', first: 'A pearl,', second: 'held close.' },
  { eyebrow: 'The Signature Collection', first: 'Lustre,', second: 'made to be worn.' },
  { first: 'Calm as', second: 'still water.' },
  null, // the ring: its own title
  null, // the glass card
];

type Engine = typeof import('./engine');

export function PearlFilm({ frames, count, product, ringCuts }: { frames: string; count: number; product: FilmProduct; ringCuts?: number[] }) {
  preload('/pearl-film/poster-m.webp', { as: 'image', fetchPriority: 'high', media: '(max-width: 767px)' });
  preload('/pearl-film/closed.webp', { as: 'image', fetchPriority: 'high', media: '(min-width: 768px)' });
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<'loading' | 'live' | 'still'>('loading');
  const [ready, setReady] = useState(false);
  const [chapter, setChapter] = useState(0);
  const exit = useMotionValue(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setMode('still');
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl')) return setMode('still');
    let cancelled = false;
    let cleanup = () => {};
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      import('./engine')
        .then((E: Engine) => {
          if (cancelled || !canvas.current || !section.current) return;
          const s: FilmState = E.createFilmState();
          const film = E.startFilm(canvas.current, s, {
            frames,
            count,
            cuts: ringCuts,
            small: Math.min(window.innerWidth, window.innerHeight) < 700,
            onReady: () => setReady(true),
          });
          if (!film) return setMode('still');
          setMode('live');
          const tl = E.createFilmTimeline(section.current, s, (p) => setChapter(E.chapterAt(p)));
          tl.eventCallback('onUpdate', () => {
            exit.set(s.exit);
          });
          const unsync = E.syncWithLenis();
          // draw only while the section is on screen and the tab is visible
          let onScreen = true;
          const apply = () => film.setActive(onScreen && document.visibilityState === 'visible');
          const io = new IntersectionObserver((e) => ((onScreen = e.some((x) => x.isIntersecting)), apply()));
          io.observe(section.current);
          document.addEventListener('visibilitychange', apply);
          cleanup = () => {
            io.disconnect();
            document.removeEventListener('visibilitychange', apply);
            unsync();
            tl.scrollTrigger?.kill();
            tl.kill();
            film.dispose();
          };
        })
        .catch(() => !cancelled && setMode('still'));
    };
    // on the visitor's first sign of life (the mouse moving, a touch, a scroll, a key), never during the page's own load:
    // the photograph itself is already on screen, so nothing is missing while it waits
    const events = ['pointermove', 'scroll', 'wheel', 'touchstart', 'keydown'] as const;
    events.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
    if (window.scrollY > 0) go();
    return () => {
      cancelled = true;
      events.forEach((e) => window.removeEventListener(e, go));
      cleanup();
    };
  }, [frames, count, ringCuts, exit]);

  const still = mode === 'still';
  const shown = still ? 0 : chapter;
  const line = shown >= 0 ? LINES[shown] : null;
  const showCard = still || shown === 4;
  const showTitle = !still && shown === 3;

  return (
    <LazyMotion features={domAnimation} strict>
      <section ref={section} aria-label="Sahyadri Pearls: the Filigree Crown ring" className={`relative ${still ? '' : 'h-[540vh] lg:h-[600vh]'}`}>
        <div className={`${still ? 'relative min-h-[100svh]' : 'sticky top-0 h-[100svh]'} overflow-hidden bg-[#1b8a86]`}>
          {/* The photograph itself: on screen at once, and all that reduced motion shows. */}
          <picture>
            <source media="(max-width: 767px)" srcSet="/pearl-film/poster-m.webp" />
            <img src="/pearl-film/closed.webp" alt="" fetchPriority="high" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${ready ? 'opacity-0' : 'opacity-100'}`} />
          </picture>
          <canvas ref={canvas} aria-hidden className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`} />
          {/* Scene 1 opens in the dark and the sea's light comes up */}
          <m.div aria-hidden className="pointer-events-none absolute inset-0 bg-[#021a1f]" initial={{ opacity: still ? 0 : 0.85 }} animate={{ opacity: 0, transition: { duration: 2.4, delay: 0.3, ease: 'easeOut' } }} />
          {/* a soft shade behind the words so they read on bright water */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,45,52,0.5),rgba(3,45,52,0.18)_40%,transparent_62%)] max-lg:bg-[linear-gradient(180deg,rgba(3,45,52,0.5),rgba(3,45,52,0.1)_38%,transparent_55%)]" />
          {!still && <m.div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface to-transparent" style={{ opacity: exit }} />}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col px-5 pt-[9vh] lg:justify-center lg:pt-0 lg:pl-[max(3rem,calc((100vw-80rem)/2+2rem))]">
            <div className="relative min-h-[150px] max-w-[560px] lg:min-h-[240px]">
              <h1 className="sr-only">Sahyadri Pearls: pearl jewellery in gold</h1>
              <AnimatePresence mode="wait">
                {line && (
                  <m.div key={`l${shown}`} {...enter} className="text-white [text-shadow:0_1px_22px_rgba(2,30,36,0.4)]">
                    {line.eyebrow && <p className="lux-track text-[11px] text-white/85 lg:text-[12px]">{line.eyebrow}</p>}
                    <p aria-hidden={shown > 0 || undefined} className="mt-3 font-serif text-[42px] leading-[1.02] sm:text-[54px] lg:text-[76px]">
                      {line.first}
                      <br />
                      <em className="font-serif italic">{line.second}</em>
                    </p>
                  </m.div>
                )}
                {showTitle && (
                  <m.div key="title" {...enter} className="text-white [text-shadow:0_1px_22px_rgba(2,30,36,0.45)]">
                    <p className="lux-track text-[11px] text-white/85 lg:text-[12px]">{product.collection}</p>
                    <p className="mt-3 font-serif text-[40px] leading-[1.02] sm:text-[52px] lg:text-[68px]">{product.name}</p>
                    <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/90 lg:text-[16px]">{product.text}</p>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <AnimatePresence>
            {showCard && (
              <m.div
                key="card"
                initial={{ opacity: 0, y: 30, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.9, ease: EASE } }}
                exit={{ opacity: 0, y: 20, transition: { duration: 0.4 } }}
                className="absolute inset-x-4 bottom-[88px] lg:inset-x-auto lg:top-1/2 lg:right-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:bottom-auto lg:w-[400px] lg:-translate-y-1/2"
              >
                <div className="rounded-xl border border-white/30 bg-white/12 p-5 text-white shadow-[0_20px_60px_rgba(3,40,45,0.35)] backdrop-blur-xl lg:p-7">
                  <p className="lux-track text-[11px] text-white/75">{product.collection}</p>
                  <h2 className="mt-2 font-serif text-[30px] leading-tight lg:text-[38px]">{product.name}</h2>
                  <p className="mt-2 hidden text-[14px] leading-relaxed text-white/85 sm:block">{product.text}</p>
                  {product.finishes.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {product.finishes.map((f) => (
                        <li key={f} className="rounded-full border border-white/35 px-3 py-1 text-[12px] text-white/90">
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 font-serif text-[22px]">{product.priceLabel}</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {product.enquireHref && (
                      <a href={product.enquireHref} target="_blank" rel="noopener" className="lux-track inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[#f6c9c4] px-5 text-[12px] text-ink transition-colors hover:bg-white">
                        Enquire
                      </a>
                    )}
                    <Link href={product.href} className="lux-track inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/50 px-5 text-[12px] text-white transition-colors hover:bg-white hover:text-ink">
                      View the ring
                    </Link>
                  </div>
                </div>
              </m.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {!still && shown === 0 && (
              <m.div key="cue" aria-hidden className="absolute inset-x-0 bottom-[6vh] flex justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 1.2 } }} exit={{ opacity: 0 }}>
                <span className="scroll-cue block h-12 w-px bg-white/80" />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </LazyMotion>
  );
}
