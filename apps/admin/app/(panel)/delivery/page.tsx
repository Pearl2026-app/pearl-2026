'use client';
import { InfoTip } from '@/components/info-tip';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@sahyadri/shared';
import { EmptyState, Spinner, StatusBadge } from '@sahyadri/ui';
import { addressLine, OfflineBanner, type Job } from '@/components/delivery-bits';
import { api } from '@/lib/api';
import { inr } from '@/lib/format';

export default function DeliveriesPage() {
  const [view, setView] = useState<'active' | 'done'>('active');
  const { data, isLoading } = useQuery({
    queryKey: ['/delivery/jobs', view],
    queryFn: () => api<{ items: Job[]; cashInHand: { count: number; amountPaise: number } }>(`/delivery/jobs?view=${view}`),
    refetchInterval: 60_000,
  });
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-3 flex items-center gap-2 font-serif text-2xl">My deliveries <InfoTip text="Your deliveries for today. Open one to scan the pieces at pickup, start the trip and record proof of delivery." /></h1>
      <OfflineBanner />
      {data && data.cashInHand.amountPaise > 0 && (
        <p className="mb-3 rounded-sm bg-surface-muted p-3 text-sm">Cash to hand over at the office: <strong>{inr(data.cashInHand.amountPaise)}</strong> ({data.cashInHand.count} order{data.cashInHand.count === 1 ? '' : 's'})</p>
      )}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-sm border border-line bg-surface p-1 text-sm" role="tablist">
        {(['active', 'done'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={`min-h-11 rounded-sm ${view === v ? 'bg-accent text-white' : ''}`} onClick={() => setView(v)}>
            {v === 'active' ? 'To deliver' : 'Completed'}
          </button>
        ))}
      </div>
      {isLoading && <Spinner />}
      {data?.items.length === 0 && <EmptyState title={view === 'active' ? 'No deliveries right now' : 'Nothing completed yet'} />}
      <ul className="flex flex-col gap-2">
        {data?.items.map((j) => (
          <li key={j.id}>
            <Link href={`/delivery/${j.id}`} className="block rounded-sm border border-line bg-surface p-3 active:bg-surface-muted">
              <span className="flex items-center justify-between">
                <strong>{j.number}</strong>
                <StatusBadge status={j.status} label={ORDER_STATUS_LABEL[j.status as OrderStatus]} />
              </span>
              <span className="mt-1 block text-sm">{j.contactName} · {j.addressSnapshot.area || j.addressSnapshot.cityName}</span>
              <span className="block text-xs text-muted">{addressLine(j.addressSnapshot)}</span>
              {j.codDuePaise > 0 && <span className="mt-1 block text-sm font-semibold text-warning">Collect cash {inr(j.codDuePaise)}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
