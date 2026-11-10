import { meta } from '@/lib/seo';

// Checkout is private to the shopper: never in search results.
export const metadata = meta({ title: 'Checkout', path: '/checkout', noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
