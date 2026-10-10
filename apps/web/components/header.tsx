'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@sahyadri/ui';
import { useSession } from './session';
import { BagIcon, CloseIcon, MenuIcon, PinIcon, SearchIcon, UserIcon } from './icons';
import { useSite } from './site-context';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/jewellery', label: 'Jewellery' },
  { href: '/our-farm', label: 'Our Farm' },
  { href: '/customized-jewellery', label: 'Customized Jewellery' },
  { href: '/contact', label: 'Contact' },
];

export function Header() {
  const site = useSite();
  const pathname = usePathname();
  const router = useRouter();
  const { me, cartCount } = useSession();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const [city, setCity] = useState<string>('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => setCity(document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] ?? ''), []);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
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
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 lg:h-20 lg:px-8">
        <button className="-ml-2 flex h-11 w-11 items-center justify-center lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu" aria-expanded={menu}>
          <MenuIcon />
        </button>
        <Link href="/" className="font-serif text-2xl tracking-wide text-accent lg:text-[28px]" aria-label="Sahyadri Pearls home">
          Sahyadri Pearls
        </Link>
        <nav aria-label="Main" className="ml-10 hidden items-center gap-7 lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} className={cx('text-[15px] transition-colors hover:text-accent', active(n.href) ? 'text-accent' : 'text-ink')}>
              {n.label}
            </Link>
          ))}
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
          <div className="fade-in relative flex h-full w-[86%] max-w-sm flex-col bg-bg p-6">
            <div className="mb-6 flex items-center justify-between">
              <span className="font-serif text-2xl text-accent">Sahyadri Pearls</span>
              <button className="flex h-11 w-11 items-center justify-center" onClick={() => setMenu(false)} aria-label="Close menu">
                <CloseIcon />
              </button>
            </div>
            <nav aria-label="Mobile" className="flex flex-col">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="border-b border-line py-4 font-serif text-2xl">
                  {n.label}
                </Link>
              ))}
              {site.categories.map((c) => (
                <Link key={c.slug} href={`/jewellery/${c.slug}`} className="py-2 text-muted">
                  {c.name}
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
  );
}
