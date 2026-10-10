'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type OrderStatus, type PaymentStatus } from '@sahyadri/shared';
import { Button, Input, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { qs } from '@/lib/api';
import { date, inr, toPaise } from '@/lib/format';
import { useCan } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

interface O { id: string; number: string; placedAt: string; contactName: string; contactPhone: string; status: OrderStatus; paymentStatus: PaymentStatus; paymentMethod: string; totalPaise: number; source: string; channel: string | null; city: { name: string }; vendor: { name: string } | null; franchise: { name: string } | null; delivery: { deliveryPartner: { name: string } | null } | null }

function RefFilter({ label, path, name, params, set }: { label: string; path: string; name: string; params: Record<string, string>; set: (p: Record<string, string | undefined>) => void }) {
  const { data } = useRefOptions({ path });
  if (!data) return null;
  return (
    <Select aria-label={label} className="max-w-44" value={params[name] ?? ''} onChange={(e) => set({ [name]: e.target.value || undefined })}>
      <option value="">{label}: all</option>
      {data.items.map((o) => <option key={String(o.id)} value={String(o.id)}>{String(o.name)}</option>)}
    </Select>
  );
}

function Orders() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<O>('/admin/orders', params);
  const can = useCan();
  const [q, setQ] = useState(params.q ?? '');
  const [from, setFrom] = useState(params.from?.slice(0, 10) ?? '');
  const [to, setTo] = useState(params.to?.slice(0, 10) ?? '');
  const [minV, setMinV] = useState(params.minTotal ? String(Number(params.minTotal) / 100) : '');
  const [maxV, setMaxV] = useState(params.maxTotal ? String(Number(params.maxTotal) / 100) : '');
  return (
    <div>
      <PageHeader
        title="Orders"
        actions={
          <>
            <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/orders${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>Export CSV</a>
            {can('ORDERS', 'create') && <Link href="/orders/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">New manual order</Link>}
          </>
        }
      />
      <form
        className="mb-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          set({
            q,
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
            minTotal: minV ? String(toPaise(minV)) : undefined,
            maxTotal: maxV ? String(toPaise(maxV)) : undefined,
          });
        }}
      >
        <Input aria-label="Search" placeholder="Order no., customer, phone or SKU" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select aria-label="Status" className="max-w-44" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">Status: all</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select aria-label="Payment" className="max-w-44" value={params.paymentStatus ?? ''} onChange={(e) => set({ paymentStatus: e.target.value || undefined })}>
          <option value="">Payment: all</option>
          {Object.entries(PAYMENT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        {can('CITIES') && <RefFilter label="City" path="/admin/cities" name="cityId" params={params} set={set} />}
        {can('VENDORS') && <RefFilter label="Vendor" path="/admin/vendors" name="vendorId" params={params} set={set} />}
        {can('FRANCHISES') && <RefFilter label="Franchise" path="/admin/franchises" name="franchiseId" params={params} set={set} />}
        {can('MANUFACTURERS') && <RefFilter label="Manufacturer" path="/admin/manufacturers" name="manufacturerId" params={params} set={set} />}
        <Input aria-label="From date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="max-w-40" />
        <Input aria-label="To date" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="max-w-40" />
        <Input aria-label="Minimum value (₹)" placeholder="Min ₹" value={minV} onChange={(e) => setMinV(e.target.value)} className="max-w-28" />
        <Input aria-label="Maximum value (₹)" placeholder="Max ₹" value={maxV} onChange={(e) => setMaxV(e.target.value)} className="max-w-28" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        sort={params.sort}
        onSort={(s) => set({ sort: s })}
        rowHref={(r) => `/orders/${r.id}`}
        columns={[
          { key: 'number', label: 'Order', sortable: true },
          { key: 'placedAt', label: 'Placed', sortable: true, render: (r) => date(r.placedAt) },
          { key: 'customer', label: 'Customer', render: (r) => <span>{r.contactName}<span className="block text-xs text-muted">{r.contactPhone}</span></span> },
          { key: 'city', label: 'City', render: (r) => r.city.name },
          { key: 'source', label: 'Source', render: (r) => `${r.source.toLowerCase()}${r.channel ? ` · ${r.channel}` : ''}` },
          { key: 'totalPaise', label: 'Total', sortable: true, render: (r) => inr(r.totalPaise) },
          { key: 'paymentStatus', label: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus} label={PAYMENT_STATUS_LABEL[r.paymentStatus]} /> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} label={ORDER_STATUS_LABEL[r.status]} /> },
          { key: 'assigned', label: 'Assigned', render: (r) => <span className="text-xs">{[r.vendor?.name, r.franchise?.name, r.delivery?.deliveryPartner?.name].filter(Boolean).join(' · ') || '—'}</span> },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function OrdersPage() {
  return <Suspense><Orders /></Suspense>;
}
