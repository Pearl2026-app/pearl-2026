'use client';
import { notFound, useParams } from 'next/navigation';
import { ResourceForm } from '@/components/resource';
import { RESOURCES } from '@/lib/resources';

export default function ResourceEditPage() {
  const { resource, id } = useParams<{ resource: string; id: string }>();
  const def = RESOURCES[resource];
  if (!def) notFound();
  return <ResourceForm def={def} id={id} />;
}
