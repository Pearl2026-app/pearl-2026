import Link from 'next/link';
import { CategoryTiles, CenterHeading, FinishTabs, OutlineLink, ProductRail } from '@/components/home-store';
import { LocationGate } from '@/components/location-gate';
import { IconFor } from '@/components/icons';
import { StoryHero, type StoryProduct } from '@/components/pearl-story/StoryHero';
import { Container } from '@/components/ui';
import { JsonLd, meta, SITE_URL } from '@/lib/seo';
import { cityFromCookie, get, pinFromCookie } from '@/lib/server-api';
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
  title: 'Sahyadri Pearls · Pearl jewellery in gold',
  description:
    'Pearl jewellery by Sahyadri Pearls: our own designs in cultured pearl and gold, made to order, with insured delivery across India.',
  path: '/',
  // the link preview on WhatsApp and social apps: generated with ChatGPT (owner's request, 10 Nov), words set in the site's fonts
  image: '/og/home.jpg',
});

export default async function HomePage() {
  const [city, pin] = await Promise.all([cityFromCookie(), pinFromCookie()]);
  const where = new URLSearchParams({ ...(city ? { city } : {}), ...(pin ? { pin } : {}) });
  const [h, sig, site] = await Promise.all([
    get<Home>(`/content/home${where.size ? `?${where}` : ''}`, { revalidate: 60 }),
    // The whole signature collection (51 pieces), for the banner, the tiles and the finish tabs.
    get<{ items: ProductCard[] }>(`/catalogue/products?${new URLSearchParams({ collection: 'signature', pageSize: '60', ...Object.fromEntries(where) })}`, { revalidate: 60 }),
    get<Site>('/site', { revalidate: 300 }),
  ]);
  if (!h) return null;
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

  const categoryTiles = [
    { label: 'Rings', href: '/jewellery/rings', image: img(ring2 ?? ring) },
    { label: 'Earrings', href: '/jewellery/earrings', image: img(oneEach.filter(isEarring)[1] ?? earring) },
    { label: "Men's Rings", href: '/search?q=men', image: img(oneEach.filter(isMens)[1] ?? mens) },
    { label: 'Custom Design', href: '/customized-jewellery', image: img(oneEach[oneEach.length - 1]) },
  ].filter((t) => t.image);

  const loved = oneEach.slice(0, 10);
  const crown = signature.find((p) => p.sku === 'SP-JRP-01-1');
  const crownHref = crown ? `/product/${crown.slug}` : '/collections/signature';
  // The opening scene's glass card: only what the catalogue says about the piece.
  const crownFinishes = [...new Set(signature.filter((p) => p.sku.startsWith('SP-JRP-01-')).map((p) => p.metal).filter((m): m is string => !!m))];
  const waNumber = site?.whatsapp.default?.replace(/\D/g, '');
  const oceanProduct: StoryProduct = {
    name: 'Filigree Crown Ring',
    href: crownHref,
    collection: 'The Signature Collection',
    text: 'An open filigree crown holds a single cultured pearl, so the light reaches it from every side.',
    finishes: crownFinishes,
    priceLabel: crown && !crown.priceOnRequest && crown.pricePaise ? `₹${Math.round(crown.pricePaise / 100).toLocaleString('en-IN')}` : 'Price on request',
    enquireHref: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello, I would like to know more about the Filigree Crown Ring${crown ? ` (${crown.sku})` : ''}.`)}` : null,
  };
  // The owner's own points (Admin → Content → home.trust) win; until they write them, only what the store's settings
  // actually say: delivery, the delivery window, returns, and a way to talk to us.
  const sf = site?.storefront;
  const trustItems = (trust?.data.items as Array<{ icon: string; title: string }> | undefined) ?? [
    { icon: 'truck', title: 'Insured delivery' },
    ...(sf?.deliveryMinDays && sf.deliveryMaxDays ? [{ icon: 'clock', title: `Ships in ${sf.deliveryMinDays}–${sf.deliveryMaxDays} days` }] : []),
    ...(site?.returns.windowDays ? [{ icon: 'return', title: `${site.returns.windowDays}-day returns` }] : []),
    ...(site?.whatsapp.default ? [{ icon: 'chat', title: 'Talk to us on WhatsApp' }] : []),
  ];

  return (
    <>
      {/* The first thing a new visitor meets: where should we deliver? */}
      <LocationGate />
      {/* The opening scene: a shell on the sea opens, a pearl rises out of it, and under the water it becomes the ring. */}
      <StoryHero slug="shell-and-sea" frames="/turntable/sp-jrp-01-cut" count={120} product={oceanProduct} />

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

      {loved.length > 0 && (
        <Container className="pt-14 lg:pt-20">
          <CenterHeading title="The Signature Collection" sub="One of each of our own designs" />
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
              <span data-depth="0.1" className="block w-full mix-blend-multiply">
                <img src={img(earring ?? ring, 1)!} alt="" loading="lazy" width={700} height={700} className="aspect-square w-full object-contain p-10 mix-blend-multiply md:aspect-[5/4]" />
              </span>
            )}
          </div>
          <div className="flex flex-col justify-center bg-ink px-6 py-12 text-white md:px-12 lg:px-20">
            <p className="lux-track text-[12px] text-gold">Our pearls</p>
            <h2 className="mt-3 font-serif text-[34px] leading-tight lg:text-[48px]">Know where your pearl comes from.</h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80">
              Meet the farms we work with and the pieces they supply, or read our guide to pearl types, quality and care
              before you choose.
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

      {/* Shop by farm: shown only for farms the owner has added, so customers can start from the farm they trust. */}
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
