// Cart / order totals and coupon rules. The API is the only caller that decides money (rule 5);
// interfaces may call these for display, but the server recomputes everything.
import { allocate, assertPaise, divRoundHalfUp, percentOf, splitInclusive } from './money';

export interface PricingLine {
  productId: string;
  categoryId: string;
  /** GST-inclusive unit price in paise */
  unitPricePaise: number;
  quantity: number;
  gstRateBp: number;
}

export interface CouponRule {
  code: string;
  discountType: 'PERCENT' | 'FLAT';
  /** PERCENT: basis points. FLAT: paise. */
  discountValue: number;
  minOrderPaise: number;
  maxDiscountPaise: number | null;
  firstOrderOnly: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  isActive: boolean;
  categoryIds: string[];
  productIds: string[];
}

export interface CouponContext {
  now: Date;
  /** Times this coupon has been redeemed in total */
  totalRedemptions: number;
  /** Times this customer has redeemed it (0 for an unknown guest) */
  customerRedemptions: number;
  /** Whether the customer has any earlier order that was not cancelled/failed */
  hasPreviousOrders: boolean;
}

export type CouponRejection =
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'USAGE_LIMIT_REACHED'
  | 'CUSTOMER_LIMIT_REACHED'
  | 'FIRST_ORDER_ONLY'
  | 'MIN_ORDER_NOT_MET'
  | 'NO_ELIGIBLE_ITEMS';

export const COUPON_REJECTION_MESSAGE: Record<CouponRejection, string> = {
  INACTIVE: 'This coupon is not active.',
  NOT_STARTED: 'This coupon is not valid yet.',
  EXPIRED: 'This coupon has expired.',
  USAGE_LIMIT_REACHED: 'This coupon has been fully used.',
  CUSTOMER_LIMIT_REACHED: 'You have already used this coupon.',
  FIRST_ORDER_ONLY: 'This coupon is only for your first order.',
  MIN_ORDER_NOT_MET: 'Your order is below the minimum value for this coupon.',
  NO_ELIGIBLE_ITEMS: 'This coupon does not apply to the items in your cart.',
};

export type CouponResult =
  | { ok: true; discountPaise: number; perLineDiscountPaise: number[] }
  | { ok: false; reason: CouponRejection; message: string };

const lineGross = (l: PricingLine) => l.unitPricePaise * l.quantity;

function isEligible(rule: CouponRule, l: PricingLine): boolean {
  const restricted = rule.categoryIds.length > 0 || rule.productIds.length > 0;
  if (!restricted) return true;
  return rule.productIds.includes(l.productId) || rule.categoryIds.includes(l.categoryId);
}

const reject = (reason: CouponRejection): CouponResult => ({ ok: false, reason, message: COUPON_REJECTION_MESSAGE[reason] });

/** Evaluate a coupon against cart lines. Discount is taken off GST-inclusive line amounts. */
export function evaluateCoupon(rule: CouponRule, lines: PricingLine[], ctx: CouponContext): CouponResult {
  if (!rule.isActive) return reject('INACTIVE');
  const now = ctx.now.getTime();
  if (rule.startsAt && now < new Date(rule.startsAt).getTime()) return reject('NOT_STARTED');
  if (rule.endsAt && now > new Date(rule.endsAt).getTime()) return reject('EXPIRED');
  if (rule.usageLimit != null && ctx.totalRedemptions >= rule.usageLimit) return reject('USAGE_LIMIT_REACHED');
  if (rule.perCustomerLimit != null && ctx.customerRedemptions >= rule.perCustomerLimit)
    return reject('CUSTOMER_LIMIT_REACHED');
  if (rule.firstOrderOnly && ctx.hasPreviousOrders) return reject('FIRST_ORDER_ONLY');

  const subtotal = lines.reduce((s, l) => s + lineGross(l), 0);
  if (subtotal < rule.minOrderPaise) return reject('MIN_ORDER_NOT_MET');

  const eligibleWeights = lines.map((l) => (isEligible(rule, l) ? lineGross(l) : 0));
  const eligibleTotal = eligibleWeights.reduce((a, b) => a + b, 0);
  if (eligibleTotal === 0) return reject('NO_ELIGIBLE_ITEMS');

  let discount = rule.discountType === 'PERCENT' ? percentOf(eligibleTotal, rule.discountValue) : rule.discountValue;
  if (rule.maxDiscountPaise != null) discount = Math.min(discount, rule.maxDiscountPaise);
  discount = Math.max(0, Math.min(discount, eligibleTotal));

  return { ok: true, discountPaise: discount, perLineDiscountPaise: allocate(discount, eligibleWeights) };
}

export interface DeliveryRule {
  /** Flat charge (GST-inclusive) when the order is below the free threshold */
  chargePaise: number;
  /** Orders at or above this (after discount) ship free; null = never free */
  freeAbovePaise: number | null;
  /** City-specific charge override */
  cityChargePaise?: number | null;
}

export interface ComputedLine extends PricingLine {
  grossPaise: number;
  discountPaise: number;
  netPaise: number;
  taxablePaise: number;
  gstPaise: number;
}

export interface Totals {
  lines: ComputedLine[];
  subtotalPaise: number;
  discountPaise: number;
  deliveryPaise: number;
  /** Taxable value of goods + delivery */
  taxablePaise: number;
  /** GST on goods + delivery */
  gstPaise: number;
  totalPaise: number;
}

