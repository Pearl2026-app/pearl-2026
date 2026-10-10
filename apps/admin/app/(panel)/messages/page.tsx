'use client';
import { Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Select, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useCan } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

interface M { id: string; createdAt: string; channel: string; recipient: string; subject: string | null; body: string; status: string; error: string | null; templateKey: string | null; context: { manualLink?: string } | null }

function Messages() {
  const { params, set } = useListParams({ pageSize: '50' });
  const { data, isLoading } = useList<M>('/admin/messages', params);
  const toast = useToast();
  const qc = useQueryClient();
  const can = useCan();
  return (
    <div>
      <PageHeader title="Message log" description="Every WhatsApp, email, SMS and push message. When WhatsApp Business is not approved yet, use “Send on WhatsApp” to send a message by hand." />
      <div className="mb-3 flex gap-2">
        <Select aria-label="Channel" className="max-w-40" value={params.channel ?? ''} onChange={(e) => set({ channel: e.target.value || undefined })}>
          <option value="">All channels</option>
          {['WHATSAPP', 'EMAIL', 'SMS', 'PUSH'].map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select aria-label="Status" className="max-w-40" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          {['QUEUED', 'SENT', 'FAILED'].map((c) => <option key={c}>{c}</option>)}
        </Select>
      </div>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        columns={[
          { key: 'createdAt', label: 'When', render: (r) => dateTime(r.createdAt) },
          { key: 'channel', label: 'Channel' },
          { key: 'recipient', label: 'To' },
          { key: 'body', label: 'Message', render: (r) => <span className="block max-w-md text-xs">{r.subject && <strong>{r.subject}<br /></strong>}{r.body.length > 160 ? r.body.slice(0, 160) + '…' : r.body}</span> },
          { key: 'status', label: 'Status', render: (r) => <span className="flex flex-col gap-1"><StatusBadge status={r.status} />{r.error && <span className="text-xs text-muted">{r.error.replace(/_/g, ' ').toLowerCase()}</span>}</span> },
          { key: 'actions', label: '', render: (r) => (
            <span className="flex flex-col gap-1 text-xs">
              {r.context?.manualLink && <a className="text-whatsapp underline" href={r.context.manualLink} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
              {r.status === 'FAILED' && can('NOTIFICATIONS', 'edit') && <Button size="sm" variant="ghost" onClick={async () => { try { await api(`/admin/messages/${r.id}/resend`, { method: 'POST' }); await qc.invalidateQueries({ queryKey: ['/admin/messages'] }); toast('Queued again'); } catch (e) { toast(errorText(e), 'danger'); } }}>Retry</Button>}
            </span>
          ) },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function MessagesPage() { return <Suspense><Messages /></Suspense>; }
