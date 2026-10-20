'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { FormField, Notice, SubmitButton, TextArea, TextInput } from '@/components/form-bits';
import { useSession } from '@/components/session';
import { api, ApiError, errorText } from '@/lib/api';
import type { ProductCard } from '@/lib/types';

interface Status {
  b2bStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  businessName: string | null;
  businessGstin: string | null;
}
type BizItem = ProductCard & { b2bPricePaise: number | null; b2bMinQty: number; b2bOnly: boolean };

/**
 * Business (B2B) account: shops and resellers apply with their GSTIN; once head office approves, they see business
 * prices with a minimum order quantity and the pieces kept for business buyers.
 */
export default function BusinessAccountPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const load = useCallback(() => api<Status>('/me/business').then(setStatus).catch(() => setStatus(null)), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!status) return <p className="text-muted">Loading…</p>;
  if (status.b2bStatus === 'APPROVED') return <Catalogue businessName={status.businessName} />;
  return (
    <div className="max-w-xl">
      <h2 className="font-serif text-3xl">Business account</h2>
      <p className="mt-2 text-muted">
        For jewellers, resellers and corporate buyers: business prices on bulk quantities, a GST invoice in your business name, and pieces we keep for business
        buyers.
      </p>
      {status.b2bStatus === 'PENDING' && (
        <div className="mt-6">
          <Notice tone="success">
            We have your application for <strong>{status.businessName}</strong> ({status.businessGstin}). Our team will check it and let you know, usually within a
            working day.
          </Notice>
        </div>
      )}
      {status.b2bStatus === 'REJECTED' && (
        <div className="mt-6">
          <Notice tone="danger">Your last application was not approved. You can correct the details and apply again, or call us.</Notice>
        </div>
      )}
      {status.b2bStatus !== 'PENDING' && <ApplyForm onDone={load} />}
    </div>
  );
}

function ApplyForm({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-6 flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setErrors({});
        setError(null);
        try {
          await api('/me/business/apply', { method: 'POST', json: { businessName: fd.get('businessName'), gstin: fd.get('gstin'), note: fd.get('note') || null } });
          onDone();
        } catch (err) {
          if (err instanceof ApiError && err.fields) setErrors(err.fields);
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <FormField label="Registered business name" error={errors.businessName} required>
        {(id) => <TextInput id={id} name="businessName" required />}
      </FormField>
      <FormField label="GSTIN" error={errors.gstin} required>
        {(id) => <TextInput id={id} name="gstin" maxLength={15} placeholder="27ABCDE1234F1Z5" required />}
      </FormField>
      <FormField label="What do you buy, and how much? (optional)" error={errors.note}>
        {(id) => <TextArea id={id} name="note" placeholder="E.g. 500 loose pearls a month for our store in Nagpur" />}
      </FormField>
      <div>
        <SubmitButton busy={busy}>Apply for a business account</SubmitButton>
      </div>
    </form>
  );
}

function Catalogue({ businessName }: { businessName: string | null }) {
  const { setCartCount, openCart } = useSession();
  const [items, setItems] = useState<BizItem[] | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  useEffect(() => {
    void api<{ items: BizItem[] }>('/me/business/products')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  const add = async (p: BizItem) => {
    const n = Number(qty[p.id] ?? p.b2bMinQty);
    try {
      const r = await api<{ count: number }>('/cart/items', { method: 'POST', json: { productId: p.id, quantity: n } });
      setCartCount(r.count);
      openCart();
      setMsg({ ...msg, [p.id]: '' });
    } catch (e) {
      setMsg({ ...msg, [p.id]: errorText(e) });
    }
  };
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-serif text-3xl">Business prices</h2>
          <p className="mt-1 text-sm text-muted">Approved for {businessName}. Business prices apply from the minimum quantity; your GSTIN goes on the invoice.</p>
        </div>
        <Link href="/bulk-buying" className="text-sm text-accent underline">
          Need a custom quote?
        </Link>
      </div>
      {!items ? (
        <p className="mt-6 text-muted">Loading…</p>
      ) : !items.length ? (
        <p className="mt-6 text-muted">No business prices are set yet. Ask us for a quote.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {items.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-4 py-4">
              <span className="nacre block h-16 w-16 shrink-0 overflow-hidden">{p.images[0] && <img src={p.images[0].url} alt="" className="h-full w-full object-cover" />}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/product/${p.slug}`} className="font-serif text-lg hover:underline">
                  {p.name}
                </Link>
                {p.b2bOnly && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[11px] text-white">Business only</span>}
                <p className="text-sm text-muted">
                  {p.sku}
                  {p.farm ? ` · ${p.farm.name}` : ''}
                  {p.caratWeight ? ` · ${p.caratWeight} ct` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{p.b2bPricePaise != null ? formatINR(p.b2bPricePaise) : 'On request'}</p>
                <p className="text-xs text-muted">
                  {p.pricePaise != null && p.b2bPricePaise != null && p.b2bPricePaise < p.pricePaise ? <s>{formatINR(p.pricePaise)}</s> : null} min {p.b2bMinQty}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  aria-label={`Quantity of ${p.name}`}
                  inputMode="numeric"
                  value={qty[p.id] ?? String(p.b2bMinQty)}
                  onChange={(e) => setQty({ ...qty, [p.id]: e.target.value.replace(/\D/g, '') })}
                  className="min-h-11 w-20 border border-line bg-surface px-2 text-sm"
                />
                <button type="button" disabled={!p.available || p.b2bPricePaise == null} onClick={() => add(p)} className="min-h-11 bg-accent px-4 text-sm text-white disabled:opacity-50">
                  Add
                </button>
              </div>
              {msg[p.id] && <p className="w-full text-sm text-danger">{msg[p.id]}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
