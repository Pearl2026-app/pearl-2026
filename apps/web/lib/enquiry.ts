'use client';
// Rule 3: an enquiry is saved before WhatsApp opens. If the save fails or is slow, WhatsApp still opens
// (with a reference made here) and the save is retried in the background until it succeeds.
import { waMeUrl, renderTemplate, DEFAULT_ENQUIRY_MESSAGE, DEFAULT_GENERAL_ENQUIRY_MESSAGE } from '@sahyadri/shared';
import { api } from './api';

export interface EnquiryPayload {
  type: 'PRODUCT' | 'CUSTOMIZED' | 'BULK' | 'RING_FINDER' | 'CONTACT';
  productId?: string;
  productName?: string;
  sku?: string;
  citySlug?: string;
  name?: string;
  phone?: string;
  email?: string;
  message?: string;
  payload?: Record<string, unknown>;
}

interface Pending extends EnquiryPayload {
  clientId: string;
  fallbackReference: string;
  pageUrl: string;
  source?: string;
  utm?: Record<string, string>;
  attempts: number;
}

const KEY = 'sp_pending_enquiries';
const SAVE_TIMEOUT_MS = 1500;

function load(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
function store(list: Pending[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {}
}

export function attribution(): { source?: string; utm?: Record<string, string> } {
  try {
    const saved = JSON.parse(sessionStorage.getItem('sp_attr') ?? 'null');
    if (saved) return saved;
    const p = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) if (p.get(k)) utm[k] = p.get(k)!.slice(0, 100);
    const ref = document.referrer ? new URL(document.referrer).hostname : '';
    const source = utm.utm_source ?? (ref.includes('instagram') ? 'instagram' : ref.includes('facebook') ? 'facebook' : ref.includes('google') ? 'google' : ref && !ref.includes(location.hostname) ? ref : 'direct');
    const a = { source, utm: Object.keys(utm).length ? utm : undefined };
    sessionStorage.setItem('sp_attr', JSON.stringify(a));
    return a;
  } catch {
    return {};
  }
}

const randomRef = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return 'ENQ-W-' + Array.from(a, (x) => chars[x % chars.length]).join('');
};

async function send(p: Pending, includeFallback: boolean) {
  const { productName: _n, sku: _s, attempts: _a, fallbackReference, ...rest } = p;
  const body = includeFallback ? { ...rest, fallbackReference } : rest;
  return api<{ reference: string; whatsappUrl: string }>('/enquiries', { method: 'POST', json: body, timeoutMs: SAVE_TIMEOUT_MS * 4 });
}

/** Retry anything that did not save earlier. Called on every page load. */
export async function flushPendingEnquiries() {
  const list = load();
  if (!list.length) return;
  const left: Pending[] = [];
  for (const p of list) {
    try {
      await send(p, true);
    } catch {
      if (p.attempts < 50) left.push({ ...p, attempts: p.attempts + 1 });
    }
  }
  store(left);
}

/**
 * Save the enquiry, then open WhatsApp. A blank tab is opened synchronously (so pop-up blockers allow it)
 * and pointed at WhatsApp once we have the reference.
 */
export async function enquireOnWhatsApp(e: EnquiryPayload, fallback: { whatsapp: string }): Promise<{ reference: string; saved: boolean }> {
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const win = mobile ? null : window.open('', '_blank');
  const p: Pending = { ...e, clientId: crypto.randomUUID(), fallbackReference: randomRef(), pageUrl: location.pathname, ...attribution(), attempts: 0 };
  let url: string;
  let reference: string;
  let saved = false;
  try {
    const r = await Promise.race([
      send(p, false),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('slow')), SAVE_TIMEOUT_MS)),
    ]);
    url = r.whatsappUrl;
    reference = r.reference;
    saved = true;
  } catch {
    // Not saved (yet): open WhatsApp anyway with our own reference and keep retrying.
    store([...load(), p]);
    reference = p.fallbackReference;
    const text = renderTemplate(e.type === 'PRODUCT' ? DEFAULT_ENQUIRY_MESSAGE : DEFAULT_GENERAL_ENQUIRY_MESSAGE, {
      productName: e.productName,
      sku: e.sku,
      reference,
      message: e.message ?? '',
    }).trim();
    url = waMeUrl(fallback.whatsapp, text);
    setTimeout(() => void flushPendingEnquiries(), 3000);
  }
  if (win) win.location.href = url;
  else window.location.href = url;
  return { reference, saved };
}
