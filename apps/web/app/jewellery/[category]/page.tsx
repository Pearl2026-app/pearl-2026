import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Catalogue, CatalogueSkeleton, type SearchParams } from '@/components/catalogue';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { breadcrumbJsonLd, JsonLd, meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

interface Category { name: string; slug: string; description: string | null; imageUrl: string | null; seoTitle: string | null; seoDescription: string | null }

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = await get<Category>(`/catalogue/categories/${category}`, { revalidate: 300 });
  if (!c) return {};
  return meta({ title: c.seoTitle ?? `Pearl ${c.name}`, description: c.seoDescription ?? c.description ?? `Farm-traced pearl ${c.name.toLowerCase()} from Sahyadri Pearls.`, path: `/jewellery/${c.slug}`, image: c.imageUrl });
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<SearchParams> }) {
  const [{ category }, sp] = await Promise.all([params, searchParams]);
  const c = await get<Category>(`/catalogue/categories/${category}`, { revalidate: 300 });
  if (!c) notFound();
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Jewellery', href: '/jewellery' }, { name: c.name }]} />
      <PageTitle eyebrow="Jewellery" title={c.name} intro={c.description} />
      {c.slug === 'rings' && (
        <p className="mb-6 text-sm">
          Not sure where to start? <Link href="/ring-finder" className="text-accent underline">Try the Ring Finder</Link>: a few questions, and rings that suit you.
        </p>
      )}
      <Suspense fallback={<CatalogueSkeleton />}>
        <Catalogue searchParams={sp} fixed={{ category: c.slug }} basePath={`/jewellery/${c.slug}`} />
      </Suspense>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Jewellery', path: '/jewellery' }, { name: c.name, path: `/jewellery/${c.slug}` }])} />
    </Container>
  );
}
