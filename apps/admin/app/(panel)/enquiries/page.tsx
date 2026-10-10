'use client';
import { Suspense, useState } from 'react';
import { ENQUIRY_TYPE_LABEL, type EnquiryType } from '@sahyadri/shared';
import { Badge, Button, cx, Input, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { qs } from '@/lib/api';
import { ago } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

const STAGES = ['NEW', 'IN_PROGRESS', 'QUOTED', 'CONVERTED', 'CLOSED'] as const;

interface E { id: string; reference: string; type: EnquiryType; stage: string; createdAt: string; contactName: string | null; contactPhone: string | null; source: string | null; responseMinutes: number; overdue: boolean; firstResponseAt: string | null; product: { name: string; sku: string } | null; city: { name: string } | null; owner: { name: string } | null; franchise: { name: string } | null; convertedOrder: { number: string } | null }

function Inbox() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<E>('/admin/enquiries', params);
  const { data: cities } = useRefOptions({ path: '/admin/cities' });
  const [q, setQ] = useState(params.q ?? '');
  const counts = (data as unknown as { stageCounts?: Record<string, number> })?.stageCounts ?? {};
  return (
    <div>
      <PageHeader
        title="Enquiries"
        description="Every WhatsApp, product, custom, bulk and contact enquiry. The timer shows how long until someone first responded."
        actions={<a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/enquiries${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>Export CSV</a>}
      />
      <div role="tablist" className="mb-3 flex flex-wrap gap-1">
        <button role="tab" aria-selected={!params.stage} onClick={() => set({ stage: undefined })} className={cx('min-h-9 rounded-sm px-3 text-sm', !params.stage ? 'bg-ink text-white' : 'bg-surface')}>All</button>
        {STAGES.map((s) => (
          <button key={s} role="tab" aria-selected={params.stage === s} onClick={() => set({ stage: s })} className={cx('min-h-9 rounded-sm px-3 text-sm', params.stage === s ? 'bg-ink text-white' : 'bg-surface')}>
            {s.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} <span className="opacity-60">{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), set({ q }))}>
        <Input aria-label="Search" placeholder="Reference, name, phone or SKU" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select aria-label="Type" className="max-w-44" value={params.type ?? ''} onChange={(e) => set({ type: e.target.value || undefined })}>
          <option value="">Any type</option>
          {Object.entries(ENQUIRY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="City" className="max-w-40" value={params.cityId ?? ''} onChange={(e) => set({ cityId: e.target.value || undefined })}>
          <option value="">Any city</option>
          {cities?.items.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
        </Select>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={params.mine === 'true'} onChange={(e) => set({ mine: e.target.checked ? 'true' : undefined })} /> Mine</label>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        rowHref={(r) => `/enquiries/${r.id}`}
        columns={[
          { key: 'reference', label: 'Reference', render: (r) => <span className="font-mono text-xs">{r.reference}</span> },
          { key: 'type', label: 'Type', render: (r) => ENQUIRY_TYPE_LABEL[r.type] },
          { key: 'about', label: 'About', render: (r) => r.product ? <span>{r.product.name}<span className="block text-xs text-muted">{r.product.sku}</span></span> : '—' },
          { key: 'contact', label: 'Customer', render: (r) => <span>{r.contactName ?? '—'}<span className="block text-xs text-muted">{r.contactPhone}</span></span> },
          { key: 'city', label: 'City', render: (r) => r.city?.name ?? '—' },
          { key: 'source', label: 'Source' },
          { key: 'owner', label: 'Owner', render: (r) => r.owner?.name ?? r.franchise?.name ?? <span className="text-muted">Unassigned</span> },
          { key: 'stage', label: 'Stage', render: (r) => <StatusBadge status={r.stage} /> },
          { key: 'timer', label: 'Response', render: (r) => r.firstResponseAt ? <span className="text-xs">{r.responseMinutes} min</span> : <Badge tone={r.overdue ? 'danger' : 'waiting'}>{ago(r.createdAt)}</Badge> },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function EnquiriesPage() { return <Suspense><Inbox /></Suspense>; }
