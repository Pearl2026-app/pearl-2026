'use client';
import { useState } from 'react';
import { api, ApiError, errorText } from '@/lib/api';

/** Footer sign-up. Nothing is stored unless the visitor ticks the consent box. */
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (state === 'done') return <p className="text-sm" role="status">Thank you. You will hear from us about new collections and private previews.</p>;
  return (
    <form
      className="flex w-full max-w-md flex-col gap-3"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) return setError('Please tick the box to agree to receive our emails.');
        setState('busy');
        setError(null);
        try {
          await api('/newsletter', { method: 'POST', json: { email, consent: true, source: 'footer' } });
          setState('done');
        } catch (err) {
          setError(err instanceof ApiError && err.fields?.email ? err.fields.email : errorText(err));
          setState('idle');
        }
      }}
    >
      <div className="flex">
        <label htmlFor="nl-email" className="sr-only">Email address</label>
        <input id="nl-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email address" className="min-h-12 flex-1 border border-line bg-surface px-3 focus:border-accent focus:outline-none" />
        <button type="submit" disabled={state === 'busy'} className="min-h-12 bg-accent px-5 text-sm text-white hover:bg-accent-hover disabled:opacity-70">{state === 'busy' ? 'Joining…' : 'Join'}</button>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        I agree to receive emails from Sahyadri Pearls. I can unsubscribe at any time.
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  );
}
