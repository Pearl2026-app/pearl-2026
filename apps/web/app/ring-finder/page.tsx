import { RingFinder } from '@/components/ring-finder';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';

export const metadata = meta({ title: 'Ring Finder', description: 'Answer a few questions and see pearl rings in stock that suit you, each with a reason, or design your own.', path: '/ring-finder' });

export default function RingFinderPage() {
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Ring Finder' }]} />
      <PageTitle eyebrow="Find your ring" title="Ring Finder" intro="Seven quick questions. We show rings that are in stock right now and say why each one suits you." />
      <div className="max-w-4xl py-6">
        <RingFinder />
      </div>
    </Container>
  );
}
