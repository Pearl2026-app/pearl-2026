import Link from 'next/link';
import { HeroCarousel } from '@/components/hero-carousel';
import { LocationGate } from '@/components/location-gate';
import { IconFor } from '@/components/icons';
import { ProductCard as Card, ProductGrid } from '@/components/product-card';
import { ButtonLink, Container, SectionHeading } from '@/components/ui';
import { JsonLd, meta, SITE_URL } from '@/lib/seo';
import { cityFromCookie, get } from '@/lib/server-api';
import type { ProductCard, Site } from '@/lib/types';

interface Banner {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  mobileImageUrl: string | null;
  linkUrl: string | null;
  ctaLabel: string | null;
  placement: string;
}
interface Home {
  banners: Banner[];
  blocks: Record<string, { title: string | null; kind: string; data: any }>;
  featured: ProductCard[];
  newest: ProductCard[];
  farms?: Array<{ name: string; slug: string; location: string; summary: string | null; heroImageUrl: string | null; productCount: number }>;
  exclusive?: ProductCard[];
  testimonials: Array<{
    id: string;
    name: string;
    city: string | null;
    quote: string;
    rating: number | null;
  }>;
}

export const metadata = meta({
  title: 'Sahyadri Pearls · Farm-traced pearl jewellery',
  description:
    'Fine pearl jewellery traced to named farms in the Sahyadri hills and the Konkan coast. Certified, insured delivery across India.',
  path: '/',
});

/** A banner's button, drawn as a span because the whole banner is the link. */
const BannerButton = ({ label, light }: { label: string; light?: boolean }) => (
  <span
    className={`mt-8 inline-flex min-h-12 items-center px-8 text-[15px] tracking-wide transition-colors ${light ? 'bg-white text-ink group-hover:bg-orient' : 'bg-ink text-white group-hover:bg-accent-hover'}`}
  >
    {label}
  </span>
);

