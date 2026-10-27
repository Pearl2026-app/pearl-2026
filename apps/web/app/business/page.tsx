import type { Metadata } from 'next';
import { Container } from '@/components/ui';
import { BusinessCta } from './cta';

export const metadata: Metadata = {
  title: 'Business Buyers (B2B)',
  description: 'Business prices on bulk quantities for jewellers, resellers and corporate buyers, with GST invoices in your business name.',
};

const POINTS: Array<[string, string]> = [
  ['Business prices', 'Bulk prices only approved accounts can see.'],
  ['GST invoice in your name', 'Your GSTIN on every invoice, ready for input credit.'],
  ['Reserved pieces', 'Lines kept off the public store, for the trade only.'],
  ['One approval, then self-serve', 'Apply once with your GSTIN; order any time after.'],
];

/** The business buyers' portal (client doc, 26 Oct): a dedicated entrance for B2B, separate from the public store. */
export default function BusinessPortalPage() {
  return (
    <Container className="py-16">
      <p className="eyebrow">For jewellers, resellers & corporate buyers</p>
      <h1 className="ruled-heading mt-1 font-serif text-4xl lg:text-5xl">Business Buyers</h1>
      <p className="mt-4 max-w-xl text-muted">A separate counter for the trade — same farms, same certification, business prices.</p>
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
        Questions? <a className="underline hover:text-accent" href="/contact">Write to us</a> — we reply within a working day.
      </p>
    </Container>
  );
}
