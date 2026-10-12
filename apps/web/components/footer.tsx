import Link from 'next/link';
import { footerCopyright, footerCredit } from '@sahyadri/shared';
import type { Site } from '@/lib/types';
import { NewsletterForm } from './newsletter';

/** Footer exactly as SPEC Part 5 lists it. Text and links come from the admin. */
export function Footer({ site }: { site: Site }) {
  const about = site.blocks['footer.about']?.data ?? {};
  const links = [
    { href: '/contact', label: 'Contact Us' },
    { href: '/terms', label: 'Terms & Conditions' },
    { href: '/refund-policy', label: 'Refund Policy' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/return-cancellation-policy', label: 'Return & Cancellation Policy' },
    { href: '/shipping-policy', label: 'Shipping / Delivery Policy' },
    { href: '/faq', label: 'FAQ' },
    { href: '/careers', label: 'Careers' },
  ];
  const discover = [
    { href: '/pearl-guide', label: 'Pearl Guide' },
    { href: '/gifts', label: 'Gifts' },
    { href: '/book-consultation', label: 'Book a consultation' },
    { href: '/visit-us', label: 'Visit us' },
    { href: '/verify', label: 'Verify a certificate' },
    { href: '/bulk-buying', label: 'Bulk & corporate gifting' },
  ];
  return (
    <footer className="mt-24 border-t border-line bg-surface-muted">
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-serif text-3xl">Join the Sahyadri circle</p>
            <p className="mt-2 max-w-md text-sm text-muted">New collections from our farms, private previews and pearl care tips. A few emails a month, never more.</p>
          </div>
          <NewsletterForm />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/about" className="font-serif text-2xl text-accent">About Us</Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">{about.body}</p>
          <address className="mt-3 text-sm not-italic text-ink">{about.address ?? site.store.address}</address>
          <p className="mt-2 text-sm">
            <a href={`tel:${site.store.phone}`} className="hover:text-accent">{site.store.phone}</a> ·{' '}
            <a href={`mailto:${site.store.email}`} className="hover:text-accent">{site.store.email}</a>
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid gap-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink hover:text-accent">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Discover">
          <ul className="grid gap-2 text-sm">
            {discover.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-ink hover:text-accent">{l.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="eyebrow mb-3">Download the app</p>
          <div className="flex flex-wrap gap-2">
            <StoreLink href={site.appLinks.android} label="Get it on Google Play" />
            <StoreLink href={site.appLinks.ios} label="Download on the App Store" />
          </div>
          <p className="eyebrow mt-8 mb-2">Shop</p>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {site.categories.map((c) => (
              <li key={c.slug}><Link href={`/jewellery/${c.slug}`} className="hover:text-accent">{c.name}</Link></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between lg:px-8">
          <span>{footerCredit()}</span>
          <span>{footerCopyright()}</span>
        </div>
      </div>
    </footer>
  );
}

function StoreLink({ href, label }: { href: string; label: string }) {
  const cls = 'inline-flex min-h-11 items-center rounded-sm border border-ink px-4 text-sm';
  return href ? (
    <a href={href} className={`${cls} hover:bg-ink hover:text-white`} target="_blank" rel="noopener noreferrer">{label}</a>
  ) : (
    <span className={`${cls} cursor-default border-dashed`} title="Coming soon">{label} · soon</span>
  );
}
