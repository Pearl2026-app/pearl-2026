'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Dashboard } from '@/components/dashboard';
import { useMe } from '@/lib/session';

export default function HomePage() {
  const { data: me } = useMe();
  const router = useRouter();
  // Delivery partners work from their job list.
  useEffect(() => {
    if (me?.role === 'DELIVERY_PARTNER') router.replace('/delivery');
  }, [me, router]);
  if (!me || me.role === 'DELIVERY_PARTNER') return null;
  return <Dashboard />;
}
