// WhatsApp click-to-chat helpers. Needs no API approval, so it is the fallback for every WhatsApp feature.

/** Digits only, with India's country code added to a bare 10-digit number. */
export function waDigits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  return d;
}

export function waMeUrl(phone: string, text?: string): string {
  const base = `https://wa.me/${waDigits(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Fill {{placeholders}}. Unknown placeholders are left empty, never shown raw. */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  });
}

export const DEFAULT_ENQUIRY_MESSAGE =
  'Hello Sahyadri Pearls, I am interested in {{productName}} (SKU {{sku}}). My enquiry reference is {{reference}}.';
export const DEFAULT_GENERAL_ENQUIRY_MESSAGE = 'Hello Sahyadri Pearls, my enquiry reference is {{reference}}. {{message}}';

/** Wishlist shortlist to share with family. */
export function wishlistShareText(items: { name: string; url: string }[]): string {
  return ['My Sahyadri Pearls shortlist:', ...items.map((i, n) => `${n + 1}. ${i.name} – ${i.url}`)].join('\n');
}
