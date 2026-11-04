'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { FormField, Notice, SubmitButton, TextInput } from '@/components/form-bits';
import { WhatsAppIcon } from '@/components/icons';
import { api, ApiError, errorText } from '@/lib/api';

interface Payout {
  id: string;
  amountPaise: number;
  method: 'UPI' | 'BANK';
  upiId: string | null;
  bankAccountNumber: string | null;
  status: 'REQUESTED' | 'PAID' | 'REJECTED';
  paidAt: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}
interface Wallet {
  enabled: boolean;
  balancePaise: number;
  referralRewardPaise: number;
  rewardOn: 'EVERY_ORDER' | 'FIRST_ORDER';
  minCashoutPaise: number;
  payoutNote: string;
  referralCode: string;
  shareUrl: string;
  shareText: string;
  friendsJoined: number;
  entries: Array<{ id: string; amountPaise: number; kind: string; note: string | null; createdAt: string }>;
  payouts: Payout[];
}

const KIND: Record<string, string> = { REFERRAL_REWARD: 'Referral reward', SPENT: 'Used on an order', CASHOUT: 'Withdrawal', ADJUSTMENT: 'Adjustment' };
const PAYOUT_STATUS: Record<Payout['status'], string> = { REQUESTED: 'Being processed', PAID: 'Paid', REJECTED: 'Not paid — amount returned' };
const day = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const rupees = (p: number) => formatINR(p, { compact: true });

