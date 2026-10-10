'use client';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@sahyadri/ui';
import type { ImageRef } from '@/lib/types';
import { CloseIcon } from './icons';
import { PearlImage } from './pearl-image';

/** Large gallery with swipe, thumbnails, hover zoom (desktop) and a full-screen pinch-zoom view. */
export function Gallery({ images, video, name }: { images: ImageRef[]; video: string | null; name: string }) {
  const slides = [...images.map((i) => ({ kind: 'image' as const, image: i })), ...(video ? [{ kind: 'video' as const, url: video }] : [])];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);
  const go = (i: number) => {
    setIndex(i);
    track.current?.scrollTo({ left: i * (track.current?.clientWidth ?? 0), behavior: 'smooth' });
  };
  const current = slides[index];

  return (
    <div className="lg:grid lg:grid-cols-[72px_1fr] lg:gap-4">
      <ul className="hidden flex-col gap-3 lg:flex" aria-label="Choose image">
        {slides.map((s, i) => (
          <li key={i}>
            <button onClick={() => go(i)} aria-label={s.kind === 'video' ? 'Play video' : `Image ${i + 1}`} aria-current={i === index} className={cx('block w-full border', i === index ? 'border-ink' : 'border-transparent')}>
              {s.kind === 'image' ? <PearlImage image={s.image} sizes="72px" className="aspect-square w-full object-cover" alt="" /> : <span className="flex aspect-square items-center justify-center bg-surface-muted text-xs">▶ Video</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="relative">
        <div ref={track} className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto lg:mx-0" aria-roledescription="carousel" aria-label={`${name} images`}>
          {slides.map((s, i) => (
            <div key={i} className="w-full shrink-0 snap-center" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}`}>
              {s.kind === 'image' ? (
                <button
                  className="group block w-full cursor-zoom-in overflow-hidden bg-surface"
                  onClick={() => setZoom(true)}
                  onMouseMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
                  }}
                  aria-label="Zoom image"
                >
                  <PearlImage image={s.image} priority={i === 0} sizes="(min-width: 1024px) 55vw, 100vw" alt={s.image.alt ?? name} className="aspect-square w-full object-cover transition-transform duration-500 lg:group-hover:scale-[1.6]" style={{ transformOrigin: origin }} />
                </button>
              ) : (
                <video src={s.url} controls playsInline preload="metadata" className="aspect-square w-full bg-ink object-contain" aria-label={`${name} video`} />
              )}
            </div>
          ))}
        </div>
        {slides.length > 1 && (
          <div className="mt-3 flex justify-center gap-2 lg:hidden" aria-hidden>
            {slides.map((_, i) => <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i === index ? 'bg-ink' : 'bg-line')} />)}
          </div>
        )}
      </div>
      {zoom && current?.kind === 'image' && (
        <div className="fixed inset-0 z-50 overflow-auto bg-surface" role="dialog" aria-modal="true" aria-label="Zoomed image">
          <button onClick={() => setZoom(false)} className="fixed top-4 right-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-bg shadow" aria-label="Close zoom">
            <CloseIcon />
          </button>
          {/* Native pinch-zoom works on the full-size image */}
          <img src={current.image.variants?.['1600'] ?? current.image.url} alt={current.image.alt ?? name} className="mx-auto h-auto min-h-full w-full max-w-[1600px] object-contain" />
        </div>
      )}
    </div>
  );
}
