import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Catalogue, type SearchParams } from '@/components/catalogue';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

interface Collection { name: string; slug: string; description: string | null; imageUrl: string | null; seoTitle: string | null; seoDescription: string | null }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await get<Collection>(`/catalogue/collections/${slug}`, { revalidate: 300 });
  if (!c) return {};
  return meta({ title: c.seoTitle ?? `${c.name} Collection`, description: c.seoDescription ?? c.description, path: `/collections/${c.slug}`, image: c.imageUrl });
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const c = await get<Collection>(`/catalogue/collections/${slug}`, { revalidate: 300 });
  if (!c) notFound();
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Jewellery', href: '/jewellery' }, { name: c.name }]} />
      <PageTitle eyebrow="Collection" title={c.name} intro={c.description} />
      <Suspense>
        <Catalogue searchParams={sp} fixed={{ collection: c.slug }} basePath={`/collections/${c.slug}`} />
      </Suspense>
    </Container>
  );
}
