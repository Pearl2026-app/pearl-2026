'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { Input, Select } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { qs, type Page } from '@/lib/api';
import { date, inr } from '@/lib/format';
import { useCan } from '@/lib/session';
import { STAGES, stageLabel } from '@/lib/custom';
import { useList, useListParams } from '@/lib/use-list';


interface C { id: string; createdAt: string; jewelleryType: string; stage: string; quotedPaise: number | null; enquiry: { reference: string; contactName: string | null; contactPhone: string | null } | null; customer: { user: { name: string; phone: string | null } } | null; city: { name: string } | null; order: { id: string; number: string } | null }

function List() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<C>('/admin/custom-orders', params);
  const page = data as (Page<C> & { stageCounts: Record<string, number> }) | undefined;
  const can = useCan();
  const [q, setQ] = useState(params.q ?? '');
  return (
    <div>
      <PageHeader
        title="Customized orders"
        description="From requirement to delivery. Customized enquiries appear here automatically."
        actions={
          <>
            <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/custom-orders${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>Export CSV</a>
            {can('CUSTOM_ORDERS', 'create') && <Link href="/custom-orders/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">New customized order</Link>}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1 text-sm" role="tablist">
        {['', ...STAGES].map((s) => (
          <button key={s || 'all'} role="tab" aria-selected={(params.stage ?? '') === s} onClick={() => set({ stage: s || undefined })} className={`rounded-full border px-3 py-1 ${(params.stage ?? '') === s ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
            {s ? stageLabel(s) : 'All'} {s && page?.stageCounts[s] ? `(${page.stageCounts[s]})` : ''}
          </button>
        ))}
      </div>
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
        <Input aria-label="Search" placeholder="Customer, phone, enquiry or order no." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Select aria-label="Sort" className="max-w-44" value={params.sort ?? ''} onChange={(e) => set({ sort: e.target.value || undefined })}>
          <option value="">Recently updated</option>
          <option value="-createdAt">Newest</option>
        </Select>
      </form>
      <DataTable
        rows={page?.items ?? []}
        loading={isLoading}
        rowHref={(r) => `/custom-orders/${r.id}`}
        empty="No customized orders"
        columns={[
          { key: 'createdAt', label: 'Created', render: (r) => date(r.createdAt) },
          { key: 'customer', label: 'Customer', render: (r) => <>{r.customer?.user.name ?? r.enquiry?.contactName ?? '—'}<span className="block text-xs text-muted">{r.customer?.user.phone ?? r.enquiry?.contactPhone}</span></> },
          { key: 'jewelleryType', label: 'Piece' },
          { key: 'city', label: 'City', render: (r) => r.city?.name ?? '—' },
          { key: 'quotedPaise', label: 'Quote', render: (r) => inr(r.quotedPaise) },
          { key: 'stage', label: 'Stage', render: (r) => stageLabel(r.stage) },
          { key: 'ref', label: 'Enquiry / order', render: (r) => [r.enquiry?.reference, r.order?.number].filter(Boolean).join(' · ') || '—' },
        ]}
      />
      {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export default function CustomOrdersPage() {
  return (
    <Suspense>
      <List />
    </Suspense>
  );
}
