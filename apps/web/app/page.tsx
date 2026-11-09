import Link from 'next/link';
import { HeroCarousel } from '@/components/hero-carousel';
import { CategoryTiles, CenterHeading, FinishTabs, OutlineLink, ProductRail, StoreHero, type StoreSlide } from '@/components/home-store';
import { LocationGate } from '@/components/location-gate';
import { IconFor } from '@/components/icons';
import { Turntable } from '@/components/turntable';
import { Container } from '@/components/ui';
import { JsonLd, meta, SITE_URL } from '@/lib/seo';
import { cityFromCookie, get, pinFromCookie } from '@/lib/server-api';
import type { ProductCard } from '@/lib/types';

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

export default async function HomePage() {
  const [city, pin] = await Promise.all([cityFromCookie(), pinFromCookie()]);
  const where = new URLSearchParams({ ...(city ? { city } : {}), ...(pin ? { pin } : {}) });
  const [h, sig] = await Promise.all([
    get<Home>(`/content/home${where.size ? `?${where}` : ''}`, { revalidate: 60 }),
    // The whole signature collection (51 pieces), for the banner, the tiles and the finish tabs.
    get<{ items: ProductCard[] }>(`/catalogue/products?${new URLSearchParams({ collection: 'signature', pageSize: '60', ...Object.fromEntries(where) })}`, { revalidate: 60 }),
  ]);
  if (!h) return null;
  const heroes = h.banners.filter((b) => b.placement === 'HOME_HERO');
  const trust = h.blocks['home.trust'];
  const cta = h.blocks['home.custom_cta'];
  // The client's own signature collection leads the page; the older stock-list photos stay in the catalogue.
  const pool = [...(sig?.items ?? []), ...(h.exclusive ?? []), ...h.featured, ...h.newest].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
  const signature = pool.filter((p) => p.collection?.slug === 'signature' && p.images.length);
  const lead = signature.length ? signature : pool.filter((p) => p.images.length);
  const designOf = (p: { sku: string }) => p.sku.replace(/-\d+$/, '');
  const oneEach = lead.filter((p, i, a) => a.findIndex((x) => designOf(x) === designOf(p)) === i);
  const isEarring = (p: ProductCard) => p.category.slug === 'earrings';
  const isMens = (p: ProductCard) => /^men'?s /i.test(p.name);
  const img = (p?: ProductCard, n = 0) => p?.images[n]?.url ?? p?.images[0]?.url ?? null;
  const ring = oneEach.find((p) => !isEarring(p) && !isMens(p));
  const mens = oneEach.find(isMens);
  const earring = oneEach.find(isEarring);
  const ring2 = oneEach.filter((p) => !isEarring(p) && !isMens(p))[1];

  const slides: StoreSlide[] = [
    ring && {
      eyebrow: 'The Signature Collection',
      title: 'Pearls, grown in the Sahyadris.',
      text: 'Our own designs in cultured pearl, hand-set in yellow, rose or white gold, and traced to the farm that grew them.',
      href: signature.length ? '/collections/signature' : '/jewellery',
      cta: 'Shop the collection',
      image: img(ring)!,
      dark: true,
    },
    earring && {
      eyebrow: 'Earrings',
      title: 'Studs and drops for every day.',
      text: 'Classic studs, halos and teardrops, each with a pearl chosen by hand.',
      href: '/jewellery/earrings',
      cta: 'Shop earrings',
      image: img(earring)!,
    },
    mens && {
      eyebrow: 'For him',
      title: "Men's pearl rings.",
      text: 'Bold settings with a single pearl, made to his ring size.',
      href: '/search?q=men',
      cta: "Shop men's rings",
      image: img(mens)!,
    },
  ].filter(Boolean) as StoreSlide[];

  const categoryTiles = [
    { label: 'Rings', href: '/jewellery/rings', image: img(ring2 ?? ring) },
    { label: 'Earrings', href: '/jewellery/earrings', image: img(oneEach.filter(isEarring)[1] ?? earring) },
    { label: "Men's Rings", href: '/search?q=men', image: img(oneEach.filter(isMens)[1] ?? mens) },
    { label: 'Custom Design', href: '/customized-jewellery', image: img(oneEach[oneEach.length - 1]) },
  ].filter((t) => t.image);

  const loved = oneEach.slice(0, 10);
  const crown = signature.find((p) => p.sku === 'SP-JRP-01-1');
  const crownHref = crown ? `/product/${crown.slug}` : '/collections/signature';
  const trustItems = (trust?.data.items as Array<{ icon: string; title: string }> | undefined) ?? [
    { icon: 'farm', title: 'Farm-traced pearls' },
    { icon: 'certificate', title: 'Certified & verifiable' },
    { icon: 'truck', title: 'Insured delivery' },
    { icon: 'check', title: 'Easy returns' },
  ];

  return (
    <>
      {/* The first thing a new visitor meets: where should we deliver? */}
      <LocationGate />
      {slides.length > 0 ? <StoreHero slides={slides} /> : <h1 className="sr-only">Sahyadri Pearls · farm-traced pearl jewellery</h1>}
      {slides.length === 0 && heroes.length > 0 && <HeroCarousel slides={heroes} />}

      {/* Why buy here, in four lines. */}
      <div className="border-b border-line bg-surface">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-y-5 px-4 py-6 lg:grid-cols-4 lg:px-8">
          {trustItems.slice(0, 4).map((t) => (
            <li key={t.title} className="flex items-center justify-center gap-3 text-center">
              <IconFor name={t.icon} className="shrink-0 text-gold" width={26} height={26} />
              <span className="text-[13px] text-ink lg:text-[14px]">{t.title}</span>
            </li>
          ))}
        </ul>
      </div>

      {categoryTiles.length > 0 && (
        <Container className="pt-14 lg:pt-20">
          <CenterHeading title="Shop by category" sub="Find the piece you have in mind" />
          <CategoryTiles tiles={categoryTiles} />
        </Container>
      )}

      {/* The ring, turning: a full 360° of the client's own film as the visitor scrolls. */}
      <div className="pt-14 lg:pt-20">
        <Turntable
          frames="/turntable/sp-jrp-01"
          count={120}
          href={crownHref}
          cta="See the Filigree Crown ring"
          captions={[
            { eyebrow: 'The pearl', title: 'Chosen by hand.', text: 'Each pearl is matched for lustre, roundness and colour before it leaves the farm.' },
            { eyebrow: 'The setting', title: 'Set by our craftsmen.', text: 'A filigree crown holds the pearl, in yellow, rose or white gold, made to your ring size.' },
            { eyebrow: 'The proof', title: 'Traced to its farm.', text: 'Every piece comes with a certificate you can check online, down to the farm that grew it.' },
          ]}
        />
      </div>

      {loved.length > 0 && (
        <Container className="pt-14 lg:pt-20">
          <CenterHeading title="Most loved" sub="Our customers' favourite designs" />
          <ProductRail products={loved} />
          <div className="mt-9 text-center">
            <OutlineLink href={signature.length ? '/collections/signature' : '/jewellery'}>Discover more</OutlineLink>
          </div>
        </Container>
      )}

      {/* Craft and origin, picture and words side by side. */}
      <Container className="pt-16 lg:pt-24">
        <div className="grid overflow-hidden rounded-md border border-line md:grid-cols-2">
          <div className="nacre flex items-center justify-center overflow-hidden">
            {img(earring ?? ring, 1) && (
              <span data-depth="0.1" className="block w-full">
                <img src={img(earring ?? ring, 1)!} alt="" loading="lazy" width={700} height={700} className="aspect-square w-full object-contain p-10 mix-blend-multiply md:aspect-[5/4]" />
              </span>
            )}
          </div>
          <div className="flex flex-col justify-center bg-ink px-6 py-12 text-white md:px-12 lg:px-20">
            <p className="lux-track text-[12px] text-gold">Our craft</p>
            <h2 className="mt-3 font-serif text-[30px] leading-tight lg:text-[42px]">From our pearl farms to your hands.</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80">
              Every pearl is grown on a named farm in the Sahyadri hills and the Konkan coast, chosen by hand and set by
              our craftsmen. Each piece comes with its certificate.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/our-farm" className="lux-track inline-flex min-h-11 items-center bg-gold px-8 text-ink transition-colors hover:bg-white">
                Meet the farms
              </Link>
              <Link href="/pearl-guide" className="lux-track inline-flex min-h-11 items-center border border-white/60 px-8 transition-colors hover:border-gold hover:text-gold">
                Pearl guide
              </Link>
            </div>
          </div>
        </div>
      </Container>

      {signature.length > 0 && (
        <Container className="pt-16 lg:pt-24">
          <CenterHeading title="Shop by finish" sub="Every design comes in yellow, rose and white gold" />
          <FinishTabs products={signature} />
        </Container>
      )}

      {/* Shop by farm: every pearl comes from a named farm, so customers can start from the farm they trust. */}
      {(h.farms?.length ?? 0) > 0 && (
        <Container className="pt-16 lg:pt-24">
          <CenterHeading title="Shop by farm" sub="Start from the farm you trust" />
          <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0">
            {h.farms!.map((f) => (
              <li key={f.slug} className="w-[62%] shrink-0 snap-start sm:w-[40%] lg:w-auto">
                <Link href={`/jewellery?farm=${encodeURIComponent(f.slug)}`} className="group block">
                  <span className="nacre block aspect-[4/3] overflow-hidden rounded-md">
                    {f.heroImageUrl && (
                      <img src={f.heroImageUrl} alt="" loading="lazy" width={480} height={360} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    )}
                  </span>
                  <span className="mt-3 block font-serif text-lg text-ink group-hover:text-gold">{f.name}</span>
                  <span className="block text-[13px] text-muted">
                    {f.location} · {f.productCount} {f.productCount === 1 ? 'piece' : 'pieces'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      )}

      {h.newest.length > 0 && (
        <Container className="pt-16 lg:pt-24">
          <CenterHeading title="New arrivals" />
          <ProductRail products={h.newest} />
          <div className="mt-9 text-center">
            <OutlineLink href="/jewellery?sort=newest">View all</OutlineLink>
          </div>
        </Container>
      )}

      {/* Two doors: design your own, and business buying (B2B). */}
      <Container className="pt-16 lg:pt-24">
        <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
          <Link
            href={cta?.data.linkUrl ?? '/customized-jewellery'}
            className="group flex flex-col justify-center rounded-md bg-[linear-gradient(135deg,#070e4d,#47628a)] px-8 py-12 text-white lg:px-12"
          >
            <p className="lux-track text-[12px] text-gold">Made for you</p>
            <h2 className="mt-2 font-serif text-[28px] leading-tight lg:text-[34px]">{cta?.title ?? 'Design your own piece'}</h2>
            <p className="mt-2 max-w-sm text-[14px] text-white/80">Tell us what you have in mind. We design it with you.</p>
            <span className="lux-track mt-6 inline-flex min-h-11 w-fit items-center bg-gold px-8 text-ink transition-colors group-hover:bg-white">
              {cta?.data.linkLabel ?? 'Start a design'}
            </span>
          </Link>
          <Link href="/business" className="group flex flex-col justify-center rounded-md border border-ink bg-surface px-8 py-12 lg:px-12">
            <p className="lux-track text-[12px] text-gold">Jewellers, resellers & corporate buyers</p>
            <h2 className="mt-2 font-serif text-[28px] leading-tight text-ink lg:text-[34px]">Buying in bulk? Business prices.</h2>
            <p className="mt-2 max-w-sm text-[14px] text-muted">Fixed prices from a minimum order quantity, with GST invoices in your business name.</p>
            <span className="lux-track mt-6 inline-flex min-h-11 w-fit items-center bg-ink px-8 text-white transition-colors group-hover:bg-gold group-hover:text-ink">
              B2B portal
            </span>
          </Link>
        </div>
      </Container>

      {h.testimonials.length > 0 && (
        <Container className="pt-16 lg:pt-24">
          <CenterHeading title="Loved by our customers" />
          <ul className="grid gap-4 md:grid-cols-3 lg:gap-6">
            {h.testimonials.slice(0, 3).map((t) => (
              <li key={t.id} className="rounded-md border border-line bg-surface p-6 text-center">
                <p aria-label={`${t.rating ?? 5} out of 5 stars`} className="text-gold">
                  {'★'.repeat(t.rating ?? 5)}
                </p>
                <blockquote className="mt-3 font-serif text-lg leading-relaxed text-ink">“{t.quote}”</blockquote>
                <p className="mt-4 text-[13px] text-muted">
                  {t.name}
                  {t.city ? `, ${t.city}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      )}
      <div className="pt-16 lg:pt-24" />
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
