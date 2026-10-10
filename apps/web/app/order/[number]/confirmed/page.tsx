'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Notice } from '@/components/form-bits';
import { OrderSummary } from '@/components/tracking';
import { Container } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import type { Tracking } from '@/lib/types-commerce';

function Confirmed() {
  const { number } = useParams<{ number: string }>();
  const t = useSearchParams().get('t') ?? '';
  const [o, setO] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    let tries = 0;
    const poll = async () => {
      try {
        const r = await api<Tracking>(`/track/${encodeURIComponent(number)}?t=${t}`);
        if (stop) return;
        setO(r);
        // Online payments are confirmed by the gateway webhook; keep checking briefly.
        if (r.paymentMethod === 'ONLINE' && r.paymentStatus === 'PENDING' && tries++ < 20) setTimeout(poll, 2000);
      } catch (e) {
        setError(errorText(e));
      }
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [number, t]);

  if (error) return <Container className="max-w-2xl py-16"><Notice tone="danger">{error}</Notice></Container>;
  if (!o) return <Container className="max-w-2xl py-16"><p className="text-muted">Confirming your order…</p></Container>;
  const failed = o.status === 'FAILED' || o.paymentStatus === 'FAILED';
  const waiting = o.paymentMethod === 'ONLINE' && o.paymentStatus === 'PENDING';
  const trackHref = `/track/${encodeURIComponent(o.number)}?t=${t}`;
  return (
    <Container className="max-w-2xl py-12">
      <p className="eyebrow">Order {o.number}</p>
      <h1 className="mt-2 font-serif text-4xl lg:text-5xl">{failed ? 'Payment did not go through' : waiting ? 'Waiting for payment confirmation' : 'Thank you for your order'}</h1>
      <p className="mt-4 text-muted">
        {failed
          ? 'No money was taken for this order, or it will be refunded in full. Your cart is ready if you want to try again.'
          : waiting
            ? 'This usually takes a few seconds. You can close this page; we will send updates on WhatsApp and email.'
            : 'We have sent the details and a tracking link to your phone and email.'}
      </p>
      <div className="mt-8"><OrderSummary t={o} invoiceHref={`/api/v1/track/${encodeURIComponent(o.number)}/invoice.pdf?t=${t}`} /></div>
      <div className="mt-8 flex flex-wrap gap-3">
        {failed ? <Link href="/cart" className="inline-flex min-h-12 items-center bg-accent px-6 text-white">Back to cart</Link> : <Link href={trackHref} className="inline-flex min-h-12 items-center bg-accent px-6 text-white">Track your order</Link>}
        <Link href="/jewellery" className="inline-flex min-h-12 items-center border border-ink px-6">Continue shopping</Link>
      </div>
    </Container>
  );
}
export default function ConfirmedPage() {
  return <Suspense><Confirmed /></Suspense>;
}
