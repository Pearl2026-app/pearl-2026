'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Input, Select } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { api, errorText } from '@/lib/api';
import { inr } from '@/lib/format';
import { useMe } from '@/lib/session';

interface Report {
  from: string;
  to: string;
  farms: Array<{ id: string; name: string; listedPieces: number; pieces: number; salesPaise: number; orders: number; b2bPaise: number; b2cPaise: number; byChannel: Record<string, number> }>;
  /** Business buyers vs retail, and where the sales came from */
  segments: Split[];
  channels: Split[];
  topPieces: Array<{ id: string; name: string; sku: string; farm: string; carat: number | null; pieces: number; salesPaise: number }>;
}

interface Split {
  name: string;
  pieces: number;
  salesPaise: number;
  orders: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const SEGMENT_LABEL: Record<string, string> = { B2C: 'Retail (B2C)', B2B: 'Business buyers (B2B)' };
const CHANNEL_NOTE: Record<string, string> = {
  Website: 'Website and app checkout',
  'WhatsApp / enquiry': 'Orders from WhatsApp chats and enquiries',
  'Campaign / coupon': 'Orders with a coupon or a campaign link',
  Store: 'Entered by the team: store, phone, walk-in',
};

/** One small breakdown: a share bar per row. */
function Breakdown({ title, info, rows, label }: { title: string; info: string; rows: Split[]; label: (name: string) => string }) {
  const total = rows.reduce((a, r) => a + r.salesPaise, 0);
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted">{info}</p>
      <ul className="flex flex-col gap-2 text-sm">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-2">
              <span>{label(r.name)}</span>
              <span className="tabular-nums">
                {inr(r.salesPaise)} <span className="text-xs text-muted">· {r.pieces} pcs · {r.orders} orders</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-surface-muted">
              <div className="h-1.5 rounded-full bg-[#B89042]" style={{ width: `${total ? Math.max(1, (r.salesPaise / total) * 100) : 0}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** How each farm's pearls are selling. A farm partner sees only its own farm. */
export default function FarmSalesPage() {
  const { data: me } = useMe();
  const [from, setFrom] = useState(day(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(day(new Date()));
  const [farmId, setFarmId] = useState('');
  const farms = useRefOptions(me && me.role !== 'FARMER' ? { path: '/admin/farms' } : undefined);
  const qsBase = `from=${from}&to=${to}T23:59:59${farmId ? `&farmId=${farmId}` : ''}`;
  const q = useQuery({
    queryKey: ['/admin/farm-sales', from, to, farmId],
    queryFn: () => api<Report>(`/admin/farm-sales?${qsBase}`),
  });
  const total = q.data?.farms.reduce((s, f) => s + f.salesPaise, 0) ?? 0;
  const max = Math.max(1, ...(q.data?.farms.map((f) => f.salesPaise) ?? [1]));
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={me?.role === 'FARMER' ? 'Your farm’s sales' : 'Farm sales'}
        description={me?.role === 'FARMER' ? 'Pieces made with your pearls and how they sold, to retail and business buyers and by channel.' : 'How much of each farm’s pearls sold, to retail and business buyers and by channel. Each farm partner can sign in and see its own figures. Pick one farm for its individual report.'}
        actions={
          <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm hover:border-ink" href={`/api/v1/admin/farm-sales?${qsBase}&format=csv`}>
            Download for Excel
          </a>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </label>
        <label className="flex items-center gap-2">
          to <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </label>
        {me && me.role !== 'FARMER' && (
          <Select aria-label="Farm" className="max-w-56" value={farmId} onChange={(e) => setFarmId(e.target.value)}>
            <option value="">All farms</option>
            {farms.data?.items.map((f) => (
              <option key={String(f.id)} value={String(f.id)}>
                {String(f.name)}
              </option>
            ))}
          </Select>
        )}
      </div>
      {q.isError && <Alert tone="danger">{errorText(q.error)}</Alert>}
      {q.data && (
        <>
          <Card className="mb-4">
            <p className="text-sm text-muted">Sales in this period</p>
            <p className="text-2xl font-semibold">{inr(total)}</p>
          </Card>
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <Breakdown title="Retail and business buyers" info="Business (B2B): an approved business buyer, or an order with a GSTIN." rows={q.data.segments ?? []} label={(n) => SEGMENT_LABEL[n] ?? n} />
            <Breakdown title="By channel" info="Where the sale came from." rows={q.data.channels ?? []} label={(n) => `${n}${CHANNEL_NOTE[n] ? ` · ${CHANNEL_NOTE[n]}` : ''}`} />
          </div>
          <Card className="mb-4 overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-normal">Farm</th>
                  <th className="px-3 py-2 font-normal">Sales</th>
                  <th className="px-3 py-2 text-right font-normal">Retail (B2C)</th>
                  <th className="px-3 py-2 text-right font-normal">Business (B2B)</th>
                  <th className="px-3 py-2 text-right font-normal">Pieces sold</th>
                  <th className="px-3 py-2 text-right font-normal">Orders</th>
                  <th className="px-3 py-2 text-right font-normal">Pieces listed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.farms.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 font-medium">{f.name}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 rounded-full bg-[#B89042]" style={{ width: `${Math.max(2, (f.salesPaise / max) * 160)}px` }} />
                        {inr(f.salesPaise)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{inr(f.b2cPaise ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{inr(f.b2bPaise ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{f.pieces}</td>
                    <td className="px-3 py-2 text-right">{f.orders}</td>
                    <td className="px-3 py-2 text-right">{f.listedPieces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="overflow-x-auto p-0">
            <h2 className="px-3 pt-3 font-semibold">Best-selling pieces</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-normal">Piece</th>
                  <th className="px-3 py-2 font-normal">Farm</th>
                  <th className="px-3 py-2 text-right font-normal">Carat</th>
                  <th className="px-3 py-2 text-right font-normal">Sold</th>
                  <th className="px-3 py-2 text-right font-normal">Sales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {q.data.topPieces.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      {p.name} <span className="text-muted">· {p.sku}</span>
                    </td>
                    <td className="px-3 py-2">{p.farm}</td>
                    <td className="px-3 py-2 text-right">{p.carat ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{p.pieces}</td>
                    <td className="px-3 py-2 text-right">{inr(p.salesPaise)}</td>
                  </tr>
                ))}
                {!q.data.topPieces.length && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted">
                      No sales in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
