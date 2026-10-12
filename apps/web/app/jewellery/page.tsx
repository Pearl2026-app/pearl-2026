import { Suspense } from 'react';
import { Catalogue, CatalogueSkeleton, type SearchParams } from '@/components/catalogue';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { breadcrumbJsonLd, JsonLd, meta } from '@/lib/seo';

export const metadata = meta({ title: 'Pearl Jewellery', description: 'Necklaces, earrings, rings, bracelets, pendants and loose pearls, each traced to a named farm.', path: '/jewellery' });

export default async function JewelleryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Jewellery' }]} />
      <PageTitle eyebrow="The collection" title="Jewellery" intro="Every piece names the farm its pearls came from." />
      <Suspense fallback={<CatalogueSkeleton />}>
        <Catalogue searchParams={sp} fixed={{}} basePath="/jewellery" />
      </Suspense>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Jewellery', path: '/jewellery' }])} />
    </Container>
  );
}
