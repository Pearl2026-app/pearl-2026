'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@sahyadri/ui';
import { CartDrawer } from './cart-drawer';
import { useSession } from './session';
import { BagIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from './icons';
import { bandHref, PRICE_BANDS } from '@/lib/guides';
import { LocationPicker } from './location-picker';
import { useSite } from './site-context';

const NAV = [
  { href: '/jewellery', label: 'Jewellery', mega: true },
  { href: '/our-farm', label: 'Shop by Farm' },
  { href: '/jewellery?exclusive=1', label: 'Exclusive' },
  { href: '/gifts', label: 'Gifts' },
  { href: '/customized-jewellery', label: 'Customized Jewellery' },
  { href: '/pearl-guide', label: 'Pearl Guide' },
  { href: '/business', label: 'B2B' },
];
const MOBILE_EXTRA = [
  { href: '/book-consultation', label: 'Book a consultation' },
  { href: '/visit-us', label: 'Visit us' },
  { href: '/contact', label: 'Contact' },
];

/** Thin bar above the header. Messages rotate; by default they come from the delivery and returns settings. */
/** Shown on the presentation site (DEMO_MODE) so it can never be mistaken for the real shop. */
function DemoRibbon() {
  return (
    <div className="bg-ink px-4 py-1.5 text-center text-[12px] text-white">
      Demo store, no real orders ·{' '}
      <a href="/platforms" className="underline underline-offset-2">
        All platforms
      </a>
    </div>
  );
}

function Announcement() {
  const site = useSite();
  const custom = site.storefront.announcement
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const free = site.delivery.freeAbovePaise;
  const messages = custom.length
    ? custom
    : [
        free != null
          ? `Free insured delivery on orders above ₹${(free / 100).toLocaleString('en-IN')}`
          : site.delivery.promise,
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
    <div
      className="bg-accent text-center text-[12.5px] tracking-wide text-white"
      role="region"
      aria-label="Announcements"
    >
      <p key={i} className="fade-in mx-auto max-w-7xl truncate px-4 py-2">
        {messages[i % messages.length]}
      </p>
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
              <Link href={it.href} onClick={onClose} className="hover:text-accent">
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div
      className="fade-in absolute inset-x-0 top-full hidden border-t border-line bg-bg shadow-[0_24px_40px_-24px_rgb(7_14_77/0.18)] lg:block"
      onMouseLeave={onClose}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-5 gap-8 px-8 py-10">
        {col('Shop by farm', [
          ...site.farms.map((f) => ({ href: `/jewellery?farm=${encodeURIComponent(f.slug)}`, label: f.name })),
          { href: '/our-farm', label: 'Meet the farms' },
        ])}
        {col('Shop by carat', [
          { href: '/jewellery?carat_max=2', label: 'Under 2 ct' },
          { href: '/jewellery?carat_min=2&carat_max=3', label: '2–3 ct' },
          { href: '/jewellery?carat_min=3&carat_max=4', label: '3–4 ct' },
          { href: '/jewellery?carat_min=4&carat_max=5', label: '4–5 ct' },
          { href: '/jewellery?carat_min=5', label: '5 ct and above' },
        ])}
        {col('Shop by category', [
          { href: '/jewellery', label: 'All jewellery' },
          ...site.categories.map((c) => ({ href: `/jewellery/${c.slug}`, label: c.name })),
        ])}
        {col(
          'Collections',
          site.shop.collections.map((c) => ({ href: `/collections/${c.slug}`, label: c.name })),
        )}
        {col(
          'Shop by price',
          PRICE_BANDS.map((b) => ({ href: bandHref(b), label: b.label })),
        )}
      </div>
      <div className="border-t border-line bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-8 py-4 text-sm">
          <Link href="/gifts" onClick={onClose} className="text-accent hover:underline">
            Gifts, ready to wrap →
          </Link>
          <Link href="/pearl-guide" onClick={onClose} className="hover:text-accent">
            How to choose a pearl
          </Link>
          {site.storefront.consultationsEnabled && (
            <Link href="/book-consultation" onClick={onClose} className="hover:text-accent">
              Book a video consultation
            </Link>
          )}
          <Link href="/ring-finder" onClick={onClose} className="hover:text-accent">
            Ring Finder
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const site = useSite();
  const pathname = usePathname();
  const router = useRouter();
  const { me, cartCount, openCart } = useSession();
  const [menu, setMenu] = useState(false);
  const [mega, setMega] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMenu(false);
    setSearch(false);
    setMega(false);
  }, [pathname]);
  useEffect(() => {
    if (search) searchRef.current?.focus();
  }, [search]);


  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      {site.demo && <DemoRibbon />}
      <Announcement />
      <header
        className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur-md"
        onKeyDown={(e) => e.key === 'Escape' && setMega(false)}
      >
        {/* Row 1: phone · logo (centred) · search and icons — the classic jewellery-store bar. */}
        <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-3 lg:h-[76px] lg:px-8">
          <div className="flex items-center">
            <button
              className="-ml-1 flex h-11 w-11 items-center justify-center lg:hidden"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              aria-expanded={menu}
            >
              <MenuIcon />
            </button>
            <a href={`tel:${site.store.phone}`} className="hidden items-center gap-2 text-[13px] text-muted hover:text-accent lg:flex">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
              </svg>
              {site.store.phone}
            </a>
          </div>
          <Link href="/" className="flex items-center justify-center" aria-label="Sahyadri Pearls home">
            <img src="/brand/logo-220.webp" alt="Sahyadri Pearls" width={84} height={54} className="h-11 w-auto object-contain lg:h-[54px]" />
          </Link>
          <div className="flex items-center justify-end gap-1">
            <form
              role="search"
              className="mr-2 hidden h-10 w-56 items-center gap-2 rounded-full border border-line bg-white/70 px-4 focus-within:border-gold xl:flex"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <SearchIcon className="h-4 w-4 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search rings, earrings…"
                aria-label="Search"
                className="min-w-0 flex-1 bg-transparent text-[13px] focus:outline-none"
              />
            </form>
            <button
              className="flex h-11 w-11 items-center justify-center hover:text-accent xl:hidden"
              onClick={() => setSearch((x) => !x)}
              aria-label="Search"
              aria-expanded={search}
            >
              <SearchIcon />
            </button>
            <div className="hidden md:block">
              <LocationPicker />
            </div>
            <Link
              href={me ? '/account' : '/login'}
              aria-label={me ? 'My account' : 'Sign in or sign up'}
              className="flex h-11 w-11 items-center justify-center hover:text-accent"
            >
              <UserIcon />
            </Link>
            <button
              type="button"
              onClick={openCart}
              className="relative flex h-11 w-11 items-center justify-center hover:text-accent"
              aria-label={`Cart, ${cartCount} items`}
              aria-haspopup="dialog"
            >
              <BagIcon />
              {cartCount > 0 && (
                <span
                  key={cartCount}
                  className="pop absolute top-1.5 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[11px] text-ink"
                >
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
        {/* Row 2: the categories, centred. */}
        <nav aria-label="Main" className="hidden border-t border-line/70 lg:block">
          <ul className="mx-auto flex h-12 max-w-7xl items-center justify-center gap-9 px-8">
            {NAV.map((n) => (
              <li key={n.href} className="flex h-full items-center" onMouseEnter={() => setMega(!!n.mega)}>
                <Link
                  href={n.href}
                  aria-current={active(n.href) ? 'page' : undefined}
                  aria-expanded={n.mega ? mega : undefined}
                  className={cx(
                    'lux-track relative flex h-full items-center transition-colors hover:text-gold',
                    'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-gold after:transition-transform after:duration-300 hover:after:scale-x-100',
                    active(n.href) || (n.mega && mega) ? 'text-gold after:scale-x-100' : 'text-ink',
                  )}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {mega && <MegaMenu onClose={() => setMega(false)} />}
        {search && (
          <form
            role="search"
            className="border-t border-line bg-bg xl:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
              <SearchIcon className="text-muted" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name or SKU"
                aria-label="Search by name or SKU"
                className="min-h-11 flex-1 bg-transparent text-base focus:outline-none"
              />
              <button type="submit" className="min-h-11 bg-accent px-5 text-sm text-white">
                Search
              </button>
            </div>
          </form>
        )}
        {menu && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button
              className="absolute inset-0 bg-ink/30 backdrop-blur-sm"
              onClick={() => setMenu(false)}
              aria-label="Close menu"
            />
            <div className="fade-in relative flex h-full w-[86%] max-w-sm flex-col overflow-y-auto bg-bg p-6">
              <div className="mb-6 flex items-center justify-between">
                <img src="/brand/logo-220.webp" alt="Sahyadri Pearls" width={84} height={54} className="h-12 w-auto object-contain" />
                <button
                  className="flex h-11 w-11 items-center justify-center"
                  onClick={() => setMenu(false)}
                  aria-label="Close menu"
                >
                  <CloseIcon />
                </button>
              </div>
              <nav aria-label="Mobile" className="flex flex-col">
                <Link href="/jewellery" className="border-b border-line py-4 font-serif text-2xl">
                  Jewellery
                </Link>
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
              <div className="mt-6 border-t border-line pt-4">
                <LocationPicker compact />
              </div>
            </div>
          </div>
        )}
      </header>
      <CartDrawer />
    </>
  );
}
