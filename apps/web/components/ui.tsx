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
    <div className="mb-9 flex items-end justify-between gap-6">
      <div className="ruled-heading min-w-0 flex-1">
        <div className="shrink-0">
          {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
          <h2 className="font-serif text-[32px] leading-tight text-ink lg:text-[40px]">{title}</h2>
        </div>
      </div>
      {action && <div className="shrink-0 pb-1">{action}</div>}
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
    <Link href={href} className={`lux-track inline-flex min-h-12 items-center justify-center px-7 transition-colors ${variant === 'text' ? 'px-0 no-underline hover:text-ink' : ''} ${cls} ${className}`}>
      {children}
    </Link>
  );
}
