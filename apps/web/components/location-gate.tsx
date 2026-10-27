'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const CITY_COOKIE = 'sp_city';
const ASKED_COOKIE = 'sp_city_asked';
const hasCookie = (name: string) => typeof document !== 'undefined' && document.cookie.includes(`${name}=`);

interface PinResult {
  pincode: string;
  district: string;
  state: string;
  city: { slug: string; name: string } | null;
  nearestStore: { name: string; km: number | null } | null;
}

/**
 * The first thing on the landing page (client, 27 Oct): ask where to deliver, so the shopper only ever
 * sees pieces available to their address. Skipping browses all of India; the header picker can change it later.
 */
export function LocationGate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<PinResult | null>(null);

  useEffect(() => {
    // Ask once, and never when a city is already known (typed earlier, or detected from the connection).
    const t = setTimeout(() => {
      if (!hasCookie(CITY_COOKIE) && !hasCookie(ASKED_COOKIE)) setOpen(true);
    }, 600);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    document.cookie = `${ASKED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(pin)) return setError('Enter a 6-digit PIN code.');
    setBusy(true);
    try {
      const r = await api<PinResult>(`/geo/pincode/${pin}`);
      setFound(r);
      try {
        localStorage.setItem('sp_pin', pin);
      } catch {
        /* private window */
      }
      if (r.city) {
        document.cookie = `${CITY_COOKIE}=${r.city.slug}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        document.cookie = `${ASKED_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        setTimeout(() => {
          setOpen(false);
          router.refresh();
        }, 900);
      }
    } catch {
      setError('That PIN code could not be checked. You can skip and pick a city later.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Where should we deliver?" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="fade-in w-full max-w-md bg-surface p-7 text-center sm:p-9">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={44} height={44} className="mx-auto mb-4 rounded-xl" />
        <h2 className="font-serif text-2xl">Where should we deliver?</h2>
        <p className="mt-2 text-sm text-muted">We show only the pieces available at your address.</p>
        <form onSubmit={submit} className="mt-5 flex gap-2">
          <input
            inputMode="numeric"
            autoFocus
            maxLength={6}
            placeholder="PIN code"
            aria-label="PIN code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="min-h-12 w-full border border-line bg-surface px-4 text-center text-lg tracking-[0.2em] focus:border-ink focus:outline-none"
          />
          <button type="submit" disabled={busy} className="lux-track min-h-12 shrink-0 bg-accent px-6 text-white hover:bg-accent-hover disabled:opacity-60">
            {busy ? '…' : 'Show'}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {found && found.city && (
          <p className="mt-3 text-sm">
            Delivering to <strong>{found.district}, {found.state}</strong>
            {found.nearestStore ? ` · nearest store ${found.nearestStore.name}${found.nearestStore.km != null ? `, ${found.nearestStore.km} km` : ''}` : ''}
          </p>
        )}
        {found && !found.city && (
          <p className="mt-3 text-sm">
            We deliver to <strong>{found.district}, {found.state}</strong> from our nearest city — browse everything and order freely.
          </p>
        )}
        <button onClick={dismiss} className="mt-5 text-sm text-muted underline underline-offset-4 hover:text-ink">
          Skip — browse all of India
        </button>
      </div>
    </div>
  );
}
