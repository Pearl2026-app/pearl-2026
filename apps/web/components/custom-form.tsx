'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, errorText } from '@/lib/api';
import { attribution } from '@/lib/enquiry';
import { FormField, Notice, SelectInput, SubmitButton, TextArea, TextInput } from './form-bits';

const TYPES = ['Ring', 'Necklace', 'Earrings', 'Bracelet', 'Pendant', 'Bridal set', 'Other'];
const METALS = ['18k gold', '22k gold', 'White gold', 'Rose gold', 'Sterling silver', 'Platinum', 'Not sure yet'];

/** Customized Jewellery form. Ring Finder hands its answers over through sessionStorage. */
export function CustomJewelleryForm() {
  const sp = useSearchParams();
  const [v, setV] = useState({ jewelleryType: sp.get('type') ?? '', metal: '', size: '', designNotes: '', budgetRupees: '', extraNotes: '', name: '', phone: '', email: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; whatsappUrl: string } | null>(null);

  useEffect(() => {
    try {
      const a = JSON.parse(sessionStorage.getItem('sp_ring_finder') ?? 'null');
      if (a && sp.get('from') === 'ring-finder') {
        setAnswers(a);
        setV((s) => ({
          ...s,
          jewelleryType: 'Ring',
          metal: a.metal ?? s.metal,
          size: a.ringSize ?? s.size,
          budgetRupees: a.budgetMax ? String(a.budgetMax) : s.budgetRupees,
          designNotes: [a.occasion && `Occasion: ${a.occasion}`, a.style && `Style: ${a.style}`, a.colour && `Pearl colour: ${a.colour}`, a.shape && `Pearl shape: ${a.shape}`].filter(Boolean).join('\n'),
        }));
      }
    } catch {}
  }, [sp]);

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (done)
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">
          Thank you. Your design request <strong>{done.reference}</strong> is with our designers. We will contact you within one working day with ideas and a quote.
        </Notice>
        <a href={done.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center bg-whatsapp px-5 text-white">Continue on WhatsApp</a>
      </div>
    );

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setError(null);
        const fd = new FormData();
        for (const [k, val] of Object.entries(v)) if (val) fd.append(k, val);
        fd.append('clientId', crypto.randomUUID());
        const c = document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1];
        if (c) fd.append('citySlug', c);
        const a = attribution();
        if (a.source) fd.append('source', a.source);
        if (answers) fd.append('ringFinderAnswers', JSON.stringify(answers));
        files.forEach((f) => fd.append('images', f));
        try {
          setDone(await api('/enquiries/custom', { method: 'POST', body: fd }));
        } catch (err) {
          if (err instanceof ApiError && err.fields) setErrors(err.fields);
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      {answers && <Notice tone="success">We have filled in your Ring Finder answers. Add anything else you have in mind.</Notice>}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Jewellery type" error={errors.jewelleryType} required>
          {(id, d) => (
            <SelectInput id={id} aria-describedby={d} value={v.jewelleryType} onChange={set('jewelleryType')} invalid={!!errors.jewelleryType} required>
              <option value="">Choose…</option>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </SelectInput>
          )}
        </FormField>
        <FormField label="Preferred metal or material" error={errors.metal}>
          {(id) => (
            <SelectInput id={id} value={v.metal} onChange={set('metal')}>
              <option value="">Choose…</option>
              {METALS.map((t) => <option key={t}>{t}</option>)}
            </SelectInput>
          )}
        </FormField>
        <FormField label="Size" hint="Ring size, necklace length or wrist size" error={errors.size}>{(id, d) => <TextInput id={id} aria-describedby={d} value={v.size} onChange={set('size')} />}</FormField>
        <FormField label="Budget (₹)" error={errors.budgetRupees}>{(id) => <TextInput id={id} inputMode="numeric" value={v.budgetRupees} onChange={set('budgetRupees')} placeholder="e.g. 50000" />}</FormField>
      </div>
      <FormField label="Design notes" hint="Describe the piece: style, pearl colour and shape, occasion" error={errors.designNotes}>{(id, d) => <TextArea id={id} aria-describedby={d} rows={5} value={v.designNotes} onChange={set('designNotes')} />}</FormField>
      <FormField label="Reference images (up to 6)" hint="Photos or sketches of what you like. JPG or PNG." error={errors.images}>
        {(id, d) => <input id={id} aria-describedby={d} type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 6))} className="text-sm" />}
      </FormField>
      <FormField label="Anything else" error={errors.extraNotes}>{(id) => <TextArea id={id} rows={3} value={v.extraNotes} onChange={set('extraNotes')} />}</FormField>
      <div className="grid gap-5 border-t border-line pt-5 sm:grid-cols-3">
        <FormField label="Your name" error={errors.name} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="name" value={v.name} onChange={set('name')} invalid={!!errors.name} />}</FormField>
        <FormField label="Mobile number" error={errors.phone} required>{(id, d) => <TextInput id={id} aria-describedby={d} type="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} invalid={!!errors.phone} />}</FormField>
        <FormField label="Email" error={errors.email}>{(id) => <TextInput id={id} type="email" autoComplete="email" value={v.email} onChange={set('email')} />}</FormField>
      </div>
      <div><SubmitButton busy={busy}>Send my design request</SubmitButton></div>
    </form>
  );
}
