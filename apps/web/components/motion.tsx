'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * The site's motion layer (client brief, 4 Nov: smooth, cursor-led animation over a glass finish).
 * One component, mounted once, that:
 * - smooths scrolling (Lenis) on pointer devices,
 * - draws a gold cursor dot and a trailing ring that grows over links and shows a label over [data-cursor],
 * - tilts [data-tilt] cards towards the pointer with a moving glare,
 * - pulls [data-magnetic] buttons a little towards the pointer,
 * - fades [data-reveal] blocks in as they scroll into view,
 * - swings .hang items on the hanging line as the cursor passes.
 * Everything is skipped for reduced motion; touch devices get reveal only (no cursor, no tilt).
 */
export function Motion() {
  const pathname = usePathname();
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  // Reveal on scroll: re-scan on every route change.
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.add('motion-ready');
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)'));
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    els.forEach((e) => io.observe(e));
    // Content added later (client lists) is picked up by a light mutation watch.
    const mo = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)').forEach((e) => io.observe(e));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  // Pointer effects and smooth scroll: once.
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduce || !fine) return;

    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let raf = 0;
    let alive = true;
    void import('lenis').then(({ default: Lenis }) => {
      if (!alive) return;
      lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9, smoothWheel: true });
    });

    document.documentElement.classList.add('has-cursor');
    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    const ringPos = { ...target };
    let tilted: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      dot.current?.classList.remove('is-hidden');
      ring.current?.classList.remove('is-hidden');
      const el = e.target as HTMLElement | null;

      // Ring state: label beats hover.
      const withLabel = el?.closest<HTMLElement>('[data-cursor]');
      const interactive = el?.closest('a, button, [role="button"], input, select, textarea, label');
      ring.current?.classList.toggle('is-label', !!withLabel);
      ring.current?.classList.toggle('is-hover', !withLabel && !!interactive);
      if (label.current) label.current.textContent = withLabel?.dataset.cursor ?? '';

      // Tilt.
      const card = el?.closest<HTMLElement>('[data-tilt]') ?? null;
      if (tilted && tilted !== card) resetTilt(tilted);
      tilted = card;
      if (card) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const max = Number(card.dataset.tilt) || 8;
        card.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
        card.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        card.classList.add('is-tilting');
      }

      // Magnetic buttons.
      const m = el?.closest<HTMLElement>('[data-magnetic]') ?? null;
      if (magnet && magnet !== m) magnet.style.transform = '';
      magnet = m;
      if (m) {
        const r = m.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        m.style.transform = `translate(${dx * 0.25}px, ${dy * 0.3}px)`;
      }

      // The hanging line: items near the cursor swing away from it.
      document.querySelectorAll<HTMLElement>('.hang').forEach((h) => {
        const r = h.getBoundingClientRect();
        if (e.clientY < r.top - 80 || e.clientY > r.bottom) return h.style.setProperty('--swing', '0deg');
        const cx = r.left + r.width / 2;
        const d = e.clientX - cx;
        const near = Math.max(0, 1 - Math.abs(d) / (r.width * 1.2));
        h.style.setProperty('--swing', `${(-Math.sign(d) * near * 9).toFixed(2)}deg`);
      });

      // Parallax layers inside [data-parallax-root].
      document.querySelectorAll<HTMLElement>('[data-parallax-root]').forEach((root) => {
        const r = root.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom) return;
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        root.querySelectorAll<HTMLElement>('[data-depth]').forEach((layer) => {
          const depth = Number(layer.dataset.depth) || 10;
          layer.style.transform = `translate3d(${(-nx * depth).toFixed(1)}px, ${(-ny * depth).toFixed(1)}px, 0)`;
        });
      });
    };
    const resetTilt = (c: HTMLElement) => {
      c.classList.remove('is-tilting');
      c.style.setProperty('--rx', '0deg');
      c.style.setProperty('--ry', '0deg');
    };
    const onLeave = () => {
      dot.current?.classList.add('is-hidden');
      ring.current?.classList.add('is-hidden');
      if (tilted) resetTilt(tilted);
      if (magnet) magnet.style.transform = '';
      document.querySelectorAll<HTMLElement>('.hang').forEach((h) => h.style.setProperty('--swing', '0deg'));
    };

    const loop = (t: number) => {
      ringPos.x += (target.x - ringPos.x) * 0.18;
      ringPos.y += (target.y - ringPos.y) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)`;
      lenis?.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      lenis?.destroy();
      document.documentElement.classList.remove('has-cursor');
    };
  }, []);

  return (
    <>
      <div ref={dot} aria-hidden className="cursor-dot is-hidden hidden [.has-cursor_&]:block" />
      <div ref={ring} aria-hidden className="cursor-ring is-hidden hidden [.has-cursor_&]:flex">
        <span ref={label} />
      </div>
    </>
  );
}
