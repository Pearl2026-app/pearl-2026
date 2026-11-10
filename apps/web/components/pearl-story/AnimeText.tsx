'use client';
// Words that arrive letter by letter (owner, 10 Nov: "use anime.js"): anime.js splits the text into characters and
// lifts them in on a stagger; reduced motion shows the words at once. The text stays real text for screen readers.
import { useEffect, useRef, type ReactNode } from 'react';

export function AnimeText({ children, className, delay = 0, as: Tag = 'p' }: { children: ReactNode; className?: string; delay?: number; as?: 'p' | 'span' | 'h2' }) {
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = el.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let undo = () => {};
    let alive = true;
    node.style.visibility = 'hidden';
    import('animejs').then(({ splitText, animate, stagger }) => {
      if (!alive || !el.current) return;
      const split = splitText(node, { chars: true });
      node.style.visibility = '';
      const anim = animate(split.chars, {
        opacity: [0, 1],
        y: ['0.55em', '0em'],
        rotate: [6, 0],
        duration: 900,
        delay: stagger(22, { start: delay }),
        ease: 'outExpo',
      });
      undo = () => {
        anim.revert();
        split.revert();
      };
    });
    return () => {
      alive = false;
      node.style.visibility = '';
      undo();
    };
  }, [delay]);
  return (
    <Tag ref={el as never} className={className}>
      {children}
    </Tag>
  );
}
