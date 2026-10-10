import Link from 'next/link';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

export const metadata = meta({ title: 'Our Farms', description: 'Where our pearls grow: farms in the Sahyadri hills and on the Konkan coast.', path: '/our-farm' });

interface Farm { id: string; name: string; slug: string; location: string; summary: string | null; heroImageUrl: string | null; _count: { products: number } }

export default async function FarmsPage() {
  const farms = (await get<Farm[]>('/catalogue/farms', { revalidate: 300 })) ?? [];
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Our Farm' }]} />
      <PageTitle eyebrow="Where our pearls grow" title="Our Farms" intro="Every Sahyadri pearl is traced to the farm it grew on. Meet the farms and the people who tend them." />
      <ul className="grid gap-12 md:grid-cols-2">
        {farms.map((f) => (
          <li key={f.id}>
            <Link href={`/our-farm/${f.slug}`} className="group block">
              <div className="overflow-hidden bg-surface-muted">
                {f.heroImageUrl && <img src={f.heroImageUrl} alt="" loading="lazy" width={1600} height={900} className="img-zoom aspect-[16/10] w-full object-cover" />}
              </div>
              <p className="eyebrow mt-5">{f.location}</p>
              <h2 className="mt-1 font-serif text-3xl group-hover:text-accent">{f.name}</h2>
              <p className="mt-2 text-muted">{f.summary}</p>
              <p className="mt-3 text-sm text-accent underline underline-offset-4">{f._count.products} pieces from this farm</p>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
