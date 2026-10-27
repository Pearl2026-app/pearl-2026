'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Card } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { api, errorText } from '@/lib/api';
import { useMe } from '@/lib/session';

interface Row {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  level: number;
  sold30: number;
  suggest: number;
  low: boolean;
  outOfStock: boolean;
  sizeMm: number | null;
  category: { name: string };
  farm: { name: string } | null;
  vendor: { name: string } | null;
  perSize: Array<{ label: string; quantity: number; sold30: number; suggest: number }> | null;
}

/**
 * What to make (meeting of 19 Oct): pieces sold by quantity that are at or below their alert level, with last
 * month's sales so the manufacturer knows how many to make. Alerts go out by email/WhatsApp when a piece crosses
 * its level.
 */
export default function RestockPage() {
  const { data: me } = useMe();
  const [all, setAll] = useState(false);
  const q = useQuery({
    queryKey: ['/admin/restock', all],
    queryFn: () => api<{ items: Row[]; defaultThreshold: number }>(`/admin/restock${all ? '?all=true' : ''}`),
  });
  const lowCount = q.data?.items.filter((r) => r.low).length ?? 0;
  const csv = () => {
    const rows = [['SKU', 'Piece', 'Category', 'Size (mm)', 'In stock', 'Alert level', 'Sold last 30 days', 'Make'], ...(q.data?.items ?? []).map((r) => [r.sku, r.name, r.category.name, r.sizeMm ?? '', r.quantity, r.level, r.sold30, r.suggest])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `restock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div>
      <PageHeader
        title="Purchase orders — low stock"
        description={`Pieces running low — one tap turns them into purchase orders. Alert level ${q.data?.defaultThreshold ?? 3} by default; below the auto-PO level a draft PO raises itself.`}
        actions={
          <>
            <button type="button" onClick={csv} className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">
              Download for Excel
            </button>
            {me && ['SUPER_ADMIN', 'STAFF'].includes(me.role) && (
              <Link href="/purchase-orders/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">
                New purchase order
              </Link>
            )}
          </>
        }
      />
      <div className="mb-3 flex items-center gap-3">
        <Badge tone={lowCount ? 'waiting' : 'success'}>{lowCount ? `${lowCount} pieces to restock` : 'Nothing running low'}</Badge>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all pieces sold by quantity
        </label>
      </div>
      {q.isError && <Alert tone="danger">{errorText(q.error)}</Alert>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Piece</th>
              <th className="px-3 py-2 font-normal">Category</th>
              <th className="px-3 py-2 text-right font-normal">Size</th>
              <th className="px-3 py-2 text-right font-normal">In stock</th>
              <th className="px-3 py-2 text-right font-normal">Alert at</th>
              <th className="px-3 py-2 text-right font-normal">Sold (30 days)</th>
              <th className="px-3 py-2 text-right font-normal">Make</th>
              <th className="px-3 py-2" aria-label="Raise a purchase order" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {q.data?.items.map((r) => (
              <tr key={r.id} className={r.low ? 'bg-[#FBF0DC]/40' : ''}>
                <td className="px-3 py-2">
                  {me?.permissions.PRODUCTS?.includes('edit') ? (
                    <Link href={`/products/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                  <span className="block text-xs text-muted">
                    {r.sku}
                    {r.farm ? ` · ${r.farm.name}` : ''}
                    {r.vendor ? ` · ${r.vendor.name}` : ''}
                  </span>
                  {r.perSize && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {r.perSize.map((x) => (
                        <span key={x.label} className={`rounded-sm border px-1.5 py-0.5 text-[11px] ${x.quantity === 0 ? 'border-[#F8E1DF] bg-[#F8E1DF] text-[#8C1D17]' : 'border-line bg-surface-muted'}`}>
                          Size {x.label}: {x.quantity} left{x.suggest ? ` → make ${x.suggest}` : ''}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{r.category.name}</td>
                <td className="px-3 py-2 text-right">{r.sizeMm ? `${r.sizeMm} mm` : '—'}</td>
                <td className="px-3 py-2 text-right">
                  {r.outOfStock || r.quantity === 0 ? <Badge tone="danger">Out</Badge> : r.quantity}
                </td>
                <td className="px-3 py-2 text-right">{r.level}</td>
                <td className="px-3 py-2 text-right">{r.sold30}</td>
                <td className="px-3 py-2 text-right font-semibold">{r.suggest || '—'}</td>
                <td className="px-3 py-2 text-right">
                  {me && me.permissions.PURCHASE_ORDERS?.includes('create') && (
                    <Link
                      href={`/purchase-orders/new?productId=${r.id}${r.suggest ? `&qty=${r.suggest}` : ''}`}
                      className="inline-flex min-h-7 items-center rounded-sm border border-line bg-surface px-2.5 text-xs font-medium whitespace-nowrap hover:border-ink"
                    >
                      Raise PO
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {q.data && !q.data.items.length && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted">
                  Nothing is running low.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
