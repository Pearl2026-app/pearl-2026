'use client';
import { notFound, useParams } from 'next/navigation';
import { Suspense } from 'react';
import { ResourceList } from '@/components/resource';
import { RESOURCES } from '@/lib/resources';

export default function ResourceListPage() {
  const { resource } = useParams<{ resource: string }>();
  const def = RESOURCES[resource];
  if (!def) notFound();
  return (
    <Suspense>
      <ResourceList def={def} />
    </Suspense>
  );
}
