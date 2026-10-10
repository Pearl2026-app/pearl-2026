import { describe, expect, it } from 'vitest';
import { computeTotals, CouponRule, evaluateCoupon, PricingLine, quoteCustom, suggestPrice } from '../src';

const necklace: PricingLine = { productId: 'p1', categoryId: 'necklaces', unitPricePaise: 4250000, quantity: 1, gstRateBp: 300 };
const earrings: PricingLine = { productId: 'p2', categoryId: 'earrings', unitPricePaise: 1890000, quantity: 2, gstRateBp: 300 };
const loose: PricingLine = { productId: 'p3', categoryId: 'loose', unitPricePaise: 500000, quantity: 1, gstRateBp: 300 };

const baseCoupon: CouponRule = {
  code: 'PEARL10',
  discountType: 'PERCENT',
  discountValue: 1000,
  minOrderPaise: 0,
  maxDiscountPaise: null,
  firstOrderOnly: false,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  perCustomerLimit: null,
  isActive: true,
  categoryIds: [],
  productIds: [],
};
const ctx = { now: new Date('2026-10-10T10:00:00Z'), totalRedemptions: 0, customerRedemptions: 0, hasPreviousOrders: false };

describe('computeTotals', () => {
  it('totals a cart with no discount or delivery', () => {
    const t = computeTotals([necklace, earrings]);
    expect(t.subtotalPaise).toBe(4250000 + 3780000);
    expect(t.totalPaise).toBe(t.subtotalPaise);
    expect(t.taxablePaise + t.gstPaise).toBe(t.totalPaise);
  });

  it('applies delivery below the free threshold and taxes it', () => {
    const t = computeTotals([loose], { delivery: { chargePaise: 15000, freeAbovePaise: 500001 } });
    expect(t.deliveryPaise).toBe(15000);
    expect(t.totalPaise).toBe(515000);
    expect(t.taxablePaise + t.gstPaise).toBe(t.totalPaise);
  });

  it('ships free at or above the threshold, judged after discount', () => {
    expect(computeTotals([loose], { delivery: { chargePaise: 15000, freeAbovePaise: 500000 } }).deliveryPaise).toBe(0);
    const t = computeTotals([loose], { lineDiscountsPaise: [1], delivery: { chargePaise: 15000, freeAbovePaise: 500000 } });
    expect(t.deliveryPaise).toBe(15000);
  });

  it('uses the city delivery override', () => {
    const t = computeTotals([loose], { delivery: { chargePaise: 15000, freeAbovePaise: null, cityChargePaise: 9900 } });
    expect(t.deliveryPaise).toBe(9900);
  });

  it('rejects bad input', () => {
    expect(() => computeTotals([{ ...loose, quantity: 0 }])).toThrow();
    expect(() => computeTotals([{ ...loose, unitPricePaise: 10.5 }])).toThrow();
  });

  it('matches the checkout sample in DESIGN-DIRECTION', () => {
    const c = evaluateCoupon(baseCoupon, [necklace], ctx);
    if (!c.ok) throw new Error('coupon should apply');
    const t = computeTotals([necklace], { lineDiscountsPaise: c.perLineDiscountPaise });
    expect(t.discountPaise).toBe(425000);
    expect(t.totalPaise).toBe(3825000);
    expect(t.gstPaise).toBe(111408);
  });
});

