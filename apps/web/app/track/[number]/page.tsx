import { notFound } from 'next/navigation';
import { OrderSummary, Timeline } from '@/components/tracking';
import { Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Tracking } from '@/lib/types-commerce';

export const metadata = meta({ title: 'Track your order', path: '/track', noindex: true });

export default async function TrackPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ number }, { t }] = await Promise.all([params, searchParams]);
  const o = await get<Tracking>(`/track/${encodeURIComponent(number)}${t ? `?t=${encodeURIComponent(t)}` : ''}`, { auth: true });
  if (!o) notFound();
  return (
    <Container className="max-w-4xl">
      <PageTitle eyebrow={`Order ${o.number}`} title="Track your order" intro={`Placed on ${new Date(o.placedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`} />
      <div className="grid gap-12 md:grid-cols-[1fr_1.2fr]">
        <Timeline t={o} />
        <OrderSummary t={o} invoiceHref={`/api/v1/track/${encodeURIComponent(o.number)}/invoice.pdf${t ? `?t=${encodeURIComponent(t)}` : ''}`} />
      </div>
      {o.delivery?.partner && <p className="mt-8 text-sm text-muted">Your delivery partner: {o.delivery.partner}</p>}
    </Container>
  );
}
