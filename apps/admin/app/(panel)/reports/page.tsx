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
  { key: 'whatsapp', label: 'WhatsApp analytics', note: 'Which products, cities, sources and WhatsApp numbers bring enquiries, and how many become orders; below, the people who enquired and what they asked about.' },
  { key: 'enquiries', label: 'Enquiries', note: 'Enquiries by type, conversion and how quickly someone first responded.' },
  { key: 'partners', label: 'Franchises & vendors', note: 'Orders, deliveries and paid sales per partner.' },
  { key: 'products', label: 'Best sellers', note: 'Pieces in paid orders, by sales.' },
  {
    key: 'commission',
    label: 'Commission',
    note: 'Each piece sold in paid orders, with its pearl value shared between the farm, the trader and the franchise or vendor that sold it (shares in Settings → Commission). The metal value and making charge go to the trader in full; a piece without metal and making costs counts its whole sale value (without GST) as pearl value.',
    roles: ['SUPER_ADMIN', 'STAFF'],
  },
  { key: 'gst', label: 'GST register', note: 'Every invoice with CGST, SGST and IGST, for filing.', roles: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'] },
];

interface Table { columns: string[]; rows: Array<Record<string, unknown>> }
interface Report extends Table { summary: Record<string, number> | null; sections?: Array<Table & { key: string; title: string }> }

/** A report table; field order matches the columns. */
function ReportTable({ t }: { t: Table }) {
  const keys = t.rows[0] ? Object.keys(t.rows[0]) : [];
  return (
    <table className="w-full text-sm">
      <thead className="bg-surface-muted text-left text-xs text-muted uppercase"><tr>{t.columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
      <tbody>
        {t.rows.map((r, i) => (
          <tr key={i} className="border-t border-line">{keys.map((k) => <td key={k} className="px-3 py-2">{cell(k, r[k])}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

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
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Ready-made, always live. Last 30 days unless you pick dates; every report downloads for Excel."
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
          <ReportTable t={data} />
        )}
      </Card>
      {data?.sections?.map((s) => (
        <section key={s.key} className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{s.title} <span className="font-normal text-muted">({s.rows.length})</span></h2>
            <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/reports/${kind.key}${qs({ ...range, format: 'csv', section: s.key })}`}>
              Download CSV
            </a>
          </div>
          <Card className="overflow-x-auto p-0">{s.rows.length ? <ReportTable t={s} /> : <EmptyState title="Nothing in this period" />}</Card>
        </section>
      ))}
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
