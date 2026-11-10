import { meta } from '@/lib/seo';

// Order confirmations are private: never in search results.
export const metadata = meta({ title: 'Your order', path: '/order', noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
