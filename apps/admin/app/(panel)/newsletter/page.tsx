'use client';
import { Suspense } from 'react';
import { Input, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { dateTime } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

interface S { id: string; email: string; name: string | null; source: string | null; consentAt: string; unsubscribedAt: string | null }

function Subscribers() {
  const { params, set } = useListParams({ pageSize: '50' });
  const { data, isLoading } = useList<S>('/admin/newsletter', params);
  const csv = `/api/v1/admin/newsletter?format=csv${params.status ? `&status=${params.status}` : ''}${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}`;
  const active = (data as { active?: number } | undefined)?.active;
  return (
    <div>
      <PageHeader
        title="Newsletter"
        description={`People who asked for our emails from the website footer, with the date they agreed.${active != null ? ` ${active} currently subscribed.` : ''}`}
        actions={<a href={csv} className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">Download CSV</a>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input aria-label="Search" placeholder="Search email or name" className="max-w-64" defaultValue={params.q ?? ''} onChange={(e) => set({ q: e.target.value || undefined })} />
        <Select aria-label="Status" className="max-w-44" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">Everyone</option>
          <option value="active">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
        </Select>
      </div>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        empty="No sign-ups yet."
        columns={[
          { key: 'email', label: 'Email' },
          { key: 'name', label: 'Name', render: (r) => r.name ?? '—' },
          { key: 'source', label: 'Where', render: (r) => r.source ?? '—' },
          { key: 'consentAt', label: 'Agreed on', render: (r) => dateTime(r.consentAt) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.unsubscribedAt ? 'INACTIVE' : 'ACTIVE'} label={r.unsubscribedAt ? `Unsubscribed ${dateTime(r.unsubscribedAt)}` : 'Subscribed'} /> },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function NewsletterPage() { return <Suspense><Subscribers /></Suspense>; }
