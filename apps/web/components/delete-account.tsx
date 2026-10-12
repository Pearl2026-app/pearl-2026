'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Notice } from './form-bits';

/** Account deletion (also required for the app stores). Asks the customer to type DELETE first. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="mt-12 max-w-xl border-t border-line pt-6">
      <h2 className="font-serif text-xl">Delete my account</h2>
      <p className="mt-2 text-sm text-muted">Your name, number, email, addresses and wishlist are erased and you are signed out everywhere. Past orders and invoices are kept because tax law requires it. This cannot be undone.</p>
      {!open ? (
        <button type="button" className="mt-3 text-sm text-danger underline" onClick={() => setOpen(true)}>Delete my account</button>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {error && <Notice tone="danger">{error}</Notice>}
          <label className="text-sm">
            Type <strong>DELETE</strong> to confirm
            <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 block min-h-12 w-full border border-line bg-surface px-3" autoCapitalize="characters" />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={text !== 'DELETE' || busy}
              className="min-h-12 bg-danger px-5 text-white disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await api('/me/delete-account', { method: 'POST', json: { confirm: 'DELETE' } });
                  await api('/auth/logout', { method: 'POST', json: {} }).catch(() => undefined);
                  window.location.href = '/delete-account?done=1';
                } catch (e) {
                  setError(errorText(e));
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button type="button" className="min-h-12 border border-line px-5" onClick={() => setOpen(false)}>Keep my account</button>
          </div>
        </div>
      )}
    </section>
  );
}
