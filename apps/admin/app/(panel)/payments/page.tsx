'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText, qs, type Page } from '@/lib/api';
import { dateTime, inr } from '@/lib/format';
import { useCan } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

interface P { id: string; createdAt: string; method: string; status: string; amountPaise: number; provider: string; providerPaymentId: string | null; reconciledAt: string | null; order: { id: string; number: string; contactName: string; city: { name: string }; delivery: { deliveryPartner: { name: string } | null; codCollectedPaise: number | null } | null }; refunds: Array<{ amountPaise: number; status: string }> }

function Payments() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<P>('/admin/payments', params);
  const page = data as (Page<P> & { codOutstanding: { count: number; amountPaise: number } }) | undefined;
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState(params.q ?? '');
  const reconcile = useMutation({
    mutationFn: (paymentIds: string[]) => api<{ reconciled: number }>('/admin/payments/reconcile', { method: 'POST', json: { paymentIds } }),
    onSuccess: async (r) => {
      setPicked([]);
      await qc.invalidateQueries({ queryKey: ['/admin/payments'] });
      toast(`${r.reconciled} COD payment(s) marked received`);
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const openCod = (r: P) => r.method === 'COD' && r.status === 'CAPTURED' && !r.reconciledAt;
  const toggle = (id: string) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pickedTotal = (page?.items ?? []).filter((r) => picked.includes(r.id)).reduce((s, r) => s + r.amountPaise, 0);

  return (
    <div>
      <PageHeader
        title="Payments"
        actions={<a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/payments${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>Export CSV</a>}
      />
      {page && page.codOutstanding.count > 0 && (
        <div className="mb-3"><Alert tone="warning">
          {page.codOutstanding.count} cash-on-delivery payment(s), {inr(page.codOutstanding.amountPaise)} in total, are collected but not yet received at the office.{' '}
          <button type="button" className="underline" onClick={() => set({ unreconciled: 'true', method: undefined, status: undefined })}>Show them</button>
        </Alert></div>
      )}
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
        <Input aria-label="Search" placeholder="Order no. or gateway payment id" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Method" className="max-w-44" value={params.method ?? ''} onChange={(e) => set({ method: e.target.value || undefined })}>
          <option value="">All methods</option>
          <option value="ONLINE">Online</option>
          <option value="COD">Cash on delivery</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="OTHER">Other</option>
        </Select>
        <Select aria-label="Status" className="max-w-44" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">All statuses</option>
          {['CREATED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={params.unreconciled === 'true'} onChange={(e) => set({ unreconciled: e.target.checked ? 'true' : undefined })} /> COD not yet received
        </label>
        <Button type="submit" size="sm" variant="secondary">Search</Button>
      </form>
      {can('PAYMENTS', 'edit') && picked.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-sm border border-line bg-surface p-2 text-sm">
          {picked.length} selected · {inr(pickedTotal)}
          <Button size="sm" loading={reconcile.isPending} onClick={() => window.confirm(`Confirm ${inr(pickedTotal)} cash received at the office?`) && reconcile.mutate(picked)}>Mark cash received</Button>
        </div>
      )}
      <DataTable
        rows={page?.items ?? []}
        loading={isLoading}
        empty="No payments"
        columns={[
          { key: 'pick', label: '', render: (r) => (can('PAYMENTS', 'edit') && openCod(r) ? <input type="checkbox" aria-label={`Select ${r.order.number}`} checked={picked.includes(r.id)} onChange={() => toggle(r.id)} /> : null) },
          { key: 'createdAt', label: 'Date', render: (r) => dateTime(r.createdAt) },
          { key: 'order', label: 'Order', render: (r) => <Link className="text-accent underline" href={`/orders/${r.order.id}`}>{r.order.number}</Link> },
          { key: 'customer', label: 'Customer', render: (r) => <>{r.order.contactName}<span className="block text-xs text-muted">{r.order.city.name}</span></> },
          { key: 'method', label: 'Method', render: (r) => <>{r.method.replace('_', ' ').toLowerCase()}<span className="block text-xs text-muted">{r.method === 'COD' ? (r.order.delivery?.deliveryPartner?.name ?? '') : (r.providerPaymentId ?? r.provider)}</span></> },
          { key: 'amountPaise', label: 'Amount', render: (r) => <>{inr(r.amountPaise)}{r.refunds.length > 0 && <span className="block text-xs text-danger">−{inr(r.refunds.filter((f) => f.status !== 'FAILED').reduce((s, f) => s + f.amountPaise, 0))} refunded</span>}</> },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'reconciledAt', label: 'Received at office', render: (r) => (r.method !== 'COD' ? '—' : r.reconciledAt ? dateTime(r.reconciledAt) : r.status === 'CAPTURED' ? <span className="text-warning">Pending</span> : '—') },
        ]}
      />
      {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <Payments />
    </Suspense>
  );
}
