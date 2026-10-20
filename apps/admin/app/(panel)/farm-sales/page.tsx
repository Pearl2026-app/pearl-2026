'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Input } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { api, errorText } from '@/lib/api';
import { inr } from '@/lib/format';
import { useMe } from '@/lib/session';

interface Report {
  from: string;
  to: string;
  farms: Array<{ id: string; name: string; listedPieces: number; pieces: number; salesPaise: number; orders: number }>;
  topPieces: Array<{ id: string; name: string; sku: string; farm: string; carat: number | null; pieces: number; salesPaise: number }>;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/** How each farm's pearls are selling. A farm partner sees only its own farm. */
export default function FarmSalesPage() {
  const { data: me } = useMe();
  const [from, setFrom] = useState(day(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(day(new Date()));
  const q = useQuery({
    queryKey: ['/admin/farm-sales', from, to],
    queryFn: () => api<Report>(`/admin/farm-sales?from=${from}&to=${to}T23:59:59`),
  });
  const total = q.data?.farms.reduce((s, f) => s + f.salesPaise, 0) ?? 0;
  const max = Math.max(1, ...(q.data?.farms.map((f) => f.salesPaise) ?? [1]));
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={me?.role === 'FARMER' ? 'Your farm’s sales' : 'Farm sales'}
        description={me?.role === 'FARMER' ? 'Pieces made with your pearls and how they sold.' : 'How much of each farm’s pearls sold. Each farm partner can sign in and see its own figures.'}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          From <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
        </label>
        <label className="flex items-center gap-2">
          to <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
        </label>
      </div>
      {q.isError && <Alert tone="danger">{errorText(q.error)}</Alert>}
      {q.data && (
        <>
          <Card className="mb-4">
            <p className="text-sm text-muted">Sales in this period</p>
            <p className="text-2xl font-semibold">{inr(total)}</p>
          </Card>
          <Card className="mb-4 overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line text-left text-muted">
                <tr>
                  <th className="px-3 py-2 font-normal">Farm</th>
                  <th className="px-3 py-2 font-normal">Sales</th>
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
                        <span className="h-2 rounded-full bg-[#9A7546]" style={{ width: `${Math.max(2, (f.salesPaise / max) * 160)}px` }} />
                        {inr(f.salesPaise)}
                      </div>
                    </td>
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
