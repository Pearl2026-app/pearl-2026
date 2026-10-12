import Link from 'next/link';
import { bandHref, PRICE_BANDS } from '@/lib/guides';
import { ProductGrid } from '@/components/product-card';
import { Breadcrumbs, ButtonLink, Container, PageTitle, SectionHeading } from '@/components/ui';
import { breadcrumbJsonLd, JsonLd, meta } from '@/lib/seo';
import { cityFromCookie, get } from '@/lib/server-api';
import type { Page, ProductCard, Site } from '@/lib/types';

export const metadata = meta({
  title: 'Pearl Gifts',
  description: 'Pearl jewellery gifts by price and occasion, with free gift packing and a handwritten-style message card.',
  path: '/gifts',
});

const OCCASIONS = [
  { title: 'Weddings and engagements', text: 'Bridal strands, sets and heirloom pieces.', href: '/collections/bridal' },
  { title: 'Birthdays and anniversaries', text: 'Studs, pendants and bracelets to wear every day.', href: '/jewellery?sort=featured' },
  { title: 'For a first pearl', text: 'Classic white studs and a single-pearl pendant.', href: '/jewellery?colour=White' },
  { title: 'Something made for them', text: 'A piece designed around their story.', href: '/customized-jewellery' },
];

export default async function GiftsPage() {
  const city = await cityFromCookie();
  const q = (max: number) => `/catalogue/products?priceMax=${max * 100}&inStock=true&sort=featured&pageSize=8${city ? `&city=${city}` : ''}`;
  const [site, under10, under25] = await Promise.all([get<Site>('/site', { revalidate: 300 }), get<Page<ProductCard>>(q(10_000), { revalidate: 60 }), get<Page<ProductCard>>(q(25_000), { revalidate: 60 })]);
  const occasions = OCCASIONS.filter((o) => !o.href.startsWith('/collections/') || site?.shop.collections.some((c) => o.href.endsWith(`/${c.slug}`)));
  const first = under10?.items.length ? { title: 'Gifts under ₹10,000', items: under10.items, href: bandHref(PRICE_BANDS[0]) } : under25?.items.length ? { title: 'Gifts under ₹25,000', items: under25.items, href: bandHref({ max: 25_000 }) } : null;
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Gifts' }]} />
      <PageTitle eyebrow="Gifts" title="A pearl, beautifully given" intro="Every piece arrives in our signature box with its certificate. Add free gift packing and a message card at checkout." />

      <section aria-labelledby="by-price">
        <h2 id="by-price" className="eyebrow mb-4">Shop by budget</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {PRICE_BANDS.map((b) => (
            <li key={b.label}>
              <Link href={bandHref(b)} className="flex min-h-28 flex-col justify-end border border-line bg-surface p-5 transition-colors hover:border-accent">
                <span className="font-serif text-2xl leading-tight">{b.label}</span>
                <span className="mt-1 text-sm text-accent">Shop now →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {first && (
        <section className="mt-16">
          <SectionHeading eyebrow="Ready to give" title={first.title} action={<Link href={first.href} className="text-sm text-accent hover:underline">View all</Link>} />
          <ProductGrid products={first.items} />
        </section>
      )}

      <section className="mt-16" aria-labelledby="occasion">
        <SectionHeading eyebrow="By occasion" title="Find the moment" />
        <h2 id="occasion" className="sr-only">By occasion</h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {occasions.map((o) => (
            <li key={o.title}>
              <Link href={o.href} className="block h-full border-t border-ink pt-4 hover:text-accent">
                <span className="font-serif text-2xl">{o.title}</span>
                <span className="mt-2 block text-sm text-muted">{o.text}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16 grid gap-8 bg-surface-muted p-6 lg:grid-cols-3 lg:p-10">
        <div>
          <p className="font-serif text-2xl">Free gift packing</p>
          <p className="mt-2 text-sm text-muted">{site?.storefront.giftWrapEnabled ? 'Tick “This is a gift” at checkout. We pack it in our gift box with a ribbon and a message card.' : 'Every piece arrives in our signature box.'}</p>
        </div>
        <div>
          <p className="font-serif text-2xl">No price in the parcel</p>
          <p className="mt-2 text-sm text-muted">With gift packing, the slip in the box shows no prices. Your invoice stays with you, on your order page and in your order messages.</p>
        </div>
        <div>
          <p className="font-serif text-2xl">Not sure what to choose?</p>
          <p className="mt-2 text-sm text-muted">Our adviser can help on a short video call.</p>
          <ButtonLink href="/book-consultation" variant="text" className="!min-h-0 !px-0 pt-2">Book a consultation →</ButtonLink>
        </div>
      </section>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Gifts', path: '/gifts' }])} />
    </Container>
  );
}
