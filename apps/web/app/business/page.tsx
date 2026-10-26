import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import { BusinessCta } from './cta';

export const metadata: Metadata = {
  title: 'Business Buyers (B2B)',
  description: 'Business prices on bulk quantities for jewellers, resellers and corporate buyers, with GST invoices in your business name.',
};

const POINTS: Array<[string, string]> = [
  ['Business prices', 'Lower prices on bulk quantities, set piece by piece, visible only to approved business accounts.'],
  ['GST invoice in your name', 'Every order carries your business name and GSTIN on a gap-free GST invoice, ready for input credit.'],
  ['Reserved pieces', 'Loose pearls and lines we keep only for business buyers never appear in the public store.'],
  ['One approval, then self-serve', 'Apply once with your GSTIN. After approval, order any time from your business catalogue.'],
];

/** The business buyers' portal (client doc, 26 Oct): a dedicated entrance for B2B, separate from the public store. */
export default function BusinessPortalPage() {
  return (
    <Container className="py-16">
      <p className="eyebrow">For jewellers, resellers & corporate buyers</p>
      <h1 className="ruled-heading mt-1 font-serif text-4xl lg:text-5xl">Business Buyers</h1>
      <p className="mt-4 max-w-2xl text-muted">
        A separate counter for the trade: business prices on bulk quantities, pieces reserved for resellers, and GST
        invoices in your business name — from the same farms and the same certification as our retail jewellery.
      </p>
      <BusinessCta />
      <dl className="mt-12 grid gap-8 sm:grid-cols-2">
        {POINTS.map(([t, d]) => (
          <div key={t} className="border-t border-line pt-4">
            <dt className="lux-track">{t}</dt>
            <dd className="mt-2 text-sm text-muted">{d}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-12 text-sm text-muted">
        Questions before applying? Write to us from the <a className="underline hover:text-accent" href="/contact">contact page</a> or ask for a callback — we reply
        within a working day.
      </p>
    </Container>
  );
}
