'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card } from '@sahyadri/ui';
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
] as const;

/** Business (B2B) buyers apply from their account; once approved they see business prices and business-only pieces. */
export default function BusinessBuyersPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('PENDING');
  const q = useQuery({ queryKey: ['/admin/business-buyers', tab], queryFn: () => api<{ items: Buyer[] }>(`/admin/business-buyers?status=${tab}`) });
  const decide = useMutation({
    mutationFn: ({ id, d }: { id: string; d: 'approve' | 'reject' }) => api(`/admin/business-buyers/${id}/${d}`, { method: 'POST', json: {} }),
    onSuccess: (_r, v) => {
      toast(v.d === 'approve' ? 'Approved: they now see business prices.' : 'Done.');
      void qc.invalidateQueries({ queryKey: ['/admin/business-buyers'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Business buyers (B2B)"
        description="Shops and resellers apply with their GSTIN. Approved buyers see business prices from the minimum quantity, set on each product under Business buyers."
      />
      <div className="mb-3 flex gap-2">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`min-h-9 rounded-sm border px-3 text-sm ${tab === k ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
            {label}
          </button>
        ))}
      </div>
      {q.isError && <Alert tone="danger">{errorText(q.error)}</Alert>}
      {q.data && !q.data.items.length && (
        <Card>
          <p className="text-sm text-muted">Nobody here yet. Customers apply from My Account → Business Account on the website.</p>
        </Card>
      )}
      <div className="grid gap-3">
        {q.data?.items.map((b) => (
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
