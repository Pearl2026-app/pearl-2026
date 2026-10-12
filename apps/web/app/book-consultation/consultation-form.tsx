'use client';
import { useMemo, useState } from 'react';
import { FormField, Notice, SelectInput, SubmitButton, TextArea, TextInput } from '@/components/form-bits';
import { useSite } from '@/components/site-context';
import { api, ApiError, errorText } from '@/lib/api';
import { attribution } from '@/lib/enquiry';
import type { Store } from '@/lib/types';

const SLOTS = [
  { value: 'MORNING', label: 'Morning, 10 am – 1 pm' },
  { value: 'AFTERNOON', label: 'Afternoon, 1 – 4 pm' },
  { value: 'EVENING', label: 'Evening, 4 – 7 pm' },
];

/** Next 14 India dates, Sundays left out (the team is off). */
function upcomingDates() {
  const out: Array<{ value: string; label: string }> = [];
  const ist = Date.now() + 5.5 * 3600_000;
  for (let d = 1; out.length < 14 && d < 30; d++) {
    const day = new Date(ist + d * 86_400_000);
    if (day.getUTCDay() === 0) continue;
    out.push({ value: day.toISOString().slice(0, 10), label: day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) });
  }
  return out;
}

export function ConsultationForm({ stores, product }: { stores: Store[]; product: { id: string; name: string } | null }) {
  const site = useSite();
  const dates = useMemo(upcomingDates, []);
  const [v, setV] = useState({ mode: 'VIDEO' as 'VIDEO' | 'STORE', date: dates[0]?.value ?? '', slot: 'EVENING', storeId: stores[0]?.id ?? '', name: '', phone: '', email: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; whatsappUrl: string } | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (!site.storefront.consultationsEnabled) return <Notice tone="danger">Appointments are not open right now. Please message us on WhatsApp and we will help.</Notice>;
  if (done)
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">
          Thank you. Your request <strong>{done.reference}</strong> is with our team; we will confirm the time on WhatsApp or by phone.
        </Notice>
        <a href={done.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center bg-whatsapp px-5 text-white">Message us on WhatsApp</a>
      </div>
    );

  const store = stores.find((s) => s.id === v.storeId);
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setError(null);
        try {
          const citySlug = document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] || undefined;
          const r = await api<{ reference: string; whatsappUrl: string }>('/enquiries/consultation', {
            method: 'POST',
            json: { clientId: crypto.randomUUID(), mode: v.mode, date: v.date, slot: v.slot, storeId: v.mode === 'STORE' ? v.storeId : undefined, productId: product?.id, name: v.name, phone: v.phone, email: v.email || undefined, notes: v.notes || undefined, citySlug, source: attribution().source ?? 'consultation-form' },
          });
          setDone(r);
        } catch (err) {
          if (err instanceof ApiError && err.fields) setErrors(err.fields);
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {product && <p className="border-l-2 border-gold pl-3 text-sm">About: <strong>{product.name}</strong></p>}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How would you like to meet?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['VIDEO', 'Video call', 'See pieces live from home, on WhatsApp video.'], ['STORE', 'Visit a store', 'Try pieces on with our adviser.']] as const).map(([m, title, text]) =>
            m === 'STORE' && !stores.length ? null : (
              <label key={m} className={`flex cursor-pointer gap-3 border p-4 ${v.mode === m ? 'border-accent bg-surface' : 'border-line'}`}>
                <input type="radio" name="mode" value={m} checked={v.mode === m} onChange={() => setV((s) => ({ ...s, mode: m }))} className="mt-1 h-4 w-4 accent-[var(--color-accent)]" />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="text-sm text-muted">{text}</span>
                </span>
              </label>
            ),
          )}
        </div>
      </fieldset>
      {v.mode === 'STORE' && (
        <FormField label="Store" error={errors.storeId} required>
          {(id) => (
            <SelectInput id={id} value={v.storeId} onChange={set('storeId')}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}, {s.area}, {s.city.name}</option>)}
            </SelectInput>
          )}
        </FormField>
      )}
      {v.mode === 'STORE' && store?.openingHours && <p className="-mt-4 text-sm text-muted">Open {store.openingHours}</p>}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Date" error={errors.date} required>
          {(id) => <SelectInput id={id} value={v.date} onChange={set('date')}>{dates.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</SelectInput>}
        </FormField>
        <FormField label="Time" error={errors.slot} required>
          {(id) => <SelectInput id={id} value={v.slot} onChange={set('slot')}>{SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</SelectInput>}
        </FormField>
        <FormField label="Your name" error={errors.name} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="name" value={v.name} onChange={set('name')} invalid={!!errors.name} required />}</FormField>
        <FormField label="Mobile number" error={errors.phone} required hint="We confirm the time on this number.">{(id, d) => <TextInput id={id} aria-describedby={d} type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} invalid={!!errors.phone} required />}</FormField>
        <FormField label="Email" error={errors.email}>{(id, d) => <TextInput id={id} aria-describedby={d} type="email" autoComplete="email" value={v.email} onChange={set('email')} invalid={!!errors.email} />}</FormField>
      </div>
      <FormField label="What are you looking for?" error={errors.notes} hint="Occasion, budget, pieces you liked — anything that helps us prepare.">
        {(id, d) => <TextArea id={id} aria-describedby={d} value={v.notes} onChange={set('notes')} maxLength={1000} />}
      </FormField>
      <div><SubmitButton busy={busy}>Request appointment</SubmitButton></div>
      <p className="text-xs text-muted">Free, with no obligation to buy. We confirm every appointment personally.</p>
    </form>
  );
}