/**
 * Compute order totals.
 * - Line amounts are GST-inclusive; GST is backed out of each line after discount.
 * - Delivery is a GST-inclusive composite supply, taxed at the highest line rate (DECISIONS D32).
 * - Invariant: taxablePaise + gstPaise === totalPaise.
 */
export function computeTotals(
  lines: PricingLine[],
  opts: { lineDiscountsPaise?: number[]; delivery?: DeliveryRule } = {},
): Totals {
  for (const l of lines) {
    assertPaise(l.unitPricePaise, 'unitPricePaise');
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error('quantity must be a positive integer');
    if (!Number.isInteger(l.gstRateBp) || l.gstRateBp < 0) throw new Error('gstRateBp must be a non-negative integer');
  }
  const discounts = opts.lineDiscountsPaise ?? lines.map(() => 0);
  const computed: ComputedLine[] = lines.map((l, i) => {
    const grossPaise = lineGross(l);
    const discountPaise = Math.min(discounts[i] ?? 0, grossPaise);
    const netPaise = grossPaise - discountPaise;
    const { taxablePaise, gstPaise } = splitInclusive(netPaise, l.gstRateBp);
    return { ...l, grossPaise, discountPaise, netPaise, taxablePaise, gstPaise };
  });

  const subtotalPaise = computed.reduce((s, l) => s + l.grossPaise, 0);
  const discountPaise = computed.reduce((s, l) => s + l.discountPaise, 0);
  const netGoods = subtotalPaise - discountPaise;

  let deliveryPaise = 0;
  if (opts.delivery && computed.length > 0) {
    const d = opts.delivery;
    const free = d.freeAbovePaise != null && netGoods >= d.freeAbovePaise;
    deliveryPaise = free ? 0 : (d.cityChargePaise ?? d.chargePaise);
  }
  const deliveryRate = computed.reduce((m, l) => Math.max(m, l.gstRateBp), 0);
  const deliverySplit = splitInclusive(deliveryPaise, deliveryRate);

  const taxablePaise = computed.reduce((s, l) => s + l.taxablePaise, 0) + deliverySplit.taxablePaise;
  const gstPaise = computed.reduce((s, l) => s + l.gstPaise, 0) + deliverySplit.gstPaise;
  const totalPaise = netGoods + deliveryPaise;
  return { lines: computed, subtotalPaise, discountPaise, deliveryPaise, taxablePaise, gstPaise, totalPaise };
}

// ── Pearl price calculator ─────────────────────────────────────────

export interface PriceCalcInput {
  caratWeight: number;
  ratePerCaratPaise: number;
  metalCostPaise?: number;
  labourCostPaise?: number;
  marginBp: number;
  minMarginPaise?: number | null;
  gstRateBp: number;
}

export interface PriceCalcResult {
  pearlCostPaise: number;
  metalCostPaise: number;
  labourCostPaise: number;
  costPaise: number;
  marginPaise: number;
  /** Suggested price before GST, rounded up to the next ₹100 */
  exclusivePaise: number;
  gstPaise: number;
  /** Suggested GST-inclusive catalogue price, rounded up to the next ₹100 */
  suggestedPricePaise: number;
}

/** Round up to a whole number of `step` paise (default ₹100). */
export const roundUpTo = (paise: number, step = 10_000): number => Math.ceil(paise / step) * step;

export function suggestPrice(input: PriceCalcInput): PriceCalcResult {
  if (!(input.caratWeight >= 0)) throw new Error('caratWeight must be >= 0');
  // carat has up to 3 decimals; compute in thousandths of a carat to stay in integers
  const milliCarat = Math.round(input.caratWeight * 1000);
  const pearlCostPaise = divRoundHalfUp(milliCarat * input.ratePerCaratPaise, 1000);
  const metalCostPaise = input.metalCostPaise ?? 0;
  const labourCostPaise = input.labourCostPaise ?? 0;
  const costPaise = pearlCostPaise + metalCostPaise + labourCostPaise;
  const marginPaise = Math.max(percentOf(costPaise, input.marginBp), input.minMarginPaise ?? 0);
  const exclusive = costPaise + marginPaise;
  const suggestedPricePaise = roundUpTo(exclusive + percentOf(exclusive, input.gstRateBp));
  const split = splitInclusive(suggestedPricePaise, input.gstRateBp);
  return {
    pearlCostPaise,
    metalCostPaise,
    labourCostPaise,
    costPaise,
    marginPaise,
    exclusivePaise: split.taxablePaise,
    gstPaise: split.gstPaise,
    suggestedPricePaise,
  };
}

/** Customized-order quote: cost breakdown + margin → quoted price (GST added on top). */
export function quoteCustom(input: {
  metalCostPaise: number;
  labourCostPaise: number;
  pearlCostPaise: number;
  marginPaise: number;
  gstRateBp: number;
}): { exclusivePaise: number; gstPaise: number; quotedPaise: number } {
  const exclusivePaise = input.metalCostPaise + input.labourCostPaise + input.pearlCostPaise + input.marginPaise;
  const gstPaise = percentOf(exclusivePaise, input.gstRateBp);
  return { exclusivePaise, gstPaise, quotedPaise: exclusivePaise + gstPaise };
}
