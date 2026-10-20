// Rule 1: every query is scoped by the caller. These builders return Prisma `where` fragments.
// An empty object means "no restriction" (global roles). A role with no access gets IMPOSSIBLE.
import type { Prisma } from '@sahyadri/db';
import type { AuthUser } from './context';

const IMPOSSIBLE = { id: '__no_access__' } as const;

export function orderScope(u: AuthUser): Prisma.OrderWhereInput {
  switch (u.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      return {};
    case 'STATE_MANAGER':
      return { city: { state: u.state ?? '__none__' } };
    case 'CITY_MANAGER':
      return { cityId: u.cityId ?? '__none__' };
    case 'VENDOR':
      // Orders sent to this vendor as the nearest to the customer, and orders for its own pieces.
      return {
        OR: [{ fulfilmentVendorId: u.vendorId ?? '__none__' }, { vendorId: u.vendorId ?? '__none__' }],
      };
    case 'FRANCHISE':
      return { franchiseId: u.franchiseId ?? '__none__' };
    case 'DELIVERY_PARTNER':
      return { delivery: { deliveryPartnerId: u.deliveryPartnerId ?? '__none__' } };
    case 'CUSTOMER':
      return { customerId: u.customerId ?? '__none__' };
    case 'FARMER':
      // Orders with pieces made from this farm's pearls (for its sales figures).
      return { items: { some: { product: { farmId: u.farmId ?? '__none__' } } } };
    case 'MANUFACTURER':
      return { manufacturerId: u.manufacturerId ?? '__none__' };
  }
}

export function enquiryScope(u: AuthUser): Prisma.EnquiryWhereInput {
  switch (u.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      return {};
    case 'STATE_MANAGER':
      return { city: { state: u.state ?? '__none__' } };
    case 'CITY_MANAGER':
      return { cityId: u.cityId ?? '__none__' };
    case 'FRANCHISE':
      return { franchiseId: u.franchiseId ?? '__none__' };
    case 'CUSTOMER':
      return { customerId: u.customerId ?? '__none__' };
    default:
      return IMPOSSIBLE;
  }
}

/** Admin product management scope (the public catalogue has its own rules). */
export function productScope(u: AuthUser): Prisma.ProductWhereInput {
  switch (u.role) {
    case 'VENDOR':
      return { vendorId: u.vendorId ?? '__none__' };
    case 'FARMER':
      return { farmId: u.farmId ?? '__none__' };
    case 'DELIVERY_PARTNER':
    case 'CUSTOMER':
      return IMPOSSIBLE;
    case 'STATE_MANAGER':
      return { OR: [{ cities: { none: {} } }, { cities: { some: { city: { state: u.state ?? '__none__' } } } }] };
    case 'CITY_MANAGER':
      // Products available in their city: no city rows means all cities.
      return { OR: [{ cities: { none: {} } }, { cities: { some: { cityId: u.cityId ?? '__none__' } } }] };
    default:
      return {};
  }
}

export function customerScope(u: AuthUser): Prisma.CustomerWhereInput {
  switch (u.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      return {};
    case 'STATE_MANAGER':
      return { city: { state: u.state ?? '__none__' } };
    case 'CITY_MANAGER':
      return { cityId: u.cityId ?? '__none__' };
    case 'FRANCHISE':
      return { orders: { some: { franchiseId: u.franchiseId ?? '__none__' } } };
    case 'CUSTOMER':
      return { id: u.customerId ?? '__none__' };
    default:
      return IMPOSSIBLE;
  }
}

export function customRequestScope(u: AuthUser): Prisma.CustomRequestWhereInput {
  switch (u.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      return {};
    case 'STATE_MANAGER':
      return { city: { state: u.state ?? '__none__' } };
    case 'CITY_MANAGER':
      return { cityId: u.cityId ?? '__none__' };
    case 'FRANCHISE':
      return { enquiry: { franchiseId: u.franchiseId ?? '__none__' } };
    case 'CUSTOMER':
      return { customerId: u.customerId ?? '__none__' };
    default:
      return IMPOSSIBLE;
  }
}

export function purchaseOrderScope(u: AuthUser): Prisma.PurchaseOrderWhereInput {
  switch (u.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      return {};
    case 'STATE_MANAGER':
      return { order: { city: { state: u.state ?? '__none__' } } };
    case 'CITY_MANAGER':
      return { order: { cityId: u.cityId ?? '__none__' } };
    case 'MANUFACTURER':
      return { manufacturerId: u.manufacturerId ?? '__none__' };
    default:
      return IMPOSSIBLE;
  }
}

export function deliveryPartnerScope(u: AuthUser): Prisma.DeliveryPartnerWhereInput {
  switch (u.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      return {};
    case 'STATE_MANAGER':
      return { cities: { some: { city: { state: u.state ?? '__none__' } } } };
    case 'CITY_MANAGER':
      return { cities: { some: { cityId: u.cityId ?? '__none__' } } };
    case 'FRANCHISE':
      return { cities: { some: { cityId: u.cityId ?? '__none__' } }, isActive: true };
    case 'DELIVERY_PARTNER':
      return { id: u.deliveryPartnerId ?? '__none__' };
    case 'VENDOR':
      return { vendorId: u.vendorId ?? '__none__' };
    default:
      return IMPOSSIBLE;
  }
}

export function returnScope(u: AuthUser): Prisma.ReturnRequestWhereInput {
  const o = orderScope(u);
  return Object.keys(o).length ? { order: o } : {};
}

export function paymentScope(u: AuthUser): Prisma.PaymentWhereInput {
  const o = orderScope(u);
  return Object.keys(o).length ? { order: o } : {};
}

/** City filter for network lists (vendors, franchises, manufacturers). */
export function cityLimited(u: AuthUser): string | null {
  return u.role === 'CITY_MANAGER' ? (u.cityId ?? '__none__') : null;
}

export const isGlobal = (u: AuthUser) => u.role === 'SUPER_ADMIN' || u.role === 'STAFF';
