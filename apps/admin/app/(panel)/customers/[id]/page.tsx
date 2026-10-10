'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Spinner, StatusBadge } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { date, inr } from '@/lib/format';
import { useCan } from '@/lib/session';

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const can = useCan();
  const { data: c, isLoading } = useQuery({ queryKey: ['/admin/customers', id], queryFn: () => api<any>(`/admin/customers/${id}`) });
  const block = useMutation({
    mutationFn: (action: 'block' | 'unblock') => api(`/admin/customers/${id}/${action}`, { method: 'POST' }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['/admin/customers'] }); toast('Saved'); },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  if (isLoading || !c) return <Spinner />;
  return (
    <div className="max-w-5xl">
      <PageHeader
        title={c.user.name}
        description={<Link href="/customers" className="text-accent hover:underline">← Customers</Link>}
        actions={can('USERS', 'edit') && <Button size="sm" variant={c.isBlocked ? 'secondary' : 'danger'} onClick={() => window.confirm(c.isBlocked ? 'Unblock this customer?' : 'Block this customer? They will be signed out.') && block.mutate(c.isBlocked ? 'unblock' : 'block')}>{c.isBlocked ? 'Unblock' : 'Block'}</Button>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Phone</dt><dd>{c.user.phone}</dd>
            <dt className="text-muted">Email</dt><dd>{c.user.email ?? '—'}</dd>
            <dt className="text-muted">City</dt><dd>{c.city?.name ?? '—'}</dd>
            <dt className="text-muted">Joined</dt><dd>{date(c.createdAt)}</dd>
            <dt className="text-muted">Status</dt><dd><Badge tone={c.isBlocked ? 'danger' : 'success'}>{c.isBlocked ? 'Blocked' : 'Active'}</Badge></dd>
          </dl>
        </Card>
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Orders</dt><dd>{c.orderCount}</dd>
            <dt className="text-muted">Total spend</dt><dd>{inr(c.totalSpendPaise)}</dd>
            <dt className="text-muted">Referral code</dt><dd className="font-mono">{c.referralCode}</dd>
            <dt className="text-muted">Referred by</dt><dd>{c.referredBy ? `${c.referredBy.user.name} (${c.referredBy.referralCode})` : '—'}</dd>
            <dt className="text-muted">Referrals</dt><dd>{c._count.referrals}</dd>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Addresses</h2>
          {c.addresses.length === 0 ? <p className="text-sm text-muted">None saved.</p> : c.addresses.map((a: any) => <p key={a.id} className="mb-2 text-sm">{a.name}, {a.line1}, {a.cityName} {a.pincode}</p>)}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Orders</h2>
          {c.orders.length === 0 ? <p className="text-sm text-muted">No orders yet.</p> : (
            <ul className="divide-y divide-line text-sm">
              {c.orders.map((o: any) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/orders/${o.id}`} className="text-accent hover:underline">{o.number}</Link>
                  <span>{date(o.placedAt)}</span>
                  <StatusBadge status={o.status} />
                  <span>{inr(o.totalPaise)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Enquiries</h2>
          {c.enquiries.length === 0 ? <p className="text-sm text-muted">No enquiries.</p> : (
            <ul className="divide-y divide-line text-sm">
              {c.enquiries.map((e: any) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/enquiries/${e.id}`} className="text-accent hover:underline">{e.reference}</Link>
                  <span>{date(e.createdAt)}</span>
                  <StatusBadge status={e.stage} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
