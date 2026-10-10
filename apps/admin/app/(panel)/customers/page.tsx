'use client';
import { Suspense, useState } from 'react';
import { Badge, Button, Input, Select } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { qs } from '@/lib/api';
import { date, inr } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

interface C { id: string; referralCode: string; isBlocked: boolean; createdAt: string; orderCount: number; totalSpendPaise: number; user: { name: string; phone: string; email: string | null }; city: { name: string } | null }

function Customers() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<C>('/admin/customers', params);
  const { data: cities } = useRefOptions({ path: '/admin/cities' });
  const [q, setQ] = useState(params.q ?? '');
  return (
    <div>
      <PageHeader
        title="Customers"
        actions={<a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/customers${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>Export CSV</a>}
      />
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), set({ q }))}>
        <Input aria-label="Search" placeholder="Name, phone, email or referral code" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select aria-label="City" className="max-w-44" value={params.cityId ?? ''} onChange={(e) => set({ cityId: e.target.value || undefined })}>
          <option value="">All cities</option>
          {cities?.items.map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}
        </Select>
        <Select aria-label="Status" className="max-w-40" value={params.blocked ?? ''} onChange={(e) => set({ blocked: e.target.value || undefined })}>
          <option value="">Any status</option>
          <option value="false">Active</option>
          <option value="true">Blocked</option>
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        rowHref={(r) => `/customers/${r.id}`}
        columns={[
          { key: 'name', label: 'Name', render: (r) => r.user.name },
          { key: 'phone', label: 'Phone', render: (r) => r.user.phone },
          { key: 'email', label: 'Email', render: (r) => r.user.email ?? '—' },
          { key: 'city', label: 'City', render: (r) => r.city?.name ?? '—' },
          { key: 'orderCount', label: 'Orders' },
          { key: 'totalSpendPaise', label: 'Total spend', render: (r) => inr(r.totalSpendPaise) },
          { key: 'referralCode', label: 'Referral code' },
          { key: 'isBlocked', label: 'Status', render: (r) => <Badge tone={r.isBlocked ? 'danger' : 'success'}>{r.isBlocked ? 'Blocked' : 'Active'}</Badge> },
          { key: 'createdAt', label: 'Joined', render: (r) => date(r.createdAt) },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function CustomersPage() {
  return <Suspense><Customers /></Suspense>;
}
