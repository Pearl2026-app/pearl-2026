'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { Notice } from '@/components/form-bits';
import { Container } from '@/components/ui';
import { api, errorText } from '@/lib/api';

// Payment window for the customer app. The app places the order through the API, opens this page in an
// in-app browser, and gets the shopper back through its own link (sahyadri://…) when payment ends.
// The webhook remains the only thing that marks an order paid.

/** Only the app's own scheme is allowed as a return address (no open redirect). */
const safeReturn = (r: string | null) => (r && /^sahyadri:\/\/[a-z0-9/_\-.?=&%]*$/i.test(r) ? r : null);

const loadRazorpay = () =>
  new Promise<void>((resolve, reject) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window.'));
    document.body.appendChild(s);
  });

function AppPayment() {
  const sp = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const mode = sp.get('mode');
  const po = sp.get('po') ?? '';
  const amount = Number(sp.get('a') ?? 0);
  const number = sp.get('n') ?? '';
  const back = safeReturn(sp.get('return'));
  const finish = (status: 'paid' | 'failed' | 'cancelled') => {
    if (back) window.location.href = `${back}${back.includes('?') ? '&' : '?'}status=${status}`;
  };

  useEffect(() => {
    if (mode !== 'razorpay' || started.current || !back) return;
    started.current = true;
    (async () => {
      try {
        await loadRazorpay();
        const R = (window as unknown as { Razorpay: new (o: Record<string, unknown>) => { open: () => void } }).Razorpay;
        new R({
          key: sp.get('key'),
          order_id: po,
          amount,
          currency: 'INR',
          name: 'Sahyadri Pearls',
          description: `Order ${number}`,
          prefill: { name: sp.get('name') ?? undefined, contact: sp.get('phone') ?? undefined },
          theme: { color: '#1F4E52' },
          handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            await api('/payments/verify', { method: 'POST', json: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } }).catch(() => undefined);
            finish('paid');
          },
          modal: { ondismiss: () => finish('cancelled') },
        }).open();
      } catch (e) {
        setError(errorText(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, po]);

  if (!back || !po) return <Container className="max-w-lg py-16"><Notice tone="danger">This payment link is incomplete. Please return to the app and try again.</Notice></Container>;
  return (
    <Container className="max-w-lg py-16">
      <p className="eyebrow">Order {number}</p>
      <h1 className="mt-2 font-serif text-4xl">Pay {formatINR(amount)}</h1>
      {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
      {mode === 'sandbox' ? (
        <div className="mt-8 flex flex-col gap-3">
          <p className="text-sm text-muted">The payment gateway is in test mode, so no money moves.</p>
          {(['success', 'failure'] as const).map((outcome) => (
            <button
              key={outcome}
              disabled={busy}
              className={outcome === 'success' ? 'min-h-12 bg-accent text-white disabled:opacity-60' : 'min-h-12 border border-ink disabled:opacity-60'}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/payments/sandbox/${po}/complete`, { method: 'POST', json: { outcome } });
                  finish(outcome === 'success' ? 'paid' : 'failed');
                } catch (e) {
                  setError(errorText(e));
                  setBusy(false);
                }
              }}
            >
              {outcome === 'success' ? 'Simulate successful payment' : 'Simulate failed payment'}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">Opening the secure payment window…</p>
      )}
      <button className="mt-6 text-sm text-accent underline" onClick={() => finish('cancelled')}>Back to the app</button>
    </Container>
  );
}

export default function AppPaymentPage() {
  return <Suspense><AppPayment /></Suspense>;
}
