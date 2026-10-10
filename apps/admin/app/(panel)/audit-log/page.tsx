'use client';
import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

interface Log { id: string; createdAt: string; action: string; entity: string; entityId: string | null; ip: string | null; before: unknown; after: unknown; actor: { name: string; role: string } | null }

function diff(before: any, after: any): string {
  if (!before || !after || typeof before !== 'object') return '';
  const keys = Object.keys(after).filter((k) => !['updatedAt', 'createdAt'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  return keys.slice(0, 6).map((k) => `${k}: ${short(before[k])} → ${short(after[k])}`).join('; ');
}
const short = (v: unknown) => { const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 40 ? s.slice(0, 40) + '…' : s; };

function Audit() {
  const { params, set } = useListParams({ pageSize: '50' });
  const { data, isLoading } = useList<Log>('/admin/audit-logs', params);
  const entities = useQuery({ queryKey: ['audit-entities'], queryFn: () => api<string[]>('/admin/audit-logs/entities') });
  const [from, setFrom] = useState(params.from?.slice(0, 10) ?? '');
  const [to, setTo] = useState(params.to?.slice(0, 10) ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Audit log" description="Every change made by staff and partners: who, what, before and after, when and from which IP. Entries cannot be edited or deleted." />
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), set({ q, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to + 'T23:59:59').toISOString() : undefined }))}>
        <Input aria-label="Search user or record id" placeholder="User name or record id" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select aria-label="Record type" className="max-w-48" value={params.entity ?? ''} onChange={(e) => set({ entity: e.target.value || undefined })}>
          <option value="">All records</option>
          {entities.data?.map((x) => <option key={x}>{x}</option>)}
        </Select>
        <Input aria-label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="max-w-40" />
        <Input aria-label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="max-w-40" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <DataTable
        rows={data?.items}
        loading={isLoading}
        columns={[
          { key: 'createdAt', label: 'When', render: (r) => dateTime(r.createdAt) },
          { key: 'actor', label: 'Who', render: (r) => (r.actor ? `${r.actor.name}` : 'System') },
          { key: 'action', label: 'Action' },
          { key: 'entity', label: 'Record', render: (r) => `${r.entity}${r.entityId ? ` · ${r.entityId.slice(-8)}` : ''}` },
          { key: 'changes', label: 'Changes', render: (r) => (
            <span>
              <span className="text-xs text-muted">{diff(r.before, r.after)}</span>{' '}
              {(r.before || r.after) ? <button className="text-xs text-accent underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</button> : null}
              {open === r.id && <pre className="mt-2 max-w-xl overflow-auto rounded-sm bg-surface-muted p-2 text-xs">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre>}
            </span>
          ) },
          { key: 'ip', label: 'IP' },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function AuditPage() { return <Suspense><Audit /></Suspense>; }
