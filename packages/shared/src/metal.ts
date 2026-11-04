// Daily metal rates and products whose price follows them (client meeting, 4 Nov).

/** The rates head office enters each day (₹ per gram). */
export const METAL_RATE_KEYS = ['GOLD_24K', 'GOLD_22K', 'GOLD_18K', 'GOLD_14K', 'SILVER_999', 'SILVER_925', 'PLATINUM'] as const;
export type MetalRateKey = (typeof METAL_RATE_KEYS)[number];

export const METAL_RATE_LABEL: Record<MetalRateKey, string> = {
  GOLD_24K: 'Gold 24K',
  GOLD_22K: 'Gold 22K',
  GOLD_18K: 'Gold 18K',
  GOLD_14K: 'Gold 14K',
  SILVER_999: 'Silver 999',
  SILVER_925: 'Silver 92.5',
  PLATINUM: 'Platinum',
};

/** The metal choices on the product form; "Other" takes free text. */
export const PRODUCT_METALS = ['92.5 Silver', '18K Gold', '22K Gold', '14K Gold', 'Platinum', 'Other'] as const;

/** Which daily rate a product's metal follows, guessed from its metal text (null when it cannot be told). */
export function metalRateKeyFor(metal: string | null | undefined): MetalRateKey | null {
  const m = (metal ?? '').toLowerCase().replace(/\s+/g, ' ');
  if (!m) return null;
  if (/platinum/.test(m)) return 'PLATINUM';
  if (/silver|92\.?5|sterling/.test(m)) return /999|fine silver/.test(m) ? 'SILVER_999' : 'SILVER_925';
  if (/24 ?k|24 ?kt|999 gold/.test(m)) return 'GOLD_24K';
  if (/22 ?k|22 ?kt|916/.test(m)) return 'GOLD_22K';
  if (/18 ?k|18 ?kt|750/.test(m)) return 'GOLD_18K';
  if (/14 ?k|14 ?kt|585/.test(m)) return 'GOLD_14K';
  return null;
}

export interface MetalMargin {
  /** % added to the metal value */
  percent: number;
  /** Fixed ₹ per gram added to the metal value, in paise */
  perGramPaise: number;
}

export interface MetalPriceInput {
  /** Metal weight in grams (the product's net weight) */
  weightGrams: number;
  ratePerGramPaise: number;
  margin?: Partial<MetalMargin> | null;
  /** Making charge for the piece, paise */
  makingPaise?: number | null;
  /** Pearl cost for the piece, paise */
  pearlPaise?: number | null;
  /** Round the price up to a multiple of this (default ₹10) */
  roundToPaise?: number;
}

export interface MetalPriceResult {
  metalValuePaise: number;
  marginPaise: number;
  makingPaise: number;
  pearlPaise: number;
  pricePaise: number;
}

/**
 * price = weight × rate × (1 + margin %) + weight × margin ₹/g + making + pearl, rounded up to ₹10.
 * Weights carry up to 3 decimals, so the arithmetic is done in milligrams to stay in whole paise.
 */
export function metalRatePrice(input: MetalPriceInput): MetalPriceResult {
  if (!(input.weightGrams > 0)) throw new Error('weightGrams must be > 0');
  if (!Number.isInteger(input.ratePerGramPaise) || input.ratePerGramPaise <= 0) throw new Error('ratePerGramPaise must be a positive integer');
  const mg = Math.round(input.weightGrams * 1000);
  const metalValuePaise = Math.round((mg * input.ratePerGramPaise) / 1000);
  const pct = Math.max(0, input.margin?.percent ?? 0);
  const perGram = Math.max(0, input.margin?.perGramPaise ?? 0);
  const marginPaise = Math.round((metalValuePaise * pct) / 100) + Math.round((mg * perGram) / 1000);
  const makingPaise = Math.max(0, input.makingPaise ?? 0);
  const pearlPaise = Math.max(0, input.pearlPaise ?? 0);
  const step = input.roundToPaise ?? 1000;
  const pricePaise = Math.ceil((metalValuePaise + marginPaise + makingPaise + pearlPaise) / step) * step;
  return { metalValuePaise, marginPaise, makingPaise, pearlPaise, pricePaise };
}

/** Business price from the public price and the B2B discount setting (same rounding as new products). */
export function b2bPriceFrom(pricePaise: number, discountPercent: number): number {
  return Math.max(1, Math.round((pricePaise * (100 - discountPercent)) / 100 / 100) * 100);
}

/** Commission split of one sale's value (meeting of 4 Nov). Percentages apply to the pearl value only. */
export interface CommissionSplitInput {
  /** The sale value without GST, paise */
  saleValuePaise: number;
  /** Metal and making value of the piece for this sale (from the product's costs); 0 when not known */
  metalPaise: number;
  makingPaise: number;
  farmerPercent: number;
  traderPercent: number;
  partnerPercent: number;
}

export interface CommissionSplit {
  pearlValuePaise: number;
  metalValuePaise: number;
  makingPaise: number;
  farmerPaise: number;
  traderPearlPaise: number;
  partnerPaise: number;
  /** What the trader gets in all: their pearl share, the metal value and the making charge */
  traderTotalPaise: number;
}

export function commissionSplit(i: CommissionSplitInput): CommissionSplit {
  const sale = Math.max(0, i.saleValuePaise);
  // Metal and making come off the top (never more than the sale itself); the rest is the pearl value.
  const metalValuePaise = Math.min(Math.max(0, i.metalPaise), sale);
  const makingPaise = Math.min(Math.max(0, i.makingPaise), sale - metalValuePaise);
  const pearlValuePaise = sale - metalValuePaise - makingPaise;
  const farmerPaise = Math.round((pearlValuePaise * i.farmerPercent) / 100);
  const partnerPaise = Math.round((pearlValuePaise * i.partnerPercent) / 100);
  // The trader takes the remainder of their share, so rounding never loses a paisa when the shares add to 100.
  const traderPearlPaise = i.farmerPercent + i.traderPercent + i.partnerPercent === 100 ? pearlValuePaise - farmerPaise - partnerPaise : Math.round((pearlValuePaise * i.traderPercent) / 100);
  return { pearlValuePaise, metalValuePaise, makingPaise, farmerPaise, traderPearlPaise, partnerPaise, traderTotalPaise: traderPearlPaise + metalValuePaise + makingPaise };
}
