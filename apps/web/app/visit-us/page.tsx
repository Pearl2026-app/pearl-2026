import { Breadcrumbs, ButtonLink, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';

export const metadata = meta({ title: 'Visit us', description: 'Our stores, addresses and opening hours. Book a visit with a pearl adviser.', path: '/visit-us' });

export default async function VisitUsPage() {
  const site = await get<Site>('/site', { revalidate: 300 });
  const stores = site?.stores ?? [];
  const cities = [...new Set(stores.map((s) => s.city.name))];
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Visit us' }]} />
      <PageTitle eyebrow="Stores" title="Visit us" intro="See and try our pearls in person. Book ahead and an adviser will have pieces ready for you." />
      {stores.length === 0 ? (
        <div className="flex flex-col items-start gap-4 bg-surface-muted p-6 lg:p-10">
          <p className="font-serif text-2xl">Our stores are coming soon</p>
          <p className="text-muted">Meanwhile, see any piece on a live video call with our adviser.</p>
          <ButtonLink href="/book-consultation">Book a video call</ButtonLink>
        </div>
      ) : (
        cities.map((city) => (
          <section key={city} className="mb-12" aria-labelledby={`c-${city}`}>
            <h2 id={`c-${city}`} className="eyebrow mb-4">{city}</h2>
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {stores.filter((s) => s.city.name === city).map((s) => (
                <li key={s.id} className="flex flex-col gap-2 border border-line bg-surface p-5">
                  <p className="font-serif text-2xl">{s.name}</p>
                  <address className="text-sm not-italic">{s.address}</address>
                  {s.openingHours && <p className="text-sm text-muted">Open {s.openingHours}</p>}
                  <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <a href={`tel:${s.phone}`} className="text-accent underline underline-offset-2">Call</a>
                    {s.mapUrl && <a href={s.mapUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">Directions</a>}
                    <a href={`/book-consultation`} className="text-accent underline underline-offset-2">Book a visit</a>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Container>
  );
}
