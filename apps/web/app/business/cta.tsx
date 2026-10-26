'use client';
import Link from 'next/link';
import { useSession } from '@/components/session';

/** The portal's door: where it leads depends on who is standing at it. */
export function BusinessCta() {
  const { me, loaded } = useSession();
  const approved = me?.customer?.b2bStatus === 'APPROVED';
  const href = me ? '/account/business' : '/login?next=%2Faccount%2Fbusiness';
  const label = !loaded ? 'Business account' : approved ? 'Open your business catalogue' : me ? 'Apply for a business account' : 'Sign in to apply';
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <Link href={href} className="lux-track inline-flex min-h-12 items-center bg-accent px-8 text-white hover:bg-accent-hover">
        {label}
      </Link>
      {approved && <span className="text-sm text-muted">Your business account is approved — business prices are live for you.</span>}
    </div>
  );
}
