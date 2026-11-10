'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ChevronRight, LogOut, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { METAL_RATE_LABEL, type MetalRateKey } from '@sahyadri/shared';
import { ROLE_LABEL } from '@sahyadri/shared';
import { Button, cx, Spinner } from '@sahyadri/ui';
import { adminPath } from '@/lib/base-path';
import { api } from '@/lib/api';
import { iconFor } from '@/lib/icons';
import { infoFor, NAV, pageItem } from '@/lib/nav';
import { InfoTip } from './info-tip';

/** A colour per menu section, so related pages share a colour and a page is recognised at a glance. */
export const GROUP_COLOUR: Record<string, string> = {
  Overview: '#070E4D',
  Sales: '#47628A',
  Delivery: '#47628A',
  Catalogue: '#B89042',
  Customers: '#6B4C9A',
  Marketing: '#C2410C',
  Content: '#1F7A4D',
  Network: '#0E7C86',
  Pricing: '#8A6D1F',
  Reports: '#B4532A',
  Administration: '#47628A',
};
export const colourFor = (href: string) => {
  const g = NAV.find((x) => x.items.some((i) => i.href === href || (href !== '/' && href.startsWith(i.href + '/'))));
  return (g && GROUP_COLOUR[g.label]) ?? '#47628A';
};

