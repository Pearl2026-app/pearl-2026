'use client';
import { Suspense, useState } from 'react';
import { cx } from '@sahyadri/ui';
import { ResourceList } from '@/components/resource';
import { RESOURCES } from '@/lib/resources';

const TABS = [
  ['whatsapp-numbers', 'Numbers'],
  ['routing-rules', 'Routing rules'],
  ['message-templates', 'Message templates'],
] as const;

export default function WhatsAppSettings() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('whatsapp-numbers');
  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('min-h-9 rounded-sm px-3 text-sm', tab === k ? 'bg-ink text-white' : 'bg-surface')}>{l}</button>
        ))}
      </div>
      <Suspense><ResourceList key={tab} def={RESOURCES[tab]!} /></Suspense>
    </div>
  );
}
