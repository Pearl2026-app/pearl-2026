'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, mayHaveSession } from '@/lib/api';
import { flushPendingEnquiries } from '@/lib/enquiry';

export interface Me {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  customer: { id: string; referralCode: string; cityId: string | null; preferredPaymentMethod: string | null } | null;
}

interface Session {
  me: Me | null;
  loaded: boolean;
  cartCount: number;
  refresh: () => Promise<void>;
  setCartCount: (n: number) => void;
}

const Ctx = createContext<Session>({ me: null, loaded: false, cartCount: 0, refresh: async () => undefined, setCartCount: () => undefined });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const refresh = useCallback(async () => {
    const [m, c] = await Promise.all([
      mayHaveSession() ? api<Me>('/me').catch(() => null) : Promise.resolve(null),
      api<{ count: number }>('/cart/count').catch(() => ({ count: 0 })),
    ]);
    setMe(m && m.role === 'CUSTOMER' ? m : null);
    setCartCount(c.count);
    setLoaded(true);
  }, []);
  useEffect(() => {
    void refresh();
    void flushPendingEnquiries();
  }, [refresh]);
  return <Ctx.Provider value={{ me, loaded, cartCount, refresh, setCartCount }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
