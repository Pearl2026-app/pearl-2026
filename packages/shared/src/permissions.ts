// The permission matrix, defined once. The API enforces it (guards + query scoping);
// the interfaces only use it to decide what to show. See docs/PERMISSION-MATRIX.md.
import type { Role } from './enums';

export const MODULES = [
  'DASHBOARD',
  'USERS',
  'STAFF',
  'CATEGORIES',
  'COLLECTIONS',
  'FARMS',
  'PRODUCTS',
  'ORDERS',
  'CUSTOM_ORDERS',
  'PURCHASE_ORDERS',
  'ENQUIRIES',
  'WHATSAPP_SETTINGS',
  'CONTENT',
  'COUPONS',
  'NOTIFICATIONS',
  'CITIES',
  'VENDORS',
  'FRANCHISES',
  'MANUFACTURERS',
  'DELIVERY_PARTNERS',
  'PRICING',
  'PAYMENTS',
  'RETURNS',
  'REVIEWS',
  'REPORTS',
  'CAREERS',
  'SETTINGS',
  'AUDIT_LOG',
] as const;
export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULE_LABEL: Record<Module, string> = {
  DASHBOARD: 'Dashboard',
  USERS: 'Customers',
  STAFF: 'Staff & partner users',
  CATEGORIES: 'Categories',
  COLLECTIONS: 'Collections',
  FARMS: 'Farms',
  PRODUCTS: 'Products',
  ORDERS: 'Orders',
  CUSTOM_ORDERS: 'Customized orders',
  PURCHASE_ORDERS: 'Purchase orders',
  ENQUIRIES: 'Enquiries',
  WHATSAPP_SETTINGS: 'WhatsApp numbers, templates & routing',
  CONTENT: 'Content & pages',
  COUPONS: 'Coupons & offers',
  NOTIFICATIONS: 'Push notifications',
  CITIES: 'Cities',
  VENDORS: 'Vendors',
  FRANCHISES: 'Franchises',
  MANUFACTURERS: 'Manufacturers',
  DELIVERY_PARTNERS: 'Delivery partners',
  PRICING: 'Pearl pricing',
  PAYMENTS: 'Payments',
  RETURNS: 'Returns & cancellations',
  REVIEWS: 'Reviews',
  REPORTS: 'Reports',
  CAREERS: 'Careers',
  SETTINGS: 'Settings',
  AUDIT_LOG: 'Audit log',
};

/** How a role's data is limited. Applied to every query in the API. */
export type ScopeKind = 'global' | 'city' | 'vendor' | 'franchise' | 'delivery' | 'self' | 'manufacturer' | 'farm';

export const ROLE_SCOPE: Record<Role, ScopeKind> = {
  SUPER_ADMIN: 'global',
  STAFF: 'global',
  CITY_MANAGER: 'city',
  VENDOR: 'vendor',
  FRANCHISE: 'franchise',
  DELIVERY_PARTNER: 'delivery',
  CUSTOMER: 'self',
  MANUFACTURER: 'manufacturer',
  FARMER: 'farm',
};

/** Roles that use the admin app. */
export const PANEL_ROLES: Role[] = ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'DELIVERY_PARTNER', 'MANUFACTURER', 'FARMER'];
/** Roles that sign in with email + password + OTP. */
export const PASSWORD_ROLES: Role[] = ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'];

type Grants = Partial<Record<Module, Action[]>>;
const V: Action[] = ['view'];
const VC: Action[] = ['view', 'create'];
const VE: Action[] = ['view', 'edit'];
const VCE: Action[] = ['view', 'create', 'edit'];

/**
 * Fixed grants for partner roles. SUPER_ADMIN has everything; STAFF grants come from StaffPermission rows.
 * The data each grant reaches is further limited by ROLE_SCOPE.
 */
export const ROLE_GRANTS: Record<Exclude<Role, 'SUPER_ADMIN' | 'STAFF'>, Grants> = {
  CITY_MANAGER: {
    DASHBOARD: V,
    USERS: V,
    CATEGORIES: V,
    COLLECTIONS: V,
    FARMS: V,
    PRODUCTS: V,
    ORDERS: VCE,
    CUSTOM_ORDERS: VCE,
    PURCHASE_ORDERS: V,
    ENQUIRIES: VCE,
    // Area offers for their city
    COUPONS: VCE,
    CITIES: V,
    VENDORS: V,
    FRANCHISES: V,
    MANUFACTURERS: V,
    DELIVERY_PARTNERS: VE,
    PRICING: V,
    PAYMENTS: V,
    RETURNS: VE,
    REPORTS: V,
  },
  VENDOR: {
    DASHBOARD: V,
    CATEGORIES: V,
    COLLECTIONS: V,
    FARMS: V,
    PRODUCTS: VCE,
    ORDERS: VE,
    // Area offers for the cities it serves
    COUPONS: VCE,
    DELIVERY_PARTNERS: VE,
    REPORTS: V,
  },
  FRANCHISE: {
    DASHBOARD: V,
    CATEGORIES: V,
    FARMS: V,
    PRODUCTS: V,
    ORDERS: VCE,
    ENQUIRIES: VCE,
    DELIVERY_PARTNERS: V,
    PRICING: V,
    PAYMENTS: V,
    RETURNS: V,
    REPORTS: V,
  },
  DELIVERY_PARTNER: {
    ORDERS: VE,
    PAYMENTS: VC,
  },
  CUSTOMER: {},
  // Sees what to make: the restock list (low-stock pieces) and its own purchase orders.
  MANUFACTURER: {
    PRODUCTS: V,
    PURCHASE_ORDERS: VE,
  },
  // A partner farm sees the pieces made with its pearls and how they sell.
  FARMER: {
    PRODUCTS: V,
    REPORTS: V,
  },
};

/** Modules a STAFF grant may never include, whatever a Super Admin ticks. */
export const STAFF_FORBIDDEN: Partial<Record<Module, Action[]>> = {
  AUDIT_LOG: ['create', 'edit', 'delete'],
};

export interface StaffGrant {
  module: Module;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface PermissionSubject {
  role: Role;
  staffGrants?: StaffGrant[];
}

const ACTION_FIELD: Record<Action, keyof Omit<StaffGrant, 'module'>> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
};

/** Can this user perform `action` on `module` at all? (Scope is applied separately.) */
export function can(subject: PermissionSubject, module: Module, action: Action): boolean {
  if (module === 'AUDIT_LOG' && action !== 'view') return false; // append-only for everyone
  if (subject.role === 'SUPER_ADMIN') return true;
  if (subject.role === 'STAFF') {
    if (STAFF_FORBIDDEN[module]?.includes(action)) return false;
    const g = subject.staffGrants?.find((x) => x.module === module);
    if (!g) return false;
    // Any write implies view.
    if (action === 'view') return g.canView || g.canCreate || g.canEdit || g.canDelete;
    return g[ACTION_FIELD[action]];
  }
  return ROLE_GRANTS[subject.role]?.[module]?.includes(action) ?? false;
}

/** Every (module, actions) pair the user has, for building menus. */
export function permissionSet(subject: PermissionSubject): Partial<Record<Module, Action[]>> {
  const out: Partial<Record<Module, Action[]>> = {};
  for (const m of MODULES) {
    const acts = ACTIONS.filter((a) => can(subject, m, a));
    if (acts.length) out[m] = acts;
  }
  return out;
}
