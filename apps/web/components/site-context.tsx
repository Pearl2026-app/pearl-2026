'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Site } from '@/lib/types';

const Ctx = createContext<Site | null>(null);
export const SiteProvider = ({ site, children }: { site: Site; children: ReactNode }) => <Ctx.Provider value={site}>{children}</Ctx.Provider>;
export function useSite(): Site {
  const s = useContext(Ctx);
  if (!s) throw new Error('SiteProvider missing');
  return s;
}

/** WhatsApp number for the visitor's city (falls back to the main number). */
export function useWhatsAppNumber(): string {
  const site = useSite();
  if (typeof document !== 'undefined') {
    const slug = document.cookie.match(/(?:^|; )sp_city=([^;]+)/)?.[1];
    const city = site.cities.find((c) => c.slug === slug);
    if (city && site.whatsapp.byCity[city.id]) return site.whatsapp.byCity[city.id]!;
  }
  return site.whatsapp.default;
}
