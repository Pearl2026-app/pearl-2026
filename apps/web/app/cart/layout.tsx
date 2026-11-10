import { meta } from '@/lib/seo';

// A shopper’s own cart: never in search results.
export const metadata = meta({ title: 'Your cart', path: '/cart', noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
