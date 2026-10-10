import { EnquiryForm } from '@/components/forms';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { EnquireButton } from '@/components/whatsapp';
import { JsonLd, meta, SITE_URL } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';

export const metadata = meta({ title: 'Contact', description: 'Visit, call, email or message Sahyadri Pearls on WhatsApp.', path: '/contact' });

export default async function ContactPage() {
  const site = (await get<Site>('/site', { revalidate: 300 }))!;
  const c = site.blocks['contact.info']?.data ?? {};
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Contact' }]} />
      <PageTitle eyebrow="We would love to hear from you" title="Contact" />
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-6">
          <div>
            <p className="eyebrow mb-1">Visit</p>
            <address className="not-italic">{c.address ?? site.store.address}</address>
            {c.hours && <p className="mt-1 text-sm text-muted">{c.hours}</p>}
          </div>
          <div>
            <p className="eyebrow mb-1">Call or email</p>
            <p><a href={`tel:${site.store.phone}`} className="hover:text-accent">{c.phone ?? site.store.phone}</a></p>
            <p><a href={`mailto:${site.store.email}`} className="hover:text-accent">{c.email ?? site.store.email}</a></p>
          </div>
          <EnquireButton enquiry={{ type: 'CONTACT', message: 'I have a question.' }} label="Message us on WhatsApp" className="self-start" />
          {c.mapEmbedUrl && <iframe title="Map to Sahyadri Pearls" src={c.mapEmbedUrl} loading="lazy" className="aspect-[4/3] w-full border border-line" referrerPolicy="no-referrer-when-downgrade" />}
        </div>
        <div className="bg-surface p-6 lg:p-10">
          <h2 className="mb-6 font-serif text-3xl">Send us a message</h2>
          <EnquiryForm type="CONTACT" submitLabel="Send message" messageLabel="How can we help?" />
        </div>
      </div>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'JewelryStore', name: 'Sahyadri Pearls', url: SITE_URL, telephone: site.store.phone, email: site.store.email, address: c.address ?? site.store.address }} />
    </Container>
  );
}
