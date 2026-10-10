import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

export const metadata = meta({ title: 'Gallery', description: 'Our farms, our craft and our customers.', path: '/gallery' });

export default async function GalleryPage() {
  const items = (await get<Array<{ id: string; title: string | null; caption: string | null; mediaUrl: string; mediaType: string }>>('/content/gallery', { revalidate: 300 })) ?? [];
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Gallery' }]} />
      <PageTitle title="Gallery" />
      <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3">
        {items.map((g) => (
          <li key={g.id} className="mb-4 break-inside-avoid">
            <figure>
              {g.mediaType === 'video' ? (
                <video src={g.mediaUrl} controls preload="metadata" className="w-full" />
              ) : (
                <img src={g.mediaUrl} alt={g.title ?? ''} loading="lazy" className="w-full" />
              )}
              {(g.title || g.caption) && <figcaption className="mt-2 text-sm text-muted">{g.title}{g.caption ? ` · ${g.caption}` : ''}</figcaption>}
            </figure>
          </li>
        ))}
      </ul>
    </Container>
  );
}
