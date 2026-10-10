'use client';
import { useState } from 'react';
import { FormField, Notice, SelectInput, SubmitButton, TextInput } from '@/components/form-bits';
import { useSession } from '@/components/session';
import { useSite } from '@/components/site-context';
import { api, ApiError, errorText } from '@/lib/api';

export default function AccountPage() {
  const { me, refresh } = useSession();
  const site = useSite();
  const [v, setV] = useState({ name: me?.name === 'Customer' ? '' : (me?.name ?? ''), email: me?.email ?? '', cityId: me?.customer?.cityId ?? '', preferredPaymentMethod: me?.customer?.preferredPaymentMethod ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  return (
    <form
      className="flex max-w-xl flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        setFields({});
        try {
          await api('/me/profile', { method: 'PATCH', json: { name: v.name || undefined, email: v.email || null, cityId: v.cityId || null, preferredPaymentMethod: v.preferredPaymentMethod || null } });
          await refresh();
          setMsg({ tone: 'success', text: 'Saved.' });
        } catch (err) {
          if (err instanceof ApiError && err.fields) setFields(err.fields);
          setMsg({ tone: 'danger', text: errorText(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-serif text-2xl">Account</h2>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <FormField label="Mobile number" hint="Your sign-in number cannot be changed here.">{(id) => <TextInput id={id} value={me?.phone ?? ''} disabled />}</FormField>
      <FormField label="Name" error={fields.name}>{(id) => <TextInput id={id} autoComplete="name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</FormField>
      <FormField label="Email" error={fields.email}>{(id) => <TextInput id={id} type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</FormField>
      <FormField label="City">
        {(id) => (
          <SelectInput id={id} value={v.cityId} onChange={(e) => setV({ ...v, cityId: e.target.value })}>
            <option value="">—</option>
            {site.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectInput>
        )}
      </FormField>
      <FormField label="Preferred payment">
        {(id) => (
          <SelectInput id={id} value={v.preferredPaymentMethod} onChange={(e) => setV({ ...v, preferredPaymentMethod: e.target.value })}>
            <option value="">No preference</option>
            <option value="ONLINE">Pay online</option>
            <option value="COD">Cash on delivery</option>
          </SelectInput>
        )}
      </FormField>
      <div><SubmitButton busy={busy}>Save</SubmitButton></div>
    </form>
  );
}
