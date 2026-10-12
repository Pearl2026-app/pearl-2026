import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { DEFAULT_ENQUIRY_MESSAGE, DEFAULT_GENERAL_ENQUIRY_MESSAGE, renderTemplate, waMeUrl } from '@sahyadri/shared';
import { client } from './api';

// Rule 3, same as the website: the enquiry is saved before WhatsApp opens. If saving is slow or fails,
// WhatsApp still opens with a reference made on the phone, and the save is retried later.

export interface Enquiry {
  type: 'PRODUCT' | 'CUSTOMIZED' | 'RING_FINDER' | 'CONTACT';
  productId?: string;
  productName?: string;
  sku?: string;
  message?: string;
  citySlug?: string;
}
interface Pending extends Enquiry {
  clientId: string;
  fallbackReference: string;
  attempts: number;
}

const KEY = 'sp.pendingEnquiries';
const SAVE_TIMEOUT_MS = 2000;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomRef = () => 'ENQ-W-' + Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => ((c === 'x' ? Math.random() * 16 : (Math.random() * 4) | 8) | 0).toString(16));

const load = async (): Promise<Pending[]> => {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]') as Pending[];
  } catch {
    return [];
  }
};
const save = (l: Pending[]) => AsyncStorage.setItem(KEY, JSON.stringify(l.slice(-50)));

const send = (p: Pending, withFallback: boolean) => {
  const { productName: _n, sku: _s, attempts: _a, fallbackReference, ...rest } = p;
  return client.shop.enquire<{ reference: string; whatsappUrl: string }>({ ...rest, pageUrl: 'app', ...(withFallback ? { fallbackReference } : {}) });
};

export async function flushPendingEnquiries() {
  const left: Pending[] = [];
  for (const p of await load()) {
    try {
      await send(p, true);
    } catch {
      if (p.attempts < 50) left.push({ ...p, attempts: p.attempts + 1 });
    }
  }
  await save(left);
}

export async function enquireOnWhatsApp(e: Enquiry, fallbackNumber: string): Promise<string> {
  const p: Pending = { ...e, clientId: uuid(), fallbackReference: randomRef(), attempts: 0 };
  let url: string;
  let reference: string;
  try {
    const r = await Promise.race([send(p, false), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('slow')), SAVE_TIMEOUT_MS))]);
    url = r.whatsappUrl;
    reference = r.reference;
  } catch {
    await save([...(await load()), p]);
    reference = p.fallbackReference;
    const text = renderTemplate(e.type === 'PRODUCT' ? DEFAULT_ENQUIRY_MESSAGE : DEFAULT_GENERAL_ENQUIRY_MESSAGE, { productName: e.productName, sku: e.sku, reference, message: e.message ?? '' }).trim();
    url = waMeUrl(fallbackNumber, text);
    setTimeout(() => void flushPendingEnquiries(), 3000);
  }
  await Linking.openURL(url);
  return reference;
}
