'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { Module } from '@sahyadri/shared';
import { Alert, Button, Card, Input, Select, Spinner } from '@sahyadri/ui';
import { api, ApiError, errorText, qs } from '@/lib/api';
import { useCan } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';
import { DataTable, Pagination, type Column } from './data-table';
import { FieldInput, type FieldDef } from './fields';
import { PageHeader } from './shell';
import { useToast } from './toast';

export interface ResourceDef<T = any> {
  key: string;
  title: string;
  singular: string;
  description?: string;
  /** API path, e.g. /admin/cities */
  api: string;
  module: Module;
  columns: Column<T>[];
  fields: FieldDef[];
  filters?: Array<{ name: string; label: string; options: Array<{ value: string; label: string }> }>;
  defaults?: Record<string, unknown>;
  remove?: { label: string; kind: 'deactivate' | 'archive' | 'delete' };
  /** Transform form values before sending */
  toBody?: (values: Record<string, unknown>, mode: 'create' | 'edit') => Record<string, unknown>;
  sortDefault?: string;
  extraActions?: (row: T) => ReactNode;
  csv?: boolean;
  createLabel?: string;
}

export function ResourceList<T extends { id: string }>({ def }: { def: ResourceDef<T> }) {
  const { params, set } = useListParams(def.sortDefault ? { sort: def.sortDefault } : {});
  const { data, isLoading, isFetching, error } = useList<T>(def.api, params);
  const can = useCan();
  const [q, setQ] = useState(params.q ?? '');
  useEffect(() => setQ(params.q ?? ''), [params.q]);

  return (
    <div>
      <PageHeader
        title={def.title}
        description={def.description}
        actions={
          <>
            {def.csv !== false && (
              <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm hover:border-ink" href={`/api/v1${def.api}${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>
                Export CSV
              </a>
            )}
            {can(def.module, 'create') && (
              <Link href={`/${def.key}/new`} className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover">
                {def.createLabel ?? `Add ${def.singular.toLowerCase()}`}
              </Link>
            )}
          </>
        }
      />
      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q });
        }}
      >
        <Input aria-label="Search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        {def.filters?.map((f) => (
          <Select key={f.name} aria-label={f.label} className="max-w-48" value={params[f.name] ?? ''} onChange={(e) => set({ [f.name]: e.target.value || undefined })}>
            <option value="">{f.label}: all</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {isFetching && <Spinner label="Updating" />}
      </form>
      {error && <Alert tone="danger">{errorText(error)}</Alert>}
      <DataTable
        rows={data?.items}
        columns={def.columns}
        loading={isLoading}
        sort={params.sort}
        onSort={(s) => set({ sort: s })}
        rowHref={(r) => `/${def.key}/${r.id}`}
        empty={`No ${def.title.toLowerCase()} yet`}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export function ResourceForm<T extends { id: string }>({ def, id, children }: { def: ResourceDef<T>; id: string; children?: (row: T) => ReactNode }) {
  const isNew = id === 'new';
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: row, isLoading } = useQuery({ queryKey: [def.api, id], queryFn: () => api<T>(`${def.api}/${id}`), enabled: !isNew });
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(def.defaults ?? {}) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    const v: Record<string, unknown> = {};
    for (const f of def.fields) v[f.name] = f.read ? f.read(row) : (row as Record<string, unknown>)[f.name];
    setValues(v);
  }, [row, def.fields]);

  const save = useMutation({
    mutationFn: async () => {
      const visible = def.fields.filter((f) => (!f.only || f.only === (isNew ? 'create' : 'edit')) && (!f.showIf || f.showIf(values)));
      let body: Record<string, unknown> = {};
      for (const f of visible) if (values[f.name] !== undefined) body[f.name] = values[f.name] === '' ? null : values[f.name];
      if (def.toBody) body = def.toBody(body, isNew ? 'create' : 'edit');
      return isNew ? api<T>(def.api, { method: 'POST', json: body }) : api<T>(`${def.api}/${id}`, { method: 'PATCH', json: body });
    },
    onSuccess: async (saved) => {
      setErrors({});
      setFormError(null);
      await qc.invalidateQueries({ queryKey: [def.api] });
      toast(`${def.singular} saved`);
      if (isNew) router.replace(`/${def.key}/${saved.id}`);
    },
    onError: (e) => {
      setFormError(errorText(e));
      if (e instanceof ApiError && e.fields) setErrors(e.fields);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`${def.api}/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [def.api] });
      toast(`${def.singular} ${def.remove?.kind === 'delete' ? 'deleted' : def.remove?.kind === 'archive' ? 'archived' : 'deactivated'}`);
      router.replace(`/${def.key}`);
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => api(`${def.api}/${id}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [def.api] });
      toast('Saved');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  if (!isNew && isLoading) return <Spinner />;
  const editable = can(def.module, isNew ? 'create' : 'edit');
  const active = (row as { isActive?: boolean } | undefined)?.isActive;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={isNew ? `New ${def.singular.toLowerCase()}` : String((row as Record<string, unknown>)?.name ?? (row as Record<string, unknown>)?.title ?? def.singular)}
        description={
          <Link href={`/${def.key}`} className="text-accent hover:underline">
            ← {def.title}
          </Link>
        }
        actions={
          !isNew && (
            <>
              {def.extraActions && row && def.extraActions(row)}
              {active !== undefined && def.remove?.kind !== 'deactivate' && can(def.module, 'edit') && (
                <Button variant="secondary" size="sm" onClick={() => toggle.mutate(!active)} loading={toggle.isPending}>
                  {active ? 'Deactivate' : 'Activate'}
                </Button>
              )}
              {active !== undefined && def.remove?.kind === 'deactivate' && can(def.module, 'edit') && (
                <Button variant={active ? 'danger' : 'secondary'} size="sm" onClick={() => toggle.mutate(!active)} loading={toggle.isPending}>
                  {active ? 'Deactivate' : 'Activate'}
                </Button>
              )}
              {def.remove && def.remove.kind !== 'deactivate' && can(def.module, 'delete') && (
                <Button
                  variant="danger"
                  size="sm"
                  loading={remove.isPending}
                  onClick={() => window.confirm(`${def.remove!.label} this ${def.singular.toLowerCase()}?`) && remove.mutate()}
                >
                  {def.remove.label}
                </Button>
              )}
            </>
          )
        }
      />
      <Card>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {formError && (
            <div className="md:col-span-2">
              <Alert tone="danger">{formError}</Alert>
            </div>
          )}
          {def.fields
            .filter((f) => (!f.only || f.only === (isNew ? 'create' : 'edit')) && (!f.showIf || f.showIf(values)))
            .map((f) => (
              <div key={f.name} className={f.wide || f.type === 'textarea' || f.type === 'json' || f.type === 'refMulti' ? 'md:col-span-2' : undefined}>
                <FieldInput def={f} value={values[f.name]} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} error={errors[f.name]} />
              </div>
            ))}
          {editable && (
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" loading={save.isPending}>
                {isNew ? `Create ${def.singular.toLowerCase()}` : 'Save changes'}
              </Button>
              <Link href={`/${def.key}`} className="inline-flex min-h-11 items-center px-3 text-sm text-muted hover:text-ink">
                Cancel
              </Link>
            </div>
          )}
        </form>
      </Card>
      {row && children?.(row)}
    </div>
  );
}
