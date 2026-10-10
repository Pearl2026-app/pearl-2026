import { notFound } from 'next/navigation';
import { CareerApplyForm } from '@/components/forms';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { JsonLd, meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

interface Job { slug: string; title: string; location: string; description: string; eligibility: string | null; createdAt: string; closesAt: string | null }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = await get<Job>(`/careers/${slug}`, { revalidate: 300 });
  return j ? meta({ title: `${j.title}, ${j.location}`, description: j.description.slice(0, 160), path: `/careers/${j.slug}` }) : {};
}

export default async function JobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const j = await get<Job>(`/careers/${slug}`, { revalidate: 300 });
  if (!j) notFound();
  return (
    <Container className="max-w-4xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Careers', href: '/careers' }, { name: j.title }]} />
      <PageTitle eyebrow={j.location} title={j.title} />
      <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6 leading-relaxed">
          <p className="whitespace-pre-line">{j.description}</p>
          {j.eligibility && (
            <div>
              <h2 className="eyebrow mb-2">Eligibility</h2>
              <p className="whitespace-pre-line text-muted">{j.eligibility}</p>
            </div>
          )}
        </div>
        <div className="bg-surface p-6">
          <h2 className="mb-5 font-serif text-2xl">Apply</h2>
          <CareerApplyForm slug={j.slug} />
        </div>
      </div>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'JobPosting', title: j.title, description: j.description, datePosted: j.createdAt, validThrough: j.closesAt ?? undefined, hiringOrganization: { '@type': 'Organization', name: 'Sahyadri Pearls' }, jobLocation: { '@type': 'Place', address: j.location } }} />
    </Container>
  );
}
