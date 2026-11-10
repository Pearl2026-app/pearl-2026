import Link from 'next/link';
import { VERSIONS } from '@/components/pearl-story/versions';
import { Container } from '@/components/ui';
import { meta } from '@/lib/seo';

// Previews of the three ways of telling the pearl's story, for the owner to choose one for the home page (10 Nov).
export const metadata = meta({ title: 'Opening scene previews', path: '/stories', noindex: true });

export default function StoriesPage() {
  return (
    <Container className="py-16 lg:py-24">
      <p className="lux-track text-[12px] text-gold">Previews</p>
      <h1 className="mt-3 font-serif text-[40px] leading-tight lg:text-[56px]">The story of a pearl, three ways</h1>
      <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink/75">Each one opens the home page with a scroll-told 3D scene from the farm to the Filigree Crown ring. Open one and scroll.</p>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {VERSIONS.map((v, i) => (
          <li key={v.slug}>
            <Link href={`/stories/${v.slug}`} className="block h-full rounded-md border border-ink/15 p-6 transition-colors hover:border-gold">
              <p className="lux-track text-[11px] text-gold">Version {i + 1}</p>
              <h2 className="mt-2 font-serif text-[28px]">{v.name}</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-ink/75">{v.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
