'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A small ⓘ that explains what something is for. Hover or focus shows it; a tap toggles it (phones).
 * The bubble is drawn on top of the page so the sidebar's scroll area never cuts it off.
 */
export function InfoTip({ text, label = 'What is this for?', className = '' }: { text: string; label?: string; className?: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = pinned || hover;

  useEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = 280;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 8, left });
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && btn.current?.contains(e.target as Node)) return;
      setPinned(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pinned]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((v) => !v);
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-current text-[11px] leading-none font-semibold text-muted transition-colors hover:text-ink focus-visible:text-ink ${className}`}
      >
        i
      </button>
      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280, zIndex: 60 }}
            className="rounded-md bg-ink px-3 py-2 text-xs leading-5 font-normal text-white shadow-lg"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}
