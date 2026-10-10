'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { Notice } from '@/components/form-bits';
import { Container } from '@/components/ui';
import { api, errorText } from '@/lib/api';

/** Test payment page used until live gateway keys arrive. It never appears in production. */
function Sandbox() {
  const sp = useSearchParams();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(15 * 60);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const po = sp.get('po')!;
  const done = `/order/${encodeURIComponent(sp.get('n') ?? '')}/confirmed?t=${sp.get('t')}`;
  const pay = async (outcome: 'success' | 'failure') => {
    setBusy(true);
    try {
      await api(`/payments/sandbox/${po}/complete`, { method: 'POST', json: { outcome } });
      router.push(done);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Container className="max-w-lg py-16">
      <p className="eyebrow">Test payment</p>
      <h1 className="mt-2 font-serif text-4xl">Pay {formatINR(Number(sp.get('a') ?? 0))}</h1>
      <p className="mt-3 text-sm text-muted">
        The payment gateway is in test mode, so no money moves. Your piece is held for{' '}
        <strong aria-live="polite">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </strong>
        .
      </p>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      <div className="mt-8 flex flex-col gap-3">
        <button disabled={busy} onClick={() => pay('success')} className="min-h-12 bg-accent text-white disabled:opacity-60">Simulate successful payment</button>
        <button disabled={busy} onClick={() => pay('failure')} className="min-h-12 border border-ink disabled:opacity-60">Simulate failed payment</button>
      </div>
    </Container>
  );
}
export default function SandboxPage() {
  return <Suspense><Sandbox /></Suspense>;
}