/** An icon on a soft tile in the page's colour. */
export function IconTile({ href, size = 'md' }: { href: string; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = iconFor(href);
  if (!Icon) return null;
  const c = colourFor(href);
  const box = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  const px = size === 'sm' ? 15 : size === 'lg' ? 22 : 18;
  return (
    <span aria-hidden className={cx('inline-flex shrink-0 items-center justify-center rounded-lg', box)} style={{ backgroundColor: `${c}17`, color: c }}>
      <Icon size={px} strokeWidth={2} />
    </span>
  );
}

/** Riders using the web panel share their position every 30 s while they have deliveries (meeting of 19 Oct). */
function useRiderLocation(on: boolean) {
  useEffect(() => {
    if (!on || typeof navigator === 'undefined' || !navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - last < 25_000) return;
        last = Date.now();
        void api('/delivery/location', { method: 'POST', json: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy } }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [on]);
}
import { useDemo, useMe, useLogout } from '@/lib/session';

export function Shell({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const pathname = usePathname();
  const logout = useLogout();
  const demo = useDemo();
  const [open, setOpen] = useState(false);
  useRiderLocation(me?.role === 'DELIVERY_PARTNER');

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
  const scope = me.state ?? me.city?.name ?? me.vendor?.name ?? me.franchise?.name ?? me.deliveryPartner?.name ?? null;
  const active = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  const items = groups.flatMap((g) => g.items);
  const main = items.filter((i) => i.primary);
  const more = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.primary) }))
    .filter((g) => g.items.length);
  const inMore = more.some((g) => g.items.some((i) => active(i.href)));
  // A page outside this login's menu (typed in or followed from a link) explains itself instead of failing quietly.
  const page = pageItem(pathname);
  const blocked = !!page && page.href !== '/' && !allowed(page);
  const link = (i: (typeof items)[number], main?: boolean) => {
    const Icon = iconFor(i.href);
    const c = colourFor(i.href);
    const on = active(i.href);
    return (
      <Link
        href={i.href}
        onClick={() => setOpen(false)}
        aria-current={on ? 'page' : undefined}
        className={cx(
          'flex items-center gap-3 rounded-md px-2.5 text-sm transition-colors',
          main ? 'py-2 font-medium' : 'py-1.5',
          on ? 'text-ink' : 'text-ink/80 hover:bg-surface-muted hover:text-ink',
        )}
        style={on ? { backgroundColor: `${c}14`, boxShadow: `inset 3px 0 0 ${c}` } : undefined}
      >
        {Icon && (
          <span
            aria-hidden
            className={cx('inline-flex shrink-0 items-center justify-center rounded-md', main ? 'h-7 w-7' : 'h-6 w-6')}
            style={{ backgroundColor: main || on ? `${c}1A` : 'transparent', color: c }}
          >
            <Icon size={main ? 16 : 15} strokeWidth={2} />
          </span>
        )}
        {i.label}
      </Link>
    );
  };

  const nav = (
    <nav aria-label="Main" className="flex flex-col gap-4 p-3">
      <ul className="flex flex-col gap-0.5">
        {main.map((i) => (
          <li key={i.href} className="group/nav flex items-center gap-1">
            <div className="min-w-0 flex-1">{link(i, true)}</div>
            {i.info && <InfoTip text={i.info} label={`What is ${i.label} for?`} className="mr-1 opacity-60 group-hover/nav:opacity-100" />}
          </li>
        ))}
      </ul>
      {more.length > 0 && (
        // Everything else, folded away; it opens by itself when one of its pages is open.
        <details open={inMore} className="group border-t border-line pt-3">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm text-muted hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
            More
            <ChevronRight aria-hidden size={16} className="transition-transform group-open:rotate-90" />
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {more.map((g) => (
              <div key={g.label}>
                <p className="mb-0.5 flex items-center gap-2 px-3 text-[11px] font-medium tracking-wide text-muted uppercase">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GROUP_COLOUR[g.label] ?? '#47628A' }} />
                  {g.label}
                </p>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.href} className="group/nav flex items-center gap-1">
                      <div className="min-w-0 flex-1">{link(i)}</div>
                      {i.info && <InfoTip text={i.info} label={`What is ${i.label} for?`} className="mr-1 opacity-60 group-hover/nav:opacity-100" />}
                    </li>
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
          <div className="flex items-center gap-3 border-b border-line px-4 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/admin/brand/logo.png" alt="" width={56} height={36} className="h-9 w-auto object-contain" />
            <div>
              <p className="font-serif text-xl font-semibold text-accent">Sahyadri Pearls</p>
              <p className="text-xs text-muted">
                {ROLE_LABEL[me.role]}
                {scope ? ` · ${scope}` : ''}
              </p>
            </div>
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
          <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
           <div className="flex h-14 items-center gap-3 px-4">
            <button
              className="rounded-sm px-2 py-1 text-sm lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <span className="flex items-center gap-2 font-serif text-lg text-accent lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/admin/brand/logo.png" alt="" width={38} height={24} className="h-6 w-auto object-contain" />
              Sahyadri Pearls
            </span>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">{me.name}</span>
              <Button variant="secondary" size="sm" onClick={logout}>
                <LogOut size={14} className="mr-1.5" aria-hidden />
                Sign out
              </Button>
            </div>
           </div>
           {me.permissions.DASHBOARD?.includes('view') && <RatesBar canEdit={!!me.permissions.PRICING?.includes('edit')} />}
          </header>
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            {blocked ? (
              <div className="max-w-xl rounded-md border border-line bg-surface p-6">
                <h1 className="text-xl font-semibold text-ink">{page.label} is not part of your login</h1>
                <p className="mt-2 text-sm text-muted">
                  Your role ({ROLE_LABEL[me.role]}) does not include this page. If you need it, ask the Super Admin to add it under Staff &amp; partner logins.
                </p>
                {items[0] && (
                  <Link href={items[0].href} className="mt-4 inline-flex min-h-9 items-center rounded-sm bg-accent px-3 text-sm font-medium text-white">
                    Go to {items[0].label}
                  </Link>
                )}
              </div>
            ) : (
              children
            )}
          </main>
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
  const pathname = usePathname();
  const info = infoFor(pathname);
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <IconTile href={pathname} size="lg" />
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink">
            {title}
            {info && <InfoTip text={info} label={`What is ${title} for?`} />}
          </h1>
          {description && <p className="mt-1 line-clamp-2 max-w-2xl text-xs leading-5 text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

interface RatesBarData {
  date: string;
  liveMetals: boolean;
  metals: Array<{ metal: MetalRateKey; ratePerGramPaise: number | null; isToday: boolean; source: string | null }>;
  pearl: { liveFeed: boolean; extraPercent: number; grade: string | null; fromPerCaratPaise: number | null };
}

const BAR_METALS: MetalRateKey[] = ['GOLD_24K', 'GOLD_22K', 'GOLD_18K', 'SILVER_999', 'SILVER_925'];
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Today's rates on every admin page (owner, 10 Nov): gold and silver per gram, and the pearl rate. */
function RatesBar({ canEdit }: { canEdit: boolean }) {
  const { data } = useQuery({ queryKey: ['/admin/pricing/rates-bar'], queryFn: () => api<RatesBarData>('/admin/pricing/rates-bar'), staleTime: 5 * 60_000, refetchInterval: 15 * 60_000 });
  if (!data) return null;
  const metals = data.metals.filter((m) => BAR_METALS.includes(m.metal) && m.ratePerGramPaise != null);
  const stale = metals.some((m) => !m.isToday);
  const item = (href: string, children: ReactNode) =>
    canEdit ? (
      <Link href={href} className="flex shrink-0 items-baseline gap-1.5 hover:text-accent">
        {children}
      </Link>
    ) : (
      <span className="flex shrink-0 items-baseline gap-1.5">{children}</span>
    );
  return (
    <div className="flex h-8 items-center gap-5 overflow-x-auto border-t border-line/70 bg-bg/60 px-4 text-xs whitespace-nowrap text-ink">
      <span className="flex shrink-0 items-center gap-1.5 text-muted" title={data.liveMetals ? 'Gold and silver refresh every hour from the market' : 'Rates are entered by hand on Pricing → Metal rates'}>
        <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${data.liveMetals && !stale ? 'bg-emerald-600' : 'bg-amber-500'}`} />
        {data.liveMetals ? (stale ? 'Live rates (waiting for today’s)' : 'Live rates') : 'Rates entered by hand'}
      </span>
      {metals.length === 0 && item('/pricing/metal-rates', <span className="text-muted">No metal rates yet</span>)}
      {metals.map((m) =>
        item(
          '/pricing/metal-rates',
          <>
            <span className="text-muted">{METAL_RATE_LABEL[m.metal]}</span>
            <span className="font-semibold tabular-nums">{rupees(m.ratePerGramPaise!)}</span>
            <span className="text-muted">/g</span>
          </>,
        ),
      )}
      {item(
        '/pearl-rates',
        data.pearl.fromPerCaratPaise != null ? (
          <>
            <span className="text-muted">Pearl {data.pearl.grade} from</span>
            <span className="font-semibold tabular-nums">{rupees(data.pearl.fromPerCaratPaise)}</span>
            <span className="text-muted">/ct (incl. +{data.pearl.extraPercent}%, {data.pearl.liveFeed ? 'live feed' : 'your rates'})</span>
          </>
        ) : (
          <span className="text-muted">No pearl rates yet</span>
        ),
      )}
    </div>
  );
}