/** The referral wallet: earn when friends order with your code, spend it at checkout, or withdraw it as cash. */
export default function WalletPage() {
  const [w, setW] = useState<Wallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api<Wallet>('/me/wallet')
        .then(setW)
        .catch((e) => setError(errorText(e))),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!w) return <p className="text-muted">Loading…</p>;
  const pending = w.payouts.find((p) => p.status === 'REQUESTED');
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section>
        <h2 className="font-serif text-2xl">Wallet</h2>
        <p className="mt-4 font-serif text-5xl">{formatINR(w.balancePaise)}</p>
        <p className="mt-2 text-sm text-muted">
          Use it at checkout (tick “Use wallet balance”), or withdraw it to your bank or UPI once it reaches {rupees(w.minCashoutPaise)}.
        </p>
      </section>

      <ShareBlock w={w} />

      <section>
        <h3 className="eyebrow mb-3">Withdraw as cash</h3>
        {pending ? (
          <Notice tone="success">
            Your withdrawal of {formatINR(pending.amountPaise)} is being processed. {w.payoutNote}
          </Notice>
        ) : !w.enabled ? (
          <p className="text-sm text-muted">Withdrawals are paused right now.</p>
        ) : w.balancePaise < w.minCashoutPaise ? (
          <p className="text-sm text-muted">
            You can withdraw from {rupees(w.minCashoutPaise)}. You need {formatINR(w.minCashoutPaise - w.balancePaise)} more — or spend what you have at checkout.
          </p>
        ) : (
          <WithdrawForm w={w} onDone={load} />
        )}
      </section>

      <section>
        <h3 className="eyebrow mb-3">History</h3>
        {w.entries.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Rewards appear here when friends order with your code.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {w.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="block">{e.note ?? KIND[e.kind] ?? e.kind}</span>
                  <span className="text-xs text-muted">
                    {KIND[e.kind] ?? e.kind} · {day(e.createdAt)}
                  </span>
                </span>
                <span className={`shrink-0 font-medium ${e.amountPaise < 0 ? 'text-danger' : 'text-success'}`}>
                  {e.amountPaise < 0 ? '−' : '+'}
                  {formatINR(Math.abs(e.amountPaise))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {w.payouts.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">Withdrawals</h3>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {w.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span>
                  {formatINR(p.amountPaise)} to {p.method === 'UPI' ? p.upiId : `account ${p.bankAccountNumber}`}
                  <span className="block text-xs text-muted">
                    Asked {day(p.createdAt)}
                    {p.paidAt ? ` · paid ${day(p.paidAt)}` : ''}
                    {p.reference ? ` · ref ${p.reference}` : ''}
                    {p.status === 'REJECTED' && p.note ? ` · ${p.note}` : ''}
                  </span>
                </span>
                <span className={p.status === 'PAID' ? 'text-success' : p.status === 'REJECTED' ? 'text-danger' : 'text-muted'}>{PAYOUT_STATUS[p.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ShareBlock({ w }: { w: Wallet }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copy = async (what: 'code' | 'link') => {
    await navigator.clipboard?.writeText(what === 'code' ? w.referralCode : w.shareUrl).catch(() => undefined);
    setCopied(what);
  };
  return (
    <section className="border border-line bg-surface p-5">
      <h3 className="eyebrow">Share your code, earn {rupees(w.referralRewardPaise)}</h3>
      <p className="mt-2 text-sm">
        When someone joins with your code, you get <strong>{rupees(w.referralRewardPaise)}</strong> in this wallet on{' '}
        {w.rewardOn === 'EVERY_ORDER' ? 'every order they place' : 'their first order'} — added once the order is confirmed.
        {w.friendsJoined > 0 ? ` ${w.friendsJoined} ${w.friendsJoined === 1 ? 'friend has' : 'friends have'} joined so far.` : ''}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <p className="border border-dashed border-ink px-5 py-2 font-mono text-xl tracking-widest">{w.referralCode}</p>
        <button type="button" className="min-h-11 border border-ink px-4 text-sm hover:bg-ink hover:text-white" onClick={() => copy('code')}>
          {copied === 'code' ? 'Code copied' : 'Copy code'}
        </button>
        <button type="button" className="min-h-11 border border-ink px-4 text-sm hover:bg-ink hover:text-white" onClick={() => copy('link')}>
          {copied === 'link' ? 'Link copied' : 'Copy link'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(w.shareText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 bg-whatsapp px-4 text-sm text-white">
          <WhatsAppIcon width={18} height={18} /> Share on WhatsApp
        </a>
      </div>
      <p className="mt-3 break-all text-xs text-muted">{w.shareUrl}</p>
      <Link href="/account/referral" className="mt-2 inline-block text-sm text-accent underline">
        See who joined with your code
      </Link>
    </section>
  );
}

function WithdrawForm({ w, onDone }: { w: Wallet; onDone: () => Promise<void> }) {
  const [method, setMethod] = useState<'UPI' | 'BANK'>('UPI');
  const [amount, setAmount] = useState(String(Math.floor(w.balancePaise / 100)));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const amountPaise = Math.round(Number(amount.replace(/[,₹\s]/g, '')) * 100);
  const tooLow = Number.isFinite(amountPaise) && amountPaise < w.minCashoutPaise;
  const tooHigh = Number.isFinite(amountPaise) && amountPaise > w.balancePaise;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (tooLow || tooHigh || !Number.isFinite(amountPaise)) return;
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setErrors({});
        setMsg(null);
        try {
          await api('/me/wallet/withdraw', {
            method: 'POST',
            json:
              method === 'UPI'
                ? { method, amountPaise, upiId: fd.get('upiId') }
                : { method, amountPaise, bankAccountName: fd.get('bankAccountName'), bankAccountNumber: fd.get('bankAccountNumber'), bankIfsc: fd.get('bankIfsc'), bankName: fd.get('bankName') || null },
          });
          await onDone();
        } catch (err) {
          if (err instanceof ApiError && err.fields) setErrors(err.fields);
          setMsg({ tone: 'danger', text: errorText(err) });
        } finally {
          setBusy(false);
        }
      }}
    >
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <FormField
        label="Amount (₹)"
        required
        error={errors.amountPaise ?? (tooLow ? `At least ${rupees(w.minCashoutPaise)}` : tooHigh ? `Up to ${formatINR(w.balancePaise)}` : undefined)}
        hint={`Between ${rupees(w.minCashoutPaise)} and ${formatINR(w.balancePaise)}`}
      >
        {(id, d) => <TextInput id={id} aria-describedby={d} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} invalid={tooLow || tooHigh} required />}
      </FormField>
      <div role="radiogroup" aria-label="Pay me by" className="flex flex-wrap gap-3">
        {(['UPI', 'BANK'] as const).map((m) => (
          <label key={m} className={`flex min-h-11 cursor-pointer items-center gap-2 border px-4 text-sm ${method === m ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
            <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
            {m === 'UPI' ? 'UPI' : 'Bank transfer'}
          </label>
        ))}
      </div>
      {method === 'UPI' ? (
        <FormField label="UPI ID" required error={errors.upiId}>
          {(id) => <TextInput id={id} name="upiId" placeholder="name@okbank" autoCapitalize="none" required />}
        </FormField>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Account holder’s name" required error={errors.bankAccountName}>
            {(id) => <TextInput id={id} name="bankAccountName" autoComplete="name" required />}
          </FormField>
          <FormField label="Account number" required error={errors.bankAccountNumber}>
            {(id) => <TextInput id={id} name="bankAccountNumber" inputMode="numeric" required />}
          </FormField>
          <FormField label="IFSC" required error={errors.bankIfsc}>
            {(id) => <TextInput id={id} name="bankIfsc" maxLength={11} placeholder="HDFC0001234" autoCapitalize="characters" required />}
          </FormField>
          <FormField label="Bank (optional)" error={errors.bankName}>
            {(id) => <TextInput id={id} name="bankName" />}
          </FormField>
        </div>
      )}
      {w.payoutNote && <p className="text-sm text-muted">{w.payoutNote}</p>}
      <div>
        <SubmitButton busy={busy}>Withdraw</SubmitButton>
      </div>
    </form>
  );
}
