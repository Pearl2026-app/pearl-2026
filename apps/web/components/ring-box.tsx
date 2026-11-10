'use client';
// "The reveal" (owner, 10 Nov: props, not text; an oyster, not a box): a pearl oyster rests on the ivory ground. Scrolling opens the
// shell, the Filigree Crown ring rises out of the mother-of-pearl, the camera moves in and the ring turns 360°, then a
// link to the piece. The oyster is real 3D (three.js, loaded only when the section is near); the ring is the client's
// own turntable film. Reduced motion, or a browser without WebGL: the earlier frame-by-frame turntable (its still
// version for reduced motion).
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { RingBoxScene } from './ring-box-scene';
import { Turntable } from './turntable';

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

type Caption = { eyebrow: string; title: string; text: string };

export function RingBox({ frames, count, href, cta, captions }: { frames: string; count: number; href: string; cta: string; captions: Caption[] }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);
  const [ready, setReady] = useState(false);
  const [p, setP] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setFallback(true);
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return setFallback(true);

    const el = section.current;
    const host = stage.current;
    if (!el || !host) return;
    let scene: RingBoxScene | null = null;
    let lastW = 0;
    let lastH = 0;
    let disposed = false;
    let raf = 0;

    const progressNow = () => {
      const r = el.getBoundingClientRect();
      return clamp(-r.top / Math.max(1, r.height - window.innerHeight));
    };
    // Build the box only once the visitor is scrolling and the section is near: never during the first load,
    // so three.js and the shader set-up cost the first screen nothing.
    let near = false;
    let loading = false;
    const build = () => {
      if (loading || disposed || !near || window.scrollY < 40) return;
      loading = true;
      import('./ring-box-scene')
        .then((m) => {
          if (disposed) return;
          scene = m.createRingBoxScene(host, { frames, count });
          lastW = host.clientWidth;
          lastH = host.clientHeight;
          scene.resize();
          scene.update(progressNow());
          setReady(true);
        })
        .catch(() => setFallback(true));
    };
    const tick = () => {
      raf = 0;
      build();
      const q = progressNow();
      scene?.update(q);
      setP(q);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onResize = () => {
      // Phones resize the viewport as the address bar slides; only redraw for a real change.
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 120) return;
      lastW = w;
      lastH = h;
      scene?.resize();
      onScroll();
    };

    const io = new IntersectionObserver(
      (entries) => {
        near = entries.some((e) => e.isIntersecting);
        if (near) build();
      },
      { rootMargin: '80% 0px' },
    );
    io.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    onScroll();
    return () => {
      disposed = true;
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      scene?.dispose();
    };
  }, [frames, count]);

  if (fallback) return <Turntable frames={frames} count={count} href={href} cta={cta} captions={captions} />;

  // Overlays: a quiet scroll cue at the start, the angle while the ring turns, the link at the end. No captions.
  // (0.52–0.96 is the turn in STAGES of ring-box-scene.ts; repeated here so three.js stays out of the page bundle.)
  const turn = clamp((p - 0.52) / 0.44);
  const showTurn = clamp((p - 0.5) / 0.04) * (1 - clamp((p - 0.97) / 0.03));
  const showCta = clamp((p - 0.9) / 0.06);
  return (
    <section ref={section} aria-label="The Filigree Crown ring, in its oyster" className="relative h-[460vh] lg:h-[520vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-bg">
        <div ref={stage} aria-hidden className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`} />

        {/* scroll cue: a fine gold line that draws downward */}
        <div aria-hidden className="absolute inset-x-0 bottom-[7vh] flex justify-center" style={{ opacity: 1 - clamp(p / 0.05) }}>
          <span className="scroll-cue block h-12 w-px bg-gold/70" />
        </div>

        {/* the angle while it turns */}
        <div aria-hidden className="absolute top-[12vh] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2" style={{ opacity: showTurn }}>
          <span className="lux-track text-[11px] text-muted">{Math.round(turn * 360)}°</span>
          <span className="block h-px w-24 bg-line">
            <span className="block h-px bg-gold" style={{ width: `${turn * 100}%` }} />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-[8vh] flex justify-center" style={{ opacity: showCta, transform: `translate3d(0, ${(1 - showCta) * 20}px, 0)` }}>
          <Link
            href={href}
            tabIndex={showCta > 0.5 ? 0 : -1}
            className="lux-track inline-flex min-h-12 items-center bg-ink px-9 text-white transition-colors hover:bg-gold hover:text-ink"
          >
            {cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
