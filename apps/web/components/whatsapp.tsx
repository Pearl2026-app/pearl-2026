'use client';
import { useState } from 'react';
import { cx } from '@sahyadri/ui';
import { enquireOnWhatsApp, type EnquiryPayload } from '@/lib/enquiry';
import { WhatsAppIcon } from './icons';
import { useSite, useWhatsAppNumber } from './site-context';

function citySlug() {
  return typeof document === 'undefined' ? undefined : document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1] || undefined;
}

/** Saves the enquiry, then opens WhatsApp with name, SKU and reference (rule 3). */
export function EnquireButton({ enquiry, label = 'Enquire on WhatsApp', className, variant = 'solid' }: { enquiry: EnquiryPayload; label?: string; className?: string; variant?: 'solid' | 'outline' }) {
  const number = useWhatsAppNumber();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await enquireOnWhatsApp({ ...enquiry, citySlug: enquiry.citySlug ?? citySlug() }, { whatsapp: number });
        } finally {
          setTimeout(() => setBusy(false), 800);
        }
      }}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 px-5 text-[15px] font-medium transition-opacity disabled:opacity-70',
        variant === 'solid' ? 'bg-whatsapp text-white hover:opacity-90' : 'border border-whatsapp text-whatsapp hover:bg-whatsapp hover:text-white',
        className,
      )}
    >
      <WhatsAppIcon width={20} height={20} />
      {busy ? 'Opening WhatsApp…' : label}
    </button>
  );
}

/** Floating WhatsApp button on every page. A general enquiry is recorded before WhatsApp opens. */
export function WhatsAppFloat() {
  const number = useWhatsAppNumber();
  useSite();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="Chat with us on WhatsApp"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await enquireOnWhatsApp({ type: 'CONTACT', citySlug: citySlug(), message: 'I have a question.' }, { whatsapp: number }).catch(() => undefined);
        } finally {
          setTimeout(() => setBusy(false), 800);
        }
      }}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-white shadow-lg transition-transform hover:scale-105 lg:bottom-6"
    >
      <WhatsAppIcon width={28} height={28} />
    </button>
  );
}
