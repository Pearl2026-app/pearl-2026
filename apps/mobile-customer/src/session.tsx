import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@sahyadri/api-client';
import { client, onSignedOut } from './api';
import { registerForPush } from './push';
import type { Cart } from './types';

interface Session {
  me: Me | null;
  ready: boolean;
  cartCount: number;
  setMe: (m: Me | null) => void;
  refreshCart: () => Promise<Cart | null>;
  setCartCount: (n: number) => void;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = useCallback(async () => {
    try {
      const c = await client.shop.cart<Cart>();
      setCartCount(c.count);
      return c;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    onSignedOut(() => setMe(null));
    (async () => {
      try {
        if (await client.isSignedIn()) setMe(await client.auth.me());
      } catch {
        /* offline at start: browse what loads */
      } finally {
        setReady(true);
      }
      void refreshCart();
    })();
  }, [refreshCart]);

  useEffect(() => {
    if (me?.id) void registerForPush();
  }, [me?.id]);

  const signOut = useCallback(async () => {
    await client.auth.signOut();
    setMe(null);
    void refreshCart();
  }, [refreshCart]);

  return <Ctx.Provider value={{ me, ready, cartCount, setMe, refreshCart, setCartCount, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}
