import { meta } from '@/lib/seo';

// Sign-in page: not a search landing page.
export const metadata = meta({ title: 'Sign in', path: '/login', noindex: true });

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
