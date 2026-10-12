import { Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { Unsubscribe } from './unsubscribe';

export const metadata = meta({ title: 'Unsubscribe', path: '/newsletter/unsubscribe', noindex: true });

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <Container className="max-w-xl py-10">
      <PageTitle eyebrow="Newsletter" title="Unsubscribe" />
      <Unsubscribe token={t ?? ''} />
    </Container>
  );
}
