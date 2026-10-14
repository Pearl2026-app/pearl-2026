import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';

export const metadata = meta({ title: 'All platforms', description: 'Every Sahyadri Pearls platform in one place.', path: '/platforms', noindex: true });

interface Platform {
  name: string;
  who: string;
  path: string;
  shows: string;
  /** Demo sign-in, shown only on the demo site. */
  login?: string;
}

const PLATFORMS: Platform[] = [
  { name: 'Website', who: 'Customers', path: '/', shows: 'Browse farm-traced pearls, Ring Finder, enquire on WhatsApp, checkout and track an order.', login: 'Optional. Mobile 9800000007' },
  { name: 'Customer app', who: 'Customers (Android and iPhone)', path: '/apps/customer', shows: 'The phone app: shop, wishlist, cart, gift packing, orders, returns, referral. Shown here in the browser.', login: 'Account tab → mobile 9800000007' },
  { name: 'Admin', who: 'Head office', path: '/admin', shows: 'Dashboard, enquiries, orders, products and approval, certificates, custom orders, purchase orders, pricing, reports, settings.', login: 'admin@sahyadripearls.test · Sahyadri@2026' },
  { name: 'City Manager panel', who: 'City teams', path: '/admin', shows: 'Only their city: enquiries, orders, delivery assignment, returns, city reports.', login: 'pune.manager@sahyadripearls.test · Sahyadri@2026' },
  { name: 'Vendor panel', who: 'Jewellery vendors', path: '/admin', shows: 'Their own pieces (changes go to head office for approval), orders up to packing, stock.', login: 'Partner tab → 9800000003' },
  { name: 'Franchise panel', who: 'Franchise stores', path: '/admin', shows: 'Enquiries and orders assigned to their store, converting enquiries into orders.', login: 'Partner tab → 9800000004' },
  { name: 'Delivery app', who: 'Delivery partners (Android and iPhone)', path: '/apps/delivery', shows: 'Today’s jobs, picked up, out for delivery, proof (photo, code or signature), cash collected; works offline.', login: 'Mobile 9800000005' },
  { name: 'Delivery panel (web)', who: 'Delivery partners without the app', path: '/admin/delivery', shows: 'The same delivery steps in a phone browser.', login: 'Partner tab → 9800000005' },
];

export default async function PlatformsPage() {
  const site = await get<Site>('/site', { revalidate: 300 });
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const qr = await Promise.all(PLATFORMS.map((p) => QRCode.toString(origin + p.path, { type: 'svg', margin: 0, color: { dark: '#1F2A2B', light: '#00000000' } })));
  return (
    <Container className="pb-16">
      <PageTitle eyebrow="Sahyadri Pearls" title="All platforms" intro="One system: the website, the two phone apps, the head-office admin and a panel for every partner, on one database and one API." />
      {site?.demo && (
        <p className="mb-8 border border-line bg-surface p-4 text-sm">
          <strong>Demo site with sample data.</strong> Every one-time code is <strong>123456</strong>. Payments use a test sandbox; nothing is charged or delivered.
        </p>
      )}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p, i) => (
          <li key={p.name} className="flex flex-col gap-3 border border-line bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl">{p.name}</h2>
                <p className="text-sm text-muted">{p.who}</p>
              </div>
              <div className="h-20 w-20 shrink-0" aria-hidden dangerouslySetInnerHTML={{ __html: qr[i]! }} />
            </div>
            <p className="text-sm">{p.shows}</p>
            {site?.demo && p.login && <p className="text-xs text-muted">Sign in: {p.login}</p>}
            <a href={p.path} className="mt-auto inline-flex min-h-11 items-center justify-center bg-accent px-4 text-sm text-white hover:bg-accent-hover">
              Open {p.name.toLowerCase()}
            </a>
          </li>
        ))}
      </ul>
    </Container>
  );
}
