'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Select } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { ago, dateTime, inr } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

interface C { id: string; lastActivityAt: string; reminderSentAt: string | null; contact: { name: string | null; phone: string | null; email: string | null }; valuePaise: number; items: Array<{ name: string; sku: string; quantity: number }>; isGuest: boolean }

function List() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<C>('/admin/abandoned-carts', params);
  const qc = useQueryClient();
  const toast = useToast();
  const remind = useMutation({
    mutationFn: (id: string) => api(`/admin/abandoned-carts/${id}/remind`, { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['/admin/abandoned-carts'] });
      toast('Reminder sent');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <div>
      <PageHeader
        title="Abandoned carts"
        description={<>Carts with pieces left for over 30 minutes in the last 30 days. One reminder goes out automatically after the delay set in <Link className="text-accent underline" href="/settings">Settings → Cart reminder</Link>.</>}
      />
      <div className="mb-3">
        <Select aria-label="Reminder" className="max-w-56" value={params.reminded ?? ''} onChange={(e) => set({ reminded: e.target.value || undefined })}>
          <option value="">All</option>
          <option value="false">Not reminded yet</option>
          <option value="true">Reminded</option>
        </Select>
      </div>
      <DataTable
        rows={data?.items ?? []}
        loading={isLoading}
        empty="No abandoned carts"
        columns={[
          { key: 'lastActivityAt', label: 'Last activity', render: (r) => <span title={dateTime(r.lastActivityAt)}>{ago(r.lastActivityAt)}</span> },
          { key: 'contact', label: 'Shopper', render: (r) => <>{r.contact.name ?? (r.isGuest ? 'Guest' : '—')}<span className="block text-xs text-muted">{r.contact.phone ?? 'no phone yet'}</span></> },
          { key: 'items', label: 'Pieces', render: (r) => <span className="line-clamp-2 max-w-xs">{r.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ''}${i.name}`).join(', ')}</span> },
          { key: 'valuePaise', label: 'Value', render: (r) => inr(r.valuePaise) },
          { key: 'reminderSentAt', label: 'Reminder', render: (r) => (r.reminderSentAt ? `Sent ${ago(r.reminderSentAt)}` : 'Not yet') },
          { key: 'actions', label: '', render: (r) => (r.contact.phone ? <Button size="sm" variant="secondary" loading={remind.isPending && remind.variables === r.id} onClick={() => window.confirm(`Send a reminder to ${r.contact.phone}?`) && remind.mutate(r.id)}>{r.reminderSentAt ? 'Remind again' : 'Remind now'}</Button> : null) },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export default function AbandonedCartsPage() {
  return (
    <Suspense>
      <List />
    </Suspense>
  );
}
