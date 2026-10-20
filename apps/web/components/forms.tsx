'use client';
import { useState } from 'react';
import { api, ApiError, errorText } from '@/lib/api';
import { attribution, enquireOnWhatsApp } from '@/lib/enquiry';
import { FormField, Notice, SelectInput, SubmitButton, TextArea, TextInput } from './form-bits';
import { useSite, useWhatsAppNumber } from './site-context';

const city = () => document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] || undefined;

/** Contact and bulk-buying forms: saved as an enquiry, then the customer can continue on WhatsApp. */
export function EnquiryForm({ type, submitLabel, messageLabel }: { type: 'CONTACT' | 'BULK'; submitLabel: string; messageLabel: string }) {
  const site = useSite();
  const cityNumber = useWhatsAppNumber();
  const [v, setV] = useState({ name: '', phone: '', email: '', message: '', quantity: '', company: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; whatsappUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  if (done)
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">Thank you. Your reference is <strong>{done.reference}</strong>. Our team will reply shortly.</Notice>
        <a href={done.whatsappUrl} className="inline-flex min-h-12 items-center justify-center bg-whatsapp px-5 text-white" target="_blank" rel="noopener noreferrer">
          Continue on WhatsApp
        </a>
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
        try {
          const message = type === 'BULK' ? [v.company && `Company: ${v.company}`, v.quantity && `Quantity: ${v.quantity}`, v.message].filter(Boolean).join('\n') : v.message;
          const r = await api<{ reference: string; whatsappUrl: string }>('/enquiries', {
            method: 'POST',
            json: { clientId: crypto.randomUUID(), type, name: v.name || undefined, phone: v.phone || undefined, email: v.email || undefined, message, citySlug: city(), pageUrl: location.pathname, ...attribution(), payload: type === 'BULK' ? { company: v.company, quantity: v.quantity } : undefined },
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
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Your name" error={errors.name} required>{(id, d) => <TextInput id={id} aria-describedby={d} autoComplete="name" value={v.name} onChange={set('name')} invalid={!!errors.name} required />}</FormField>
        <FormField label="Mobile number" error={errors.phone} required>{(id, d) => <TextInput id={id} aria-describedby={d} type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} invalid={!!errors.phone} required />}</FormField>
        <FormField label="Email" error={errors.email}>{(id, d) => <TextInput id={id} aria-describedby={d} type="email" autoComplete="email" value={v.email} onChange={set('email')} invalid={!!errors.email} />}</FormField>
        {type === 'BULK' && (
          <>
            <FormField label="Company or occasion" error={errors.company}>{(id) => <TextInput id={id} value={v.company} onChange={set('company')} />}</FormField>
            <FormField label="Approximate quantity" error={errors.quantity}>{(id) => <TextInput id={id} inputMode="numeric" value={v.quantity} onChange={set('quantity')} />}</FormField>
          </>
        )}
      </div>
      <FormField label={messageLabel} error={errors.message}>{(id, d) => <TextArea id={id} aria-describedby={d} value={v.message} onChange={set('message')} />}</FormField>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton busy={busy}>{submitLabel}</SubmitButton>
        <button
          type="button"
          className="text-sm text-whatsapp underline"
          onClick={() => enquireOnWhatsApp({ type, message: v.message || undefined, name: v.name || undefined, phone: v.phone || undefined, citySlug: city() }, { whatsapp: type === 'BULK' ? site.whatsapp.wholesale ?? cityNumber : cityNumber })}
        >
          Or message us on WhatsApp
        </button>
      </div>
    </form>
  );
}

export function CareerApplyForm({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (done) return <Notice tone="success">Thank you for applying. Our team will be in touch if your profile fits.</Notice>;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setError(null);
        try {
          await api(`/careers/${slug}/apply`, { method: 'POST', body: new FormData(e.currentTarget) });
          setDone(true);
        } catch (err) {
          if (err instanceof ApiError && err.fields) setErrors(err.fields);
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <FormField label="Full name" error={errors.name} required>{(id) => <TextInput id={id} name="name" autoComplete="name" required />}</FormField>
      <FormField label="Email" error={errors.email} required>{(id) => <TextInput id={id} name="email" type="email" autoComplete="email" required />}</FormField>
      <FormField label="Mobile number" error={errors.phone} required>{(id) => <TextInput id={id} name="phone" type="tel" autoComplete="tel" required />}</FormField>
      <FormField label="A note about you" error={errors.coverNote}>{(id) => <TextArea id={id} name="coverNote" />}</FormField>
      <FormField label="Resume (PDF or Word, up to 10 MB)" error={errors.resume} required>{(id) => <input id={id} name="resume" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required className="text-sm" />}</FormField>
      <div><SubmitButton busy={busy}>Send application</SubmitButton></div>
    </form>
  );
}

export { SelectInput };

const DOC_ACCEPT = 'image/*,.pdf,application/pdf';

/** Riders apply with their documents; head office checks them and approves (no Aadhaar asked). */
export function RiderApplyForm() {
  const site = useSite();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (done)
    return (
      <Notice tone="success">
        Thank you. We have your application and documents. Our team will check them and call you; once approved you can
        sign in to the delivery app with your mobile number.
      </Notice>
    );
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrors({});
        setError(null);
        try {
          await api('/partners/delivery/apply', { method: 'POST', body: new FormData(e.currentTarget) });
          setDone(true);
        } catch (err) {
          if (err instanceof ApiError && err.fields) setErrors(err.fields);
          setError(errorText(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="danger">{error}</Notice>}
      <FormField label="Full name" error={errors.name} required>{(id) => <TextInput id={id} name="name" autoComplete="name" required />}</FormField>
      <FormField label="Mobile number" error={errors.phone} required hint="You will sign in to the delivery app with this number.">
        {(id, d) => <TextInput id={id} aria-describedby={d} name="phone" type="tel" autoComplete="tel" required />}
      </FormField>
      <FormField label="City" error={errors.citySlug} required>
        {(id) => (
          <SelectInput id={id} name="citySlug" required defaultValue={city() ?? ''}>
            <option value="" disabled>
              Choose your city
            </option>
            {site.cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </SelectInput>
        )}
      </FormField>
      <FormField label="Home address" error={errors.address} required>{(id) => <TextArea id={id} name="address" required />}</FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Bike number" error={errors.vehicleNumber} required>{(id) => <TextInput id={id} name="vehicleNumber" placeholder="MH12 AB 1234" required />}</FormField>
        <FormField label="Driving licence number" error={errors.licenceNumber} required>{(id) => <TextInput id={id} name="licenceNumber" required />}</FormField>
      </div>
      <fieldset className="flex flex-col gap-4 border border-line p-4">
        <legend className="px-1 text-sm font-medium">Documents (photo or PDF, up to 10 MB each)</legend>
        <FormField label="Driving licence" error={errors.licence} required>{(id) => <input id={id} name="licence" type="file" accept={DOC_ACCEPT} required className="text-sm" />}</FormField>
        <FormField label="Bike RC (registration certificate)" error={errors.rc} required>{(id) => <input id={id} name="rc" type="file" accept={DOC_ACCEPT} required className="text-sm" />}</FormField>
        <FormField label="Address proof (electricity bill, rent agreement or passport; not Aadhaar)" error={errors.addressProof} required>
          {(id) => <input id={id} name="addressProof" type="file" accept={DOC_ACCEPT} required className="text-sm" />}
        </FormField>
      </fieldset>
      <div>
        <SubmitButton busy={busy}>Send application</SubmitButton>
      </div>
    </form>
  );
}
