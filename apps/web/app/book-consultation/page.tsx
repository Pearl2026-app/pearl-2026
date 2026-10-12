import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { ProductDetail, Site } from '@/lib/types';
import { ConsultationForm } from './consultation-form';

export const metadata = meta({ title: 'Book a consultation', description: 'See our pearls on a live video call or visit a store with a pearl adviser. Free, with no obligation.', path: '/book-consultation' });

export default async function BookConsultationPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const sp = await searchParams;
  const [site, product] = await Promise.all([
    get<Site>('/site', { revalidate: 300 }),
    sp.product ? get<ProductDetail>(`/catalogue/products/${encodeURIComponent(sp.product)}`, { revalidate: 60 }) : Promise.resolve(null),
  ]);
  return (
    <Container className="max-w-3xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Book a consultation' }]} />
      <PageTitle eyebrow="Personal advice" title="Book a consultation" intro="Meet a pearl adviser on a video call or in store. We will show you pieces up close, compare lustre and sizes side by side, and help you choose." />
      <ConsultationForm stores={site?.stores ?? []} product={product ? { id: product.id, name: product.name } : null} />
    </Container>
  );
}
