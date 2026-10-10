'use client';
import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, Input, Spinner } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { api, qs } from '@/lib/api';
import { humanize, inr } from '@/lib/format';
import { useMe } from '@/lib/session';
import { useListParams } from '@/lib/use-list';

const KINDS = [
  { key: 'sales', label: 'Sales', note: 'Paid orders by day, with discounts, GST, refunds and net.' },
  { key: 'whatsapp', label: 'WhatsApp analytics', note: 'Which products, cities, sources and WhatsApp numbers bring enquiries, and how many become orders.' },
  { key: 'enquiries', label: 'Enquiries', note: 'Enquiries by type, conversion and how quickly someone first responded.' },
  { key: 'partners', label: 'Franchises & vendors', note: 'Orders, deliveries and paid sales per partner.' },
  { key: 'products', label: 'Best sellers', note: 'Pieces in paid orders, by sales.' },
  { key: 'gst', label: 'GST register', note: 'Every invoice with CGST, SGST and IGST, for filing.', roles: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'] },
];

interface Report { columns: string[]; rows: Array<Record<string, unknown>>; summary: Record<string, number> | null }

/** Paise fields show as rupees; everything else as is. */
const cell = (k: string, v: unknown) => (k.endsWith('Paise') && typeof v === 'number' ? inr(v) : k.endsWith('Pct') ? `${v}%` : v == null ? '—' : String(v));

function Reports() {
  const { params, set } = useListParams({ kind: 'sales' });
  const { data: me } = useMe();
  const [from, setFrom] = useState(params.from?.slice(0, 10) ?? '');
  const [to, setTo] = useState(params.to?.slice(0, 10) ?? '');
  const kinds = KINDS.filter((k) => !k.roles || (me && k.roles.includes(me.role)));
  const kind = kinds.find((k) => k.key === params.kind) ?? kinds[0]!;
  const range = { from: params.from, to: params.to };
  const { data, isLoading } = useQuery({ queryKey: ['/admin/reports', kind.key, range], queryFn: () => api<Report>(`/admin/reports/${kind.key}${qs(range)}`) });
  const keys = data?.rows[0] ? Object.keys(data.rows[0]) : [];
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Last 30 days unless you choose dates. Every report downloads as CSV."
        actions={<a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/reports/${kind.key}${qs({ ...range, format: 'csv' })}`}>Download CSV</a>}
      />
      <div className="mb-3 flex flex-wrap gap-1 text-sm" role="tablist">
        {kinds.map((k) => (
          <button key={k.key} role="tab" aria-selected={k.key === kind.key} onClick={() => set({ kind: k.key })} className={`rounded-full border px-3 py-1 ${k.key === kind.key ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>{k.label}</button>
        ))}
      </div>
      <form className="mb-3 flex flex-wrap items-center gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); set({ from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to + 'T23:59:59').toISOString() : undefined }); }}>
        <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="max-w-44" />
        <span>to</span>
        <Input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="max-w-44" />
        <button type="submit" className="min-h-9 rounded-sm border border-line bg-surface px-3">Apply</button>
      </form>
      <p className="mb-3 text-sm text-muted">{kind.note}</p>
      {data?.summary && (
        <ul className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          {Object.entries(data.summary).map(([k, v]) => (
            <li key={k} className="rounded-sm border border-line bg-surface p-2"><span className="block text-xs text-muted">{humanize(k.replace(/Paise$|Pct$/, '').replace(/([A-Z])/g, ' $1'))}</span><span className="font-serif text-xl">{cell(k, v)}</span></li>
          ))}
        </ul>
      )}
      <Card className="overflow-x-auto p-0">
        {isLoading ? (
          <Spinner />
        ) : !data?.rows.length ? (
          <EmptyState title="Nothing in this period" />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-left text-xs text-muted uppercase"><tr>{data.columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">{keys.map((k) => <td key={k} className="px-3 py-2">{cell(k, r[k])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}
