'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@sahyadri/ui';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/lib/session';

export default function PagesPage() {
  const { data, isLoading } = useQuery({ queryKey: ['/admin/pages'], queryFn: () => api<any[]>('/admin/pages') });
  const can = useCan();
  return (
    <div>
      <PageHeader
        title="Pages & legal"
        description="Our Story, About and the five legal pages. Every published change keeps the earlier version."
        actions={can('CONTENT', 'create') && <Link href="/pages/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">Add page</Link>}
      />
      <DataTable
        rows={data}
        loading={isLoading}
        rowHref={(r) => `/pages/${r.id}`}
        columns={[
          { key: 'title', label: 'Page' },
          { key: 'slug', label: 'URL', render: (r) => `/${r.slug}` },
          { key: 'isLegal', label: 'Type', render: (r) => (r.isLegal ? <Badge tone="info">Legal</Badge> : 'Content') },
          { key: 'version', label: 'Version', render: (r) => `v${r.currentVersion?.version ?? 0} · ${dateTime(r.currentVersion?.publishedAt)}` },
        ]}
      />
    </div>
  );
}
