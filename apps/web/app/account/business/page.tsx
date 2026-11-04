'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { FormField, Notice, SubmitButton, TextArea, TextInput } from '@/components/form-bits';
import { Modal } from '@/components/product-extras';
import { useSession } from '@/components/session';
import { api, ApiError, errorText } from '@/lib/api';
import type { ProductCard } from '@/lib/types';

interface Status {
  b2bStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  businessName: string | null;
  businessGstin: string | null;
  shopName: string | null;
  shopAddress: string | null;
  b2bContactPhone: string | null;
  b2bContactEmail: string | null;
  b2bNote: string | null;
  accountPhone: string | null;
  accountEmail: string | null;
}
type BizItem = ProductCard & { b2bPricePaise: number | null; b2bMinQty: number; b2bOnly: boolean; inStock: number };

const APPLIED_MESSAGE = "Thanks for applying. We're verifying your details — you'll get an email once approved.";

/**
 * Business (B2B) account: shops and resellers apply with their GSTIN, shop and contact details; once head office
 * approves, they see business prices with a minimum order quantity and the pieces kept for business buyers.
 */
export default function BusinessAccountPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [thanks, setThanks] = useState(false);
  const load = useCallback(() => api<Status>('/me/business').then(setStatus).catch(() => setStatus(null)), []);
  const closeThanks = useCallback(() => setThanks(false), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!status) return <p className="text-muted">Loading…</p>;
  if (status.b2bStatus === 'APPROVED') return <Catalogue businessName={status.shopName || status.businessName} />;
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
            We have your application for <strong>{status.shopName || status.businessName}</strong> ({status.businessGstin}). We&apos;re verifying your details — you&apos;ll
            get an email once approved.
          </Notice>
        </div>
      )}
      {status.b2bStatus === 'REJECTED' && (
        <div className="mt-6">
          <Notice tone="danger">Your last application was not approved. You can correct the details and apply again, or call us.</Notice>
        </div>
      )}
      {status.b2bStatus !== 'PENDING' && (
        <ApplyForm
          status={status}
          onDone={() => {
            setThanks(true);
            void load();
          }}
        />
      )}
      {thanks && (
        <Modal title="Application received" onClose={closeThanks}>
          <p>{APPLIED_MESSAGE}</p>
          <button type="button" onClick={closeThanks} className="mt-6 inline-flex min-h-11 items-center bg-accent px-6 text-sm text-white hover:bg-accent-hover">
            OK
          </button>
        </Modal>
      )}
    </div>
  );
}

