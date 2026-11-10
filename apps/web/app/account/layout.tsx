import { meta } from '@/lib/seo';
import { AccountShell } from './account-shell';

// A shopper's own account: never in search results.
export const metadata = meta({ title: 'My account', path: '/account', noindex: true });

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
