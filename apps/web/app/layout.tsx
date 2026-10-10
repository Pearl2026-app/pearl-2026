import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { SessionProvider } from '@/components/session';
import { SiteProvider } from '@/components/site-context';
import { WhatsAppFloat } from '@/components/whatsapp';
import { JsonLd, SITE_URL } from '@/lib/seo';
import { get } from '@/lib/server-api';
import type { Site } from '@/lib/types';
import './globals.css';

const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-cormorant', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const site = await get<Site>('/site', { revalidate: 300 });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: 'Sahyadri Pearls · Farm-traced pearl jewellery', template: `%s${site?.seo.titleSuffix ?? ' | Sahyadri Pearls'}` },
    description: site?.seo.defaultDescription,
    applicationName: 'Sahyadri Pearls',
    formatDetection: { telephone: false },
    icons: { icon: '/icon.svg' },
  };
}

export const viewport: Viewport = { themeColor: '#FBF8F3', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = (await get<Site>('/site', { revalidate: 300 }))!;
  return (
    <html lang="en-IN" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <SiteProvider site={site}>
          <SessionProvider>
            <Header />
            <main id="main">{children}</main>
            <Footer site={site} />
            <WhatsAppFloat />
          </SessionProvider>
        </SiteProvider>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Sahyadri Pearls',
            url: SITE_URL,
            telephone: site.store.phone,
            email: site.store.email,
            address: site.store.address,
          }}
        />
      </body>
    </html>
  );
}
