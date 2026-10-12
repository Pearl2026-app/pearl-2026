import { describe, expect, it } from 'vitest';
import { estimateDelivery, isValidPincode } from '../src';

// Times are given in UTC; India is UTC+5:30.
const at = (iso: string) => new Date(iso);

describe('isValidPincode', () => {
  it('accepts six digits not starting with 0', () => {
    expect(isValidPincode('411004')).toBe(true);
    expect(isValidPincode(' 400001 ')).toBe(true);
    expect(isValidPincode('011004')).toBe(false);
    expect(isValidPincode('41100')).toBe(false);
    expect(isValidPincode('41100a')).toBe(false);
  });
});

describe('estimateDelivery', () => {
  it('counts working days from today before the cut-off', () => {
    // Mon 13 Oct 2026, 10:00 IST
    const e = estimateDelivery(at('2026-10-13T04:30:00Z'), 3, 5);
    expect(e.from).toBe('2026-10-16'); // Fri
    expect(e.to).toBe('2026-10-19'); // Sun skipped → Mon
  });

  it('starts from the next working day after the cut-off', () => {
    // Mon 13 Oct 2026, 15:00 IST
    const e = estimateDelivery(at('2026-10-13T09:30:00Z'), 3, 5);
    expect(e.from).toBe('2026-10-17'); // Sat
    expect(e.to).toBe('2026-10-20');
  });

  it('uses the India date near midnight UTC', () => {
    // Sat 17 Oct 2026, 23:00 UTC = Sun 18 Oct 04:30 IST → starts Monday
    const e = estimateDelivery(at('2026-10-17T23:00:00Z'), 1, 1);
    expect(e.from).toBe('2026-10-20');
    expect(e.label).toMatch(/Tue/);
  });

  it('never returns a window that ends before it starts', () => {
    const e = estimateDelivery(at('2026-10-13T04:30:00Z'), 6, 2);
    expect(e.from <= e.to).toBe(true);
  });
});
