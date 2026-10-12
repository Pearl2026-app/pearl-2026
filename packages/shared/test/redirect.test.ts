import { describe, expect, it } from 'vitest';
import { safeNextPath } from '../src';

const O = 'https://www.sahyadripearls.in';
describe('safeNextPath', () => {
  it('keeps paths on this site', () => {
    expect(safeNextPath('/checkout', O)).toBe('/checkout');
    expect(safeNextPath('/account/orders?page=2#top', O)).toBe('/account/orders?page=2#top');
  });
  it('refuses other sites and tricks', () => {
    for (const bad of ['//evil.com', '/\\evil.com', '/%5Cevil.com'.replace('%5C', '\\'), 'https://evil.com', 'javascript:alert(1)', '/\tevil', '', null, undefined]) {
      expect(safeNextPath(bad as string, O)).toBe('/account');
    }
  });
});