describe('evaluateCoupon', () => {
  it('applies a percentage to the whole cart', () => {
    const r = evaluateCoupon(baseCoupon, [necklace, earrings], ctx);
    expect(r).toMatchObject({ ok: true, discountPaise: 803000 });
    if (r.ok) expect(r.perLineDiscountPaise.reduce((a, b) => a + b, 0)).toBe(803000);
  });
  it('caps at the maximum discount', () => {
    expect(evaluateCoupon({ ...baseCoupon, maxDiscountPaise: 200000 }, [necklace], ctx)).toMatchObject({ discountPaise: 200000 });
  });
  it('enforces the minimum order value', () => {
    expect(evaluateCoupon({ ...baseCoupon, minOrderPaise: 10_000_000 }, [necklace], ctx)).toMatchObject({
      ok: false,
      reason: 'MIN_ORDER_NOT_MET',
    });
  });
  it('restricts to categories and products', () => {
    const r = evaluateCoupon({ ...baseCoupon, categoryIds: ['earrings'] }, [necklace, earrings], ctx);
    expect(r).toMatchObject({ ok: true, discountPaise: 378000 });
    if (r.ok) expect(r.perLineDiscountPaise).toEqual([0, 378000]);
    const p = evaluateCoupon({ ...baseCoupon, productIds: ['p3'] }, [necklace], ctx);
    expect(p).toMatchObject({ ok: false, reason: 'NO_ELIGIBLE_ITEMS' });
  });
  it('never discounts more than the eligible amount for flat coupons', () => {
    const r = evaluateCoupon({ ...baseCoupon, discountType: 'FLAT', discountValue: 9_999_999 }, [loose], ctx);
    expect(r).toMatchObject({ ok: true, discountPaise: 500000 });
  });
  it('checks dates, activity, usage and first-order rules', () => {
    expect(evaluateCoupon({ ...baseCoupon, isActive: false }, [loose], ctx)).toMatchObject({ reason: 'INACTIVE' });
    expect(evaluateCoupon({ ...baseCoupon, startsAt: '2026-11-01' }, [loose], ctx)).toMatchObject({ reason: 'NOT_STARTED' });
    expect(evaluateCoupon({ ...baseCoupon, endsAt: '2026-10-01' }, [loose], ctx)).toMatchObject({ reason: 'EXPIRED' });
    expect(evaluateCoupon({ ...baseCoupon, usageLimit: 5 }, [loose], { ...ctx, totalRedemptions: 5 })).toMatchObject({
      reason: 'USAGE_LIMIT_REACHED',
    });
    expect(evaluateCoupon({ ...baseCoupon, perCustomerLimit: 1 }, [loose], { ...ctx, customerRedemptions: 1 })).toMatchObject({
      reason: 'CUSTOMER_LIMIT_REACHED',
    });
    expect(evaluateCoupon({ ...baseCoupon, firstOrderOnly: true }, [loose], { ...ctx, hasPreviousOrders: true })).toMatchObject({
      reason: 'FIRST_ORDER_ONLY',
    });
  });
});

describe('suggestPrice', () => {
  it('computes pearl cost from carat and rate, adds margin and GST, rounds up to ₹100', () => {
    const r = suggestPrice({
      caratWeight: 7.2,
      ratePerCaratPaise: 300000,
      metalCostPaise: 500000,
      labourCostPaise: 200000,
      marginBp: 2500,
      gstRateBp: 300,
    });
    expect(r.pearlCostPaise).toBe(2160000);
    expect(r.costPaise).toBe(2860000);
    expect(r.marginPaise).toBe(715000);
    expect(r.suggestedPricePaise % 10000).toBe(0);
    expect(r.suggestedPricePaise).toBeGreaterThanOrEqual(Math.round((2860000 + 715000) * 1.03));
    expect(r.exclusivePaise + r.gstPaise).toBe(r.suggestedPricePaise);
  });
  it('respects the minimum margin', () => {
    const r = suggestPrice({ caratWeight: 0.5, ratePerCaratPaise: 10000, marginBp: 1000, minMarginPaise: 50000, gstRateBp: 300 });
    expect(r.marginPaise).toBe(50000);
  });
});

describe('quoteCustom', () => {
  it('adds GST on top of the cost breakdown', () => {
    expect(quoteCustom({ metalCostPaise: 100, labourCostPaise: 200, pearlCostPaise: 300, marginPaise: 400, gstRateBp: 300 })).toEqual({
      exclusivePaise: 1000,
      gstPaise: 30,
      quotedPaise: 1030,
    });
  });
});
