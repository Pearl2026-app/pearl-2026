'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, Select } from '@sahyadri/ui';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { inr } from '@/lib/format';

interface Row {
  id: string;
  name: string;
  sku: string;
  pricePaise: number;
  compareAtPaise: number | null;
}

/**
 * Product-level offers (meeting of 19 Oct): pick pieces, a category, a farm or a collection, give a %, and the
 * storefront shows the old price struck through with the new one. "End offer" puts the old price back.
 */
export default function OffersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useRefOptions({ path: '/admin/categories' });
  const farms = useRefOptions({ path: '/admin/farms' });
  const cols = useRefOptions({ path: '/admin/collections' });
  const [scope, setScope] = useState({ categoryId: '', farmId: '', collectionId: '' });
  const [percent, setPercent] = useState('10');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Row[]>([]);

  const found = useQuery({
    queryKey: ['/admin/products', 'offers', q],
    queryFn: () => api<{ items: Row[] }>(`/admin/products?pageSize=8&q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
  const onOffer = useQuery({
    queryKey: ['/admin/products', 'on-offer'],
    queryFn: () => api<{ items: Row[] }>('/admin/products?pageSize=200'),
    select: (d) => d.items.filter((p) => p.compareAtPaise && p.compareAtPaise > p.pricePaise),
  });

  const run = useMutation({
    mutationFn: (action: 'apply' | 'remove') =>
      api<{ changed: number; matched: number }>('/admin/products/discount', {
        method: 'POST',
        json: {
          action,
          percent: action === 'apply' ? Number(percent) : undefined,
          productIds: picked.length ? picked.map((p) => p.id) : undefined,
          categoryId: scope.categoryId || undefined,
          farmId: scope.farmId || undefined,
          collectionId: scope.collectionId || undefined,
        },
      }),
    onSuccess: (r, action) => {
      toast(action === 'apply' ? `Offer applied to ${r.changed} pieces.` : `Offer ended on ${r.changed} pieces.`);
      void qc.invalidateQueries({ queryKey: ['/admin/products'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  const nothing = !picked.length && !scope.categoryId && !scope.farmId && !scope.collectionId;
  const opt = (r: { data?: { items: Array<Record<string, unknown>> } }) =>
    (r.data?.items ?? []).map((x) => (
      <option key={String(x.id)} value={String(x.id)}>
        {String(x.name)}
      </option>
    ));

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Offers & discounts"
        description="Put chosen pieces on offer for a festival or sale. Customers see the old price struck through. Coupon codes are under Coupons & offers."
        actions={
          <Link href="/products" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">
            Back to products
          </Link>
        }
      />
      <div className="grid gap-4">
        <Card>
          <h2 className="mb-1 font-semibold">1 · Which pieces</h2>
          <p className="mb-3 text-sm text-muted">Pick a whole category, farm or collection, or search for single pieces. Choices combine (e.g. Rings from Swastik farm).</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select aria-label="Category" value={scope.categoryId} onChange={(e) => setScope({ ...scope, categoryId: e.target.value })}>
              <option value="">Any category</option>
              {opt(cats)}
            </Select>
            <Select aria-label="Farm" value={scope.farmId} onChange={(e) => setScope({ ...scope, farmId: e.target.value })}>
              <option value="">Any farm</option>
              {opt(farms)}
            </Select>
            <Select aria-label="Collection" value={scope.collectionId} onChange={(e) => setScope({ ...scope, collectionId: e.target.value })}>
              <option value="">Any collection</option>
              {opt(cols)}
            </Select>
          </div>
          <div className="mt-4">
            <Input aria-label="Search pieces" placeholder="Or search a piece by name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
            {q.trim().length >= 2 && (
              <ul className="mt-2 divide-y divide-line rounded-sm border border-line">
                {(found.data?.items ?? []).map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted"
                      onClick={() => {
                        if (!picked.some((x) => x.id === p.id)) setPicked([...picked, p]);
                        setQ('');
                      }}
                    >
                      <span>
                        {p.name} <span className="text-muted">· {p.sku}</span>
                      </span>
                      <span>{inr(p.pricePaise)}</span>
                    </button>
                  </li>
                ))}
                {found.data && !found.data.items.length && <li className="px-3 py-2 text-sm text-muted">No pieces found</li>}
              </ul>
            )}
            {picked.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {picked.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}
                    className="rounded-full border border-line bg-surface-muted px-3 py-1 text-sm"
                    aria-label={`Remove ${p.name}`}
                  >
                    {p.name} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">2 · How much off</h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Input aria-label="Discount percent" inputMode="decimal" className="w-24" value={percent} onChange={(e) => setPercent(e.target.value.replace(/[^\d.]/g, ''))} />
              <span className="text-sm">% off</span>
            </div>
            {[5, 10, 15, 20, 25].map((n) => (
              <button key={n} type="button" onClick={() => setPercent(String(n))} className={`min-h-9 rounded-sm border px-3 text-sm ${percent === String(n) ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
                {n}%
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={nothing || !Number(percent)} loading={run.isPending && run.variables === 'apply'} onClick={() => run.mutate('apply')}>
              Apply offer
            </Button>
            <Button variant="secondary" disabled={nothing} loading={run.isPending && run.variables === 'remove'} onClick={() => run.mutate('remove')}>
              End offer on these pieces
            </Button>
          </div>
          {nothing && <p className="mt-2 text-sm text-muted">Choose the pieces first.</p>}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">On offer now</h2>
          {onOffer.isError && <Alert tone="danger">{errorText(onOffer.error)}</Alert>}
          {!onOffer.data?.length ? (
            <p className="text-sm text-muted">No pieces are on offer.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-normal">Piece</th>
                  <th className="py-1 text-right font-normal">Was</th>
                  <th className="py-1 text-right font-normal">Now</th>
                  <th className="py-1 text-right font-normal">Off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {onOffer.data.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2">
                      <Link href={`/products/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>{' '}
                      <span className="text-muted">· {p.sku}</span>
                    </td>
                    <td className="py-2 text-right text-muted line-through">{inr(p.compareAtPaise!)}</td>
                    <td className="py-2 text-right font-medium">{inr(p.pricePaise)}</td>
                    <td className="py-2 text-right">{Math.round((1 - p.pricePaise / p.compareAtPaise!) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
