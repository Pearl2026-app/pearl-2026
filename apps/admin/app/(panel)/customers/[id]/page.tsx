'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Input, Spinner, StatusBadge } from '@sahyadri/ui';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { date, inr, toPaise } from '@/lib/format';
import { useCan, useMe } from '@/lib/session';

const WALLET_KIND: Record<string, string> = { REFERRAL_REWARD: 'Referral reward', SPENT: 'Spent on an order', CASHOUT: 'Cash-out', ADJUSTMENT: 'Adjustment' };

/** Referral wallet: balance, every movement, cash-out requests, and (Super Admin) a manual adjustment. */
function WalletCard({ c }: { c: any }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const adjust = useMutation({
    mutationFn: () => api(`/admin/wallet/customers/${c.id}/adjust`, { method: 'POST', json: { amountPaise: toPaise(amount) ?? 0, note } }),
    onSuccess: async () => {
      setAmount('');
      setNote('');
      await qc.invalidateQueries({ queryKey: ['/admin/customers'] });
      toast('Wallet updated');
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Wallet</h2>
        <span className="text-lg font-semibold">{inr(Math.max(0, c.walletPaise ?? 0))}</span>
      </div>
      {!c.walletEntries?.length ? (
        <p className="text-sm text-muted">Nothing yet. Referral rewards land here when someone orders with this customer’s code.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto text-sm">
          {c.walletEntries.map((e: any) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block">{e.note ?? WALLET_KIND[e.kind] ?? e.kind}</span>
                <span className="text-xs text-muted">
                  {WALLET_KIND[e.kind] ?? e.kind} · {date(e.createdAt)}
                  {e.orderId && (
                    <>
                      {' · '}
                      <Link href={`/orders/${e.orderId}`} className="text-accent hover:underline">order</Link>
                    </>
                  )}
                </span>
              </span>
              <span className={`shrink-0 font-mono ${e.amountPaise < 0 ? 'text-danger' : 'text-success'}`}>
                {e.amountPaise > 0 ? '+' : '−'}
                {inr(Math.abs(e.amountPaise))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {c.walletPayouts?.length > 0 && (
        <>
          <h3 className="mt-4 mb-1 text-sm font-semibold">Cash-out requests</h3>
          <ul className="divide-y divide-line text-sm">
            {c.walletPayouts.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {inr(p.amountPaise)} · {p.method === 'UPI' ? p.upiId : `A/c ••${String(p.bankAccountNumber ?? '').slice(-4)} ${p.bankIfsc ?? ''}`}
                </span>
                <span className="text-xs text-muted">{date(p.createdAt)}{p.reference ? ` · ref ${p.reference}` : ''}</span>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
          <Link href="/wallet-payouts" className="mt-2 inline-block text-sm text-accent hover:underline">All wallet payouts →</Link>
        </>
      )}
      {me?.role === 'SUPER_ADMIN' && (
        <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3" onSubmit={(e) => (e.preventDefault(), adjust.mutate())}>
          <Input aria-label="Amount in rupees (negative to take away)" placeholder="₹ e.g. 200 or -200" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-36" />
          <Input aria-label="Reason" placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} className="min-w-40 flex-1" />
          <Button type="submit" size="sm" variant="secondary" loading={adjust.isPending} disabled={!amount || !note}>Adjust</Button>
        </form>
      )}
    </Card>
  );
}

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
      <Link href="/customers" className="mb-3 inline-flex min-h-9 items-center gap-1 rounded-sm border border-line bg-surface px-3 text-sm hover:bg-surface-muted">
        ← Customers
      </Link>
      <PageHeader
        title={c.user.name}
        actions={can('USERS', 'edit') && <Button size="sm" variant={c.isBlocked ? 'secondary' : 'danger'} onClick={() => window.confirm(c.isBlocked ? 'Activate this customer again?' : 'Deactivate this customer? They are signed out and cannot order until activated again.') && block.mutate(c.isBlocked ? 'unblock' : 'block')}>{c.isBlocked ? 'Activate' : 'Deactivate'}</Button>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Phone</dt><dd>{c.user.phone}</dd>
            <dt className="text-muted">Email</dt><dd>{c.user.email ?? '—'}</dd>
            <dt className="text-muted">City</dt><dd>{c.city?.name ?? '—'}</dd>
            <dt className="text-muted">Joined</dt><dd>{date(c.createdAt)}</dd>
            <dt className="text-muted">Status</dt><dd><Badge tone={c.isBlocked ? 'danger' : 'success'}>{c.isBlocked ? 'Deactivated' : 'Active'}</Badge></dd>
          </dl>
        </Card>
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Orders</dt><dd>{c.orderCount}</dd>
            <dt className="text-muted">Total spend</dt><dd>{inr(c.totalSpendPaise)}</dd>
            <dt className="text-muted">Credit points</dt><dd className="font-semibold">{Math.round((c.pointsPaise ?? 0) / 100)} (worth {inr(c.pointsPaise ?? 0)})</dd>
            <dt className="text-muted">Wallet</dt><dd className="font-semibold">{inr(Math.max(0, c.walletPaise ?? 0))}</dd>
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
          <h2 className="mb-2 font-semibold">Credit points</h2>
          {!c.pointsLedger?.length ? <p className="text-sm text-muted">No points yet. Points are earned when an order is delivered.</p> : (
            <ul className="divide-y divide-line text-sm">
              {c.pointsLedger.map((l: any) => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{l.reason}</span>
                  <span className="text-xs text-muted">{date(l.createdAt)}</span>
                  <span className={`font-mono ${l.points < 0 ? 'text-danger' : 'text-success'}`}>{l.points > 0 ? '+' : ''}{l.points}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <WalletCard c={c} />
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
