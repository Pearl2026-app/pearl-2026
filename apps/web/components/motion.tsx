'use client';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * The site's motion layer: smooth scrolling and gentle fade-ins, nothing more (simple and premium, 8 Nov).
 * One component, mounted once, that:
 * - smooths scrolling (Lenis) on pointer devices,
 * - fades [data-reveal] blocks in as they scroll into view ([data-reveal="3d"] also tips up from a slight 3D tilt),
 * - moves [data-depth] pictures a little slower or faster than the page (depth="0.12" etc.) for a sense of depth.
 * Everything is skipped for reduced motion; touch devices get the fade-ins and depth only.
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

  // Depth: [data-depth] elements drift with the scroll, relative to the middle of the screen.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      document.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
        const host = (el.parentElement ?? el).getBoundingClientRect();
        if (host.bottom < -200 || host.top > vh + 200) return;
        const depth = Number(el.dataset.depth) || 0.1;
        const offset = (host.top + host.height / 2 - vh / 2) * depth;
        el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(${1 + Math.abs(depth) * 0.9})`;
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
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
