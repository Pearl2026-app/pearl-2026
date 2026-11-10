import { get } from './server-api';
import type { ProductCard, Site } from './types';

/**
 * The Filigree Crown ring, as the opening scenes' glass card shows it: only what the catalogue says about the piece
 * (its finishes, its price or "Price on request") and a WhatsApp enquiry link from the store's settings.
 */
export async function crownCard() {
  const [sig, site] = await Promise.all([
    get<{ items: ProductCard[] }>(`/catalogue/products?${new URLSearchParams({ collection: 'signature', pageSize: '60' })}`, { revalidate: 60 }),
    get<Site>('/site', { revalidate: 300 }),
  ]);
  const signature = (sig?.items ?? []).filter((p) => p.collection?.slug === 'signature');
  const crown = signature.find((p) => p.sku === 'SP-JRP-01-1');
  const waNumber = site?.whatsapp.default?.replace(/\D/g, '');
  return {
    name: 'Filigree Crown Ring',
    href: crown ? `/product/${crown.slug}` : '/collections/signature',
    collection: 'The Signature Collection',
    text: 'An open filigree crown holds a single cultured pearl, so the light reaches it from every side.',
    finishes: [...new Set(signature.filter((p) => p.sku.startsWith('SP-JRP-01-')).map((p) => p.metal).filter((m): m is string => !!m))],
    priceLabel: crown && !crown.priceOnRequest && crown.pricePaise ? `₹${Math.round(crown.pricePaise / 100).toLocaleString('en-IN')}` : 'Price on request',
    enquireHref: waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hello, I would like to know more about the Filigree Crown Ring${crown ? ` (${crown.sku})` : ''}.`)}` : null,
  };
}
