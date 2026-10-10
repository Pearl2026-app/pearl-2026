import { Suspense } from 'react';
import { CustomJewelleryForm } from '@/components/custom-form';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';

export const metadata = meta({ title: 'Customized Jewellery', description: 'Design a pearl piece with our craftspeople: tell us your idea, share reference images and get a quote.', path: '/customized-jewellery' });

export default function CustomPage() {
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Customized Jewellery' }]} />
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <PageTitle eyebrow="Made for you" title="Customized Jewellery" intro="Tell us what you have in mind. Our designers will suggest pearls from our farms, sketch the piece and send a quote." />
          <ol className="mt-4 flex flex-col gap-4 text-sm text-muted">
            <li><strong className="text-ink">1. Share your idea.</strong> Type, metal, size, budget and any photos you like.</li>
            <li><strong className="text-ink">2. Get a quote.</strong> We confirm pearls, design and price, usually within a day.</li>
            <li><strong className="text-ink">3. We make it.</strong> After an advance, our craftspeople set your pearls and we deliver, insured.</li>
          </ol>
        </div>
        <div className="py-6 lg:py-10">
          <Suspense>
            <CustomJewelleryForm />
          </Suspense>
        </div>
      </div>
    </Container>
  );
}
