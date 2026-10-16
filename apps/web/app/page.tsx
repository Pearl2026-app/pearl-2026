import Link from 'next/link';
import { IconFor } from '@/components/icons';
import { ProductGrid } from '@/components/product-card';
import { ButtonLink, Container, SectionHeading } from '@/components/ui';
import { JsonLd, meta, SITE_URL } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { ProductCard } from '@/lib/types';


interface Home {
  banners: Array<{ id: string; title: string | null; subtitle: string | null; imageUrl: string; mobileImageUrl: string | null; linkUrl: string | null; ctaLabel: string | null; placement: string }>;
  blocks: Record<string, { title: string | null; kind: string; data: any }>;
  collections: Array<{ name: string; slug: string; description: string | null; imageUrl: string | null }>;
  featured: ProductCard[];
  newest: ProductCard[];
  testimonials: Array<{ id: string; name: string; city: string | null; quote: string; rating: number | null }>;
  gallery: Array<{ id: string; title: string | null; mediaUrl: string }>;
}

export const metadata = meta({
  title: 'Sahyadri Pearls · Farm-traced pearl jewellery',
  description: 'Fine pearl jewellery traced to named farms in the Sahyadri hills and the Konkan coast. Certified, insured delivery across India.',
  path: '/',
});

export default async function HomePage() {
  const h = (await get<Home>('/content/home', { revalidate: 60 }))!;
  const hero = h.banners.find((b) => b.placement === 'HOME_HERO');
  const story = h.blocks['home.story'];
  const trust = h.blocks['home.trust'];
  const cta = h.blocks['home.custom_cta'];
  return (
    <>
      {hero && (
        <section className="relative isolate overflow-hidden bg-ink">
          <picture>
            {hero.mobileImageUrl && <source media="(max-width: 767px)" srcSet={hero.mobileImageUrl} />}
            <img src={hero.imageUrl} alt="" width={1600} height={900} fetchPriority="high" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          </picture>
          <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-ink/80 via-ink/25 to-transparent" />
          <Container className="flex min-h-[80vh] flex-col justify-end pt-24 pb-14 lg:min-h-[88vh] lg:pb-24">
            <div className="fade-in max-w-2xl text-white">
              <p className="mb-5 font-serif text-lg text-white/85 italic">Grown in the Sahyadri hills and on the Konkan coast</p>
              <h1 className="font-serif text-[52px] leading-[1.02] lg:text-[96px]">{hero.title}</h1>
              {hero.subtitle && <p className="mt-6 max-w-md text-lg leading-relaxed text-white/85">{hero.subtitle}</p>}
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href={hero.linkUrl ?? '/jewellery'} className="inline-flex min-h-12 items-center bg-white px-8 text-[15px] tracking-wide text-ink transition-colors hover:bg-orient">
                  {hero.ctaLabel ?? 'Explore Jewellery'}
                </Link>
                <Link href="/our-farm" className="inline-flex min-h-12 items-center border border-white/60 px-8 text-[15px] tracking-wide text-white transition-colors hover:border-white hover:bg-white/10">
                  Visit our farms
                </Link>
              </div>
            </div>
          </Container>
        </section>
      )}

      {h.collections.length > 0 && (
        <Container className="pt-20">
          <SectionHeading eyebrow="Collections" title="Find your strand" action={<ButtonLink href="/jewellery" variant="text">View all</ButtonLink>} />
          <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-8 lg:overflow-visible lg:px-0">
            {h.collections.map((c) => (
              <li key={c.slug} className="w-[78%] shrink-0 snap-start sm:w-[45%] lg:w-auto">
                <Link href={`/collections/${c.slug}`} className="group block">
                  <div className="overflow-hidden bg-surface-muted">
                    {c.imageUrl && <img src={c.imageUrl} alt="" loading="lazy" width={800} height={1000} className="img-zoom aspect-[4/5] w-full object-cover" />}
                  </div>
                  <h3 className="mt-4 font-serif text-2xl group-hover:text-accent">{c.name}</h3>
                  {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {story && (
        <section className="mt-24 bg-surface-muted">
          <Container className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-20 lg:py-24">
            {story.data.imageUrl && <img src={story.data.imageUrl} alt="" loading="lazy" width={1600} height={900} className="aspect-[4/3] w-full object-cover" />}
            <div>
              <p className="eyebrow mb-3">{story.title}</p>
              <h2 className="font-serif text-4xl leading-tight lg:text-5xl">Every pearl has a birthplace</h2>
              <p className="mt-5 text-lg leading-relaxed text-muted">{story.data.body}</p>
              {story.data.linkUrl && <ButtonLink href={story.data.linkUrl} variant="outline" className="mt-8">{story.data.linkLabel ?? 'Read more'}</ButtonLink>}
            </div>
          </Container>
        </section>
      )}

      <Container className="pt-24">
        <SectionHeading eyebrow="Featured" title="Pieces we love" action={<ButtonLink href="/jewellery" variant="text">Shop all</ButtonLink>} />
        <ProductGrid products={h.featured} />
      </Container>

      {trust && (
        <Container className="pt-24">
          <ul className="grid grid-cols-2 gap-8 border-y border-line py-12 lg:grid-cols-4">
            {(trust.data.items as Array<{ icon: string; title: string; text: string }>).map((t) => (
              <li key={t.title} className="flex flex-col gap-2">
                <IconFor name={t.icon} className="text-gold" width={28} height={28} />
                <p className="font-serif text-xl">{t.title}</p>
                <p className="text-sm text-muted">{t.text}</p>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {h.testimonials.length > 0 && (
        <Container className="pt-24">
          <SectionHeading eyebrow="In their words" title="From our customers" />
          <ul className="grid gap-8 md:grid-cols-3">
            {h.testimonials.slice(0, 3).map((t) => (
              <li key={t.id} className="border-t border-gold pt-6">
                <blockquote className="font-serif text-xl leading-relaxed">“{t.quote}”</blockquote>
                <p className="mt-4 text-sm text-muted">
                  {t.name}
                  {t.city ? `, ${t.city}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {cta && (
        <Container className="pt-24">
          <div className="flex flex-col items-start gap-6 bg-accent px-6 py-14 text-white lg:flex-row lg:items-center lg:justify-between lg:px-16">
            <div className="max-w-xl">
              <h2 className="font-serif text-4xl">{cta.title}</h2>
              <p className="mt-3 text-white/85">{cta.data.body}</p>
            </div>
            <Link href={cta.data.linkUrl ?? '/customized-jewellery'} className="inline-flex min-h-12 items-center bg-white px-7 text-[15px] text-ink">
              {cta.data.linkLabel ?? 'Start a design'}
            </Link>
          </div>
        </Container>
      )}

      {h.gallery.length > 0 && (
        <Container className="pt-24">
          <SectionHeading eyebrow="Gallery" title="From the farms" action={<ButtonLink href="/gallery" variant="text">See gallery</ButtonLink>} />
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {h.gallery.slice(0, 4).map((g) => (
              <li key={g.id}>
                <img src={g.mediaUrl} alt={g.title ?? ''} loading="lazy" width={800} height={800} className="aspect-square w-full object-cover" />
              </li>
            ))}
          </ul>
        </Container>
      )}
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Sahyadri Pearls', url: SITE_URL, potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/search?q={query}`, 'query-input': 'required name=query' } }} />
    </>
  );
}
