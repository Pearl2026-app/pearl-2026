import { RiderApplyForm } from '@/components/forms';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';

export const metadata = meta({
  title: 'Deliver with us',
  description: 'Join Sahyadri Pearls as a delivery partner: apply with your driving licence, bike RC and address proof.',
  path: '/deliver-with-us',
});

export default function DeliverWithUsPage() {
  return (
    <Container className="max-w-4xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Deliver with us' }]} />
      <PageTitle
        eyebrow="Delivery partners"
        title="Deliver with us"
        intro="We deliver fine jewellery, so every rider is checked before their first delivery. Apply below; once our team approves your documents you can start with the vendor nearest you."
      />
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <ul className="flex flex-col gap-4 text-sm leading-relaxed text-muted">
          <li>
            <strong className="block text-ink">1 · Apply</strong>Your details and three documents: driving licence, bike RC and an address proof.
          </li>
          <li>
            <strong className="block text-ink">2 · We check</strong>Head office verifies the documents and calls you.
          </li>
          <li>
            <strong className="block text-ink">3 · Start delivering</strong>Sign in to the delivery app with your mobile number and a one-time code.
          </li>
        </ul>
        <div className="bg-surface p-6">
          <RiderApplyForm />
        </div>
      </div>
    </Container>
  );
}
