# Sitemap

## Storefront (apps/web)

URLs are lowercase, hyphenated and have no ids. Every page has auto-generated title, description and structured data, with an admin override.

### Navigation
- **Header:** Home · Jewellery · Our Farm · Customized Jewellery · Contact · Search · Cart (count) · Sign Up → My Account after login
- **Footer:** About Us (with address) · Contact Us · Terms & Conditions · Refund Policy · Privacy Policy · Return & Cancellation Policy · Shipping / Delivery Policy · FAQ · Careers · Download the app (Play Store, App Store; links set in the admin) · "Developed by Sahyadri Pearls" · "© {year} Sahyadri Pearls. All Rights Reserved."
- **Floating WhatsApp button** on every page (routed number for the visitor's city, otherwise the default)
- **Account menu, in this order:** Account · My Orders · Manage Addresses · Wishlist · Referral Code · Returns · Terms & Conditions · Logout

### Pages
| Route | Page | Structured data |
|---|---|---|
| `/` | Home: hero banners, featured collections, farm story, featured pieces, trust points, testimonials, gallery strip | Organization, WebSite + SearchAction |
| `/jewellery` | Catalogue: filters, search, sort | ItemList, BreadcrumbList |
| `/jewellery/[category]` | Category page | ItemList, BreadcrumbList |
| `/collections/[collection]` | Collection page | ItemList |
| `/product/[slug]` | Product detail | Product + Offer (no Offer when price-on-request), AggregateRating, BreadcrumbList |
| `/search?q=` | Search results (name or SKU) | — (noindex) |
| `/cart` | Cart | noindex |
| `/checkout` | One-page checkout (guest or signed in) | noindex |
| `/order/[number]/confirmed` | Order confirmation | noindex |
| `/track/[number]` | Order tracking (signed link, or signed in) | noindex |
| `/offers` | Active offers and coupons | — |
| `/bulk-buying` | Bulk / B2B enquiry form → wholesale WhatsApp | — |
| `/our-story` | Our Story | AboutPage |
| `/gallery` | Gallery | ImageGallery |
| `/our-farm` | Farm index | — |
| `/our-farm/[slug]` | One page per farm: profile, location map, photos, pearls from this farm | Place |
| `/customized-jewellery` | Customized Jewellery form | — |
| `/ring-finder` | Ring Finder guided flow and results | — |
| `/contact` | Address, phone, email, map, contact form, WhatsApp | LocalBusiness |
| `/faq` | FAQ | FAQPage |
| `/careers` · `/careers/[slug]` | Openings and the application form | JobPosting |
| `/verify/[code]` | Certificate of authenticity (QR target) | noindex |
| `/terms` · `/privacy` · `/refund-policy` · `/return-cancellation-policy` · `/shipping-policy` | Legal pages (versioned) | — |
| `/about` | About Us with address | — |
| `/login` | Mobile number + OTP (sign up and log in are one flow) | noindex |
| `/account` | Profile | noindex |
| `/account/orders` · `/account/orders/[number]` | History, detail, live status, invoice download | noindex |
| `/account/addresses` | Manage addresses | noindex |
| `/account/wishlist` | Wishlist with "share on WhatsApp" | noindex |
| `/account/referral` | Referral code, share link, rewards earned | noindex |
| `/account/returns` | Return and cancellation requests | noindex |
| `/sitemap.xml` · `/robots.txt` | Generated | — |

## Admin and partner panels (apps/admin)

One app. Menus come from the permission matrix and the API enforces scope.

### Central admin (Super Admin / granted Staff)
| Route | Screen |
|---|---|
| `/login` | Email + password, then OTP |
| `/` | Dashboard (date-range filter) |
| `/customers` · `/customers/[id]` | User database: orders, enquiries, block |
| `/users` · `/users/[id]` | Staff and partner users, role, module grants |
| `/categories` · `/collections` · `/farms` | Catalogue structure |
| `/products` · `/products/new` · `/products/[id]` · `/products/import` · `/products/approvals` | Products, CSV import, vendor approvals |
| `/certificates` | Certificates and QR |
| `/orders` · `/orders/new` · `/orders/[id]` | Orders (manual entry, detail, timeline, assignments, invoice) |
| `/custom-orders` · `/custom-orders/[id]` | Customized order form, cost breakdown, production stages |
| `/purchase-orders` · `/purchase-orders/[id]` | PO generation and status |
| `/manufacturers` | Manufacturer list |
| `/enquiries` · `/enquiries/[id]` | Enquiry inbox (WhatsApp CRM) |
| `/enquiries/settings` | WhatsApp numbers, message templates, routing rules |
| `/content/banners` · `/content/blocks` · `/content/pages` · `/content/testimonials` · `/content/gallery` · `/content/faq` | Content |
| `/careers` · `/careers/applications` | Job openings and applications |
| `/coupons` | Coupons and offers, usage |
| `/notifications` | Push campaigns |
| `/network/cities` · `/network/vendors` · `/network/franchises` · `/network/delivery-partners` | Network |
| `/pricing/rates` · `/pricing/margins` · `/pricing/calculator` | Pearl pricing |
| `/payments` · `/payments/cod` | Transactions, refunds, COD reconciliation |
| `/returns` | Return and cancellation queue |
| `/reviews` | Review moderation |
| `/abandoned-carts` | Abandoned carts and reminder status |
| `/reports/[report]` | Sales, orders, monthly, enquiries, franchise, vendor, WhatsApp analytics |
| `/settings` · `/settings/feature-flags` · `/settings/templates` | Settings |
| `/audit-log` | Audit log viewer |
| `/messages` | Outbound message log (all channels) |

### City Manager panel
Dashboard, Enquiries, Orders (+ manual), Custom orders, Customers, Partners in the city (view and assign), Payments (view), Returns, Reports. All of it is limited to their city.

### Vendor panel
Dashboard, My products (add/edit → approval), Stock, Assigned orders (status up to Packed), Reports. Commissions and Settlements stay hidden until `vendor_commissions` is on.

### Franchise panel
Dashboard / performance, Assigned enquiries (stage, notes, convert), Assigned orders (assign a delivery partner from their city), Pricing calculator.

### Delivery Partner panel (`/delivery`, mobile-first)
Today · History · Delivery detail (one-tap status, reason, proof, COD).

## Customer app (apps/mobile-customer)

Tabs: **Home · Shop · Wishlist · Cart · Account**

Screens: Home, Catalogue (filters/sort), Search, Category, Collection, Product detail, Farm, Cart, Checkout, Payment (gateway SDK), Order confirmation, Orders, Order detail / tracking, Addresses, Wishlist, Referral, Returns, Customized Jewellery, Ring Finder, Offers, Contact, FAQ, Legal pages, Login (phone + OTP), Notifications inbox.

Deep links: `/product/*`, `/track/*`, `/offers` and `/account/orders/*` open in the app when it is installed (Android App Links / iOS Universal Links).

## Delivery app (apps/mobile-delivery)

Login (phone + OTP) → **Today** (list) → **Delivery detail** (address, call, navigate, items, COD amount) → status buttons → **Proof** (photo, signature or customer OTP, COD collected) → **History**. An offline queue banner shows pending syncs.
