'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatINR, ORDER_STATUS_LABEL, type OrderStatus } from '@sahyadri/shared';
import { api } from '@/lib/api';

interface Row { id: string; number: string; placedAt: string; status: OrderStatus; totalPaise: number; items: Array<{ name: string; imageUrl: string | null; quantity: number }> }

export default function MyOrders() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    api<{ items: Row[] }>('/me/orders?pageSize=50').then((r) => setRows(r.items)).catch(() => setRows([]));
  }, []);
  if (!rows) return <p className="text-muted">Loading…</p>;
  return (
    <div>
      <h2 className="mb-4 font-serif text-2xl">My Orders</h2>
      {rows.length === 0 ? (
        <p className="text-muted">No orders yet. <Link href="/jewellery" className="text-accent underline">Start shopping</Link>.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/account/orders/${encodeURIComponent(o.number)}`} className="flex items-center gap-4 py-4 hover:bg-surface">
                {o.items[0]?.imageUrl && <img src={o.items[0].imageUrl} alt="" className="h-16 w-16 object-cover" />}
                <span className="flex-1">
                  <span className="block font-medium">{o.number}</span>
                  <span className="block text-sm text-muted">{new Date(o.placedAt).toLocaleDateString('en-IN')} · {o.items.map((i) => i.name).join(', ')}</span>
                </span>
                <span className="text-right text-sm">
                  <span className="block">{formatINR(o.totalPaise, { compact: true })}</span>
                  <span className="text-muted">{ORDER_STATUS_LABEL[o.status]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
