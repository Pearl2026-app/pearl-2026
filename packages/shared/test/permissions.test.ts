import { describe, expect, it } from 'vitest';
import { can, canTransition, indianMobile, nextStatuses, permissionSet, renderTemplate, waMeUrl } from '../src';

describe('permissions', () => {
  it('gives Super Admin everything except audit log writes', () => {
    expect(can({ role: 'SUPER_ADMIN' }, 'SETTINGS', 'delete')).toBe(true);
    expect(can({ role: 'SUPER_ADMIN' }, 'AUDIT_LOG', 'view')).toBe(true);
    expect(can({ role: 'SUPER_ADMIN' }, 'AUDIT_LOG', 'delete')).toBe(false);
  });
  it('gives Staff only granted modules', () => {
    const staff = {
      role: 'STAFF' as const,
      staffGrants: [{ module: 'PRODUCTS' as const, canView: true, canCreate: false, canEdit: true, canDelete: false }],
    };
    expect(can(staff, 'PRODUCTS', 'view')).toBe(true);
    expect(can(staff, 'PRODUCTS', 'edit')).toBe(true);
    expect(can(staff, 'PRODUCTS', 'create')).toBe(false);
    expect(can(staff, 'ORDERS', 'view')).toBe(false);
    expect(can({ role: 'STAFF', staffGrants: [{ module: 'AUDIT_LOG', canView: true, canCreate: true, canEdit: true, canDelete: true }] }, 'AUDIT_LOG', 'delete')).toBe(false);
  });
  it('keeps partner roles away from settings and staff', () => {
    for (const role of ['CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER', 'CUSTOMER'] as const) {
      expect(can({ role }, 'SETTINGS', 'view')).toBe(false);
      expect(can({ role }, 'STAFF', 'view')).toBe(false);
      expect(can({ role }, 'AUDIT_LOG', 'view')).toBe(false);
    }
  });
  it('builds a permission set for menus', () => {
    expect(permissionSet({ role: 'VENDOR' }).PRODUCTS).toEqual(['view', 'create', 'edit']);
    expect(permissionSet({ role: 'CUSTOMER' })).toEqual({});
  });
});

describe('order state machine', () => {
  it('lets a vendor move only up to Packed', () => {
    expect(canTransition('VENDOR', 'CONFIRMED', 'PACKED')).toBe(true);
    expect(canTransition('VENDOR', 'PACKED', 'ASSIGNED')).toBe(false);
    expect(canTransition('VENDOR', 'OUT_FOR_DELIVERY', 'DELIVERED')).toBe(false);
  });
  it('lets delivery partners move only delivery steps', () => {
    expect(nextStatuses('DELIVERY_PARTNER', 'OUT_FOR_DELIVERY').sort()).toEqual(['DELIVERED', 'FAILED', 'RETURNED']);
    expect(canTransition('DELIVERY_PARTNER', 'PLACED', 'CONFIRMED')).toBe(false);
  });
  it('rejects invalid jumps for everyone', () => {
    expect(canTransition('SUPER_ADMIN', 'PLACED', 'DELIVERED')).toBe(false);
    expect(canTransition('SUPER_ADMIN', 'REFUNDED', 'PLACED')).toBe(false);
  });
});

describe('helpers', () => {
  it('normalises Indian mobiles', () => {
    expect(indianMobile.parse('98765 43210')).toBe('+919876543210');
    expect(indianMobile.parse('+91-9876543210')).toBe('+919876543210');
    expect(indianMobile.safeParse('12345').success).toBe(false);
  });
  it('builds wa.me links and fills templates', () => {
    expect(waMeUrl('+91 98765 43210', 'Hi there')).toBe('https://wa.me/919876543210?text=Hi%20there');
    expect(renderTemplate('Hi {{name}}, ref {{ref}} {{missing}}', { name: 'Asha', ref: 'ENQ-1' })).toBe('Hi Asha, ref ENQ-1 ');
  });
});
