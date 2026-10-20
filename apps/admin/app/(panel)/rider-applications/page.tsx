'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Input } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';

interface Applicant {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  vehicleNumber: string | null;
  licenceNumber: string | null;
  approvalStatus: string;
  rejectionReason: string | null;
  appliedAt: string | null;
  cities: Array<{ city: { name: string } }>;
}

/**
 * Riders who applied on the website. Head office (or the city manager) opens the three documents, then approves
 * the rider, which creates their delivery-app login, or rejects them with a reason.
 */
export default function RiderApplicationsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'PENDING' | 'REJECTED'>('PENDING');
  const list = useQuery({
    queryKey: ['/admin/delivery-partners', 'applications', tab],
    queryFn: () => api<{ items: Applicant[] }>(`/admin/delivery-partners?approvalStatus=${tab}&pageSize=100&sort=-createdAt`),
  });
  const [reason, setReason] = useState<Record<string, string>>({});
  const [docs, setDocs] = useState<Record<string, { licence: string | null; rc: string | null; addressProof: string | null }>>({});

  const openDocs = async (id: string) => {
    try {
      setDocs({ ...docs, [id]: await api(`/admin/delivery-partners/${id}/documents`) });
    } catch (e) {
      toast(errorText(e), 'danger');
    }
  };
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) =>
      api(`/admin/delivery-partners/${id}/${ok ? 'approve' : 'reject'}`, { method: 'POST', json: ok ? {} : { reason: reason[id] ?? '' } }),
    onSuccess: (_r, v) => {
      toast(v.ok ? 'Approved. The rider can now sign in to the delivery app with their mobile number.' : 'Application rejected.');
      void qc.invalidateQueries({ queryKey: ['/admin/delivery-partners'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Rider applications"
        description="Riders apply on the website with their driving licence, the bike's RC and an address proof. Check the documents, then approve or reject."
        actions={
          <Link href="/delivery-partners" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm">
            All delivery partners
          </Link>
        }
      />
      <div className="mb-3 flex gap-2">
        {(['PENDING', 'REJECTED'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`min-h-9 rounded-sm border px-3 text-sm ${tab === t ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}>
            {t === 'PENDING' ? 'Waiting for approval' : 'Rejected'}
          </button>
        ))}
        <a href="/deliver-with-us" target="_blank" className="ml-auto self-center text-sm text-accent underline">
          Open the application form ↗
        </a>
      </div>
      {list.isError && <Alert tone="danger">{errorText(list.error)}</Alert>}
      {list.data && !list.data.items.length && <Card><p className="text-sm text-muted">{tab === 'PENDING' ? 'No applications waiting.' : 'No rejected applications.'}</p></Card>}
      <div className="grid gap-3">
        {list.data?.items.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {a.name} <span className="font-normal text-muted">· {a.phone}</span>
                </p>
                <p className="text-sm text-muted">
                  {a.cities.map((c) => c.city.name).join(', ')} · applied {a.appliedAt ? new Date(a.appliedAt).toLocaleDateString('en-IN') : '—'}
                </p>
              </div>
              <Badge tone={a.approvalStatus === 'PENDING' ? 'waiting' : 'danger'}>{a.approvalStatus === 'PENDING' ? 'Waiting' : 'Rejected'}</Badge>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Bike number</dt>
                <dd>{a.vehicleNumber ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Driving licence</dt>
                <dd>{a.licenceNumber ?? '—'}</dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-muted">Address</dt>
                <dd>{a.address ?? '—'}</dd>
              </div>
            </dl>
            {a.rejectionReason && <p className="mt-2 text-sm text-danger">Reason: {a.rejectionReason}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {docs[a.id] ? (
                <>
                  {(
                    [
                      ['licence', 'Driving licence'],
                      ['rc', 'Bike RC'],
                      ['addressProof', 'Address proof'],
                    ] as const
                  ).map(([k, label]) =>
                    docs[a.id]![k] ? (
                      <a key={k} href={docs[a.id]![k]!} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-sm border border-line bg-surface px-3 text-sm hover:border-ink">
                        {label} ↗
                      </a>
                    ) : (
                      <span key={k} className="text-sm text-muted">{label}: not available</span>
                    ),
                  )}
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => openDocs(a.id)}>
                  View documents
                </Button>
              )}
            </div>
            {a.approvalStatus === 'PENDING' && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <Button size="sm" loading={decide.isPending && decide.variables?.id === a.id && decide.variables.ok} onClick={() => decide.mutate({ id: a.id, ok: true })}>
                  Approve rider
                </Button>
                <Input aria-label="Reason for rejecting" placeholder="Reason, if rejecting" className="max-w-xs" value={reason[a.id] ?? ''} onChange={(e) => setReason({ ...reason, [a.id]: e.target.value })} />
                <Button variant="secondary" size="sm" disabled={(reason[a.id] ?? '').trim().length < 3} onClick={() => decide.mutate({ id: a.id, ok: false })}>
                  Reject
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
