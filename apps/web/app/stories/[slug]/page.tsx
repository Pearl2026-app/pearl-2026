import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoryHero } from '@/components/pearl-story/StoryHero';
import { VERSIONS, versionBySlug } from '@/components/pearl-story/versions';
import { Container } from '@/components/ui';
import { crownCard } from '@/lib/crown';
import { meta } from '@/lib/seo';

export function generateStaticParams() {
  return VERSIONS.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = versionBySlug(slug);
  return meta({ title: v ? `Opening scene: ${v.name}` : 'Opening scene', path: `/stories/${slug}`, noindex: true });
}

export default async function StoryPreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = versionBySlug(slug);
  if (!v) notFound();
  const product = await crownCard();
  return (
    <>
      <StoryHero slug={v.slug} product={product} frames="/turntable/sp-jrp-01-cut" count={120} />
      <Container className="py-16">
        <p className="lux-track text-[12px] text-gold">Other versions</p>
        <ul className="mt-4 flex flex-wrap gap-3">
          {VERSIONS.filter((x) => x.slug !== v.slug).map((x) => (
            <li key={x.slug}>
              <Link href={`/stories/${x.slug}`} className="lux-track inline-flex min-h-11 items-center rounded-full border border-ink/30 px-5 text-[12px] hover:border-gold">
                {x.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/stories" className="lux-track inline-flex min-h-11 items-center px-2 text-[12px] underline">
              All previews
            </Link>
          </li>
        </ul>
      </Container>
    </>
  );
}
