// Brand constants that are not business settings (those live in the Setting table).
export const BRAND_NAME = 'Sahyadri Pearls';
export const footerCredit = (): string => 'Developed by Sahyadri Pearls';
export const footerCopyright = (year: number = new Date().getFullYear()): string =>
  `© ${year} Sahyadri Pearls. All Rights Reserved.`;

export const ACCOUNT_MENU = [
  { label: 'Account', href: '/account' },
  { label: 'My Orders', href: '/account/orders' },
  { label: 'Manage Addresses', href: '/account/addresses' },
  { label: 'Wishlist', href: '/account/wishlist' },
  { label: 'Referral Code', href: '/account/referral' },
  { label: 'Returns', href: '/account/returns' },
  { label: 'Business Account', href: '/account/business' },
  { label: 'Terms & Conditions', href: '/terms' },
] as const;

export const LEGAL_PAGES = [
  { slug: 'terms', title: 'Terms & Conditions' },
  { slug: 'refund-policy', title: 'Refund Policy' },
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'return-cancellation-policy', title: 'Return & Cancellation Policy' },
  { slug: 'shipping-policy', title: 'Shipping / Delivery Policy' },
] as const;
