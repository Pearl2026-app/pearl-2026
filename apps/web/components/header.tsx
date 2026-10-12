'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@sahyadri/ui';
import { useSession } from './session';
import { BagIcon, CloseIcon, MenuIcon, PinIcon, SearchIcon, UserIcon } from './icons';
import { bandHref, PRICE_BANDS } from '@/lib/guides';
import { useSite } from './site-context';

const NAV = [
  { href: '/jewellery', label: 'Jewellery', mega: true },
  { href: '/gifts', label: 'Gifts' },
  { href: '/our-farm', label: 'Our Farm' },
  { href: '/customized-jewellery', label: 'Customized Jewellery' },
  { href: '/pearl-guide', label: 'Pearl Guide' },
];
const MOBILE_EXTRA = [
  { href: '/book-consultation', label: 'Book a consultation' },
  { href: '/visit-us', label: 'Visit us' },
  { href: '/contact', label: 'Contact' },
];

/** Thin bar above the header. Messages rotate; by default they come from the delivery and returns settings. */
function Announcement() {
  const site = useSite();
  const custom = site.storefront.announcement.split('\n').map((l) => l.trim()).filter(Boolean);
  const free = site.delivery.freeAbovePaise;
  const messages = custom.length
    ? custom
    : [
        free != null ? `Free insured delivery on orders above ₹${(free / 100).toLocaleString('en-IN')}` : site.delivery.promise,
        'Every pearl traced to its farm, with a certificate you can verify',
        site.returns.windowDays > 0 ? `Easy ${site.returns.windowDays}-day returns` : null,
      ].filter((m): m is string => !!m);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 5000);
    return () => clearInterval(t);
  }, [messages.length]);
  if (!messages.length) return null;
  return (
    <div className="bg-accent text-center text-[12.5px] tracking-wide text-white" role="region" aria-label="Announcements">
      <p key={i} className="fade-in mx-auto max-w-7xl truncate px-4 py-2">{messages[i % messages.length]}</p>
    </div>
  );
}

