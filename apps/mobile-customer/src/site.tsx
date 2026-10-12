import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { client } from './api';
import type { Site } from './types';

const Ctx = createContext<Site | null>(null);

/** Shop settings (cities, WhatsApp number, delivery promise). Kept on the phone so the app opens offline. */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<Site | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem('cache:site').then((s) => s && setSite((cur) => cur ?? (JSON.parse(s) as Site)));
    client.shop
      .site<Site>()
      .then((s) => {
        setSite(s);
        void AsyncStorage.setItem('cache:site', JSON.stringify(s));
      })
      .catch(() => undefined);
  }, []);
  return <Ctx.Provider value={site}>{children}</Ctx.Provider>;
}
export const useSite = () => useContext(Ctx);
