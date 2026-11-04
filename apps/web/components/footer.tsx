import Link from 'next/link';
import { footerCopyright, footerCredit } from '@sahyadri/shared';
import type { Site } from '@/lib/types';
import { NewsletterForm } from './newsletter';

/** The brand's social accounts (client brief, 4 Nov). */
const SOCIAL = [
  { href: 'https://www.instagram.com/sahyadri_pearls', label: 'Instagram', icon: <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9a5.5 5.5 0 0 1-5.5 5.5h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm5.25-3.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" /> },
  { href: 'https://www.facebook.com/share/19hjwQVwhJ/', label: 'Facebook', icon: <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22h3.4Z" /> },
  { href: 'https://youtube.com/@sahyadri_pearls', label: 'YouTube', icon: <path d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" /> },
];

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
    { href: '/deliver-with-us', label: 'Become a Delivery Partner' },
  ];
  const discover = [
    { href: '/pearl-guide', label: 'Pearl Guide' },
    { href: '/gifts', label: 'Gifts' },
    { href: '/book-consultation', label: 'Book a consultation' },
    { href: '/visit-us', label: 'Visit us' },
    { href: '/verify', label: 'Verify a certificate' },
    { href: '/bulk-buying', label: 'Bulk & corporate gifting' },
    { href: '/business', label: 'Business buyers (B2B)' },
  ];
  return (
    <footer className="glass mx-2 mt-24 mb-2 overflow-hidden rounded-3xl lg:mx-5 lg:mb-5">
      <div className="border-b border-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between lg:px-8">
          <div>
            <p className="font-serif text-3xl">The Sahyadri circle</p>
            <p className="mt-2 text-sm text-muted">New pieces and private previews. A few emails a month.</p>
          </div>
          <NewsletterForm />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Link href="/about" className="font-serif text-2xl text-accent">About Us</Link>
          <address className="mt-3 text-sm not-italic text-ink">{about.address ?? site.store.address}</address>
          <p className="mt-2 text-sm">
            <a href={`tel:${site.store.phone}`} className="hover:text-accent">{site.store.phone}</a> ·{' '}
            <a href={`mailto:${site.store.email}`} className="hover:text-accent">{site.store.email}</a>
          </p>
          <ul className="mt-5 flex gap-2" aria-label="Follow us">
            {SOCIAL.map((x) => (
              <li key={x.label}>
                <a
                  href={x.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={x.label}
                  data-magnetic
                  className="glass flex h-11 w-11 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent hover:text-white"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    {x.icon}
                  </svg>
                </a>
              </li>
            ))}
          </ul>
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
      <div className="border-t border-white/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between lg:px-8">
          <span>{footerCredit()}</span>
          <span>{footerCopyright()}</span>
        </div>
      </div>
    </footer>
  );
}

function StoreLink({ href, label }: { href: string; label: string }) {
  const cls = 'inline-flex min-h-11 items-center rounded-full border border-ink/40 px-4 text-sm';
  return href ? (
    <a href={href} className={`${cls} hover:bg-ink hover:text-white`} target="_blank" rel="noopener noreferrer">{label}</a>
  ) : (
    <span className={`${cls} cursor-default border-dashed`} title="Coming soon">{label} · soon</span>
  );
}
