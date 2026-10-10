import type { Action, Module, Role } from '@sahyadri/shared';

export interface NavItem {
  href: string;
  label: string;
  module?: Module;
  action?: Action;
  roles?: Role[];
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/', label: 'Dashboard', module: 'DASHBOARD' }] },
  {
    label: 'Sales',
    items: [
      { href: '/enquiries', label: 'Enquiries', module: 'ENQUIRIES' },
      { href: '/orders', label: 'Orders', module: 'ORDERS', roles: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE'] },
      { href: '/custom-orders', label: 'Customized orders', module: 'CUSTOM_ORDERS' },
      { href: '/purchase-orders', label: 'Purchase orders', module: 'PURCHASE_ORDERS' },
      { href: '/payments', label: 'Payments', module: 'PAYMENTS', roles: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER', 'FRANCHISE'] },
      { href: '/returns', label: 'Returns', module: 'RETURNS' },
      { href: '/abandoned-carts', label: 'Abandoned carts', module: 'ORDERS', roles: ['SUPER_ADMIN', 'STAFF'] },
    ],
  },
  {
    label: 'Delivery',
    items: [{ href: '/delivery', label: 'My deliveries', roles: ['DELIVERY_PARTNER'] }],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/products', label: 'Products', module: 'PRODUCTS' },
      { href: '/categories', label: 'Categories', module: 'CATEGORIES', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/collections', label: 'Collections', module: 'COLLECTIONS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/farms', label: 'Farms', module: 'FARMS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/certificates', label: 'Certificates', module: 'PRODUCTS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/reviews', label: 'Reviews', module: 'REVIEWS' },
    ],
  },
  { label: 'Customers', items: [{ href: '/customers', label: 'Customers', module: 'USERS' }] },
  {
    label: 'Marketing',
    items: [
      { href: '/coupons', label: 'Coupons & offers', module: 'COUPONS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/notifications', label: 'Push notifications', module: 'NOTIFICATIONS' },
      { href: '/messages', label: 'Message log', module: 'NOTIFICATIONS' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/banners', label: 'Banners', module: 'CONTENT' },
      { href: '/content-blocks', label: 'Home & page blocks', module: 'CONTENT' },
      { href: '/pages', label: 'Pages & legal', module: 'CONTENT' },
      { href: '/testimonials', label: 'Testimonials', module: 'CONTENT' },
      { href: '/gallery', label: 'Gallery', module: 'CONTENT' },
      { href: '/faq', label: 'FAQ', module: 'CONTENT' },
      { href: '/jobs', label: 'Careers', module: 'CAREERS' },
      { href: '/job-applications', label: 'Job applications', module: 'CAREERS' },
    ],
  },
  {
    label: 'Network',
    items: [
      { href: '/cities', label: 'Cities', module: 'CITIES', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/vendors', label: 'Vendors', module: 'VENDORS' },
      { href: '/franchises', label: 'Franchises', module: 'FRANCHISES' },
      { href: '/manufacturers', label: 'Manufacturers', module: 'MANUFACTURERS' },
      { href: '/delivery-partners', label: 'Delivery partners', module: 'DELIVERY_PARTNERS', roles: ['SUPER_ADMIN', 'STAFF', 'CITY_MANAGER'] },
    ],
  },
  {
    label: 'Pricing',
    items: [
      { href: '/pricing/calculator', label: 'Price calculator', module: 'PRICING' },
      { href: '/pearl-rates', label: 'Pearl rates', module: 'PRICING', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/margin-rules', label: 'Margin rules', module: 'PRICING', roles: ['SUPER_ADMIN', 'STAFF'] },
    ],
  },
  { label: 'Reports', items: [{ href: '/reports', label: 'Reports', module: 'REPORTS' }] },
  {
    label: 'Administration',
    items: [
      { href: '/whatsapp', label: 'WhatsApp numbers & routing', module: 'WHATSAPP_SETTINGS' },
      { href: '/users', label: 'Staff & partner logins', roles: ['SUPER_ADMIN'] },
      { href: '/settings', label: 'Settings', module: 'SETTINGS' },
      { href: '/audit-log', label: 'Audit log', module: 'AUDIT_LOG' },
    ],
  },
];
