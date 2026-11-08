'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The site's motion layer: smooth scrolling and gentle fade-ins, nothing more (simple and premium, 8 Nov).
 * One component, mounted once, that:
 * - smooths scrolling (Lenis) on pointer devices,
 * - fades [data-reveal] blocks in as they scroll into view,
 * Everything is skipped for reduced motion; touch devices get the fade-ins only.
 */
export function Motion() {
  const pathname = usePathname();

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

  // Smooth scroll on pointer devices: once. The custom cursor, tilt and magnetic buttons were removed on
  // 8 Nov for a plainer, easier site (the client asked for simple, minimal and premium).
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduce || !fine) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let raf = 0;
    let alive = true;
    void import('lenis').then(({ default: Lenis }) => {
      if (!alive) return;
      lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.95, smoothWheel: true });
      const loop = (t: number) => {
        lenis?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);

  return null;
}
