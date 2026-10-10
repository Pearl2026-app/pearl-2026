'use client';
import { useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { WhatsAppIcon } from '@/components/icons';
import { api } from '@/lib/api';

interface Ref { code: string; enabled: boolean; referrerRewardPaise: number; refereeRewardPaise: number; shareText: string; shareUrl: string; referrals: Array<{ name: string; joinedAt: string; rewarded: boolean }>; rewards: Array<{ code: string; amountPaise: number; endsAt: string | null; used: boolean; description: string | null }> }

export default function Referral() {
  const [r, setR] = useState<Ref | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<Ref>('/me/referral').then(setR);
  }, []);
  if (!r) return <p className="text-muted">Loading…</p>;
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div>
        <h2 className="font-serif text-2xl">Referral Code</h2>
        <p className="mt-2 text-muted">
          Share your code. When a friend’s first order is delivered, you get {formatINR(r.referrerRewardPaise, { compact: true })} off and they get {formatINR(r.refereeRewardPaise, { compact: true })} off.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="border border-dashed border-ink px-6 py-3 font-mono text-2xl tracking-widest">{r.code}</p>
        <button className="min-h-11 border border-ink px-4 text-sm" onClick={async () => { await navigator.clipboard.writeText(r.shareText).catch(() => undefined); setCopied(true); }}>{copied ? 'Copied' : 'Copy message'}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(r.shareText)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 bg-whatsapp px-4 text-sm text-white"><WhatsAppIcon width={18} height={18} /> Share on WhatsApp</a>
      </div>
      <section>
        <h3 className="eyebrow mb-2">Friends who joined</h3>
        {r.referrals.length === 0 ? <p className="text-sm text-muted">No one yet.</p> : (
          <ul className="text-sm">{r.referrals.map((x, i) => <li key={i}>{x.name} · joined {new Date(x.joinedAt).toLocaleDateString('en-IN')} · {x.rewarded ? 'reward earned' : 'waiting for first delivery'}</li>)}</ul>
        )}
      </section>
      <section>
        <h3 className="eyebrow mb-2">Your rewards</h3>
        {r.rewards.length === 0 ? <p className="text-sm text-muted">Rewards appear here as personal coupon codes.</p> : (
          <ul className="flex flex-col gap-2 text-sm">{r.rewards.map((x) => <li key={x.code}><span className="font-mono">{x.code}</span> · {formatINR(x.amountPaise, { compact: true })} off · {x.used ? 'used' : x.endsAt ? `valid until ${new Date(x.endsAt).toLocaleDateString('en-IN')}` : 'valid'}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
