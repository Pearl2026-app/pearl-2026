// Money maths. All amounts are integer paise; rates are integer basis points (300 = 3%).
// Catalogue prices are GST-inclusive (DECISIONS D9). Everything here is pure and deterministic.

export const PAISE_PER_RUPEE = 100;
export const BP = 10_000;

export function assertPaise(n: number, label = 'amount'): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${label} must be a non-negative integer number of paise`);
}

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * PAISE_PER_RUPEE);
export const paiseToRupees = (paise: number): number => paise / PAISE_PER_RUPEE;

/** ₹1,23,456.78 (Indian digit grouping). Drops ".00" when `compact` is true. */
export function formatINR(paise: number, opts: { compact?: boolean } = {}): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const s = String(rupees);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  const frac = opts.compact && p === 0 ? '' : '.' + String(p).padStart(2, '0');
  return `${neg ? '-' : ''}₹${grouped}${frac}`;
}

/** Integer division rounding half up, for non-negative numerator and positive denominator. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('denominator must be positive');
  if (numerator < 0) return -divRoundHalfUp(-numerator, denominator);
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Percentage of an amount in basis points, rounded half up. */
export const percentOf = (amountPaise: number, bp: number): number => divRoundHalfUp(amountPaise * bp, BP);

/** Split a GST-inclusive amount into taxable value and GST. taxable + gst === inclusive, always. */
export function splitInclusive(inclusivePaise: number, rateBp: number): { taxablePaise: number; gstPaise: number } {
  const taxablePaise = divRoundHalfUp(inclusivePaise * BP, BP + rateBp);
  return { taxablePaise, gstPaise: inclusivePaise - taxablePaise };
}

/** GST added on top of an exclusive amount (used for customized quotes). */
export const gstOnExclusive = (exclusivePaise: number, rateBp: number): number => percentOf(exclusivePaise, rateBp);

/** Intra-state → CGST + SGST (half each); inter-state → IGST. CGST takes the smaller half. */
export function splitGst(gstPaise: number, interState: boolean): { cgstPaise: number; sgstPaise: number; igstPaise: number } {
  if (interState) return { cgstPaise: 0, sgstPaise: 0, igstPaise: gstPaise };
  const cgstPaise = Math.floor(gstPaise / 2);
  return { cgstPaise, sgstPaise: gstPaise - cgstPaise, igstPaise: 0 };
}

/**
 * Allocate `total` across `weights` proportionally, so the parts are integers that add up to exactly `total`
 * (largest remainder method; ties go to the earlier index).
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map((r) => Math.floor(r));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    parts[i] += 1;
    remainder -= 1;
  }
  return parts;
}
