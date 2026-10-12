import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createClient, type KeyValueStore } from '@sahyadri/api-client';

/** Tokens live in the phone's secure storage (Keychain / Keystore), never in plain storage. */
const secure: KeyValueStore = {
  get: (k) => SecureStore.getItemAsync(k),
  set: async (k, v) => {
    if (v === null) await SecureStore.deleteItemAsync(k);
    else await SecureStore.setItemAsync(k, v);
  },
};

export const API_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ?? 'http://localhost:4000/api/v1';

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
