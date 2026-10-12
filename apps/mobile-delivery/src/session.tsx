import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@sahyadri/api-client';
import { client, onSignedOut } from './api';
import { registerForPush } from './push';

interface Session {
  me: Me | null;
  ready: boolean;
  setMe: (m: Me | null) => void;
  signOut: () => Promise<void>;
}
const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSignedOut(() => {
      setMe(null);
      router.replace('/login');
    });
    (async () => {
      try {
        if (await client.isSignedIn()) setMe(await client.auth.me());
      } catch {
        // Offline at start: keep the saved sign-in; screens show the offline state.
        if (await client.isSignedIn()) setMe({ id: '', role: 'DELIVERY_PARTNER', name: '', phone: null, email: null });
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (me?.id) void registerForPush();
  }, [me?.id]);

  const signOut = useCallback(async () => {
    await client.auth.signOut();
    setMe(null);
    router.replace('/login');
  }, []);

  return <Ctx.Provider value={{ me, ready, setMe, signOut }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}
