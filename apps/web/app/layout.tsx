import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { Motion } from '@/components/motion';
import { OrderStrip } from '@/components/order-strip';
import { SessionProvider } from '@/components/session';
import { SiteProvider } from '@/components/site-context';
import { WhatsAppFloat } from '@/components/whatsapp';
import { JsonLd, SITE_URL } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';
import './globals.css';

// Fonts ship with the site (open licence, from Fontsource): no request to Google at build or run time.
// Type (owner's brief, 10 Nov): an elegant serif for headings (Cormorant Garamond) and a refined sans for reading (Inter).
// Supersedes "Poppins everywhere" (27 Oct) on the storefront; the admin keeps Poppins.
const serif = localFont({
  src: [
    { path: '../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff2', weight: '400', style: 'italic' },
    { path: '../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-500-italic.woff2', weight: '500', style: 'italic' },
    { path: '../node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-cormorant',
  display: 'swap',
});
const sans = localFont({
  src: [
    { path: '../node_modules/@fontsource/inter/files/inter-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const site = await get<Site>('/site', { revalidate: 300 });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: 'Sahyadri Pearls · Pearl jewellery in gold', template: `%s${site?.seo.titleSuffix ?? ' | Sahyadri Pearls'}` },
    description: site?.seo.defaultDescription,
    applicationName: 'Sahyadri Pearls',
    formatDetection: { telephone: false },
    icons: { icon: '/icon.svg', apple: '/brand/logo.png' },
    // The demo (sample data, fixed sign-in code) must never appear in search results.
    robots: site?.demo ? { index: false, follow: false } : undefined,
  };
}

export const viewport: Viewport = { themeColor: '#F7F3E9', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = (await get<Site>('/site', { revalidate: 300 }))!;
  // The store can be limited to India (meeting of 19 Oct): visitors elsewhere see a short notice.
  const country = (await headers()).get('x-vercel-ip-country');
  if (site.storefront.indiaOnly && country && country !== 'IN') {
    return (
      <html lang="en" className={`${serif.variable} ${sans.variable}`}>
        <body>
          <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="font-serif text-4xl">Sahyadri Pearls</p>
            <p className="max-w-md text-muted">
              Our store is available in India only. If you are travelling, please visit us again when you are back, or
              write to {site.store.email}.
            </p>
          </main>
        </body>
      </html>
    );
  }
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <SiteProvider site={site}>
          <SessionProvider>
            <Header />
            <OrderStrip />
            <main id="main">{children}</main>
            <Footer site={site} />
            <WhatsAppFloat />
            <Motion />
          </SessionProvider>
        </SiteProvider>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Sahyadri Pearls',
            url: SITE_URL,
            logo: `${SITE_URL}/brand/logo.png`,
            telephone: site.store.phone,
            email: site.store.email,
            address: site.store.address,
          }}
        />
      </body>
    </html>
  );
}
