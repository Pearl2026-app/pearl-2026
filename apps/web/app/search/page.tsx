import { Suspense } from 'react';
import { Catalogue, type SearchParams } from '@/components/catalogue';
import { Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';

export const metadata = meta({ title: 'Search', path: '/search', noindex: true });

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  return (
    <Container>
      <PageTitle eyebrow="Search" title={q ? `Results for “${q}”` : 'Search'} intro={!q ? 'Search by product name or SKU using the search icon above.' : undefined} />
      {q && (
        <Suspense>
          <Catalogue searchParams={sp} fixed={{}} basePath="/search" />
        </Suspense>
      )}
    </Container>
  );
}
