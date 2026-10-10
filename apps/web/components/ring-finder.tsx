'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ProductCard } from './product-card';
import { Notice } from './form-bits';
import { api, errorText } from '@/lib/api';
import type { ProductCard as Card } from '@/lib/types';

interface Answers { occasion?: string; budgetMax?: number; style?: string; metal: string; colour?: string; shape?: string; ringSize?: string }
interface Result { results: Array<{ product: Card; reason: string }>; relaxed: string[]; handoff: boolean }

const METAL_LABEL: Record<string, string> = { 'yellow-gold': 'Yellow gold', 'rose-gold': 'Rose gold', 'white-gold': 'White gold', silver: 'Silver', any: 'No preference' };
const STEPS: Array<{ key: keyof Answers; question: string; options: Array<{ value: string; label: string }>; hint?: string }> = [
  { key: 'occasion', question: 'What is the ring for?', options: ['Engagement', 'Anniversary', 'Gift', 'Everyday', 'Festive'].map((v) => ({ value: v, label: v })) },
  { key: 'budgetMax', question: 'What is your budget?', options: [['10000', 'Up to ₹10,000'], ['20000', 'Up to ₹20,000'], ['35000', 'Up to ₹35,000'], ['60000', 'Up to ₹60,000'], ['', 'No limit']].map(([value, label]) => ({ value: value!, label: label! })) },
  { key: 'style', question: 'Which style do you like?', options: ['Classic', 'Modern', 'Statement', 'Minimal', 'Traditional'].map((v) => ({ value: v, label: v })) },
  { key: 'metal', question: 'Which metal?', options: Object.entries(METAL_LABEL).map(([value, label]) => ({ value, label })) },
  { key: 'colour', question: 'Which pearl colour?', options: ['White', 'Cream', 'Golden', 'Rose', 'Silver', 'Black', 'Any'].map((v) => ({ value: v, label: v })) },
  { key: 'shape', question: 'Which pearl shape?', options: ['Round', 'Button', 'Drop', 'Baroque', 'Any'].map((v) => ({ value: v, label: v })) },
  { key: 'ringSize', question: 'Do you know the ring size?', hint: 'Indian ring sizes. We can resize most rings after purchase.', options: [...['8', '10', '12', '14', '16', '18', '20'].map((v) => ({ value: v, label: `Size ${v}` })), { value: '', label: 'Not sure' }] },
];

/** Guided Ring Finder: a few taps, then real in-stock rings with a reason each, or a hand-off to a custom design. */
export function RingFinder() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({ metal: 'any' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const search = async (answers: Answers) => {
    setBusy(true);
    setError(null);
    try {
      const city = document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1];
      setResult(
        await api<Result>('/ring-finder', {
          method: 'POST',
          timeoutMs: 15_000,
          json: { occasion: answers.occasion, budgetMaxPaise: answers.budgetMax ? answers.budgetMax * 100 : undefined, style: answers.style, metal: answers.metal, colour: answers.colour, shape: answers.shape, ringSize: answers.ringSize, citySlug: city },
        }),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = (value: string) => {
    const s = STEPS[step]!;
    const next = { ...a, [s.key]: s.key === 'budgetMax' ? (value ? Number(value) : undefined) : value || undefined } as Answers;
    setA(next);
    if (step + 1 < STEPS.length) setStep(step + 1);
    else void search(next);
  };
  const handOff = () => {
    try {
      sessionStorage.setItem('sp_ring_finder', JSON.stringify({ ...a, metal: METAL_LABEL[a.metal] ?? a.metal }));
    } catch {
      /* private mode: the form still opens, just empty */
    }
    router.push('/customized-jewellery?from=ring-finder');
  };

  if (result || busy || error) {
    return (
      <div aria-live="polite">
        {busy && <p className="py-10 text-center text-muted">Finding rings for you…</p>}
        {error && <Notice tone="danger">{error}</Notice>}
        {result && result.results.length > 0 && (
          <>
            {result.relaxed.length > 0 && <p className="mb-4 text-sm text-muted">Nothing matched every choice, so we relaxed: {result.relaxed.join(', ')}.</p>}
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
              {result.results.map((r) => (
                <li key={r.product.id}>
                  <ProductCard p={r.product} />
                  <p className="mt-2 text-sm text-muted">{r.reason}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        {result && (
          <div className="mt-10 border-t border-line pt-6">
            <p className="font-serif text-xl">{result.results.length ? 'Not quite right?' : 'We have nothing in stock that fits yet.'}</p>
            <p className="mt-1 text-sm text-muted">Our craftspeople can make a ring to your answers.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handOff} className="inline-flex min-h-12 items-center bg-accent px-6 text-white hover:bg-accent-hover">Design a ring with us</button>
              <button type="button" onClick={() => { setResult(null); setStep(0); setA({ metal: 'any' }); }} className="inline-flex min-h-12 items-center border border-line px-6">Start again</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const s = STEPS[step]!;
  return (
    <div>
      <p className="eyebrow mb-2">Question {step + 1} of {STEPS.length}</p>
      <div className="mb-6 h-1 w-full bg-surface-muted"><div className="h-1 bg-accent transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <h2 className="font-serif text-2xl" id="rf-q">{s.question}</h2>
      {s.hint && <p className="mt-1 text-sm text-muted">{s.hint}</p>}
      <div role="group" aria-labelledby="rf-q" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {s.options.map((o) => (
          <button key={o.label} type="button" onClick={() => choose(o.value)} className="min-h-14 border border-line bg-surface px-4 text-left hover:border-ink focus-visible:border-ink">
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-6 flex gap-4 text-sm">
        {step > 0 && <button type="button" className="underline" onClick={() => setStep(step - 1)}>Back</button>}
        <Link href="/jewellery/rings" className="text-muted underline">Browse all rings instead</Link>
      </div>
    </div>
  );
}
