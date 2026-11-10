'use client';
// The first thing on the home page (owner's brief and reference video, 10 Nov): a cinematic, scroll-driven 3D scene.
// A pink scallop floats on bright sea water; it opens, a pearl rises out of it, the view lowers to the horizon and dives;
// under the water the pearl settles into the Filigree Crown setting, the ring turns 360° and a glass card offers the
// piece. GSAP ScrollTrigger scrubs one timeline (timeline.ts); React Three Fiber draws the 3D (OceanStage.tsx, loaded
// on the visitor's first scroll, touch or mouse movement); Framer Motion moves the words. Reduced motion or no WebGL: a still of the opening frame with the
// words and the buttons. The words are short and our own, with no claims about where the pearls come from.
import { AnimatePresence, LazyMotion, domAnimation, m, useMotionValue, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { preload } from 'react-dom';
import type { OceanStageProps } from './OceanStage';
import { chapterAt, createOceanState } from './timeline';

export interface OceanProduct {
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

const LINES: Array<{ eyebrow?: string; first: string; second: string; tone: 'light' | 'dark' } | null> = [
  { eyebrow: 'Sahyadri Pearls', first: 'A pearl,', second: 'held close.', tone: 'light' },
  { eyebrow: 'The Signature Collection', first: 'Lustre,', second: 'made to be worn.', tone: 'light' },
  { first: 'Calm as', second: 'still water.', tone: 'dark' },
  null, // the showcase: the product's own title
  null, // the call to action: the glass card
];

type Stage = { default: ComponentType<OceanStageProps>; createOceanTimeline: typeof import('./timeline').createOceanTimeline; syncWithLenis: typeof import('./timeline').syncWithLenis };

export function OceanHero({ frames, count, product, ringCuts }: { frames: string; count: number; product: OceanProduct; ringCuts?: number[] }) {
  // The still is the first big paint: ask for it from the document's head, the right one for the screen.
  preload('/hero/ocean-m.webp', { as: 'image', fetchPriority: 'high', media: '(max-width: 767px)' });
  preload('/hero/ocean-d.webp', { as: 'image', fetchPriority: 'high', media: '(min-width: 768px)' });
  const section = useRef<HTMLElement>(null);
  const state = useRef(createOceanState());
  const [mode, setMode] = useState<'loading' | 'live' | 'still'>('loading');
  const [stage, setStage] = useState<Stage | null>(null);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [small, setSmall] = useState(false);
  const [chapter, setChapter] = useState(0);
  const dim = useMotionValue(1); // Scene 1: the dark before the light
  const exit = useMotionValue(0); // Scene 5: hand-over to the next section
  const darkness = useTransform(dim, (d) => d * 0.85);

  // Load the 3D on the visitor's first sign of life (a scroll, a touch, a key, the mouse moving), never during the
  // page's own load: the still of the opening frame covers the wait, and a phone that is only looking pays nothing.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setMode('still');
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return setMode('still');
    setSmall(Math.min(window.innerWidth, window.innerHeight) < 700);
    let cancelled = false;
    let started = false;
    const events = ['scroll', 'wheel', 'touchstart', 'keydown', 'pointermove'] as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, go));
    function go() {
      if (started) return;
      started = true;
      stop();
      import('./OceanStage')
        .then((mod) => !cancelled && (setStage(mod as unknown as Stage), setMode('live')))
        .catch(() => !cancelled && setMode('still'));
    }
    events.forEach((e) => window.addEventListener(e, go, { passive: true }));
    if (window.scrollY > 0) go(); // arrived part-way down (back button, anchor)
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // The scroll timeline, once the 3D module (which carries GSAP) has arrived.
  useEffect(() => {
    if (!stage || !section.current) return;
    const s = state.current;
    const tl = stage.createOceanTimeline(section.current, s, (p) => {
      const c = chapterAt(p);
      setChapter(c); // between chapters (-1), no words
    });
    tl.eventCallback('onUpdate', () => {
      dim.set(1 - s.light);
      exit.set(s.exit);
    });
    const unsync = stage.syncWithLenis();
    return () => {
      unsync();
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [stage, dim, exit]);

  // Draw only while the section is on screen and the tab is visible.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let onScreen = true;
    const apply = () => setActive(onScreen && document.visibilityState === 'visible');
    const io = new IntersectionObserver((e) => ((onScreen = e.some((x) => x.isIntersecting)), apply()));
    io.observe(el);
    document.addEventListener('visibilitychange', apply);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, []);

  const still = mode === 'still';
  const shown = still ? 0 : chapter;
  const line = shown >= 0 ? LINES[shown] : null;
  const showCard = still || shown === 4;
  const showTitle = !still && shown === 3;

  return (
    <LazyMotion features={domAnimation} strict>
      <section ref={section} aria-label="Sahyadri Pearls: the Filigree Crown ring" className={`relative ${still ? '' : 'h-[560vh] lg:h-[620vh]'}`}>
        <div className={`${still ? 'relative min-h-[100svh]' : 'sticky top-0 h-[100svh]'} overflow-hidden bg-[#0d6066]`}>
          {/* The opening frame as a still: on screen at once; kept for reduced motion. */}
          <picture>
            <source media="(max-width: 767px)" srcSet="/hero/ocean-m.webp" />
            <img
              src="/hero/ocean-d.webp"
              alt=""
              fetchPriority="high"
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${ready ? 'opacity-0' : 'opacity-100'}`}
            />
          </picture>
          {stage && (
            <div aria-hidden className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
              <stage.default state={state.current} frames={frames} count={count} cuts={ringCuts} active={active} small={small} onReady={() => setReady(true)} />
            </div>
          )}
          {/* Scene 1 opens in the dark; Scene 5 hands over to the page below. */}
          {!still && <m.div aria-hidden className="pointer-events-none absolute inset-0 bg-[#02161b]" style={{ opacity: darkness }} />}
          {!still && <m.div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-surface to-transparent" style={{ opacity: exit }} />}

          {/* The words: left on wide screens, at the top on phones. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col px-5 pt-[9vh] lg:justify-center lg:pt-0 lg:pl-[max(3rem,calc((100vw-80rem)/2+2rem))]">
            <div className="relative min-h-[150px] max-w-[560px] lg:min-h-[240px]">
              {/* The page's h1, always present for search engines and screen readers. */}
              <h1 className="sr-only">Sahyadri Pearls: pearl jewellery in gold</h1>
              <AnimatePresence mode="wait">
                {line && (
                  <m.div key={`l${shown}`} {...enter} className={line.tone === 'light' ? 'text-white [text-shadow:0_1px_18px_rgba(4,40,44,0.35)]' : 'text-ink'}>
                    {line.eyebrow && <p className={`lux-track text-[11px] lg:text-[12px] ${line.tone === 'light' ? 'text-white/80' : 'text-gold'}`}>{line.eyebrow}</p>}
                    <p aria-hidden={shown > 0 || undefined} className="mt-3 font-serif text-[40px] leading-[1.02] sm:text-[52px] lg:text-[72px]">
                      {line.first}
                      <br />
                      <em className="font-serif italic">{line.second}</em>
                    </p>
                  </m.div>
                )}
                {showTitle && (
                  <m.div key="title" {...enter} className="text-white [text-shadow:0_1px_18px_rgba(4,40,44,0.4)]">
                    <p className="lux-track text-[11px] text-white/80 lg:text-[12px]">{product.collection}</p>
                    <p className="mt-3 font-serif text-[40px] leading-[1.02] sm:text-[52px] lg:text-[68px]">{product.name}</p>
                    <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/85 lg:text-[16px]">{product.text}</p>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Scene 5: the glass card. */}
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

          {/* scroll cue */}
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
