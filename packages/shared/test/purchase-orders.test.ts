import { describe, expect, it } from 'vitest';
import { normalisePoStage, PO_STAGES, poBillMismatch, poCost } from '../src';

describe('poCost', () => {
  it('is metal weight × rate × quantity, plus 5% GST by default', () => {
    // 4.25 g × ₹120/g × 2 = ₹1,020; GST 5% = ₹51
    expect(poCost({ metalWeightG: '4.250', makingRatePerGramPaise: 12_000, quantity: 2 })).toEqual({ subtotalPaise: 102_000, gstPaise: 5_100, totalPaise: 107_100 });
  });
  it('uses the GST given', () => {
    expect(poCost({ metalWeightG: 10, makingRatePerGramPaise: 9_000, quantity: 1, gstPercent: '3' })).toEqual({ subtotalPaise: 90_000, gstPaise: 2_700, totalPaise: 92_700 });
  });
  it('is null until weight and rate are known', () => {
    expect(poCost({ metalWeightG: null, makingRatePerGramPaise: 9_000, quantity: 1 })).toBeNull();
    expect(poCost({ metalWeightG: 3, makingRatePerGramPaise: null, quantity: 1 })).toBeNull();
  });
});

describe('bill check', () => {
  it('flags a bill more than ₹1 away from the total', () => {
    expect(poBillMismatch(107_100, 107_100)).toBe(false);
    expect(poBillMismatch(107_200, 107_100)).toBe(false);
    expect(poBillMismatch(107_201, 107_100)).toBe(true);
    expect(poBillMismatch(null, 107_100)).toBe(false);
  });
});

describe('work stages', () => {
  it('start with the PO and pearls, and end with the pickup check', () => {
    expect(PO_STAGES[0]).toBe('Received PO');
    expect(PO_STAGES[1]).toBe('Pearls received');
    expect(PO_STAGES.at(-1)).toBe('Quality check at pickup');
  });
  it('reads the old stage names', () => {
    expect(normalisePoStage('Filling and Finishing')).toBe('Filing & finishing');
    expect(normalisePoStage('Ready for Pickup')).toBe('Ready for pickup');
    expect(normalisePoStage('Casting')).toBe('Casting');
  });
});
