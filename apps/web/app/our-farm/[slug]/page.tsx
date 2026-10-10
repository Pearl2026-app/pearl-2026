import { notFound } from 'next/navigation';
import { ProductGrid } from '@/components/product-card';
import { Breadcrumbs, Container, SectionHeading } from '@/components/ui';
import { breadcrumbJsonLd, JsonLd, meta } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { ProductCard } from '@/lib/types';


interface Farm { name: string; slug: string; location: string; latitude: number | null; longitude: number | null; summary: string | null; story: string | null; heroImageUrl: string | null; galleryUrls: string[]; seoTitle: string | null; seoDescription: string | null; products: ProductCard[] }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = await get<Farm>(`/catalogue/farms/${slug}`, { revalidate: 300 });
  if (!f) return {};
  return meta({ title: f.seoTitle ?? `${f.name} · Pearl farm in ${f.location}`, description: f.seoDescription ?? f.summary, path: `/our-farm/${f.slug}`, image: f.heroImageUrl });
}

export default async function FarmPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = await get<Farm>(`/catalogue/farms/${slug}`, { revalidate: 300 });
  if (!f) notFound();
  return (
    <>
      <section className="relative isolate bg-ink">
        {f.heroImageUrl && <img src={f.heroImageUrl} alt="" width={1600} height={900} fetchPriority="high" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-75" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/70 to-transparent" />
        <Container className="flex min-h-[56vh] flex-col justify-end pb-12 text-white">
          <p className="text-xs tracking-[0.2em] uppercase opacity-80">{f.location}</p>
          <h1 className="mt-2 font-serif text-5xl lg:text-6xl">{f.name}</h1>
          {f.summary && <p className="mt-4 max-w-2xl text-lg text-white/90">{f.summary}</p>}
        </Container>
      </section>
      <Container>
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Our Farm', href: '/our-farm' }, { name: f.name }]} />
        <div className="grid gap-12 py-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="text-lg leading-relaxed whitespace-pre-line">{f.story}</div>
          <aside className="flex flex-col gap-4">
            {f.latitude != null && f.longitude != null && (
              <iframe
                title={`Map of ${f.name}`}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${f.longitude - 0.08},${f.latitude - 0.05},${f.longitude + 0.08},${f.latitude + 0.05}&layer=mapnik&marker=${f.latitude},${f.longitude}`}
                loading="lazy"
                className="aspect-[4/3] w-full border border-line"
              />
            )}
            <p className="text-sm text-muted">{f.location}</p>
          </aside>
        </div>
        {f.galleryUrls.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {f.galleryUrls.map((u) => (
              <li key={u}>
                <img src={u} alt="" loading="lazy" width={1600} height={900} className="aspect-[4/3] w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
        <section className="mt-20">
          <SectionHeading eyebrow="From this farm" title={`Pearls from ${f.name}`} />
          <ProductGrid products={f.products} />
        </section>
        <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Place', name: f.name, address: f.location, ...(f.latitude != null ? { geo: { '@type': 'GeoCoordinates', latitude: f.latitude, longitude: f.longitude } } : {}) }} />
        <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Our Farm', path: '/our-farm' }, { name: f.name, path: `/our-farm/${f.slug}` }])} />
      </Container>
    </>
  );
}
