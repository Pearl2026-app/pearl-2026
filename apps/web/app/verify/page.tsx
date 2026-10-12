import { Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { VerifyForm } from './verify-form';

export const metadata = meta({ title: 'Verify a certificate', description: 'Check a Sahyadri Pearls certificate of authenticity by its number.', path: '/verify' });

export default function VerifyIndexPage() {
  return (
    <Container className="max-w-xl py-10">
      <PageTitle eyebrow="Certificate" title="Verify a certificate" intro="Scan the QR code on your certificate, or type its number below." />
      <VerifyForm />
    </Container>
  );
}
