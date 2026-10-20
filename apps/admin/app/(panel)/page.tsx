'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card } from '@sahyadri/ui';
import { Dashboard } from '@/components/dashboard';
import { IconTile } from '@/components/shell';
import { NAV } from '@/lib/nav';
import { useMe } from '@/lib/session';

export default function HomePage() {
  const { data: me } = useMe();
  const router = useRouter();
  // Delivery partners work from their job list.
  useEffect(() => {
    if (me?.role === 'DELIVERY_PARTNER') router.replace('/delivery');
  }, [me, router]);
  if (!me || me.role === 'DELIVERY_PARTNER') return null;
  if (me.permissions.DASHBOARD?.includes('view')) return <Dashboard />;

  // No dashboard right: a plain welcome with shortcuts to what this login can open.
  const items = NAV.flatMap((g) => g.items).filter((i) => i.href !== '/' && (!i.roles || i.roles.includes(me.role)) && (!i.module || me.permissions[i.module]?.includes(i.action ?? 'view')));
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold">Welcome, {me.name}</h1>
      <p className="mb-6 text-sm text-muted">Choose where to start.</p>
      {items.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((i) => (
            <Link key={i.href} href={i.href}>
              <Card className="flex items-center gap-3 hover:border-accent">
                <IconTile href={i.href} />
                <span className="font-medium">{i.label}</span>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm">This login has no sections yet. Ask the Super Admin to give it the rights it needs.</p>
      )}
    </div>
  );
}
