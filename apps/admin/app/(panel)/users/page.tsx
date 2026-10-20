'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { ROLE_LABEL, type Role } from '@sahyadri/shared';
import { Badge, Select } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { ago } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

interface U { id: string; name: string; role: Role; email: string | null; phone: string | null; isActive: boolean; lastLoginAt: string | null; city: { name: string } | null; vendor: { name: string } | null; franchise: { name: string } | null; deliveryPartner: { name: string } | null }

function Users() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<U>('/admin/users', params);
  return (
    <div>
      <PageHeader
        title="Staff & partner logins"
        description="Create logins, assign a role and grant modules. Only a Super Admin can do this."
        actions={<Link href="/users/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">Add login</Link>}
      />
      <div className="mb-3 flex gap-2">
        <Select aria-label="Role" className="max-w-56" value={params.role ?? ''} onChange={(e) => set({ role: e.target.value || undefined })}>
          <option value="">All roles</option>
          {(['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER', 'MANUFACTURER', 'FARMER'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        rowHref={(r) => `/users/${r.id}`}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role', render: (r) => ROLE_LABEL[r.role] },
          { key: 'scope', label: 'Scope', render: (r) => r.city?.name ?? r.vendor?.name ?? r.franchise?.name ?? r.deliveryPartner?.name ?? 'All' },
          { key: 'email', label: 'Sign-in', render: (r) => r.email ?? r.phone },
          { key: 'lastLoginAt', label: 'Last sign-in', render: (r) => ago(r.lastLoginAt) },
          { key: 'isActive', label: 'Status', render: (r) => <Badge tone={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'Active' : 'Deactivated'}</Badge> },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function UsersPage() {
  return <Suspense><Users /></Suspense>;
}
