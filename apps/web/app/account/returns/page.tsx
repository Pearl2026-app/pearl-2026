'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatINR } from '@sahyadri/shared';
import { api } from '@/lib/api';

export default function Returns() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    api<any[]>('/me/returns').then(setRows);
  }, []);
  if (!rows) return <p className="text-muted">Loading…</p>;
  return (
    <div>
      <h2 className="mb-2 font-serif text-2xl">Returns</h2>
      <p className="mb-6 text-sm text-muted">Request a return or cancellation from the order page. <Link href="/return-cancellation-policy" className="underline">Read the policy</Link>.</p>
      {rows.length === 0 ? <p className="text-muted">No return or cancellation requests.</p> : (
        <ul className="divide-y divide-line border-y border-line text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 py-4">
              <span>
                <Link href={`/account/orders/${encodeURIComponent(r.order.number)}`} className="font-medium text-accent">{r.order.number}</Link> · {r.type === 'RETURN' ? 'Return' : 'Cancellation'} · {r.reason}
              </span>
              <span className="text-muted">
                {r.status.toLowerCase().replace('_', ' ')}
                {r.refunds.length ? ` · refunded ${formatINR(r.refunds.reduce((s: number, x: any) => s + x.amountPaise, 0))}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