function MegaMenu({ onClose }: { onClose: () => void }) {
  const site = useSite();
  const col = (title: string, items: Array<{ href: string; label: string }>) =>
    items.length > 0 && (
      <div>
        <p className="eyebrow mb-3">{title}</p>
        <ul className="grid gap-2 text-[15px]">
          {items.map((it) => (
            <li key={it.href}>
              <Link href={it.href} onClick={onClose} className="hover:text-accent">{it.label}</Link>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="absolute inset-x-0 top-full hidden border-t border-line bg-bg shadow-[0_24px_40px_-24px_rgba(0,0,0,0.18)] lg:block" onMouseLeave={onClose}>
      <div className="mx-auto grid max-w-7xl grid-cols-5 gap-8 px-8 py-10">
        {col('Shop by category', [{ href: '/jewellery', label: 'All jewellery' }, ...site.categories.map((c) => ({ href: `/jewellery/${c.slug}`, label: c.name }))])}
        {col('Pearl colour', site.shop.colours.map((c) => ({ href: `/jewellery?colour=${encodeURIComponent(c)}`, label: c })))}
        {col('Pearl shape', site.shop.shapes.map((s) => ({ href: `/jewellery?shape=${encodeURIComponent(s)}`, label: s })))}
        {col('Collections', site.shop.collections.map((c) => ({ href: `/collections/${c.slug}`, label: c.name })))}
        {col('Shop by price', PRICE_BANDS.map((b) => ({ href: bandHref(b), label: b.label })))}
      </div>
      <div className="border-t border-line bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-8 py-4 text-sm">
          <Link href="/gifts" onClick={onClose} className="text-accent hover:underline">Gifts, ready to wrap →</Link>
          <Link href="/pearl-guide" onClick={onClose} className="hover:text-accent">How to choose a pearl</Link>
          {site.storefront.consultationsEnabled && <Link href="/book-consultation" onClick={onClose} className="hover:text-accent">Book a video consultation</Link>}
          <Link href="/ring-finder" onClick={onClose} className="hover:text-accent">Ring Finder</Link>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const site = useSite();
  const pathname = usePathname();
  const router = useRouter();
  const { me, cartCount } = useSession();
  const [menu, setMenu] = useState(false);
  const [mega, setMega] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const [city, setCity] = useState<string>('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCity(document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] ?? ''), []);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
    setMega(false);
  }, [pathname]);
  useEffect(() => {
    if (search) searchRef.current?.focus();
  }, [search]);

  const chooseCity = (slug: string) => {
    document.cookie = `sp_city=${slug}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setCity(slug);
    router.refresh();
  };
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
    <Announcement />
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/95 backdrop-blur" onKeyDown={(e) => e.key === 'Escape' && setMega(false)}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 lg:h-20 lg:px-8">
        <button className="-ml-2 flex h-11 w-11 items-center justify-center lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}>
          <MenuIcon />
        </button>
        <Link href="/" className="font-serif text-2xl tracking-wide text-accent lg:text-[28px]" aria-label="Sahyadri Pearls home">
          Sahyadri Pearls
        </Link>
        <nav aria-label="Main" className="ml-10 hidden items-center gap-7 lg:flex">
          {NAV.map((n) =>
            n.mega ? (
              <div key={n.href} className="flex items-center" onMouseEnter={() => setMega(true)}>
                <Link href={n.href} aria-current={active(n.href) ? 'page' : undefined} className={cx('text-[15px] transition-colors hover:text-accent', active(n.href) || mega ? 'text-accent' : 'text-ink')}>
                  {n.label}
                </Link>
                <button className="ml-1 flex h-8 w-6 items-center justify-center text-muted" aria-label="Show jewellery menu" aria-expanded={mega} onClick={() => setMega((m) => !m)}>
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
                </button>
              </div>
            ) : (
              <Link key={n.href} href={n.href} onMouseEnter={() => setMega(false)} aria-current={active(n.href) ? 'page' : undefined} className={cx('text-[15px] transition-colors hover:text-accent', active(n.href) ? 'text-accent' : 'text-ink')}>
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center">
          <label className="mr-2 hidden items-center gap-1 text-sm text-muted md:flex">
            <PinIcon width={16} height={16} />
            <span className="sr-only">Your city</span>
            <select value={city} onChange={(e) => chooseCity(e.target.value)} className="bg-transparent py-2 text-sm text-ink focus:outline-none" aria-label="Your city">
              <option value="">All India</option>
              {site.cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="flex h-11 w-11 items-center justify-center hover:text-accent" onClick={() => setSearch((s) => !s)} aria-label="Search" aria-expanded={search}>
            <SearchIcon />
          </button>
          <Link href="/cart" className="relative flex h-11 w-11 items-center justify-center hover:text-accent" aria-label={`Cart, ${cartCount} items`}>
            <BagIcon />
            {cartCount > 0 && <span className="absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] text-white">{cartCount}</span>}
          </Link>
          <Link href={me ? '/account' : '/login'} className="ml-1 flex h-11 items-center gap-2 px-2 text-sm hover:text-accent">
            <UserIcon />
            <span className="hidden sm:inline">{me ? 'My Account' : 'Sign Up'}</span>
          </Link>
        </div>
      </div>
      {mega && <MegaMenu onClose={() => setMega(false)} />}
      {search && (
        <form
          role="search"
          className="border-t border-line bg-bg"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <SearchIcon className="text-muted" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or SKU" aria-label="Search by name or SKU" className="min-h-11 flex-1 bg-transparent text-base focus:outline-none" />
            <button type="submit" className="min-h-11 bg-accent px-5 text-sm text-white">Search</button>
          </div>
        </form>
      )}
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/30" onClick={() => setMenu(false)} aria-label="Close menu" />
          <div className="fade-in relative flex h-full w-[86%] max-w-sm flex-col overflow-y-auto bg-bg p-6">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-serif text-2xl text-accent">Sahyadri Pearls</span>
              <button className="flex h-11 w-11 items-center justify-center" onClick={() => setMenu(false)} aria-label="Close menu">
                <CloseIcon />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex flex-col">
              <Link href="/jewellery" className="border-b border-line py-4 font-serif text-2xl">Jewellery</Link>
              <div className="grid grid-cols-2 gap-x-4 border-b border-line py-3">
                {site.categories.map((c) => (
                  <Link key={c.slug} href={`/jewellery/${c.slug}`} className="py-2 text-muted">
                    {c.name}
                  </Link>
                ))}
              </div>
              {NAV.filter((n) => !n.mega).map((n) => (
                <Link key={n.href} href={n.href} className="border-b border-line py-4 font-serif text-2xl">
                  {n.label}
                </Link>
              ))}
              {MOBILE_EXTRA.map((n) => (
                <Link key={n.href} href={n.href} className="py-3 text-[15px]">
                  {n.label}
                </Link>
              ))}
            </nav>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <PinIcon width={18} height={18} /> City
              <select value={city} onChange={(e) => chooseCity(e.target.value)} className="min-h-11 flex-1 border border-line bg-surface px-2">
                <option value="">All India</option>
                {site.cities.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
    </header>
    </>
  );
}
