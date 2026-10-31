import type { Action, Module, Role } from '@sahyadri/shared';

export interface NavItem {
  href: string;
  label: string;
  module?: Module;
  action?: Action;
  roles?: Role[];
  /** Shown in the short main menu, with this colour; everything else sits under "More". */
  primary?: string;
  /** One line on what this section is for, shown behind the ⓘ. */
  info?: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ href: '/', info: 'Today at a glance: sales, orders waiting, stock value left, and low-stock alerts.', label: 'Dashboard', module: 'DASHBOARD', primary: '#14212B' }] },
  {
    label: 'Sales',
    items: [
      { href: '/enquiries', info: 'WhatsApp and website enquiries from shoppers. Reply, follow up, and convert one into an order in a click.', label: 'Enquiries', module: 'ENQUIRIES', primary: '#1F7A4D' },
      {
        href: '/orders', info: 'Every order from the website, stores and enquiries. Confirm, pack, assign a rider and track it to delivery.',
        label: 'Orders',
        module: 'ORDERS',
        roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE'],
        primary: '#2B5C8A',
      },
      { href: '/custom-orders', info: "Made-to-order requests (shopper's own design or photo). Quote a price, approve, and track making.", label: 'Customized orders', module: 'CUSTOM_ORDERS' },
      { href: '/purchase-orders', info: 'Orders we place on manufacturers. They accept with a deadline and update 7 daily work stages; you get an email each time.', label: 'Purchase orders', module: 'PURCHASE_ORDERS' },
      {
        href: '/payments', info: 'Every payment received: online, cash on delivery and refunds. Use it to reconcile with the bank.',
        label: 'Payments',
        module: 'PAYMENTS',
        roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'FRANCHISE'],
      },
      { href: '/returns', info: 'Return and exchange requests from customers. Approve, arrange pickup and refund.', label: 'Returns', module: 'RETURNS' },
      {
        href: '/abandoned-carts', info: 'Shoppers who added pieces but did not pay. Follow up on WhatsApp to recover the sale.',
        label: 'Abandoned carts',
        module: 'ORDERS',
        roles: ['SUPER_ADMIN', 'STAFF'],
      },
    ],
  },
  {
    label: 'Delivery',
    items: [{ href: '/delivery', info: "The rider's own list: scan pieces at pickup, start delivery, and record proof (photo, customer code, cash).", label: 'My deliveries', roles: ['DELIVERY_PARTNER'], primary: '#2B5C8A' }],
  },
  {
    label: 'Catalogue',
    items: [
      { href: '/products', info: 'The full catalogue: add pieces with photos, CAD and video; set price, sizes, SR code and where each piece is shown.', label: 'Products', module: 'PRODUCTS', primary: '#9A7546', roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE', 'FARMER'] },
      {
        href: '/restock', info: 'Pieces running low (under 5). A draft purchase order is created automatically so you can reorder in one step.',
        label: 'Purchase orders (low stock)',
        module: 'PRODUCTS',
        roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'VENDOR', 'MANUFACTURER'],
        primary: '#9A7546',
      },
      { href: '/products/offers', info: 'Product-level discounts shown on the website, e.g. 10% off a collection for a period.', label: 'Offers & discounts', module: 'PRODUCTS', action: 'edit', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/categories', info: 'Rings, necklaces, earrings… the groups shoppers browse by. Also used in reports.', label: 'Categories', module: 'CATEGORIES', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/collections', info: 'Curated themes (Bridal, Everyday…) that group pieces across categories for the website.', label: 'Collections', module: 'COLLECTIONS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/farms', info: 'The pearl farms we source from. Every piece is traced to a farm, and shoppers can browse by farm.', label: 'Farms', module: 'FARMS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/certificates', info: 'Authenticity certificates for pieces. Shoppers verify them online with the code.', label: 'Certificates', module: 'PRODUCTS', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/reviews', info: 'Customer reviews. Approve or hide them before they appear on the website.', label: 'Reviews', module: 'REVIEWS' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { href: '/customers', info: 'Retail shoppers: contact details, order history and points. Activate or deactivate an account.', label: 'Customers', module: 'USERS', primary: '#6B4C9A' },
      { href: '/business-buyers', info: 'Wholesale (B2B) buyers. Approve them; they see business prices (10% less) on the /business portal.', label: 'Business buyers (B2B)', module: 'USERS', action: 'edit', roles: ['SUPER_ADMIN', 'STAFF'] },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/coupons', info: 'Discount codes shoppers enter at checkout, with limits, dates and cities.', label: 'Coupons & offers', module: 'COUPONS', roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'VENDOR'] },
      { href: '/notifications', info: 'Send push notifications to app users, e.g. a new collection or festive offer.', label: 'Push notifications', module: 'NOTIFICATIONS' },
      { href: '/messages', info: 'A log of every SMS, email and WhatsApp the system sent, to check what a customer received.', label: 'Message log', module: 'NOTIFICATIONS' },
      { href: '/newsletter', info: 'People who signed up for emails. Export the list for campaigns.', label: 'Newsletter', module: 'NOTIFICATIONS' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/banners', info: 'The big pictures on the home page and other pages, with their links and buttons.', label: 'Banners', module: 'CONTENT' },
      { href: '/content-blocks', info: 'Editable sections of the home page: trust marks, the custom-design call to action, announcements.', label: 'Home & page blocks', module: 'CONTENT' },
      { href: '/pages', info: 'About us, policies and legal pages, edited here without a developer.', label: 'Pages & legal', module: 'CONTENT' },
      { href: '/testimonials', info: 'Customer quotes shown on the home page.', label: 'Testimonials', module: 'CONTENT' },
      { href: '/gallery', info: 'Photo gallery shown on the website.', label: 'Gallery', module: 'CONTENT' },
      { href: '/faq', info: 'Frequently asked questions shown on the website.', label: 'FAQ', module: 'CONTENT' },
      { href: '/jobs', info: 'Open positions shown on the Careers page.', label: 'Careers', module: 'CAREERS' },
      { href: '/job-applications', info: 'Applications received for the open positions.', label: 'Job applications', module: 'CAREERS' },
    ],
  },
  {
    label: 'Network',
    items: [
      { href: '/cities', info: 'Cities we deliver to, each with its delivery charge. Shoppers only see pieces available in their city.', label: 'Cities', module: 'CITIES', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/vendors', info: 'Partner jewellers who sell their stock through us. Their pieces show only in the cities they serve.', label: 'Vendors', module: 'VENDORS' },
      { href: '/franchises', info: 'Franchise stores under our brand, with their own logo, stock and orders.', label: 'Franchises', module: 'FRANCHISES' },
      { href: '/manufacturers', info: 'Workshops that make our jewellery. They receive and update purchase orders.', label: 'Manufacturers', module: 'MANUFACTURERS' },
      {
        href: '/delivery-partners', info: 'Our riders, their cities and their current deliveries.',
        label: 'Delivery partners',
        module: 'DELIVERY_PARTNERS',
        roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'VENDOR'],
      },
      { href: '/rider-applications', info: 'People who applied to become riders. Approve to give them the rider app.', label: 'Rider applications', module: 'DELIVERY_PARTNERS', action: 'edit', roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER'] },
    ],
  },
  {
    label: 'Pricing',
    items: [
      { href: '/pricing/calculator', info: 'Work out a selling price from pearl, metal, making cost and GST.', label: 'Price calculator', module: 'PRICING' },
      { href: '/pearl-rates', info: "Today's pearl rates used by the price calculator.", label: 'Pearl rates', module: 'PRICING', roles: ['SUPER_ADMIN', 'STAFF'] },
      { href: '/margin-rules', info: 'The markups applied to cost to get selling and B2B prices.', label: 'Margin rules', module: 'PRICING', roles: ['SUPER_ADMIN', 'STAFF'] },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports', info: 'Sales, stock, GST and farm reports. Pick a date range and export to Excel.', label: 'Reports', module: 'REPORTS', primary: '#B4532A', roles: ['SUPER_ADMIN', 'STAFF', 'STATE_MANAGER', 'CITY_MANAGER', 'VENDOR', 'FRANCHISE'] },
      { href: '/farm-sales', info: "Sales of each farm's pearls, for paying and reviewing farms.", label: 'Farm sales', module: 'REPORTS', primary: '#B4532A', roles: ['SUPER_ADMIN', 'STAFF', 'FARMER'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/whatsapp', info: 'Which WhatsApp number handles which city or enquiry type.', label: 'WhatsApp numbers & routing', module: 'WHATSAPP_SETTINGS' },
      { href: '/users', info: 'Logins for staff and partners, with their role. Each role sees only what it is allowed to.', label: 'Staff & partner logins', roles: ['SUPER_ADMIN'] },
      { href: '/settings', info: 'Business settings: payments, delivery, returns, points, alerts and the announcement bar. Changes apply immediately.', label: 'Settings', module: 'SETTINGS' },
      { href: '/audit-log', info: 'Who changed what and when. Every change in the admin is recorded here.', label: 'Audit log', module: 'AUDIT_LOG' },
    ],
  },
];

/** The purpose of the page at this path: the closest menu entry above it. */
export function infoFor(pathname: string): string | undefined {
  let best: NavItem | undefined;
  for (const g of NAV)
    for (const i of g.items) {
      const hit = i.href === '/' ? pathname === '/' : pathname === i.href || pathname.startsWith(i.href + '/');
      if (hit && (!best || i.href.length > best.href.length)) best = i;
    }
  return best?.info;
}
