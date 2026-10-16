import { describe, expect, it } from 'vitest';
import { pickNearestVendor, pincodeCloseness } from '../src/routing';

const vendors = [
  { id: 'pune', pincode: '411005', cityIds: ['c-pune'] },
  { id: 'mumbai', pincode: '400050', cityIds: ['c-mumbai'] },
  { id: 'delhi', pincode: '110005', cityIds: ['c-delhi'] },
  { id: 'blr', pincode: '560011', cityIds: ['c-blr'] },
  { id: 'none', pincode: null },
];

describe('nearest vendor by PIN code', () => {
  it('measures the shared prefix and the numeric gap', () => {
    expect(pincodeCloseness('411004', '411005')).toEqual([5, 1]);
    expect(pincodeCloseness('400050', '411005')).toEqual([1, 10955]);
  });
  it('sends each order to the vendor in the same area', () => {
    expect(pickNearestVendor(vendors, '411004')?.id).toBe('pune');
    expect(pickNearestVendor(vendors, '400001')?.id).toBe('mumbai');
    expect(pickNearestVendor(vendors, '122001')?.id).toBe('delhi'); // Gurugram: same zone as Delhi
    expect(pickNearestVendor(vendors, '560100')?.id).toBe('blr');
  });
  it('prefers a vendor serving the city when the PIN prefix ties, and skips vendors without a PIN', () => {
    const tie = [
      { id: 'a', pincode: '411010', cityIds: ['x'] },
      { id: 'b', pincode: '411090', cityIds: ['c-pune'] },
    ];
    expect(pickNearestVendor(tie, '411030', 'c-pune')?.id).toBe('b');
    expect(pickNearestVendor([{ id: 'none', pincode: null }], '411004')).toBeNull();
    expect(pickNearestVendor(vendors, null)).toBeNull();
  });
});
