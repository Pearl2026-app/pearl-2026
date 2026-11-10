import { meta } from '@/lib/seo';

// Payment screens are private: never in search results.
export const metadata = meta({ title: 'Payment', path: '/pay', noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
