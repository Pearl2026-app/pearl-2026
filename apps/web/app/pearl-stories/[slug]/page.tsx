import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StoryHero } from '@/components/pearl-story/StoryHero';
import { VERSIONS, versionBySlug } from '@/components/pearl-story/versions';
import { Container } from '@/components/ui';
import { crownCard } from '@/lib/crown';
import { meta } from '@/lib/seo';

// Pearl Stories (owner, 10 Nov): three scroll-told 3D stories of a pearl, from the farm to the Filigree Crown ring,
// each under its own tab (and its own address, so each can be shared).
export function generateStaticParams() {
  return VERSIONS.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = versionBySlug(slug);
  if (!v) return meta({ title: 'Pearl Stories', path: '/pearl-stories' });
  return meta({ title: `${v.name} · Pearl Stories`, description: v.summary, path: `/pearl-stories/${v.slug}`, image: '/og/home.jpg' });
}

function Tabs({ current }: { current: string }) {
  return (
    <nav aria-label="Pearl Stories" className="rounded-full border border-white/30 bg-[rgba(3,40,46,0.35)] p-1 backdrop-blur-md">
      <ul className="flex gap-1">
        {VERSIONS.map((v) => {
          const on = v.slug === current;
          return (
            <li key={v.slug}>
              <Link
                href={`/pearl-stories/${v.slug}`}
                aria-current={on ? 'page' : undefined}
                className={`lux-track inline-flex min-h-10 items-center rounded-full px-4 text-[11px] transition-colors sm:px-5 sm:text-[12px] ${on ? 'bg-white text-ink' : 'text-white/90 hover:bg-white/15'}`}
              >
                {v.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default async function PearlStory({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = versionBySlug(slug);
  if (!v) notFound();
  const product = await crownCard();
  const i = VERSIONS.findIndex((x) => x.slug === v.slug);
  const next = VERSIONS[(i + 1) % VERSIONS.length];
  return (
    <>
      {/* key: a fresh scene for each story */}
      <StoryHero key={v.slug} slug={v.slug} product={product} frames="/turntable/sp-jrp-01-cut" count={120} tabs={<Tabs current={v.slug} />} />
      <Container className="py-16 text-center lg:py-20">
        <p className="lux-track text-[12px] text-gold">Pearl Stories</p>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink/75">{v.summary}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/pearl-stories/${next.slug}`} className="lux-track inline-flex min-h-11 items-center rounded-full border border-ink px-6 text-[12px] hover:border-gold hover:text-gold">
            Next story: {next.name}
          </Link>
          <Link href={product.href} className="lux-track inline-flex min-h-11 items-center rounded-full bg-ink px-6 text-[12px] text-white hover:bg-gold hover:text-ink">
            View the ring
          </Link>
        </div>
      </Container>
    </>
  );
}