function ApplyForm({ status, onDone }: { status: Status; onDone: () => void }) {
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
          await api('/me/business/apply', {
            method: 'POST',
            json: {
              businessName: fd.get('businessName'),
              gstin: fd.get('gstin'),
              shopName: fd.get('shopName'),
              shopAddress: fd.get('shopAddress'),
              contactPhone: fd.get('contactPhone'),
              contactEmail: fd.get('contactEmail') || null,
              note: fd.get('note') || null,
            },
          });
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
      <FormField label="Shop name" error={errors.shopName} required>
        {(id) => <TextInput id={id} name="shopName" defaultValue={status.shopName ?? ''} placeholder="The name on your shop board" required />}
      </FormField>
      <FormField label="Registered business name" hint="As on your GST certificate" error={errors.businessName} required>
        {(id, d) => <TextInput id={id} aria-describedby={d} name="businessName" defaultValue={status.businessName ?? ''} required />}
      </FormField>
      <FormField label="GSTIN" error={errors.gstin} required>
        {(id) => <TextInput id={id} name="gstin" maxLength={15} defaultValue={status.businessGstin ?? ''} placeholder="27ABCDE1234F1Z5" required />}
      </FormField>
      <FormField label="Shop address" error={errors.shopAddress} required>
        {(id) => <TextArea id={id} name="shopAddress" defaultValue={status.shopAddress ?? ''} placeholder="Shop number, street, area, city, PIN code" required />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Contact phone" error={errors.contactPhone} required>
          {(id) => <TextInput id={id} name="contactPhone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={(status.b2bContactPhone ?? status.accountPhone ?? '').replace(/^\+91/, '')} required />}
        </FormField>
        <FormField label="Contact email" hint="We email you here once you are approved" error={errors.contactEmail}>
          {(id, d) => <TextInput id={id} aria-describedby={d} name="contactEmail" type="email" autoComplete="email" defaultValue={status.b2bContactEmail ?? status.accountEmail ?? ''} />}
        </FormField>
      </div>
      <FormField label="What do you buy, and how much? (optional)" error={errors.note}>
        {(id) => <TextArea id={id} name="note" defaultValue={status.b2bNote ?? ''} placeholder="E.g. 500 loose pearls a month for our store in Nagpur" />}
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
  const [msg, setMsg] = useState<Record<string, { tone: 'success' | 'danger'; text: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void api<{ items: BizItem[] }>('/me/business/products')
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }, []);
  const say = (id: string, tone: 'success' | 'danger', text: string) => setMsg((m) => ({ ...m, [id]: { tone, text } }));
  const wanted = (p: BizItem) => Math.max(1, Number(qty[p.id] ?? p.b2bMinQty) || 1);
  const add = async (p: BizItem, n: number) => {
    setBusy(p.id);
    try {
      const r = await api<{ count: number }>('/cart/items', { method: 'POST', json: { productId: p.id, quantity: n } });
      setCartCount(r.count);
      openCart();
      setMsg((m) => ({ ...m, [p.id]: { tone: 'success', text: '' } }));
    } catch (e) {
      say(p.id, 'danger', errorText(e));
    } finally {
      setBusy(null);
    }
  };
  /** Order above stock: what there is goes to the cart, the rest becomes a request that we follow up by phone. */
  const requestRest = async (p: BizItem) => {
    setBusy(p.id);
    try {
      const r = await api<{ message: string; remaining: number; reference: string }>('/me/business/request-more', { method: 'POST', json: { productId: p.id, quantity: wanted(p) } });
      say(p.id, 'success', `${r.message} (Reference ${r.reference}, ${r.remaining} pcs.)`);
    } catch (e) {
      say(p.id, 'danger', errorText(e));
    } finally {
      setBusy(null);
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
          {items.map((p) => {
            const n = wanted(p);
            const short = p.b2bPricePaise != null && !p.isUnique && n > p.inStock;
            const rest = n - p.inStock;
            return (
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
                    {` · ${p.inStock > 0 ? `${p.inStock} in stock` : 'out of stock'}`}
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
                  {!short && (
                    <button type="button" disabled={!p.available || p.b2bPricePaise == null || busy === p.id} onClick={() => add(p, n)} className="min-h-11 bg-accent px-4 text-sm text-white disabled:opacity-50">
                      Add
                    </button>
                  )}
                </div>
                {short && (
                  <div className="w-full border border-line bg-surface p-3 text-sm">
                    <p>
                      {p.inStock > 0 ? (
                        <>
                          We have <strong>{p.inStock}</strong> in stock. Add those now, and we&apos;ll arrange the remaining <strong>{rest}</strong>.
                        </>
                      ) : (
                        <>
                          This piece is out of stock right now. Ask us for <strong>{rest}</strong> and we&apos;ll call you.
                        </>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.inStock > 0 && (
                        <button type="button" disabled={busy === p.id} onClick={() => add(p, p.inStock)} className="min-h-11 bg-accent px-4 text-white disabled:opacity-50">
                          Add {p.inStock} to cart
                        </button>
                      )}
                      <button type="button" disabled={busy === p.id} onClick={() => requestRest(p)} className="min-h-11 border border-ink px-4 hover:bg-ink hover:text-white disabled:opacity-50">
                        Request the remaining {rest}
                      </button>
                    </div>
                  </div>
                )}
                {msg[p.id]?.text && (
                  <div className="w-full">
                    <Notice tone={msg[p.id]!.tone}>{msg[p.id]!.text}</Notice>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
