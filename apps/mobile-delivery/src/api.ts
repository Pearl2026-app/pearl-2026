import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient, type KeyValueStore } from '@sahyadri/api-client';

/** Tokens live in the phone's secure storage (Keychain / Keystore). The browser preview has none, so it uses page storage. */
const secure: KeyValueStore =
  Platform.OS === 'web'
    ? {
        get: async (k) => globalThis.localStorage?.getItem(k) ?? null,
        set: async (k, v) => (v === null ? globalThis.localStorage?.removeItem(k) : globalThis.localStorage?.setItem(k, v)),
      }
    : {
        get: (k) => SecureStore.getItemAsync(k),
        set: async (k, v) => {
          if (v === null) await SecureStore.deleteItemAsync(k);
          else await SecureStore.setItemAsync(k, v);
        },
      };

/** The browser preview served by the website itself (presentation site): talk to the site it was opened from. */
const sameOrigin = Platform.OS === 'web' && process.env.EXPO_PUBLIC_SAME_ORIGIN === '1' && typeof window !== 'undefined';
export const API_URL: string = sameOrigin ? `${window.location.origin}/api/v1` : ((Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:4000/api/v1');

let signedOutHandler: () => void = () => undefined;
export const onSignedOut = (fn: () => void) => {
  signedOutHandler = fn;
};

export const client = createClient({
  baseUrl: API_URL,
  store: secure,
  client: `app-delivery/${Constants.expoConfig?.version ?? '1.0.0'}`,
  onSignedOut: () => signedOutHandler(),
});
