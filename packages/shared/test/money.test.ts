import { describe, expect, it } from 'vitest';
import { allocate, divRoundHalfUp, formatINR, percentOf, splitGst, splitInclusive } from '../src';

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(12345678)).toBe('₹1,23,456.78');
    expect(formatINR(4250000, { compact: true })).toBe('₹42,500');
    expect(formatINR(99)).toBe('₹0.99');
    expect(formatINR(100000000000)).toBe('₹1,00,00,00,000.00');
  });
});

describe('divRoundHalfUp', () => {
  it('rounds halves up', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(4, 2)).toBe(2);
    expect(divRoundHalfUp(7, 3)).toBe(2);
    expect(divRoundHalfUp(-5, 2)).toBe(-3);
  });
});

describe('GST', () => {
  it('backs GST out of an inclusive amount without losing a paisa', () => {
    const { taxablePaise, gstPaise } = splitInclusive(4250000, 300);
    expect(taxablePaise).toBe(4126214);
    expect(gstPaise).toBe(123786);
    expect(taxablePaise + gstPaise).toBe(4250000);
  });
  it('holds the invariant for many amounts and rates', () => {
    for (const rate of [0, 300, 500, 1200, 1800, 2800]) {
      for (let amt = 0; amt < 50000; amt += 137) {
        const s = splitInclusive(amt, rate);
        expect(s.taxablePaise + s.gstPaise).toBe(amt);
        expect(s.gstPaise).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it('splits CGST/SGST for intra-state and IGST for inter-state', () => {
    expect(splitGst(101, false)).toEqual({ cgstPaise: 50, sgstPaise: 51, igstPaise: 0 });
    expect(splitGst(101, true)).toEqual({ cgstPaise: 0, sgstPaise: 0, igstPaise: 101 });
  });
  it('computes percentages in basis points', () => {
    expect(percentOf(10000, 1000)).toBe(1000);
    expect(percentOf(333, 300)).toBe(10);
  });
});

describe('allocate', () => {
  it('splits exactly and proportionally', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [0, 5, 5])).toEqual([0, 5, 5]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
    const parts = allocate(999, [123, 456, 789]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(999);
  });
});
