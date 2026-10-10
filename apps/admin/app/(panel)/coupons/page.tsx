'use client';
import { Suspense } from 'react';
import { ResourceList } from '@/components/resource';
import { RESOURCES } from '@/lib/resources';

export default function CouponsPage() {
  return (
    <Suspense>
      <ResourceList def={RESOURCES.coupons!} />
    </Suspense>
  );
}
