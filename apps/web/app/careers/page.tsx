import Link from 'next/link';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

export const metadata = meta({ title: 'Careers', description: 'Work with Sahyadri Pearls.', path: '/careers' });

interface Job { id: string; slug: string; title: string; location: string; description: string }

export default async function CareersPage() {
  const jobs = (await get<Job[]>('/careers', { revalidate: 300 })) ?? [];
  return (
    <Container className="max-w-4xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Careers' }]} />
      <PageTitle eyebrow="Join us" title="Careers" intro="We are a small team that cares about pearls, craft and the people we serve." />
      {jobs.length === 0 ? (
        <p className="text-muted">There are no openings right now. Please check back soon.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/careers/${j.slug}`} className="flex flex-col gap-1 py-6 hover:text-accent sm:flex-row sm:items-center sm:justify-between">
                <span className="font-serif text-2xl">{j.title}</span>
                <span className="text-sm text-muted">{j.location}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
