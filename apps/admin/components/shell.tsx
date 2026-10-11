'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ROLE_LABEL } from '@sahyadri/shared';
import { Button, cx, Spinner } from '@sahyadri/ui';
import { adminPath } from '@/lib/base-path';
import { NAV } from '@/lib/nav';
import { useMe, useLogout } from '@/lib/session';

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const pathname = usePathname();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (error || !me) {
    if (typeof window !== 'undefined') window.location.href = adminPath(`/login?next=${encodeURIComponent(pathname)}`);
    return null;
  }

  const allowed = (i: (typeof NAV)[number]['items'][number]) =>
    (!i.roles || i.roles.includes(me.role)) && (!i.module || me.permissions[i.module]?.includes(i.action ?? 'view'));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);
  const scope = me.city?.name ?? me.vendor?.name ?? me.franchise?.name ?? me.deliveryPartner?.name ?? null;
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-5 p-4">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted uppercase">{g.label}</p>
          <ul>
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={() => setOpen(false)}
                  aria-current={active(i.href) ? 'page' : undefined}
                  className={cx(
                    'block rounded-sm px-2 py-1.5 text-sm',
                    active(i.href) ? 'bg-accent text-white' : 'text-ink hover:bg-surface-muted',
                  )}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
        <div className="border-b border-line px-4 py-4">
          <p className="font-serif text-xl font-semibold text-accent">Sahyadri Pearls</p>
          <p className="text-xs text-muted">{ROLE_LABEL[me.role]}{scope ? ` · ${scope}` : ''}</p>
        </div>
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/30" aria-label="Close menu" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 overflow-y-auto bg-surface">{nav}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <button className="rounded-sm px-2 py-1 text-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <span className="font-serif text-lg text-accent lg:hidden">Sahyadri Pearls</span>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{me.name}</span>
            <Button variant="secondary" size="sm" onClick={logout}>
              Sign out
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
        <footer className="border-t border-line px-6 py-3 text-xs text-muted">
          Developed by Sahyadri Pearls · © {new Date().getFullYear()} Sahyadri Pearls. All Rights Reserved.
        </footer>
      </div>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
