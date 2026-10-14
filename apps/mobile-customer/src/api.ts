import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createClient, type KeyValueStore } from '@sahyadri/api-client';

/** Phones keep tokens in the Keychain / Keystore. The web preview (development only) has no secure store. */
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

const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string; webUrl?: string };
/** The browser preview served by the website itself (presentation site): talk to the site it was opened from. */
const sameOrigin = Platform.OS === 'web' && process.env.EXPO_PUBLIC_SAME_ORIGIN === '1' && typeof window !== 'undefined';
export const API_URL = sameOrigin ? `${window.location.origin}/api/v1` : (extra.apiUrl ?? 'http://localhost:4000/api/v1');
export const WEB_URL = (sameOrigin ? window.location.origin : (extra.webUrl ?? 'http://localhost:3000')).replace(/\/+$/, '');
export const WEB_HOST = new URL(WEB_URL).host;
const API_ORIGIN = new URL(API_URL).origin;

/** Image paths from the API are relative (/media/…); the app needs full addresses. */
export const img = (u?: string | null) => (!u ? undefined : /^https?:\/\//.test(u) ? u : `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`);

let signedOutHandler: () => void = () => undefined;
export const onSignedOut = (fn: () => void) => {
  signedOutHandler = fn;
};

export const client = createClient({
  baseUrl: API_URL,
  store: secure,
  client: `app-customer/${Constants.expoConfig?.version ?? '1.0.0'}`,
  onSignedOut: () => signedOutHandler(),
});
