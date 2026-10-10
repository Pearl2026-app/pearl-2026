'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@sahyadri/ui';
import { ResourceForm } from '@/components/resource';
import { api } from '@/lib/api';
import { date, inr } from '@/lib/format';
import { RESOURCES } from '@/lib/resources';

interface Usage { redemptions: number; discountPaise: number; salesPaise: number; usageLimit: number | null; recent: Array<{ id: string; discountPaise: number; order: { id: string; number: string; totalPaise: number; placedAt: string; contactName: string } }> }

function UsagePanel({ id }: { id: string }) {
  const { data } = useQuery({ queryKey: ['/admin/coupons', id, 'usage'], queryFn: () => api<Usage>(`/admin/coupons/${id}/usage`) });
  if (!data) return null;
  return (
    <Card className="mt-4 max-w-3xl">
      <h2 className="mb-2 font-semibold">Usage</h2>
      <dl className="mb-3 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-muted">Times used</dt><dd className="text-lg">{data.redemptions}{data.usageLimit ? ` / ${data.usageLimit}` : ''}</dd></div>
        <div><dt className="text-muted">Discount given</dt><dd className="text-lg">{inr(data.discountPaise)}</dd></div>
        <div><dt className="text-muted">Paid sales with this code</dt><dd className="text-lg">{inr(data.salesPaise)}</dd></div>
      </dl>
      {data.recent.length > 0 && (
        <ul className="text-sm">
          {data.recent.map((r) => (
            <li key={r.id} className="flex justify-between border-t border-line py-1">
              <span><Link href={`/orders/${r.order.id}`} className="text-accent underline">{r.order.number}</Link> · {r.order.contactName} · {date(r.order.placedAt)}</span>
              <span>{inr(r.order.totalPaise)} <span className="text-xs text-success">(−{inr(r.discountPaise)})</span></span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function CouponPage() {
  const { id } = useParams<{ id: string }>();
  return <ResourceForm def={RESOURCES.coupons!} id={id}>{() => (id === 'new' ? null : <UsagePanel id={id} />)}</ResourceForm>;
}
