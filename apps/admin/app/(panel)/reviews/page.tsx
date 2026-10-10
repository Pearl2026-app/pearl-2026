'use client';
import { Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { date } from '@/lib/format';
import { useCan } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

function Reviews() {
  const { params, set } = useListParams({ status: 'PENDING' });
  const { data, isLoading } = useList<any>('/admin/reviews', params);
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const decide = async (id: string, d: 'approve' | 'reject') => {
    try {
      await api(`/admin/reviews/${id}/${d}`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['/admin/reviews'] });
      toast(d === 'approve' ? 'Review published' : 'Review rejected');
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };
  return (
    <div>
      <PageHeader title="Reviews" description="Customers are asked for a review after delivery. Reviews show on the site only after approval." />
      <Select aria-label="Status" className="mb-3 max-w-44" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
        <option value="">All</option>
        <option value="PENDING">Waiting</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
      </Select>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        columns={[
          { key: 'product', label: 'Product', render: (r) => r.product.name },
          { key: 'customer', label: 'Customer', render: (r) => r.customer.user.name },
          { key: 'rating', label: 'Rating', render: (r) => '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) },
          { key: 'body', label: 'Review', render: (r) => <span className="block max-w-md text-sm">{r.title && <strong>{r.title} </strong>}{r.body}</span> },
          { key: 'createdAt', label: 'Date', render: (r) => date(r.createdAt) },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', label: '', render: (r) => can('REVIEWS', 'edit') && r.status === 'PENDING' && (
            <span className="flex gap-1"><Button size="sm" onClick={() => decide(r.id, 'approve')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decide(r.id, 'reject')}>Reject</Button></span>
          ) },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function ReviewsPage() { return <Suspense><Reviews /></Suspense>; }