export default async function HomePage() {
  const [h, site] = await Promise.all([
    cityFromCookie().then((city) => get<Home>(`/content/home${city ? `?city=${encodeURIComponent(city)}` : ''}`, { revalidate: 60 })),
    get<Site>('/site', { revalidate: 300 }),
  ]);
  if (!h) return null;
  const heroes = h.banners.filter((b) => b.placement === 'HOME_HERO');
  const [wide, ...tiles] = h.banners.filter((b) => b.placement === 'HOME_SECONDARY');
  const trust = h.blocks['home.trust'];
  const cta = h.blocks['home.custom_cta'];
  const categories = site?.categories ?? [];

  return (
    <>
      {/* The first thing a new visitor meets: where should we deliver? */}
      <LocationGate />
      {heroes.length > 0 && <HeroCarousel slides={heroes} />}

      {/* Shop by category: the quickest way in. */}
      {categories.length > 0 && (
        <Container className="pt-14 lg:pt-20">
          <SectionHeading title="Shop by category" />
          <ul className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:gap-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-8 lg:overflow-visible lg:px-0">
            {categories.map((c) => (
              <li key={c.slug} className="w-[92px] shrink-0 sm:w-28 lg:w-auto">
                <Link
                  href={`/jewellery/${c.slug}`}
                  className="group flex flex-col items-center gap-3 text-center"
                >
                  <span className="nacre block aspect-square w-full overflow-hidden rounded-full ring-1 ring-line transition-shadow duration-300 group-hover:ring-2 group-hover:ring-gold">
                    {c.imageUrl && (
                      <img
                        src={c.imageUrl}
                        alt=""
                        loading="lazy"
                        width={200}
                        height={200}
                        className="img-zoom h-full w-full object-cover"
                      />
                    )}
                  </span>
                  <span className="text-sm text-ink lg:text-[15px]">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {/* Shop by farm: every pearl comes from a named farm, so customers can start from the farm they trust. */}
      {(h.farms?.length ?? 0) > 0 && (
        <Container className="pt-16 lg:pt-24">
          <SectionHeading
            title="Shop by farm"
            action={
              <ButtonLink href="/our-farm" variant="text">
                Meet the farms
              </ButtonLink>
            }
          />
          <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0">
            {h.farms!.map((f) => (
              <li key={f.slug} className="w-[70%] shrink-0 snap-start sm:w-[45%] lg:w-auto">
                <Link href={`/jewellery?farm=${encodeURIComponent(f.slug)}`} className="group block">
                  <span className="nacre block aspect-[4/5] overflow-hidden">
                    {f.heroImageUrl && (
                      <img src={f.heroImageUrl} alt="" loading="lazy" width={480} height={600} className="img-zoom h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="mt-3 block font-serif text-xl">{f.name}</span>
                  <span className="block text-sm text-muted">
                    {f.location} · {f.productCount} {f.productCount === 1 ? 'piece' : 'pieces'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {h.featured.length > 0 && (
        <Container className="pt-16 lg:pt-24">
          <SectionHeading
            title="Bestsellers"
            action={
              <ButtonLink href="/jewellery" variant="text">
                View all
              </ButtonLink>
            }
          />
          <ProductGrid products={h.featured.slice(0, 8)} priorityCount={2} />
        </Container>
      )}

      {/* Mid-page banner: picture and words side by side, the whole panel is the link. */}
      {wide && (
        <Container className="pt-20 lg:pt-28">
          <Link
            href={wide.linkUrl ?? '/jewellery'}
            className="group grid overflow-hidden bg-surface md:grid-cols-2"
          >
            <div className="nacre overflow-hidden">
              <img
                src={wide.imageUrl}
                alt=""
                loading="lazy"
                width={800}
                height={800}
                className="img-zoom aspect-square h-full w-full object-cover md:aspect-auto"
              />
            </div>
            <div className="flex flex-col justify-center px-6 py-12 md:px-12 lg:px-20">
              {wide.title && <h2 className="font-serif text-4xl lg:text-6xl">{wide.title}</h2>}
              {wide.subtitle && <p className="mt-4 text-lg text-muted">{wide.subtitle}</p>}
              <div>
                <BannerButton label={wide.ctaLabel ?? 'Shop now'} />
              </div>
            </div>
          </Link>
        </Container>
      )}

      {tiles.length > 0 && (
        <Container className="pt-6">
          <ul className="grid gap-6 md:grid-cols-2">
            {tiles.slice(0, 2).map((b) => (
              <li key={b.id}>
                <Link href={b.linkUrl ?? '/jewellery'} className="group block bg-surface">
                  <div className="nacre overflow-hidden">
                    <img
                      src={b.imageUrl}
                      alt=""
                      loading="lazy"
                      width={800}
                      height={600}
                      className="img-zoom aspect-[4/3] w-full object-cover"
                    />
                  </div>
                  <div className="flex items-end justify-between gap-4 px-6 py-6">
                    <div>
                      {b.title && <h2 className="font-serif text-3xl">{b.title}</h2>}
                      {b.subtitle && <p className="mt-1 text-muted">{b.subtitle}</p>}
                    </div>
                    <span className="shrink-0 border-b border-ink pb-0.5 text-[15px] transition-colors group-hover:border-gold group-hover:text-gold">
                      {b.ctaLabel ?? 'Shop now'}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {/* Exclusive and designer pieces: limited, premium work shown on its own. */}
      {(h.exclusive?.length ?? 0) > 0 && (
        <Container className="pt-16 lg:pt-24">
          <SectionHeading
            title="Exclusive designer pieces"
            action={
              <ButtonLink href="/jewellery?exclusive=1" variant="text">
                View all
              </ButtonLink>
            }
          />
          <ProductGrid products={h.exclusive!.slice(0, 4)} />
        </Container>
      )}

      {/* New arrivals: one row that scrolls sideways. */}
      {h.newest.length > 0 && (
        <Container className="pt-20 lg:pt-28">
          <SectionHeading
            title="New arrivals"
            action={
              <ButtonLink href="/jewellery?sort=newest" variant="text">
                View all
              </ButtonLink>
            }
          />
          <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:gap-6 lg:px-0">
            {h.newest.map((p) => (
              <li key={p.id} className="w-[46%] shrink-0 snap-start md:w-[31%] lg:w-[23%]">
                <Card p={p} />
              </li>
            ))}
          </ul>
        </Container>
      )}

      {/* Business buyers (B2B): their own entrance, with fixed bulk prices from a minimum order quantity. */}
      <Container className="pt-20 lg:pt-28">
        <Link
          href="/business"
          className="group flex flex-col items-start justify-between gap-6 border border-ink px-6 py-10 sm:flex-row sm:items-center lg:px-12"
        >
          <div>
            <p className="eyebrow">For jewellers, resellers & corporate buyers</p>
            <h2 className="mt-2 font-serif text-3xl lg:text-4xl">Buying in bulk? Business prices.</h2>
            <p className="mt-2 max-w-lg text-muted">Fixed business prices from a minimum order quantity, with GST invoices in your business name.</p>
          </div>
          <span className="lux-track inline-flex min-h-12 shrink-0 items-center bg-ink px-8 text-white transition-colors group-hover:bg-accent-hover">
            B2B portal →
          </span>
        </Link>
      </Container>

      {cta && (
        <Container className="pt-20 lg:pt-28">
          <Link
            href={cta.data.linkUrl ?? '/customized-jewellery'}
            className="group flex flex-col items-center bg-ink px-6 py-16 text-center text-white lg:py-24"
          >
            <h2 className="font-serif text-4xl lg:text-6xl">{cta.title}</h2>
            <p className="mt-4 max-w-md text-white/80">
              Tell us what you have in mind. We design it with you.
            </p>
            <BannerButton label={cta.data.linkLabel ?? 'Start a design'} light />
          </Link>
        </Container>
      )}

      {h.testimonials.length > 0 && (
        <Container className="pt-20 lg:pt-28">
          <SectionHeading title="Loved by our customers" />
          <ul className="grid gap-10 md:grid-cols-3">
            {h.testimonials.slice(0, 3).map((t) => (
              <li key={t.id} className="border-t border-gold pt-6">
                <p aria-label={`${t.rating ?? 5} out of 5 stars`} className="text-gold">
                  {'★'.repeat(t.rating ?? 5)}
                </p>
                <blockquote className="mt-3 font-serif text-xl leading-relaxed">“{t.quote}”</blockquote>
                <p className="mt-4 text-sm text-muted">
                  {t.name}
                  {t.city ? `, ${t.city}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {trust && (
        <Container className="pt-20 lg:pt-28">
          <ul className="grid grid-cols-2 gap-6 border-y border-line py-10 lg:grid-cols-4">
            {(trust.data.items as Array<{ icon: string; title: string }>).map((t) => (
              <li key={t.title} className="flex flex-col items-center gap-3 text-center">
                <IconFor name={t.icon} className="text-gold" width={28} height={28} />
                <p className="text-[15px]">{t.title}</p>
              </li>
            ))}
          </ul>
        </Container>
      )}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Sahyadri Pearls',
          url: SITE_URL,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_URL}/search?q={query}`,
            'query-input': 'required name=query',
          },
        }}
      />
    </>
  );
}
