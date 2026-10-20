'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { PinIcon } from './icons';
import { useSite } from './site-context';

const COOKIE = 'sp_city';
const PIN_KEY = 'sp_pin';
const readCookie = () => document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] ?? '';
const writeCookie = (slug: string) => {
  document.cookie = `${COOKIE}=${slug}; path=/; max-age=${slug ? 60 * 60 * 24 * 365 : 0}; samesite=lax`;
};

interface PinResult {
  pincode: string;
  district: string;
  state: string;
  city: { slug: string; name: string } | null;
  nearestStore: { name: string; km: number | null } | null;
}

/**
 * "Deliver to": the shopper's city decides which pieces and offers they see, like Zepto or Blinkit. It is worked
 * out from the PIN code they type; before that, from the city their connection reports. They can always pick a city
 * or All India by hand.
 */
export function LocationPicker({ compact = false }: { compact?: boolean }) {
  const site = useSite();
  const router = useRouter();
  const [city, setCity] = useState('');
  const [pin, setPin] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<PinResult | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = readCookie();
    setCity(c);
    try {
      setPin(localStorage.getItem(PIN_KEY) ?? '');
    } catch {
      /* ignore */
    }
    // First visit: start from the city the connection reports, if we deliver there.
    if (!c && !document.cookie.includes('sp_city_auto=1')) {
      document.cookie = 'sp_city_auto=1; path=/; max-age=31536000; samesite=lax';
      void api<{ city: { slug: string } | null }>('/geo/ip-city')
        .then((r) => {
          if (r.city) {
            writeCookie(r.city.slug);
            setCity(r.city.slug);
            router.refresh();
          }
        })
        .catch(() => undefined);
    }
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (slug: string) => {
    writeCookie(slug);
    setCity(slug);
    router.refresh();
  };

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFound(null);
    if (!/^\d{6}$/.test(pin)) return setError('Enter a 6-digit PIN code.');
    setBusy(true);
    try {
      const r = await api<PinResult>(`/geo/pincode/${pin}`);
      setFound(r);
      try {
        localStorage.setItem(PIN_KEY, pin);
      } catch {
        /* ignore */
      }
      if (r.city) choose(r.city.slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const name = site.cities.find((c) => c.slug === city)?.name;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 py-2 text-left text-sm hover:text-accent ${compact ? '' : 'mr-2'}`}
      >
        <PinIcon width={16} height={16} />
        <span className="leading-tight">
          <span className="block text-[11px] text-muted">Deliver to</span>
          <span className="block max-w-[9rem] truncate text-ink">
            {name ?? 'All India'}
            {pin && name ? ` ${pin}` : ''}
          </span>
        </span>
      </button>
      {open && (
        <div className="fade-in absolute right-0 z-50 mt-1 w-[19rem] border border-line bg-surface p-4 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.3)]">
          <p className="font-serif text-lg">Where should we deliver?</p>
          <p className="mt-1 text-xs text-muted">We show the pieces and offers of the store nearest you.</p>
          <form onSubmit={check} className="mt-3 flex gap-2">
            <input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN code"
              aria-label="PIN code"
              className="min-h-11 w-full border border-line bg-bg px-3 text-sm"
            />
            <button type="submit" disabled={busy} className="min-h-11 bg-accent px-4 text-sm text-white disabled:opacity-60">
              {busy ? '…' : 'Check'}
            </button>
          </form>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          {found && (
            <p className="mt-2 text-xs">
              {found.district}, {found.state}
              {found.nearestStore && (
                <>
                  <br />
                  Nearest store: <strong>{found.nearestStore.name}</strong>
                  {found.nearestStore.km != null && ` · about ${found.nearestStore.km} km`}
                </>
              )}
            </p>
          )}
          <label className="mt-4 block text-xs text-muted">
            Or choose a city
            <select
              value={city}
              onChange={(e) => {
                choose(e.target.value);
                setOpen(false);
              }}
              className="mt-1 min-h-11 w-full border border-line bg-bg px-2 text-sm text-ink"
            >
              <option value="">All India</option>
              {site.cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
