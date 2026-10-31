'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Input } from '@sahyadri/ui';
import { Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';

interface Buyer {
  id: string;
  b2bStatus: string;
  businessName: string | null;
  businessGstin: string | null;
  b2bNote: string | null;
  b2bAppliedAt: string | null;
  user: { name: string; phone: string | null; email: string | null };
  _count: { orders: number };
}

const TABS = [
  ['PENDING', 'Waiting for approval'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['PRICES', 'B2B price list'],
] as const;

interface PriceRow {
  id: string;
  name: string;
  sku: string;
  pricePaise: number | null;
  b2bPricePaise: number | null;
  b2bMinQty: number;
  b2bOnly: boolean;
  quantity: number;
  category: { name: string };
}
const inr = (p: number | null) => (p == null ? '—' : `₹${(p / 100).toLocaleString('en-IN')}`);

/** What approved business buyers see: business price and minimum order quantity for every piece. */
function PriceList() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const r = useQuery({
    queryKey: ['/admin/business-buyers/price-list', q, page],
    queryFn: () => api<{ items: PriceRow[]; total: number; page: number; pageSize: number }>(`/admin/business-buyers/price-list?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Exactly what approved business buyers see on the website. Business prices apply from the minimum order quantity (MOQ). Change them on each product under Business buyers.
      </p>
      <Input aria-label="Search by name or SR code" placeholder="Search by name or SR code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="mb-3 max-w-sm" />
      {r.isError && <Alert tone="danger">{errorText(r.error)}</Alert>}
      {r.data && (
        <>
          <div className="overflow-x-auto rounded-md border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Piece</th>
                  <th className="px-3 py-2">SR code</th>
                  <th className="px-3 py-2 text-right">Retail price</th>
                  <th className="px-3 py-2 text-right">B2B price</th>
                  <th className="px-3 py-2 text-right">MOQ</th>
                  <th className="px-3 py-2 text-right">In stock</th>
                </tr>
              </thead>
              <tbody>
                {r.data.items.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-3 py-2">
                      <Link href={`/products/${p.id}`} className="text-accent underline">{p.name}</Link>
                      <span className="block text-xs text-muted">{p.category.name}{p.b2bOnly ? ' · business only' : ''}</span>
                    </td>
                    <td className="px-3 py-2">{p.sku}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.b2bOnly ? '—' : inr(p.pricePaise)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(p.b2bPricePaise ?? p.pricePaise)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.b2bMinQty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.quantity}</td>
                  </tr>
                ))}
                {!r.data.items.length && (
                  <tr><td colSpan={6} className="px-3 py-4 text-muted">No pieces have a business price yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

/** Business (B2B) buyers apply from their account; once approved they see business prices and business-only pieces. */
export default function BusinessBuyersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('PENDING');
  const q = useQuery({ enabled: tab !== 'PRICES', queryKey: ['/admin/business-buyers', tab], queryFn: () => api<{ items: Buyer[] }>(`/admin/business-buyers?status=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, d }: { id: string; d: 'approve' | 'reject' }) => api(`/admin/business-buyers/${id}/${d}`, { method: 'POST', json: {} }),
    onSuccess: (_r, v) => {
      toast(v.d === 'approve' ? 'Approved: they now see business prices.' : 'Done.');
      void qc.invalidateQueries({ queryKey: ['/admin/business-buyers'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <div className={tab === 'PRICES' ? 'max-w-6xl' : 'max-w-4xl'}>
      <PageHeader
        title="Business buyers (B2B)"
        description="Shops and resellers apply with their GSTIN. Approved buyers see business prices from the minimum order quantity (MOQ). The B2B price list shows exactly what they see."
      />
      <div className="mb-3 flex gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`min-h-9 rounded-sm border px-3 text-sm ${tab === k ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'PRICES' && <PriceList />}
      {tab !== 'PRICES' && q.isError && <Alert tone="danger">{errorText(q.error)}</Alert>}
      {tab !== 'PRICES' && q.data && !q.data.items.length && (
        <Card>
          <p className="text-sm text-muted">Nobody here yet. Customers apply from My Account → Business Account on the website.</p>
        </Card>
      )}
      <div className="grid gap-3">
        {tab !== 'PRICES' && q.data?.items.map((b) => (
          <Card key={b.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{b.businessName}</p>
                <p className="text-sm">GSTIN {b.businessGstin}</p>
                <p className="text-sm text-muted">
                  {b.user.name} · {b.user.phone ?? b.user.email} · {b._count.orders} orders
                  {b.b2bAppliedAt ? ` · applied ${new Date(b.b2bAppliedAt).toLocaleDateString('en-IN')}` : ''}
                </p>
                {b.b2bNote && <p className="mt-2 rounded-sm bg-surface-muted p-2 text-sm">{b.b2bNote}</p>}
              </div>
              <Badge tone={b.b2bStatus === 'APPROVED' ? 'success' : b.b2bStatus === 'PENDING' ? 'waiting' : 'danger'}>{b.b2bStatus.toLowerCase()}</Badge>
            </div>
            <div className="mt-3 flex gap-2">
              {b.b2bStatus !== 'APPROVED' && (
                <Button size="sm" loading={decide.isPending && decide.variables?.id === b.id} onClick={() => decide.mutate({ id: b.id, d: 'approve' })}>
                  Approve
                </Button>
              )}
              {b.b2bStatus !== 'REJECTED' && (
                <Button size="sm" variant="secondary" onClick={() => decide.mutate({ id: b.id, d: 'reject' })}>
                  {b.b2bStatus === 'APPROVED' ? 'Remove business access' : 'Reject'}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
