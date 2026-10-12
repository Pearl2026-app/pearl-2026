'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from '@sahyadri/ui';
import { DataTable, Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { api, errorText } from '@/lib/api';
import { date } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';
import { useList, useListParams } from '@/lib/use-list';

function Certs() {
  const { params, set } = useListParams();
  const { data, isLoading } = useList<any>('/admin/certificates', params);
  const { data: me } = useMe();
  const can = useCan();
  const qc = useQueryClient();
  // A certificate is the company's word on a pearl: only head office revokes one (for example, a piece found to be misgraded).
  const mayRevoke = (me?.role === 'SUPER_ADMIN' || me?.role === 'STAFF') && can('PRODUCTS', 'edit');
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/admin/certificates/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/admin/certificates'] }),
    onError: (e) => window.alert(errorText(e)),
  });
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
          ...(mayRevoke
            ? [{
                key: 'revoke',
                label: '',
                render: (r: any) =>
                  !r.revokedAt && (
                    <Button size="sm" variant="danger" loading={revoke.isPending && revoke.variables === r.id} onClick={() => window.confirm(`Revoke certificate ${r.code}? Its QR code will then show it as revoked. This cannot be undone.`) && revoke.mutate(r.id)}>
                      Revoke
                    </Button>
                  ),
              }]
            : []),
        ]}
      />
      {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) })} />}
    </div>
  );
}
export default function CertsPage() { return <Suspense><Certs /></Suspense>; }
