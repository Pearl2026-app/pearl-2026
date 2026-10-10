'use client';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button, Field, Input, Select, Switch, Textarea } from '@sahyadri/ui';
import { api, errorText } from '@/lib/api';
import { toPaise, toRupees } from '@/lib/format';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'percent'
  | 'switch'
  | 'select'
  | 'ref'
  | 'refMulti'
  | 'image'
  | 'images'
  | 'date'
  | 'datetime'
  | 'json'
  | 'list';

export interface FieldDef {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  hint?: string;
  options?: Array<{ value: string; label: string }>;
  /** For ref fields: API list path and label key */
  ref?: { path: string; label?: string; query?: Record<string, string> };
  /** Upload folder for image fields */
  folder?: string;
  placeholder?: string;
  /** Only shown when creating / editing */
  only?: 'create' | 'edit';
  /** Read value from a nested shape for edit (e.g. cities → cityIds) */
  read?: (row: any) => unknown;
  showIf?: (values: Record<string, unknown>) => boolean;
  wide?: boolean;
}

export function useRefOptions(ref?: FieldDef['ref']) {
  return useQuery({
    queryKey: ['ref', ref?.path, ref?.query],
    queryFn: () => api<{ items: Array<Record<string, unknown>> }>(`${ref!.path}?pageSize=200${ref?.query ? '&' + new URLSearchParams(ref.query) : ''}`),
    enabled: !!ref,
    staleTime: 60_000,
  });
}

export function ImageUpload({ value, onChange, folder = 'content' }: { value: string | null; onChange: (url: string | null) => void; folder?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'image');
      fd.append('folder', folder);
      const r = await api<{ url: string }>('/admin/uploads', { method: 'POST', body: fd });
      onChange(r.url);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-20 w-20 rounded-sm border border-line object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-sm border border-dashed border-line text-xs text-muted">No image</div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
        {err && <p className="text-xs text-danger">{err}</p>}
        <p className="text-xs text-muted">JPG, PNG or WebP. Resized and compressed automatically.</p>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
    </div>
  );
}

function RefSelect({ def, value, onChange, multi, id, d }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; multi?: boolean; id: string; d?: string }) {
  const { data, isLoading } = useRefOptions(def.ref);
  const label = def.ref?.label ?? 'name';
  const items = data?.items ?? [];
  if (multi) {
    const selected = new Set((value as string[] | undefined) ?? []);
    return (
      <div id={id} aria-describedby={d} className="flex flex-wrap gap-2 rounded-sm border border-line bg-surface p-2">
        {isLoading && <span className="text-xs text-muted">Loading…</span>}
        {items.map((o) => {
          const v = String(o.id);
          const on = selected.has(v);
          return (
            <label key={v} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm ${on ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  const next = new Set(selected);
                  if (on) next.delete(v);
                  else next.add(v);
                  onChange([...next]);
                }}
              />
              {String(o[label] ?? v)}
            </label>
          );
        })}
      </div>
    );
  }
  return (
    <Select id={id} aria-describedby={d} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{isLoading ? 'Loading…' : '— None —'}</option>
      {items.map((o) => (
        <option key={String(o.id)} value={String(o.id)}>
          {String(o[label] ?? o.id)}
        </option>
      ))}
    </Select>
  );
}

export function FieldInput({ def, value, onChange, error }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const t = def.type ?? 'text';
  if (t === 'switch') return <Switch checked={!!value} onChange={onChange} label={def.label} />;
  return (
    <Field label={def.label} error={error} hint={def.hint} required={def.required} className={def.wide ? 'md:col-span-2' : undefined}>
      {(id, d) => {
        const common = { id, 'aria-describedby': d, invalid: !!error, placeholder: def.placeholder };
        switch (t) {
          case 'textarea':
            return <Textarea {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={5} />;
          case 'number':
            return <Input {...common} type="number" step="any" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
          case 'money':
            return (
              <div className="flex items-center gap-2">
                <span className="text-muted">₹</span>
                <Input {...common} inputMode="decimal" value={typeof value === 'number' ? toRupees(value) : ((value as string) ?? '')} onChange={(e) => onChange(e.target.value === '' ? null : (toPaise(e.target.value) ?? e.target.value))} />
              </div>
            );
          case 'percent':
            return (
              <div className="flex items-center gap-2">
                <Input {...common} inputMode="decimal" value={value == null ? '' : String(Number(value) / 100)} onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} />
                <span className="text-muted">%</span>
              </div>
            );
          case 'select':
            return (
              <Select {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
                <option value="">— Choose —</option>
                {def.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            );
          case 'ref':
            return <RefSelect def={def} value={value} onChange={onChange} id={id} d={d} />;
          case 'refMulti':
            return <RefSelect def={def} value={value} onChange={onChange} multi id={id} d={d} />;
          case 'image':
            return <ImageUpload value={(value as string) ?? null} onChange={onChange} folder={def.folder} />;
          case 'date':
            return <Input {...common} type="date" value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
          case 'datetime':
            return (
              <Input
                {...common}
                type="datetime-local"
                value={value ? toLocalInput(String(value)) : ''}
                onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
              />
            );
          case 'list':
            return (
              <Textarea
                {...common}
                rows={3}
                value={Array.isArray(value) ? (value as string[]).join('\n') : ''}
                onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
              />
            );
          case 'json':
            return <JsonInput {...common} value={value} onChange={onChange} />;
          default:
            return <Input {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
        }
      }}
    </Field>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function JsonInput({ value, onChange, ...rest }: { value: unknown; onChange: (v: unknown) => void; id: string; invalid?: boolean }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <Textarea
      {...rest}
      invalid={bad || rest.invalid}
      className="font-mono text-xs"
      rows={12}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(JSON.parse(e.target.value));
          setBad(false);
        } catch {
          setBad(true);
        }
      }}
    />
  );
}
