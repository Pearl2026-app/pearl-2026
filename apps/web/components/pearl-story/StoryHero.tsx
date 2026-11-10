'use client';
// A scroll-told 3D story of a pearl coming out of the farm (owner, 10 Nov), in one of three versions (versions.ts).
// The 3D (Stage.tsx: React Three Fiber, post-processing) loads on the visitor's first move; GSAP ScrollTrigger turns the
// scroll into one smoothed progress value; Motion (motion/react) brings the words and the card in and out, and
// anime.js lifts the words in letter by letter. Reduced motion or no WebGL: a
// calm still of the opening with the words and the buttons.
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AnimeText } from './AnimeText';
import type { StageProps } from './Stage';
import { versionBySlug } from './versions';

export interface StoryProduct {
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

export function StoryHero({ slug, product, frames, count, tabs }: { slug: string; product: StoryProduct; frames: string; count: number; tabs?: ReactNode }) {
  const version = versionBySlug(slug)!;
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [Stage, setStage] = useState<ComponentType<StageProps> | null>(null);
  const [mode, setMode] = useState<'loading' | 'live' | 'still'>('loading');
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const [small, setSmall] = useState(false);
  const [p, setP] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setMode('still');
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return setMode('still');
    setSmall(Math.min(window.innerWidth, window.innerHeight) < 700);
    let cancelled = false;
    let started = false;
    const events = ['pointermove', 'scroll', 'wheel', 'touchstart', 'keydown'] as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, go));
    function go() {
      if (started) return;
      started = true;
      stop();
      import('./Stage')
        .then((mod) => {
          if (cancelled) return;
          setStage(() => mod.default);
          setMode('live');
        })
        .catch(() => !cancelled && setMode('still'));
    }
    events.forEach((e) => window.addEventListener(e, go, { passive: true }));
    if (window.scrollY > 0) go();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // scroll → one smoothed progress value
  useEffect(() => {
    if (mode !== 'live' || !section.current) return;
    let kill = () => {};
    let alive = true;
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (!alive || !section.current) return;
      gsap.registerPlugin(ScrollTrigger);
      const s = { p: 0 };
      let shown = -1;
      const tween = gsap.to(s, {
        p: 1,
        ease: 'none',
        scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom bottom', scrub: 1 },
        onUpdate: () => {
          progress.current = s.p;
          const q = Math.round(s.p * 200) / 200; // re-render the words only when it matters
          if (q !== shown) {
            shown = q;
            setP(q);
          }
        },
      });
      const lenis = (window as unknown as { __lenis?: { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void } }).__lenis;
      const sync = () => ScrollTrigger.update();
      lenis?.on('scroll', sync);
      kill = () => {
        lenis?.off('scroll', sync);
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });
    return () => {
      alive = false;
      kill();
    };
  }, [mode]);

  // draw only while on screen and the tab is visible
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let on = true;
    const apply = () => setActive(on && document.visibilityState === 'visible');
    const io = new IntersectionObserver((e) => ((on = e.some((x) => x.isIntersecting)), apply()));
    io.observe(el);
    document.addEventListener('visibilitychange', apply);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', apply);
    };
  }, []);

  const still = mode === 'still';
  const inSpan = ([a, b]: [number, number]) => p >= a && p < b;
  const lineIdx = still ? 0 : version.lines.findIndex((l) => inSpan(l.at));
  const line = lineIdx >= 0 ? version.lines[lineIdx] : null;
  const showTitle = !still && inSpan(version.title);
  const showCard = still || inSpan(version.card);
  const opening = version.startDark ? 'bg-[#06343b]' : 'bg-[linear-gradient(180deg,#bfd6e3_0%,#f6d6cf_46%,#2aa7a0_47%,#1d8d88_100%)]';

  return (
    <LazyMotion features={domAnimation} strict>
      <section ref={section} aria-label={`The story of a pearl: ${version.name}`} className={`relative ${still ? '' : 'h-[640vh] lg:h-[720vh]'}`}>
        <div className={`${still ? 'relative min-h-[100svh]' : 'sticky top-0 h-[100svh]'} overflow-hidden ${opening}`}>
          {Stage && (
            <div aria-hidden className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
              <Stage version={version} progress={progress} frames={frames} count={count} active={active} small={small} onReady={() => setReady(true)} />
            </div>
          )}
          {/* the opening comes up out of the dark */}
          <m.div aria-hidden className="pointer-events-none absolute inset-0 bg-[#021a1f]" initial={{ opacity: still ? 0 : 0.9 }} animate={{ opacity: ready || still ? 0 : 0.9, transition: { duration: 2.2, ease: 'easeOut' } }} />
          {/* the three stories' tabs stay on screen through the whole story */}
          {tabs && <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-4 pt-4">{tabs}</div>}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(3,40,46,0.42),rgba(3,40,46,0.12)_40%,transparent_60%)] max-lg:bg-[linear-gradient(180deg,rgba(3,40,46,0.45),rgba(3,40,46,0.08)_38%,transparent_55%)]" />

          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-full flex-col px-5 pt-[calc(9vh+56px)] lg:justify-center lg:pt-0 lg:pl-[max(3rem,calc((100vw-80rem)/2+2rem))]">
            <div className="relative min-h-[150px] max-w-[580px] lg:min-h-[240px]">
              <h1 className="sr-only">Sahyadri Pearls: pearl jewellery in gold</h1>
              <AnimatePresence mode="wait">
                {line && (
                  <m.div key={`l${lineIdx}`} {...enter} className="text-white [text-shadow:0_1px_22px_rgba(2,30,36,0.45)]">
                    {line.eyebrow && <p className="lux-track text-[11px] text-white/85 lg:text-[12px]">{line.eyebrow}</p>}
                    <AnimeText delay={120} className="mt-3 font-serif text-[40px] leading-[1.03] sm:text-[52px] lg:text-[72px]">
                      {line.first}
                      {line.second && (
                        <>
                          <br />
                          <em className="font-serif italic">{line.second}</em>
                        </>
                      )}
                    </AnimeText>
                  </m.div>
                )}
                {showTitle && (
                  <m.div key="title" {...enter} className="text-white [text-shadow:0_1px_22px_rgba(2,30,36,0.5)]">
                    <p className="lux-track text-[11px] text-white/85 lg:text-[12px]">{product.collection}</p>
                    <AnimeText delay={120} className="mt-3 font-serif text-[40px] leading-[1.02] sm:text-[52px] lg:text-[68px]">
                      {product.name}
                    </AnimeText>
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
            {!still && p < 0.04 && (
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
