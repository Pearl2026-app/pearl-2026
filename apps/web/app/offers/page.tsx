import { formatINR } from '@sahyadri/shared';
import { Breadcrumbs, ButtonLink, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

export const metadata = meta({ title: 'Offers', description: 'Current offers and coupon codes at Sahyadri Pearls.', path: '/offers' });

interface Offers { coupons: Array<{ code: string; description: string | null; discountType: 'PERCENT' | 'FLAT'; discountValue: number; minOrderPaise: number; maxDiscountPaise: number | null; firstOrderOnly: boolean; endsAt: string | null; categories: Array<{ name: string; slug: string }> }> }

export default async function OffersPage() {
  const o = (await get<Offers>('/offers', { revalidate: 120 }))!;
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Offers' }]} />
      <PageTitle eyebrow="Offers" title="Current offers" intro="Apply a code in your cart or at checkout." />
      {o.coupons.length === 0 ? (
        <p className="text-muted">There are no offers running right now.</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {o.coupons.map((c) => (
            <li key={c.code} className="flex flex-col gap-3 border border-line bg-surface p-6">
              <p className="font-serif text-3xl text-accent">{c.discountType === 'PERCENT' ? `${c.discountValue / 100}% off` : `${formatINR(c.discountValue, { compact: true })} off`}</p>
              <p>{c.description}</p>
              <p className="text-xs text-muted">
                {[c.minOrderPaise ? `Orders above ${formatINR(c.minOrderPaise, { compact: true })}` : null, c.maxDiscountPaise ? `up to ${formatINR(c.maxDiscountPaise, { compact: true })}` : null, c.firstOrderOnly ? 'first order only' : null, c.categories.length ? `on ${c.categories.map((x) => x.name).join(', ')}` : null, c.endsAt ? `until ${new Date(c.endsAt).toLocaleDateString('en-IN')}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="mt-auto border border-dashed border-ink px-3 py-2 text-center font-mono tracking-widest">{c.code}</p>
            </li>
          ))}
        </ul>
      )}
      <ButtonLink href="/jewellery" className="mt-12">Shop jewellery</ButtonLink>
    </Container>
  );
}
