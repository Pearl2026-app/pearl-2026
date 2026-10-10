import { EnquiryForm } from '@/components/forms';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';

export const metadata = meta({ title: 'Bulk Buying & B2B', description: 'Wedding gifting, corporate orders and trade enquiries for farm-traced pearls.', path: '/bulk-buying' });

export default async function BulkPage() {
  const site = await get<Site>('/site', { revalidate: 300 });
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Bulk Buying' }]} />
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <PageTitle eyebrow="Bulk & B2B" title="Bulk Buying" intro={site?.blocks['bulk.intro']?.data?.body ?? 'Tell us what you need and our wholesale team will send a quote.'} />
        <div className="bg-surface p-6 lg:my-10 lg:p-10">
          <EnquiryForm type="BULK" submitLabel="Request a quote" messageLabel="What are you looking for?" />
        </div>
      </div>
    </Container>
  );
}
