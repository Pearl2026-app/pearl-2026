import { ButtonLink, Container } from '@/components/ui';

export default function NotFound() {
  return (
    <Container className="max-w-2xl py-24 text-center">
      <p className="eyebrow">Page not found</p>
      <h1 className="mt-3 font-serif text-5xl">This pearl slipped away</h1>
      <p className="mt-4 text-muted">The page you are looking for has moved or no longer exists.</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/jewellery">Shop jewellery</ButtonLink>
        <ButtonLink href="/contact" variant="outline">Contact us</ButtonLink>
      </div>
    </Container>
  );
}
