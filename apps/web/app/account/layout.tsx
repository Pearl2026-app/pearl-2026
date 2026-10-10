'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { ACCOUNT_MENU } from '@sahyadri/shared';
import { cx } from '@sahyadri/ui';
import { useSession } from '@/components/session';
import { Container } from '@/components/ui';
import { api } from '@/lib/api';

export default function AccountLayout({ children }: { children: ReactNode }) {
  const { me, loaded, refresh } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (loaded && !me) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loaded, me, pathname, router]);
  if (!me) return <Container className="py-16"><p className="text-muted">Loading your account…</p></Container>;
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await refresh();
    router.replace('/');
  };
  return (
    <Container className="py-8">
      <p className="eyebrow">My Account</p>
      <h1 className="mt-1 mb-8 font-serif text-4xl">Hello{me.name && me.name !== 'Customer' ? `, ${me.name.split(' ')[0]}` : ''}</h1>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Account" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {ACCOUNT_MENU.map((m) => {
            const active = m.href === '/account' ? pathname === '/account' : pathname.startsWith(m.href);
            return (
              <Link key={m.href} href={m.href} aria-current={active ? 'page' : undefined} className={cx('flex min-h-11 shrink-0 items-center px-3 text-sm whitespace-nowrap', active ? 'bg-accent text-white' : 'hover:bg-surface-muted')}>
                {m.label}
              </Link>
            );
          })}
          <button onClick={logout} className="flex min-h-11 shrink-0 items-center px-3 text-left text-sm text-muted hover:text-danger">Logout</button>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Container>
  );
}
