'use client';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

/** A button, not an automatic action on page load, so link scanners in email clients cannot unsubscribe people. */
export function Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<{ done?: string; error?: string; busy?: boolean }>({});
  if (!token) return <p className="text-muted">This link is incomplete. Please use the unsubscribe link from our email.</p>;
  if (state.done) return <p role="status">{state.done} will no longer receive our newsletter.</p>;
  return (
    <div className="flex flex-col items-start gap-3">
      <p>Stop receiving the Sahyadri Pearls newsletter?</p>
      <button
        className="min-h-12 bg-accent px-6 text-white hover:bg-accent-hover disabled:opacity-70"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          try {
            const r = await api<{ email: string }>('/newsletter/unsubscribe', { method: 'POST', json: { token } });
            setState({ done: r.email });
          } catch (e) {
            setState({ error: errorText(e) });
          }
        }}
      >
        Unsubscribe
      </button>
      {state.error && <p role="alert" className="text-danger">{state.error}</p>}
    </div>
  );
}
