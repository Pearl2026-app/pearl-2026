'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatINR, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus, type PaymentStatus } from '@sahyadri/shared';
import { FormField, Notice, SelectInput, SubmitButton, TextArea, TextInput } from '@/components/form-bits';
import { Timeline } from '@/components/tracking';
import { api, ApiError, errorText } from '@/lib/api';

export default function MyOrder() {
  const { number } = useParams<{ number: string }>();
  const [o, setO] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api(`/me/orders/${encodeURIComponent(number)}`).then(setO).catch((e) => setError(errorText(e))), [number]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!o) return <p className="text-muted">Loading…</p>;
  const reviewed = new Set((o.reviews as Array<{ productId: string }>).map((r) => r.productId));
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-3xl">Order {o.number}</h2>
        <span className="text-sm text-muted">{ORDER_STATUS_LABEL[o.status as OrderStatus]} · {PAYMENT_STATUS_LABEL[o.paymentStatus as PaymentStatus]}</span>
      </div>
      <div className="grid gap-10 md:grid-cols-2">
        <Timeline t={{ ...o, timeline: o.events.map((e: any) => ({ status: e.toStatus, at: e.createdAt })) }} />
        <div className="flex flex-col gap-4">
          <ul className="divide-y divide-line border-y border-line">
            {o.items.map((i: any) => (
              <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
                {i.imageUrl && <img src={i.imageUrl} alt="" className="h-14 w-14 object-cover" />}
                <span className="flex-1">{i.quantity} × {i.name}</span>
                <span>{formatINR(i.lineTotalPaise, { compact: true })}</span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">Subtotal</dt><dd className="text-right">{formatINR(o.subtotalPaise)}</dd>
            {o.discountPaise > 0 && (<><dt className="text-muted">Discount</dt><dd className="text-right text-success">−{formatINR(o.discountPaise)}</dd></>)}
            <dt className="text-muted">Delivery</dt><dd className="text-right">{o.deliveryPaise ? formatINR(o.deliveryPaise) : 'Free'}</dd>
            <dt className="text-muted">GST included</dt><dd className="text-right">{formatINR(o.gstPaise)}</dd>
            <dt className="font-medium">Total</dt><dd className="text-right font-serif text-xl">{formatINR(o.totalPaise)}</dd>
          </dl>
          {o.invoice && <a className="text-sm text-accent underline" href={`/api/v1/track/${encodeURIComponent(o.number)}/invoice.pdf`}>Download GST invoice {o.invoice.number}</a>}
          <Link href={o.trackUrl.replace(/^https?:\/\/[^/]+/, '')} className="text-sm text-accent underline">Shareable tracking link</Link>
          {o.status === 'PLACED' && o.paymentStatus === 'PENDING' && (
            <button className="self-start text-sm text-danger underline" onClick={async () => { if (confirm('Cancel this unpaid order?')) { await api(`/me/orders/${encodeURIComponent(o.number)}/cancel-unpaid`, { method: 'POST' }); void load(); } }}>Cancel this unpaid order</button>
          )}
        </div>
      </div>

      {o.returnRequests.length > 0 && (
        <section>
          <h3 className="mb-2 font-serif text-xl">Requests</h3>
          <ul className="text-sm">
            {o.returnRequests.map((r: any) => (
              <li key={r.id}>{r.type === 'RETURN' ? 'Return' : 'Cancellation'}: {r.reason} · <strong>{r.status.toLowerCase().replace('_', ' ')}</strong></li>
            ))}
          </ul>
        </section>
      )}
      {(o.canCancel || o.canReturn) && <ReturnForm number={o.number} type={o.canCancel ? 'CANCELLATION' : 'RETURN'} windowDays={o.returnWindowDays} onDone={load} />}
      {o.status === 'DELIVERED' && (
        <section id="review">
          <h3 className="mb-3 font-serif text-xl">Review your pieces</h3>
          {o.items.filter((i: any) => i.productId).map((i: any) =>
            reviewed.has(i.productId) ? <p key={i.id} className="text-sm text-muted">Thank you for reviewing {i.name}.</p> : <ReviewForm key={i.id} number={o.number} productId={i.productId} name={i.name} onDone={load} />,
          )}
        </section>
      )}
    </div>
  );
}

function ReturnForm({ number, type, windowDays, onDone }: { number: string; type: 'RETURN' | 'CANCELLATION'; windowDays: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button className="self-start border border-ink px-5 py-3 text-sm" onClick={() => setOpen(true)}>{type === 'RETURN' ? `Request a return (within ${windowDays} days)` : 'Request cancellation'}</button>;
  return (
    <form
      className="flex max-w-lg flex-col gap-4 bg-surface p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const fd = new FormData(e.currentTarget);
        fd.set('type', type);
        try {
          await api(`/me/orders/${encodeURIComponent(number)}/returns`, { method: 'POST', body: fd });
          setOpen(false);
          onDone();
        } catch (err) {
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-serif text-xl">{type === 'RETURN' ? 'Return request' : 'Cancellation request'}</h3>
      {error && <Notice tone="danger">{error}</Notice>}
      <FormField label="Reason" required>
        {(id) => (
          <SelectInput id={id} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required>
            <option value="">Choose…</option>
            {(type === 'RETURN' ? ['Not as described', 'Does not suit me', 'Damaged on arrival', 'Wrong item', 'Other'] : ['Ordered by mistake', 'Found a better option', 'Delivery is too slow', 'Other']).map((r) => <option key={r}>{r}</option>)}
          </SelectInput>
        )}
      </FormField>
      <FormField label="Details">{(id) => <TextArea id={id} name="details" value={details} onChange={(e) => setDetails(e.target.value)} />}</FormField>
      {type === 'RETURN' && <FormField label="Photos (optional)">{(id) => <input id={id} name="photos" type="file" accept="image/*" multiple className="text-sm" />}</FormField>}
      <div><SubmitButton busy={busy}>Send request</SubmitButton></div>
    </form>
  );
}

function ReviewForm({ number, productId, name, onDone }: { number: string; productId: string; name: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mb-4 flex max-w-lg flex-col gap-3 border-t border-line pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/me/reviews', { method: 'POST', json: { orderNumber: number, productId, rating, title: title || undefined, body: body || undefined } });
          onDone();
        } catch (err) {
          setError(err instanceof ApiError ? err.message : errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-medium">{name}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <fieldset className="flex gap-1">
        <legend className="sr-only">Rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer text-3xl text-gold">
            <input type="radio" className="sr-only" name={`rating-${productId}`} checked={rating === n} onChange={() => setRating(n)} />
            <span aria-label={`${n} stars`}>{n <= rating ? '★' : '☆'}</span>
          </label>
        ))}
      </fieldset>
      <FormField label="Title">{(id) => <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</FormField>
      <FormField label="Your review">{(id) => <TextArea id={id} value={body} onChange={(e) => setBody(e.target.value)} />}</FormField>
      <div><SubmitButton busy={busy}>Submit review</SubmitButton></div>
      <p className="text-xs text-muted">Reviews appear after a quick check by our team.</p>
    </form>
  );
}
