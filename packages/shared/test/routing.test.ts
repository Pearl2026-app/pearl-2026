import { describe, expect, it } from 'vitest';
import { pickNearestVendor, pincodeCloseness, pickNearestVendorByDistance, distanceKm } from '../src/routing';

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

describe('pickNearestVendorByDistance', () => {
  const gurugram = { id: 'ggn', pincode: '122001', point: { lat: 28.4599, lng: 77.025 } };
  const noida = { id: 'noida', pincode: '201301', point: { lat: 28.5706, lng: 77.3272 } };
  const pune = { id: 'pune', pincode: '411005', point: { lat: 18.5308, lng: 73.8475 } };
  it('picks the nearest by km', () => {
    // Ghaziabad is closer to Noida than to Gurugram.
    const r = pickNearestVendorByDistance([gurugram, noida, pune], { pincode: '201001', point: { lat: 28.6692, lng: 77.4538 } });
    expect(r?.vendor.id).toBe('noida');
    expect(r?.km).toBeGreaterThan(5);
  });
  it('goes to the next nearest when a vendor is left out (switched off)', () => {
    const r = pickNearestVendorByDistance([gurugram, pune], { pincode: '201001', point: { lat: 28.6692, lng: 77.4538 } });
    expect(r?.vendor.id).toBe('ggn');
  });
  it('falls back to the PIN rule when the address cannot be placed', () => {
    const r = pickNearestVendorByDistance([gurugram, noida, pune], { pincode: '411004', point: null });
    expect(r?.vendor.id).toBe('pune');
    expect(r?.km).toBeNull();
  });
  it('distanceKm is about right', () => {
    expect(Math.round(distanceKm({ lat: 18.52, lng: 73.85 }, { lat: 19.07, lng: 72.88 }))).toBeGreaterThan(110);
  });
});
