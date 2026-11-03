'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Input, StatusBadge } from '@sahyadri/ui';
import { Pagination } from '@/components/data-table';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';
import { dateTime, inr } from '@/lib/format';
import { useCan } from '@/lib/session';

interface Payout {
  id: string;
  amountPaise: number;
  method: 'UPI' | 'BANK';
  upiId: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankName: string | null;
  status: 'REQUESTED' | 'PAID' | 'REJECTED';
  paidAt: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
  customer: { id: string; referralCode: string; user: { name: string; phone: string | null; email: string | null } };
}
interface Page {
  items: Payout[];
  total: number;
  page: number;
  pageSize: number;
  open: { count: number; amountPaise: number };
}

const TABS = [
  ['REQUESTED', 'Waiting to be paid'],
  ['PAID', 'Paid'],
  ['REJECTED', 'Rejected'],
  ['ALL', 'All'],
] as const;

function PayoutCard({ p }: { p: Payout }) {
  const toast = useToast();
  const qc = useQueryClient();
  const can = useCan();
  const [mode, setMode] = useState<'paid' | 'reject' | null>(null);
  const [text, setText] = useState('');
  const act = useMutation({
    mutationFn: () => api(`/admin/wallet/payouts/${p.id}/${mode === 'paid' ? 'paid' : 'reject'}`, { method: 'POST', json: mode === 'paid' ? { reference: text } : { note: text } }),
    onSuccess: async () => {
      toast(mode === 'paid' ? 'Marked paid; the customer is emailed.' : 'Rejected; the amount is back in their wallet.');
      setMode(null);
      setText('');
      await qc.invalidateQueries({ queryKey: ['/admin/wallet/payouts'] });
    },
    onError: (e) => toast(errorText(e), 'danger'),
  });
  const copy = (v: string) => void navigator.clipboard?.writeText(v).then(() => toast('Copied'));
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{inr(p.amountPaise, false)}</p>
          <p className="text-sm">
            <Link href={`/customers/${p.customer.id}`} className="text-accent hover:underline">{p.customer.user.name}</Link>
            <span className="text-muted"> · {p.customer.user.phone ?? p.customer.user.email} · requested {dateTime(p.createdAt)}</span>
          </p>
          {p.method === 'UPI' ? (
            <p className="mt-2 text-sm">
              UPI: <button type="button" className="font-mono underline decoration-dotted" onClick={() => copy(p.upiId ?? '')} title="Copy">{p.upiId}</button>
            </p>
          ) : (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
              <dt className="text-muted">Account name</dt><dd>{p.bankAccountName}</dd>
              <dt className="text-muted">Account no.</dt>
              <dd><button type="button" className="font-mono underline decoration-dotted" onClick={() => copy(p.bankAccountNumber ?? '')} title="Copy">{p.bankAccountNumber}</button></dd>
              <dt className="text-muted">IFSC</dt>
              <dd><button type="button" className="font-mono underline decoration-dotted" onClick={() => copy(p.bankIfsc ?? '')} title="Copy">{p.bankIfsc}</button></dd>
              {p.bankName && (<><dt className="text-muted">Bank</dt><dd>{p.bankName}</dd></>)}
            </dl>
          )}
          {p.status === 'PAID' && <p className="mt-2 text-sm text-muted">Paid {dateTime(p.paidAt)} · ref {p.reference}</p>}
          {p.note && <p className="mt-2 rounded-sm bg-surface-muted p-2 text-sm">{p.note}</p>}
        </div>
        <StatusBadge status={p.status} />
      </div>
      {p.status === 'REQUESTED' && can('USERS', 'edit') && (
        <div className="mt-3">
          {!mode ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setMode('paid')}>Mark paid</Button>
              <Button size="sm" variant="secondary" onClick={() => setMode('reject')}>Reject</Button>
            </div>
          ) : (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => (e.preventDefault(), act.mutate())}>
              <Input
                autoFocus
                aria-label={mode === 'paid' ? 'UTR / transaction reference' : 'Reason for rejecting'}
                placeholder={mode === 'paid' ? 'UTR / transaction reference' : 'Reason (the customer sees it)'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-w-56 flex-1"
              />
              <Button type="submit" size="sm" variant={mode === 'paid' ? 'primary' : 'danger'} loading={act.isPending} disabled={text.trim().length < 3}>
                {mode === 'paid' ? 'Confirm paid' : 'Reject'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => (setMode(null), setText(''))}>Cancel</Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}

/** Customers withdrawing their referral wallet as cash: pay them, then mark paid with the reference, or reject. */
export default function WalletPayoutsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('REQUESTED');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const r = useQuery({
    queryKey: ['/admin/wallet/payouts', tab, page, q],
    queryFn: () => api<Page>(`/admin/wallet/payouts?status=${tab}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Wallet payouts"
        description="Customers earn referral rewards in their wallet and can withdraw them as cash. The amount is held from their wallet when they ask; rejecting puts it back."
      />
      {r.data && r.data.open.count > 0 && (
        <p className="mb-3 text-sm">
          <strong>{r.data.open.count}</strong> waiting to be paid, {inr(r.data.open.amountPaise, false)} in all.
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => (setTab(k), setPage(1))}
            className={`min-h-9 rounded-sm border px-3 text-sm ${tab === k ? 'border-accent bg-accent text-white' : 'border-line bg-surface'}`}
          >
            {label}
          </button>
        ))}
        <Input aria-label="Search by name or phone" placeholder="Name or phone" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} className="ml-auto max-w-56" />
      </div>
      {r.isError && <Alert tone="danger">{errorText(r.error)}</Alert>}
      {r.data && !r.data.items.length && (
        <Card>
          <p className="text-sm text-muted">Nothing here. Customers ask for a withdrawal from My Account → Wallet on the website.</p>
        </Card>
      )}
      <div className="grid gap-3">{r.data?.items.map((p) => <PayoutCard key={p.id} p={p} />)}</div>
      {r.data && <Pagination page={r.data.page} pageSize={r.data.pageSize} total={r.data.total} onPage={setPage} />}
    </div>
  );
}
