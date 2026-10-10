import Link from 'next/link';
import { Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

export const metadata = meta({ title: 'Verify certificate', path: '/verify', noindex: true });

interface Cert { code: string; valid: boolean; issuedAt: string; issuedBy: string | null; details: Record<string, string | number | null> | null; product: { name: string; sku: string; slug: string | null; imageUrl: string | null }; farm: { name: string; slug: string; location: string } | null }

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = await get<Cert>(`/verify/${encodeURIComponent(code)}`, { revalidate: 60 });
  if (!c)
    return (
      <Container className="max-w-2xl py-16">
        <PageTitle title="Certificate not found" intro={`We could not find certificate ${code}. Please check the code or contact us.`} />
      </Container>
    );
  return (
    <Container className="max-w-3xl py-10">
      <p className={`inline-block px-3 py-1 text-xs tracking-widest uppercase ${c.valid ? 'bg-[#E2F1E8] text-[#1F5E3A]' : 'bg-[#F8E1DF] text-[#8C1D17]'}`}>{c.valid ? 'Genuine · verified' : 'This certificate has been revoked'}</p>
      <PageTitle eyebrow={`Certificate ${c.code}`} title={c.product.name} />
      <div className="grid gap-8 md:grid-cols-[240px_1fr]">
        {c.product.imageUrl && <img src={c.product.imageUrl} alt="" className="aspect-square w-full object-cover" />}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 self-start text-sm">
          <dt className="text-muted">SKU</dt><dd>{c.product.sku}</dd>
          {c.farm && (<><dt className="text-muted">Farm of origin</dt><dd><Link href={`/our-farm/${c.farm.slug}`} className="text-accent underline">{c.farm.name}</Link>, {c.farm.location}</dd></>)}
          {Object.entries(c.details ?? {}).filter(([k, v]) => v != null && k !== 'farm').map(([k, v]) => (
            <div key={k} className="contents"><dt className="text-muted capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt><dd>{String(v)}</dd></div>
          ))}
          <dt className="text-muted">Issued</dt><dd>{new Date(c.issuedAt).toLocaleDateString('en-IN')}{c.issuedBy ? ` by ${c.issuedBy}` : ''}</dd>
        </dl>
      </div>
      {c.product.slug && <Link href={`/product/${c.product.slug}`} className="mt-8 inline-flex min-h-11 items-center text-accent underline">View this piece</Link>}
    </Container>
  );
}
