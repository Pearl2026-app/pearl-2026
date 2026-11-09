'use client';
// "Turn it in the light": a signature ring turns a full 360° as the visitor scrolls, drawn frame by frame from the
// client's own turntable film (120 stills in /public/turntable/<design>). The stage stays pinned while three short
// lines appear beside the ring, then a link to the piece. Reduced motion: one still with the lines below it.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Caption {
  eyebrow: string;
  title: string;
  text: string;
}

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
/** 0 → 1 → 0 over a window of the scroll, with soft edges. */
const windowed = (p: number, from: number, to: number, edge = 0.06) =>
  clamp((p - from) / edge) * clamp((to - p) / edge);

export function Turntable({
  frames,
  count,
  captions,
  href,
  cta,
}: {
  frames: string;
  count: number;
  captions: Caption[];
  href: string;
  cta: string;
}) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [p, setP] = useState(0);
  const [still, setStill] = useState(false);
  const src = (i: number) => `${frames}/${String(i).padStart(3, '0')}.webp`;

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStill(true);
      return;
    }
    const el = section.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const imgs: HTMLImageElement[] = [];
    let loadedAll = false;
    let current = -1;
    let raf = 0;

    const size = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      current = -1;
    };
    // The nearest frame that has arrived (frames load in the background, the first one at once).
    const nearest = (i: number) => {
      for (let d = 0; d < count; d++) {
        for (const k of [i - d, i + d]) {
          const img = imgs[(k + count) % count];
          if (img?.complete && img.naturalWidth) return img;
        }
      }
      return null;
    };
    const draw = (progress: number) => {
      const i = Math.min(count - 1, Math.floor(progress * count));
      if (i === current) return;
      const img = nearest(i);
      if (!img) return;
      current = img === imgs[i] ? i : -1;
      const s = Math.min(cv.width / img.naturalWidth, cv.height / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    };
    const progressNow = () => {
      const r = el.getBoundingClientRect();
      return clamp(-r.top / Math.max(1, r.height - window.innerHeight));
    };
    const loop = () => {
      const progress = progressNow();
      setP(progress);
      draw(progress);
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const loadAll = () => {
      if (loadedAll) return;
      loadedAll = true;
      for (let i = 1; i < count; i++) {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => draw(progressNow());
        img.src = src(i);
        imgs[i] = img;
      }
    };
    const first = new Image();
    first.onload = () => {
      size();
      draw(progressNow());
    };
    first.src = src(0);
    imgs[0] = first;

    // Fetch the rest only when the section is near, so the home page opens fast.
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && loadAll(), { rootMargin: '1200px 0px' });
    io.observe(el);
    size();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => (size(), onScroll()));
    onScroll();
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, count]);

  if (still) {
    return (
      <section className="nacre border-y border-line py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2 lg:px-8">
          <img src={src(0)} alt="" width={720} height={880} className="mx-auto w-full max-w-sm mix-blend-multiply" />
          <div className="flex flex-col gap-8">
            {captions.map((c) => (
              <div key={c.title}>
                <p className="lux-track text-[12px] text-gold">{c.eyebrow}</p>
                <h3 className="mt-2 font-serif text-2xl text-ink">{c.title}</h3>
                <p className="mt-2 text-muted">{c.text}</p>
              </div>
            ))}
            <Link href={href} className="lux-track inline-flex min-h-12 w-fit items-center bg-ink px-9 text-white">
              {cta}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Ring motion beyond the turn: it rises and grows a little, then settles as the last line appears.
  const scale = 0.82 + 0.2 * Math.sin(Math.min(1, p * 1.15) * Math.PI * 0.5);
  const lift = (1 - clamp(p * 1.6)) * 60;
  const n = captions.length;
  const span = 0.8 / n;

  return (
    <section ref={section} aria-label="The ring, turning" className="relative h-[420vh] lg:h-[460vh]">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden bg-[radial-gradient(70%_60%_at_50%_45%,#fffdf8_0%,#f7f3e9_55%,#ece4d0_100%)]">
        {/* the turning ring */}
        {/* The motion sits on the canvas itself: a transformed wrapper would stop the white of the film from
            blending into the ivory (mix-blend-mode needs the stage as its backdrop). */}
        <div className="relative -mt-[16vh] h-[50vh] w-[min(86vw,41vh)] lg:mt-0 lg:h-[70vh] lg:w-[min(40vw,57vh)]">
          <canvas
            ref={canvas}
            className="h-full w-full mix-blend-multiply will-change-transform"
            style={{ transform: `translate3d(0, ${lift}px, 0) scale(${scale})` }}
            aria-hidden
          />
          {/* a soft contact shadow that breathes with the turn */}
          <span
            aria-hidden
            className="absolute -bottom-2 left-1/2 h-6 w-1/2 -translate-x-1/2 rounded-[50%] bg-ink/15 blur-xl"
            style={{ opacity: 0.5 + 0.3 * Math.abs(Math.cos(p * Math.PI * 2)) }}
          />
        </div>

        {/* the lines, one at a time, alternating sides on desktop and under the ring on phones */}
        {captions.map((c, k) => {
          const o = windowed(p, 0.06 + k * span, 0.06 + (k + 1) * span - 0.02);
          const left = k % 2 === 0;
          return (
            <div
              key={c.title}
              aria-hidden={o < 0.5}
              className={`pointer-events-none absolute inset-x-6 bottom-[9vh] text-center lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:w-[22rem] lg:-translate-y-1/2 lg:text-left ${left ? 'lg:left-[6vw]' : 'lg:right-[6vw]'}`}
              style={{ opacity: o, transform: `translate3d(0, ${(1 - o) * 24}px, 0)` }}
            >
              <p className="lux-track text-[12px] text-gold">{c.eyebrow}</p>
              <h3 className="mt-3 font-serif text-[28px] leading-tight text-ink lg:text-[44px]">{c.title}</h3>
              <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted lg:mx-0">{c.text}</p>
            </div>
          );
        })}

        {/* the way out */}
        <div
          className="absolute inset-x-0 bottom-[8vh] flex justify-center"
          style={{ opacity: clamp((p - 0.86) / 0.08), transform: `translate3d(0, ${(1 - clamp((p - 0.86) / 0.08)) * 20}px, 0)` }}
        >
          <Link
            href={href}
            tabIndex={p > 0.86 ? 0 : -1}
            className="lux-track inline-flex min-h-12 items-center bg-ink px-9 text-white transition-colors hover:bg-gold hover:text-ink"
          >
            {cta}
          </Link>
        </div>

        {/* progress: a thin gold line and the angle */}
        <div aria-hidden className="absolute top-[14vh] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 lg:top-auto lg:bottom-[6vh] lg:left-auto lg:right-[4vw] lg:translate-x-0">
          <span className="lux-track text-[11px] text-muted">{Math.round(p * 360)}°</span>
          <span className="block h-px w-24 bg-line">
            <span className="block h-px bg-gold" style={{ width: `${p * 100}%` }} />
          </span>
        </div>
      </div>
    </section>
  );
}
