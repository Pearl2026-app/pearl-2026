import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BuyActions, WishlistButton } from '@/components/buy-box';
import { Gallery } from '@/components/gallery';
import { IconFor } from '@/components/icons';
import { Price, ProductGrid } from '@/components/product-card';
import { Breadcrumbs, Container, SectionHeading } from '@/components/ui';
import { breadcrumbJsonLd, JsonLd, meta, productDescription, productJsonLd } from '@/lib/seo';
import { cityFromCookie, get } from '@/lib/server-api';
import type { ProductDetail, Site } from '@/lib/types';


async function load(slug: string) {
  const city = await cityFromCookie();
  return get<ProductDetail>(`/catalogue/products/${encodeURIComponent(slug)}${city ? `?city=${city}` : ''}`, { revalidate: 30 });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return {};
  return meta({
    title: p.seoTitle ?? `${p.name}${p.farm ? ` · ${p.farm.name}` : ''}`,
    description: p.seoDescription ?? productDescription(p),
    path: `/product/${p.slug}`,
    image: p.images[0]?.variants?.['1200'] ?? p.images[0]?.url,
  });
}

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} out of 5`} className="text-gold">
      {'★'.repeat(Math.round(value))}
      <span className="text-line">{'★'.repeat(5 - Math.round(value))}</span>
    </span>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, site] = await Promise.all([load(slug), get<Site>('/site', { revalidate: 300 })]);
  if (!p) notFound();
  const trust = (site?.blocks['product.trust']?.data?.items ?? []) as Array<{ icon: string; title: string; text: string }>;
  const spec: Array<[string, string | number | null]> = [
    ['Carat', p.caratWeight != null ? `${p.caratWeight} ct` : null],
    ['Shape', p.shape],
    ['Colour', p.colour],
    ['Lustre', p.lustre],
    ['Surface', p.surface],
    ['Size', p.sizeMm != null ? `${p.sizeMm} mm` : null],
    ['Grade', p.grade],
    ['Metal / setting', p.metal],
    ['Origin farm', p.farm?.name ?? null],
    ['Certification', p.certification],
    ['SKU', p.sku],
  ];
  return (
    <Container className="pb-28 lg:pb-0">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Jewellery', href: '/jewellery' }, { name: p.category.name, href: `/jewellery/${p.category.slug}` }, { name: p.name }]} />
      <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
        <Gallery images={p.images} video={p.videoUrl} name={p.name} />
        <div className="flex flex-col gap-6">
          <div>
            {p.collection && <Link href={`/collections/${p.collection.slug}`} className="eyebrow hover:text-accent">{p.collection.name} collection</Link>}
            <h1 className="mt-2 font-serif text-4xl leading-tight lg:text-5xl">{p.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>SKU {p.sku}</span>
              {p.rating.count > 0 && (
                <a href="#reviews" className="flex items-center gap-1 hover:text-accent">
                  <Stars value={p.rating.average ?? 0} /> {p.rating.average} ({p.rating.count})
                </a>
              )}
            </p>
          </div>
          <div>
            <Price p={p} className={`font-serif text-3xl ${p.priceOnRequest ? 'italic text-muted' : ''}`} />
            {!p.priceOnRequest && <p className="mt-1 text-xs text-muted">Inclusive of GST</p>}
            {p.isSold && <p className="mt-3 inline-block bg-ink px-3 py-1 text-xs tracking-widest text-white uppercase">Sold</p>}
            {p.reserved && <p className="mt-3 text-sm text-warning">Someone is checking out this one-of-a-kind piece right now. It may be available again in 15 minutes.</p>}
            {!p.availableInCity && <p className="mt-3 text-sm text-warning">Not delivered in your selected city. Enquire and we will try to help.</p>}
            {p.isUnique && !p.isSold && <p className="mt-3 text-sm text-muted">One of a kind: there is only this piece.</p>}
          </div>
          {/* Trust next to the price and buttons (SPEC Part 11) */}
          <ul className="grid gap-3 border-y border-line py-5 text-sm">
            {p.farm && (
              <li className="flex items-start gap-3">
                <IconFor name="farm" className="mt-0.5 shrink-0 text-gold" />
                <span>
                  Origin: <Link href={`/our-farm/${p.farm.slug}`} className="text-accent underline underline-offset-2">{p.farm.name}</Link>, {p.farm.location}
                </span>
              </li>
            )}
            {p.certificateCode && (
              <li className="flex items-start gap-3">
                <IconFor name="certificate" className="mt-0.5 shrink-0 text-gold" />
                <span>
                  Certified · <Link href={`/verify/${p.certificateCode}`} className="text-accent underline underline-offset-2">verify certificate</Link>
                </span>
              </li>
            )}
            {trust
              .filter((t) => t.icon !== 'farm' && t.icon !== 'certificate')
              .map((t) => (
                <li key={t.title} className="flex items-start gap-3">
                  <IconFor name={t.icon} className="mt-0.5 shrink-0 text-gold" />
                  <span>{t.icon === 'truck' ? site?.delivery.promise ?? t.text : t.text}</span>
                </li>
              ))}
          </ul>
          <BuyActions p={p} />
          <WishlistButton productId={p.id} />
          {p.description && <p className="leading-relaxed text-ink/90">{p.description}</p>}
          <section aria-labelledby="spec">
            <h2 id="spec" className="eyebrow mb-3">Specification</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
              {spec
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>
      </div>

      {p.farm && (
        <section className="mt-20 grid items-center gap-8 bg-surface-muted p-6 lg:grid-cols-2 lg:gap-14 lg:p-12">
          {p.farm.heroImageUrl && <img src={p.farm.heroImageUrl} alt="" loading="lazy" width={1600} height={900} className="aspect-[16/10] w-full object-cover" />}
          <div>
            <p className="eyebrow mb-2">The farm</p>
            <h2 className="font-serif text-3xl lg:text-4xl">{p.farm.name}</h2>
            <p className="mt-4 leading-relaxed text-muted">{p.farm.summary ?? p.farm.story?.slice(0, 320)}</p>
            <Link href={`/our-farm/${p.farm.slug}`} className="mt-6 inline-flex min-h-11 items-center text-accent underline underline-offset-4">Read the farm’s story</Link>
          </div>
        </section>
      )}

      <section id="reviews" className="mt-20" aria-labelledby="reviews-h">
        <SectionHeading title="Reviews" />
        <h2 id="reviews-h" className="sr-only">Reviews</h2>
        {p.reviews.length === 0 ? (
          <p className="text-muted">No reviews yet. Customers are invited to review after their piece is delivered.</p>
        ) : (
          <ul className="grid gap-8 md:grid-cols-2">
            {p.reviews.map((r) => (
              <li key={r.id} className="border-t border-line pt-5">
                <Stars value={r.rating} />
                {r.title && <p className="mt-2 font-medium">{r.title}</p>}
                {r.body && <p className="mt-1 text-sm leading-relaxed text-ink/90">{r.body}</p>}
                <p className="mt-2 text-xs text-muted">{r.name} · {new Date(r.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {p.related.length > 0 && (
        <section className="mt-20">
          <SectionHeading eyebrow="You may also like" title="Related pieces" />
          <ProductGrid products={p.related.slice(0, 4)} />
        </section>
      )}
      <JsonLd data={productJsonLd(p)} />
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Jewellery', path: '/jewellery' }, { name: p.category.name, path: `/jewellery/${p.category.slug}` }, { name: p.name, path: `/product/${p.slug}` }])} />
    </Container>
  );
}
