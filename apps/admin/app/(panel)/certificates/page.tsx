'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { Badge } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { date } from '@/lib/format';
import { useList, useListParams } from '@/lib/use-list';

function Certs() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<any>('/admin/certificates', params);
  return (
    <div>
      <PageHeader title="Certificates" description="Issue certificates from a product's page. Each carries a QR code that opens the piece and its farm." />
      <DataTable
        rows={data?.items}
        loading={isLoading}
        columns={[
          { key: 'code', label: 'Certificate', render: (r) => <span className="font-mono">{r.code}</span> },
          { key: 'product', label: 'Product', render: (r) => <Link className="text-accent underline" href={`/products/${r.product.id}`}>{r.product.name}</Link> },
          { key: 'issuedAt', label: 'Issued', render: (r) => date(r.issuedAt) },
          { key: 'status', label: 'Status', render: (r) => <Badge tone={r.revokedAt ? 'danger' : 'success'}>{r.revokedAt ? 'Revoked' : 'Valid'}</Badge> },
          { key: 'pdf', label: '', render: (r) => <a className="text-accent underline" href={`/api/v1/admin/certificates/${r.id}/pdf`} target="_blank" rel="noreferrer">PDF</a> },
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function CertsPage() { return <Suspense><Certs /></Suspense>; }
