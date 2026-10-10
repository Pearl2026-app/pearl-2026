import Link from 'next/link';
import type { ReactNode } from 'react';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 lg:px-8 ${className}`}>{children}</div>;
}

export function Breadcrumbs({ items }: { items: Array<{ name: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="py-4 text-xs text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((i, n) => (
          <li key={n} className="flex items-center gap-1">
            {i.href ? <Link href={i.href} className="hover:text-accent">{i.name}</Link> : <span aria-current="page" className="text-ink">{i.name}</span>}
            {n < items.length - 1 && <span aria-hidden>›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageTitle({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: ReactNode }) {
  return (
    <div className="fade-in max-w-3xl py-6 lg:py-10">
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h1 className="font-serif text-4xl leading-tight text-ink lg:text-[56px]">{title}</h1>
      {intro && <div className="mt-4 text-lg leading-relaxed text-muted">{intro}</div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="font-serif text-3xl text-ink lg:text-4xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function ButtonLink({ href, children, variant = 'solid', className = '' }: { href: string; children: ReactNode; variant?: 'solid' | 'outline' | 'text'; className?: string }) {
  const cls =
    variant === 'solid'
      ? 'bg-accent text-white hover:bg-accent-hover'
      : variant === 'outline'
        ? 'border border-ink text-ink hover:bg-ink hover:text-white'
        : 'text-accent underline-offset-4 hover:underline';
  return (
    <Link href={href} className={`inline-flex min-h-12 items-center justify-center px-6 text-[15px] transition-colors ${cls} ${className}`}>
      {children}
    </Link>
  );
}
