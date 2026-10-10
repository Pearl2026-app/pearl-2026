'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { Alert, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { type Page } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

interface N { id: string; title: string; status: string; createdAt: string; scheduledAt: string | null; sentAt: string | null; targetCount: number; delivered: number; failed: number; queued: number }

function List() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<N>('/admin/campaigns', params);
  const page = data as (Page<N> & { pushReady: boolean }) | undefined;
  const can = useCan();
  return (
    <div>
      <PageHeader
        title="Push notifications"
        description="Offers and announcements to customer app users. Order updates go out automatically."
        actions={can('NOTIFICATIONS', 'create') && <Link href="/notifications/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">New notification</Link>}
      />
      {page && !page.pushReady && <div className="mb-3"><Alert tone="warning">Push sending is not set up yet (Firebase keys are needed). Notifications are recorded but not delivered to phones.</Alert></div>}
      <DataTable
        rows={page?.items ?? []}
        loading={isLoading}
        rowHref={(r) => `/notifications/${r.id}`}
        empty="No notifications yet"
        columns={[
          { key: 'title', label: 'Title' },
          { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'when', label: 'When', render: (r) => dateTime(r.sentAt ?? r.scheduledAt ?? r.createdAt) },
          { key: 'targetCount', label: 'Devices', render: (r) => (r.status === 'SENT' ? r.targetCount : '—') },
          { key: 'delivered', label: 'Delivered / failed', render: (r) => (r.status === 'SENT' ? `${r.delivered} / ${r.failed}${r.queued ? ` (${r.queued} queued)` : ''}` : '—') },
        ]}
      />
      {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense>
      <List />
    </Suspense>
  );
}
