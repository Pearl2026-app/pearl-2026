'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ROLE_LABEL } from '@sahyadri/shared';
import { Button, cx, Spinner } from '@sahyadri/ui';
import { adminPath } from '@/lib/base-path';
import { NAV } from '@/lib/nav';
import { useDemo, useMe, useLogout } from '@/lib/session';

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const pathname = usePathname();
  const logout = useLogout();
  const demo = useDemo();
  const [open, setOpen] = useState(false);

  if (isLoading)
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  if (error || !me) {
    if (typeof window !== 'undefined')
      window.location.href = adminPath(`/login?next=${encodeURIComponent(pathname)}`);
    return null;
  }

  const allowed = (i: (typeof NAV)[number]['items'][number]) =>
    (!i.roles || i.roles.includes(me.role)) &&
    (!i.module || me.permissions[i.module]?.includes(i.action ?? 'view'));
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);
  const scope = me.city?.name ?? me.vendor?.name ?? me.franchise?.name ?? me.deliveryPartner?.name ?? null;
  const active = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  const items = groups.flatMap((g) => g.items);
  const main = items.filter((i) => i.primary);
  const more = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.primary) }))
    .filter((g) => g.items.length);
  const inMore = more.some((g) => g.items.some((i) => active(i.href)));
  const link = (i: (typeof items)[number], colour?: string) => (
    <Link
      href={i.href}
      onClick={() => setOpen(false)}
      aria-current={active(i.href) ? 'page' : undefined}
      className={cx(
        'flex items-center gap-3 rounded-md px-3 text-sm transition-colors',
        colour ? 'py-2.5 font-medium' : 'py-1.5',
        active(i.href) ? 'text-ink' : 'text-ink/80 hover:bg-surface-muted hover:text-ink',
      )}
      style={
        active(i.href) && colour
          ? { backgroundColor: `${colour}14`, boxShadow: `inset 3px 0 0 ${colour}` }
          : active(i.href)
            ? { backgroundColor: 'var(--color-surface-muted)' }
            : undefined
      }
    >
      {colour && (
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
      )}
      {i.label}
    </Link>
  );

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-4 p-3">
      <ul className="flex flex-col gap-0.5">
        {main.map((i) => (
          <li key={i.href}>{link(i, i.primary)}</li>
        ))}
      </ul>
      {more.length > 0 && (
        // Everything else, folded away; it opens by itself when one of its pages is open.
        <details open={inMore} className="group border-t border-line pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
            More
            <span aria-hidden className="transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {more.map((g) => (
              <div key={g.label}>
                <p className="mb-0.5 px-3 text-xs text-muted">{g.label}</p>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.href}>{link(i)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </nav>
  );

  return (
    <>
      {demo && (
        <p className="bg-ink px-4 py-1.5 text-center text-xs text-white">
          Demo site · sample data, no real orders or payments
        </p>
      )}
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
          <div className="border-b border-line px-4 py-4">
            <p className="font-serif text-xl font-semibold text-accent">Sahyadri Pearls</p>
            <p className="text-xs text-muted">
              {ROLE_LABEL[me.role]}
              {scope ? ` · ${scope}` : ''}
            </p>
          </div>
          {nav}
        </aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button
              className="absolute inset-0 bg-black/30"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            />
            <aside className="relative h-full w-72 overflow-y-auto bg-surface">{nav}</aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
            <button
              className="rounded-sm px-2 py-1 text-sm lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
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
    </>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
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
