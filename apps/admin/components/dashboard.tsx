'use client';
import { PageHeader } from './shell';
import { useMe } from '@/lib/session';

/** Phase 4 replaces this with the full dashboard (cards, monthly summaries, recent orders and enquiries). */
export function Dashboard() {
  const { data: me } = useMe();
  return <PageHeader title={`Welcome, ${me?.name ?? ''}`} description="Use the menu to manage the catalogue, network and content." />;
}
