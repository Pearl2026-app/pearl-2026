'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { dateTime, inr, toPaise, toRupees } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

interface R { id: string; type: 'RETURN' | 'CANCELLATION'; status: string; reason: string; createdAt: string; pickupAt: string | null; order: { id: string; number: string; status: string; paymentStatus: string; totalPaise: number; contactName: string; contactPhone: string }; refunds: Array<{ amountPaise: number; status: string }> }

// Mirrors the server's state machine; the server is still the judge of every step.
const ACTIONS: Record<string, Array<{ action: string; label: string; returnOnly?: boolean; refund?: boolean; danger?: boolean }>> = {
  REQUESTED: [{ action: 'approve', label: 'Approve' }, { action: 'reject', label: 'Reject', danger: true }],
  APPROVED: [{ action: 'schedule', label: 'Schedule pickup', returnOnly: true }, { action: 'receive', label: 'Mark received', returnOnly: true }, { action: 'refund', label: 'Refund', refund: true }, { action: 'close', label: 'Close' }],
  PICKUP_SCHEDULED: [{ action: 'picked-up', label: 'Picked up' }, { action: 'close', label: 'Close' }],
  PICKED_UP: [{ action: 'receive', label: 'Mark received' }],
  RECEIVED: [{ action: 'refund', label: 'Refund', refund: true }, { action: 'close', label: 'Close' }],
  REFUNDED: [{ action: 'close', label: 'Close' }],
};

function Returns() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<R>('/admin/returns', params);
  const can = useCan();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const headOffice = me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF';
  const act = useMutation({
    mutationFn: ({ id, action, json }: { id: string; action: string; json: Record<string, unknown> }) => api(`/admin/returns/${id}/${action}`, { method: 'POST', json }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/returns'] });
      toast('Updated');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  const run = (r: R, a: (typeof ACTIONS)[string][number]) => {
    const json: Record<string, unknown> = {};
    if (a.action === 'reject' || a.action === 'approve') {
      const note = window.prompt(a.action === 'reject' ? 'Why is this being rejected? (sent to the customer)' : 'Note for the customer (optional)');
      if (a.action === 'reject' && !note) return;
      if (note) json.note = note;
    }
    if (a.action === 'schedule') {
      const when = window.prompt('Pickup date and time (YYYY-MM-DD HH:MM)');
      if (!when) return;
      const d = new Date(when.replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return toast('Use the format 2026-10-12 14:00', 'danger');
      json.pickupAt = d.toISOString();
    }
    if (a.refund) {
      const paid = r.order.paymentStatus === 'PAID' || r.order.paymentStatus === 'COD_COLLECTED';
      if (paid) {
        const amount = window.prompt('Refund amount in ₹', toRupees(r.order.totalPaise));
        if (!amount) return;
        const p = toPaise(amount);
        if (!p) return toast('Enter a valid amount', 'danger');
        if (!window.confirm(`Refund ${inr(p)} for order ${r.order.number}?`)) return;
        json.refundPaise = p;
      } else if (!window.confirm('Nothing was paid on this order. Mark the request refunded?')) return;
    }
    act.mutate({ id: r.id, action: a.action, json });
  };

  return (
    <div>
      <PageHeader title="Returns & cancellations" description="Requests from customers. Approving a cancellation cancels the order and puts the piece back on sale; a received return does the same." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select aria-label="Status" className="max-w-48" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">All statuses</option>
          {Object.keys(ACTIONS).concat('REJECTED', 'CLOSED').map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </Select>
        <Select aria-label="Type" className="max-w-48" value={params.type ?? ''} onChange={(e) => set({ type: e.target.value || undefined })}>
          <option value="">Returns and cancellations</option>
          <option value="RETURN">Returns</option>
          <option value="CANCELLATION">Cancellations</option>
        </Select>
      </div>
      <DataTable
        rows={data?.items ?? []}
        loading={isLoading}
        empty="No requests"
        columns={[
          { key: 'createdAt', label: 'Requested', render: (r) => dateTime(r.createdAt) },
          { key: 'order', label: 'Order', render: (r) => <Link className="text-accent underline" href={`/orders/${r.order.id}`}>{r.order.number}</Link> },
          { key: 'customer', label: 'Customer', render: (r) => <>{r.order.contactName}<span className="block text-xs text-muted">{r.order.contactPhone}</span></> },
          { key: 'type', label: 'Type', render: (r) => r.type.toLowerCase() },
          { key: 'reason', label: 'Reason', render: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span> },
          { key: 'total', label: 'Value', render: (r) => <>{inr(r.order.totalPaise)}<span className="block text-xs text-muted">{r.order.paymentStatus.toLowerCase().replace('_', ' ')}</span></> },
          { key: 'status', label: 'Status', render: (r) => <><StatusBadge status={r.status} />{r.pickupAt && <span className="block text-xs text-muted">Pickup {dateTime(r.pickupAt)}</span>}</> },
          {
            key: 'actions',
            label: '',
            render: (r) =>
              can('RETURNS', 'edit') ? (
                <div className="flex flex-wrap gap-1">
                  {(ACTIONS[r.status] ?? [])
                    .filter((a) => (!a.returnOnly || r.type === 'RETURN') && (!a.refund || headOffice))
                    .map((a) => <Button key={a.action} size="sm" variant={a.danger ? 'danger' : 'secondary'} onClick={() => run(r, a)} disabled={act.isPending}>{a.label}</Button>)}
                </div>
              ) : null,
          },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export default function ReturnsPage() {
  return (
    <Suspense>
      <Returns />
    </Suspense>
  );
}
