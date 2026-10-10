'use client';
import { useEffect, useState } from 'react';
import { FormField, Notice, SubmitButton, TextInput } from '@/components/form-bits';
import { api, ApiError, errorText } from '@/lib/api';

interface Address { id: string; label: string | null; name: string; phone: string; line1: string; line2: string | null; area: string | null; landmark: string | null; cityName: string; state: string; pincode: string; isDefault: boolean }
const EMPTY = { label: '', name: '', phone: '', line1: '', area: '', landmark: '', cityName: '', state: 'Maharashtra', pincode: '' };

export default function Addresses() {
  const [list, setList] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [v, setV] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<Address[]>('/me/addresses').then(setList);
  useEffect(() => {
    void load();
  }, []);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const startEdit = (a?: Address) => {
    setEditing(a?.id ?? 'new');
    setV(a ? { label: a.label ?? '', name: a.name, phone: a.phone.replace('+91', ''), line1: a.line1, area: a.area ?? '', landmark: a.landmark ?? '', cityName: a.cityName, state: a.state, pincode: a.pincode } : EMPTY);
    setFields({});
    setError(null);
  };
  if (!list) return <p className="text-muted">Loading…</p>;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl">Manage Addresses</h2>
        {!editing && <button className="min-h-11 border border-ink px-4 text-sm" onClick={() => startEdit()}>Add address</button>}
      </div>
      {editing && (
        <form
          className="grid max-w-2xl gap-4 bg-surface p-5 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setFields({});
            setError(null);
            try {
              const body = { ...v, label: v.label || null, area: v.area || null, landmark: v.landmark || null };
              if (editing === 'new') await api('/me/addresses', { method: 'POST', json: body });
              else await api(`/me/addresses/${editing}`, { method: 'PATCH', json: body });
              setEditing(null);
              await load();
            } catch (err) {
              if (err instanceof ApiError && err.fields) setFields(err.fields);
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div>}
          <FormField label="Label" hint="Home, Office…">{(id) => <TextInput id={id} value={v.label} onChange={set('label')} />}</FormField>
          <FormField label="Full name" error={fields.name} required>{(id) => <TextInput id={id} value={v.name} onChange={set('name')} />}</FormField>
          <FormField label="Mobile number" error={fields.phone} required>{(id) => <TextInput id={id} type="tel" value={v.phone} onChange={set('phone')} />}</FormField>
          <FormField label="House, building, street" error={fields.line1} required>{(id) => <TextInput id={id} value={v.line1} onChange={set('line1')} />}</FormField>
          <FormField label="Area" error={fields.area}>{(id) => <TextInput id={id} value={v.area} onChange={set('area')} />}</FormField>
          <FormField label="Landmark">{(id) => <TextInput id={id} value={v.landmark} onChange={set('landmark')} />}</FormField>
          <FormField label="Town / city" error={fields.cityName} required>{(id) => <TextInput id={id} value={v.cityName} onChange={set('cityName')} />}</FormField>
          <FormField label="PIN code" error={fields.pincode} required>{(id) => <TextInput id={id} inputMode="numeric" maxLength={6} value={v.pincode} onChange={set('pincode')} />}</FormField>
          <FormField label="State" error={fields.state} required>{(id) => <TextInput id={id} value={v.state} onChange={set('state')} />}</FormField>
          <div className="flex gap-3 sm:col-span-2">
            <SubmitButton busy={busy}>Save address</SubmitButton>
            <button type="button" className="text-sm text-muted underline" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {list.length === 0 && !editing && <p className="text-muted">No saved addresses yet.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {list.map((a) => (
          <li key={a.id} className="flex flex-col gap-1 border border-line bg-surface p-5 text-sm">
            <p className="font-medium">{a.label ?? a.name} {a.isDefault && <span className="ml-2 text-xs text-accent">Default</span>}</p>
            <p>{a.name}, {a.phone}</p>
            <p className="text-muted">{[a.line1, a.area, a.landmark, `${a.cityName} ${a.pincode}`, a.state].filter(Boolean).join(', ')}</p>
            <div className="mt-2 flex gap-4">
              <button className="min-h-11 text-accent underline" onClick={() => startEdit(a)}>Edit</button>
              {!a.isDefault && <button className="min-h-11 text-accent underline" onClick={async () => { await api(`/me/addresses/${a.id}`, { method: 'PATCH', json: { isDefault: true } }); void load(); }}>Make default</button>}
              <button className="min-h-11 text-muted underline hover:text-danger" onClick={async () => { if (confirm('Remove this address?')) { await api(`/me/addresses/${a.id}`, { method: 'DELETE' }); void load(); } }}>Remove</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
