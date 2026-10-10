import { notFound } from 'next/navigation';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { Markdown } from '@/lib/markdown';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';


interface PageData { slug: string; title: string; isLegal: boolean; body: string; version: number; updatedAt: string; seoTitle: string | null; seoDescription: string | null }

/** Admin-managed pages: Our Story, About Us and the five legal pages (with version history in the admin). */
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const p = await get<PageData>(`/content/pages/${encodeURIComponent(page)}`, { revalidate: 300 });
  return p ? meta({ title: p.seoTitle ?? p.title, description: p.seoDescription ?? p.body.replace(/[#>*_[\]()]/g, '').slice(0, 160), path: `/${p.slug}` }) : {};
}

export default async function ContentPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const p = await get<PageData>(`/content/pages/${encodeURIComponent(page)}`, { revalidate: 300 });
  if (!p) notFound();
  return (
    <Container className="max-w-3xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: p.title }]} />
      <PageTitle title={p.title} />
      <article>
        <Markdown text={p.body.replace(/^##\s+.*\n/, '')} />
      </article>
      {p.isLegal && <p className="mt-10 text-xs text-muted">Version {p.version} · last updated {new Date(p.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
    </Container>
  );
}
