'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, Select, Spinner, StatusBadge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { useRefOptions } from '@/components/fields';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText, qs } from '@/lib/api';
import { inr } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

interface Row {
  id: string;
  sku: string;
  name: string;
  status: string;
  pricePaise: number;
  priceOnRequest: boolean;
  stockType: string;
  quantity: number;
  outOfStock: boolean;
  soldAt: string | null;
  pendingChanges: unknown;
  images: Array<{ url: string }>;
  category: { name: string };
  farm: { name: string } | null;
  vendor: { name: string } | null;
}

function Products() {
  const { params, set } = useListParams();
  const { data, isLoading, isFetching, error } = useList<Row>('/admin/products', params);
  const { data: cats } = useRefOptions({ path: '/admin/categories' });
  const can = useCan();
  const { data: me } = useMe();
  const [q, setQ] = useState(params.q ?? '');
  useEffect(() => setQ(params.q ?? ''), [params.q]);
  const bulk = useRef<HTMLInputElement>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const isVendor = me?.role === 'VENDOR';

  const uploadBulk = async (files: FileList) => {
    setBulkBusy(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append('files', f));
      const r = await api<{ uploaded: number; failed: number; report: Array<{ file: string; ok: boolean; message?: string }> }>('/admin/products/bulk-images', { method: 'POST', body: fd });
      toast(`${r.uploaded} images added${r.failed ? `, ${r.failed} not matched: ${r.report.filter((x) => !x.ok).map((x) => x.file).slice(0, 5).join(', ')}` : ''}`, r.failed ? 'info' : 'success');
      await qc.invalidateQueries({ queryKey: ['/admin/products'] });
    } catch (e) {
      toast(errorText(e), 'danger');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={isVendor ? 'My products' : 'Products'}
        description={isVendor ? 'New products and changes go live after head office approves them. Stock changes apply straight away.' : undefined}
        actions={
          <>
            <a className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm" href={`/api/v1/admin/products${qs({ ...params, format: 'csv', page: undefined, pageSize: undefined })}`}>
              Export CSV
            </a>
            {!isVendor && can('PRODUCTS', 'edit') && (
              <Link href="/products/offers" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">
                Offers & discounts
              </Link>
            )}
            {can('PRODUCTS', 'create') && (
              <Link href="/products/import" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">
                Import CSV
              </Link>
            )}
            {can('PRODUCTS', 'edit') && (
              <>
                <Button variant="secondary" size="sm" loading={bulkBusy} onClick={() => bulk.current?.click()} title="Name each file by SKU, e.g. SP-NE-0001.jpg or SP-NE-0001_2.jpg">
                  Bulk upload images
                </Button>
                <input ref={bulk} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files?.length && uploadBulk(e.target.files)} />
              </>
            )}
            {can('PRODUCTS', 'create') && (
              <Link href="/products/new" className="inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">
                Add product
              </Link>
            )}
          </>
        }
      />
      <form className="mb-3 flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), set({ q }))}>
        <Input aria-label="Search by name or SKU" placeholder="Name or SKU" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select aria-label="Status" className="max-w-44" value={params.status ?? ''} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">Any status</option>
          {['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'].map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ').toLowerCase()}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" className="max-w-44" value={params.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
          <option value="">Any category</option>
          {cats?.items.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {String(c.name)}
            </option>
          ))}
        </Select>
        <Select aria-label="Stock" className="max-w-40" value={params.outOfStock ?? ''} onChange={(e) => set({ outOfStock: e.target.value || undefined })}>
          <option value="">Any stock</option>
          <option value="true">Out of stock</option>
          <option value="false">In stock</option>
        </Select>
        {!isVendor && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={params.pendingApproval === 'true'} onChange={(e) => set({ pendingApproval: e.target.checked ? 'true' : undefined })} />
            Waiting for approval
          </label>
        )}
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {isFetching && <Spinner label="Updating" />}
      </form>
      {error && <Alert tone="danger">{errorText(error)}</Alert>}
      <DataTable
        rows={data?.items}
        loading={isLoading}
        sort={params.sort}
        onSort={(s) => set({ sort: s })}
        rowHref={(r) => `/products/${r.id}`}
        columns={[
          {
            key: 'name',
            label: 'Product',
            sortable: true,
            render: (r) => (
              <span className="flex items-center gap-3">
                {r.images[0] ? <img src={r.images[0].url} alt="" className="h-10 w-10 rounded-sm object-cover" /> : <span className="h-10 w-10 rounded-sm bg-surface-muted" />}
                <span>
                  {r.name}
                  <span className="block text-xs text-muted">{r.sku}</span>
                </span>
              </span>
            ),
          },
          { key: 'category', label: 'Category', render: (r) => r.category.name },
          { key: 'pricePaise', label: 'Price', sortable: true, render: (r) => (r.priceOnRequest ? <Badge>On request</Badge> : inr(r.pricePaise)) },
          {
            key: 'quantity',
            label: 'Stock',
            sortable: true,
            render: (r) =>
              r.stockType === 'UNIQUE' ? (r.soldAt ? <Badge tone="danger">Sold</Badge> : <Badge tone="info">Unique</Badge>) : r.outOfStock || r.quantity === 0 ? <Badge tone="danger">Out</Badge> : r.quantity,
          },
          { key: 'vendor', label: 'Vendor', render: (r) => r.vendor?.name ?? 'Own' },
          {
            key: 'status',
            label: 'Status',
            render: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.status} />
                {r.pendingChanges ? <Badge tone="waiting">Changes waiting</Badge> : null}
              </span>
            ),
          },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <Products />
    </Suspense>
  );
}
