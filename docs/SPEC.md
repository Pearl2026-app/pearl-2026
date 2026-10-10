# Sahyadri Pearls — Master Build Prompt

> Saved word for word from Part 1 onward, together with the source reconciliation table. The "How to use this prompt" preamble and the author line are left out because they name tools and an agency, which rule 10 (white-label) forbids in the repository. See docs/DECISIONS.md D30.

The three documents disagree in places. The prompt follows the Product Requirements Document and your front-end / back-end list, because they are the most recent and the most complete.

| Point | What the sources say | What this prompt does |
|---|---|---|
| Prices | Client brief: prices must not be shown. PRD and your list: cart, checkout and payment gateways. | Prices are shown. Each product has a "price on request" switch that hides the price and Add to Cart and leaves only WhatsApp enquiry. |
| Mobile apps | Summary: an app comes later. PRD and your list: Android and iOS now. | Customer app and delivery app are both in scope, built in Phase 5. |
| Referral | Summary: later. Your list: referral code in the account menu. | Referral code is in scope. Loyalty points stay switched off. |
| Commissions, live GPS, multi-currency, loyalty | Summary: designed in now, switched on later. PRD lists them as capabilities. | Tables and fields are created now. The features sit behind off switches. |
| Ring AI | One line, no detail. | Assumed to be a guided ring finder that recommends catalogue pieces and hands off to a customized request. |
| Manufacturer | Appears only in order filters and PO generation. | Treated as its own record, separate from vendors. |
| Tech stack | Not named anywhere. | One is chosen in Part 2. Change it if your developer prefers another. |

Confirm these four before building starts: payment gateway (Razorpay assumed), WhatsApp Business API provider, SMS OTP provider, and hosting.

## Part 1 — Role and mission

You are the lead engineer building the Sahyadri Pearls platform from an empty repository. Sahyadri Pearls is an Indian pearl jewellery brand whose pearls are traced to named farms. It sells through its own team, vendors and city franchises, and delivers through its own delivery partners.

You are building two connected products on one database and one API:

1. The store. A premium jewellery e-commerce website, plus Android and iOS customer apps. Customers browse, see prices, add to cart, pay online or choose cash on delivery, and track the order. Every product also has a WhatsApp enquiry button, because high-value and bespoke pieces are usually discussed before they are bought.
2. The business platform. One central admin that runs products, enquiries, orders, cities, vendors, franchises, manufacturers, delivery partners, staff, content and reports, with separate panels for each partner type.

Most customers will arrive on a phone in India, often on a slow connection, so the storefront must be fast and comfortable to buy from on mobile. Most admin users are not technical, so routine work must never need a developer.

Your first action is to save this whole prompt, word for word, as docs/SPEC.md, and to create docs/STATUS.md with a checklist of every phase and feature. Re-read both files at the start of every session, because you will not remember earlier sessions.

The attached PDFs are background. Where they conflict with this prompt, this prompt wins. Where this prompt is silent, choose the simplest option consistent with it and record the choice in docs/DECISIONS.md. Do not stop to ask. When a choice affects money, permissions or deletion of data, take the more cautious option, record it, and flag it in docs/STATUS.md for the owner to review.

## Part 2 — Tech stack and repository

Use one TypeScript monorepo so the website, admin and apps share types and one API. Use the latest stable version of each tool.

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | One codebase, shared types |
| Storefront | Next.js (App Router), server-rendered | Fast first load and strong SEO |
| Admin and partner panels | Next.js app, separate from the storefront | Keeps admin code out of the public site |
| API | NestJS REST API with OpenAPI docs | One backend for web, admin and both apps |
| Database | PostgreSQL with Prisma migrations | Relational data, transactions for stock |
| Jobs and cache | Redis + BullMQ | Notifications, cart recovery, stock holds |
| Mobile apps | React Native with Expo | Android and iOS from one codebase |
| Styling | Tailwind CSS with a shared design-token package | Consistent look across web and admin |
| Media | S3-compatible storage behind a CDN, with image resizing | Large image catalogue |
| Search | PostgreSQL full-text search to start | No extra service until needed |
| Hosting | Docker containers in an India cloud region | Customer data stays in India |

Repository layout:

- apps/web — customer storefront
- apps/admin — central admin plus city manager, vendor and franchise panels
- apps/api — the API, background workers and webhooks
- apps/mobile-customer — customer app
- apps/mobile-delivery — delivery partner app
- packages/db — Prisma schema, migrations and seed data
- packages/shared — types, validation schemas, permission rules, price and GST maths
- packages/ui — design tokens and shared components
- docs — sitemap, data model, permission matrix, API reference, runbook, decisions

Every third-party service sits behind an interface in the API (payments, WhatsApp, SMS, email, push, storage, pearl rates), so a provider can be swapped without touching business logic.

## Part 3 — Rules that apply everywhere

These ten rules matter more than any single feature. Each one has a reason; keep to the reason when a case is not spelled out.

1. Permissions are enforced in the API, not the menu. Every query is scoped by the caller's role, city, vendor or franchise. A city manager who requests another city's order by ID gets "not found". Hiding a menu item is not security, and partners will share one system.
2. A one-of-a-kind piece can be sold only once. Each product is either unique or quantity stock. When checkout starts, hold the unique piece for 15 minutes inside a database transaction with a row lock. Mark it sold on payment success or COD confirmation, and release it if payment fails or the hold expires. Two simultaneous checkouts must end with exactly one order.
3. An enquiry is saved before WhatsApp opens. A tap on Enquire creates the enquiry record first, then opens WhatsApp with a pre-filled message carrying the product name, SKU and enquiry reference. If saving fails, still open WhatsApp and retry in the background. The customer must never be blocked, and no enquiry may be lost.
4. Business settings are data, not code. Cities, vendors, franchises, manufacturers, delivery partners, WhatsApp numbers, message templates, routing rules, payment methods, GST rates, delivery charges and every website content block are managed in the admin. Adding a city must take minutes and no deployment.
5. Money is calculated on the server. Store amounts as integer paise. Compute price, discount, GST and delivery in the API and ignore totals sent by the client. Mark an order paid only after the gateway webhook signature is verified.
6. Everything staff and partners change is logged. The audit log records who, what, the before and after values, when and from which IP. It is append-only.
7. Nothing important is hard-deleted. Orders, enquiries, customers and products are archived or deactivated, so history and reports stay intact.
8. Later features sit behind switches. Vendor commissions and settlements, live GPS tracking, multi-currency and loyalty points have their tables and fields now and a feature flag set to off.
9. Data stays inside the system. No customer, enquiry or order data goes to any third party beyond the approved integrations. Run automated daily backups and include a restore script that is actually tested.
10. The product is white-labelled. No agency or developer name appears anywhere. The footer reads "Developed by Sahyadri Pearls" and "© [year] Sahyadri Pearls. All Rights Reserved."

## Part 4 — Roles and permissions

There are seven roles, each with its own login and its own view. Define the permission matrix once in packages/shared and use it in the API and in every interface.

| Role | Signs in with | Sees and does |
|---|---|---|
| Super Admin | Email, password and OTP | Everything, across every city and partner. Manages staff, roles and settings. |
| Admin / Staff | Email, password and OTP | Only the modules a Super Admin grants, each as view, create, edit or delete. |
| City Manager | Email, password and OTP | Their own city only: enquiries, orders, partners and reports. |
| Vendor | Email or phone, with OTP | Their own products, stock and orders, in their own panel. |
| Franchise | Email or phone, with OTP | The enquiries and orders assigned to them, and their own performance. |
| Delivery Partner | Phone and OTP | Deliveries assigned to them, with one-tap status updates. |
| Customer | Phone and OTP | Their own account, orders, tracking, addresses, wishlist, referral code and returns. |

Write automated tests that sign in as each role and try to read and change data outside its scope. Every such attempt must fail.

## Part 5 — Customer website

Build a modern, premium storefront that works on mobile, tablet and desktop. Every content block on it is editable from the admin.

### Navigation

- Header: Home | Jewellery | Our Farm | Customized Jewellery | Contact | Search icon | Cart icon with item count | Sign Up, which becomes My Account after login.
- Footer: About Us with address | Contact Us | Terms & Conditions | Refund Policy | Privacy Policy | Return & Cancellation Policy | Shipping / Delivery Policy | FAQ | Careers | Download the app (Android and iOS) | "Developed by Sahyadri Pearls" | "© [year] Sahyadri Pearls. All Rights Reserved."
- Account menu after login, in this order: Account | My Orders | Manage Addresses | Wishlist | Referral Code | Returns | Terms & Conditions | Logout.

### Pages

Home, Jewellery catalogue, Category pages, Collection pages, Product detail, Cart, Checkout, Order confirmation, Order tracking, My Account, Wishlist, Offers, Bulk Buying / B2B, Our Story, Gallery, Our Farm index and one page per farm, Customized Jewellery, Ring Finder, Contact, FAQ, Careers, and the five legal pages.

### Catalogue and product page

- Filter by category, collection, farm, carat range, shape, colour and price. Search by product name or SKU. Sort by newest, price and carat.
- The product page shows a large image gallery with zoom, product video, price, and the full specification: carat, shape, colour, lustre, surface, origin farm and certification.
- Below that: the farm's story with a link to its page, reviews and ratings, and related pieces.
- Two actions, Add to Cart and Enquire on WhatsApp, stay fixed within reach while scrolling on a phone.
- A product marked "price on request" hides the price and Add to Cart and shows only the enquiry button.
- A sold unique piece shows as Sold and offers "Enquire about a similar piece".

### Cart, checkout and payment

- The cart survives a closed browser and merges into the account on login. It shows quantity, a coupon field and a running total with GST and delivery.
- Checkout is one short page that works as a guest or signed in: delivery address, city, order summary, payment.
- Payment is online through the gateway (UPI, cards, net banking, wallets) or cash on delivery. Each method can be switched on or off from the admin.
- Coupons apply at checkout with rules for minimum value, maximum discount, category or product, first-time buyers and dates.
- After payment the customer gets a confirmation page, a GST invoice, and a tracking link by WhatsApp and email.

### Account

- Sign up and log in by mobile number and OTP.
- My Orders shows history, order detail, live status and invoice download.
- Saved addresses, saved payment preference, and wishlist with "share on WhatsApp" so a customer can send a shortlist to family.
- Referral code: each customer has a code to share. Admin sets the reward for the referrer and the new buyer.
- Returns and cancellations are requested from the order and handled by the team in the admin.

### Customized Jewellery

A dedicated page with a form: jewellery type, preferred metal or material, size, design notes, reference image upload, budget and extra notes. Submitting creates a customized enquiry in the enquiry inbox, where the team assigns it, quotes it and converts it into a customized order.

### Ring Finder (Ring AI)

A guided flow asks for occasion, budget, style, metal, pearl colour and shape, and ring size. It returns matching rings from the live catalogue with a one-line reason for each. Recommend only real, in-stock products: filter the catalogue first, then use the AI model to rank and explain. If nothing fits, pass the answers into the Customized Jewellery form. If the AI service is unavailable, fall back to the plain filtered results.

### Contact, enquiry and other pages

- Contact shows address, phone, email, map, a contact form and a WhatsApp button. A floating WhatsApp button appears on every page.
- Bulk Buying has a B2B enquiry form that routes to the wholesale WhatsApp number.
- Offers lists the active offers and coupons set in the admin.
- Each farm page carries the farm's profile, location, photos and the pearls that came from it.
- FAQ questions and answers are managed in the admin.
- Careers lists openings with title, location, description and eligibility, and has an application form with resume upload.
- Each certificate of authenticity carries a QR code that opens the piece's page and its farm origin.

### SEO and speed

Generate titles, descriptions and structured data automatically for every product, category and farm page, with an admin override. Provide clean URLs, an XML sitemap and compressed, lazy-loaded images. Target a mobile Lighthouse performance score of 90 or more on the home, catalogue and product pages.

## Part 6 — Central admin

One admin runs the store, the orders and the enquiries. Every list has search, filters, sorting, pagination and CSV export.

### Dashboard

Cards for total users, total orders, total sales, total franchises / stores, total products, out-of-stock products, pending, completed and cancelled orders, and pending and converted enquiries. Below them: monthly sales summary, monthly order summary, recent orders with a link to order detail, and recent enquiries. A date-range filter applies to the whole page. A City Manager sees the same dashboard limited to their city.

### User database

- Customers: name, phone, email, city, order count, total spend, referral code, active or blocked status, and full order and enquiry history.
- Staff and partner users: create, assign a role, grant modules, deactivate.

### Categories

Add, edit and archive. Fields: name, description, image, active / inactive status, the cities it appears in, and sort order.

### Products

- Add, edit, publish, unpublish, archive, and bulk-import from CSV.
- Fields: name, SKU, category, collection, description, main images, carousel images with drag-to-reorder, product video, price, metal cost, labour cost, pearl rate / cost, carat weight as a decimal number, shape, colour, lustre, surface, origin farm, certification, vendor, cities, related products.
- Stock: stock type (unique or quantity), quantity, and an out-of-stock switch. A "price on request" switch per product.
- Bulk image upload with automatic cropping and compression.

### Orders

- Three ways in: customer checkout, an enquiry converted in one click, or manual entry by the team for a phone or Instagram sale.
- Each order carries line items, customer, delivery address, city, assigned vendor, franchise, manufacturer and delivery partner, order status, payment status, GST invoice and a full timeline.
- Order status: Placed, Confirmed, Packed, Assigned, Picked Up, Out for Delivery, Delivered, plus Cancelled, Failed, Returned and Refunded.
- Payment status: Pending, Paid, COD Pending, COD Collected, Failed, Refunded.
- Filters: search by order number, customer, phone or SKU; date range; order value range; city; vendor; franchise; manufacturer; status; payment status.

### Customized orders, purchase orders and manufacturers

- Team order filling: staff complete the customized order form with jewellery type, metal, weight, pearl details, size, design files, and a cost breakdown of metal, labour, pearl and margin that produces the quoted price.
- Production stages: Requirement, Quoted, Advance Paid, PO Raised, In Manufacturing, Quality Check, Ready, Dispatched, Delivered.
- PO generation: choose a manufacturer from a dropdown and generate a numbered purchase order PDF with specification, quantity, agreed cost and due date. PO status: Draft, Sent, Accepted, In Production, Received, Closed.
- Manufacturers are a managed list: name, contact, city, speciality, active / inactive.

### Enquiry inbox (WhatsApp CRM)

- Every enquiry lands here with product, page, city, visitor source and customer contact.
- Stages: New, In Progress, Quoted, Converted, Closed. Each has an owner, a response timer and internal notes.
- One click turns an enquiry into an order with the details carried over.
- WhatsApp numbers, message templates and routing rules are edited here. Rules route by city and by type, so Pune enquiries reach the Pune team and bulk enquiries reach the wholesale number.
- An automatic acknowledgement goes to the customer while a person picks the enquiry up.

### Content, banners and pages

Edit home banners, featured products, collections, story content, testimonials, trust points, gallery, farm pages, FAQ, job openings and the legal pages, including Terms & Conditions. Job applications and resumes are visible to authorised staff. Legal pages keep version history.

### Coupons and offers

Create custom coupon codes with discount type and value, minimum order value, maximum discount, category or product restrictions, first-time-buyer restriction, start and end dates, usage limits and an active / inactive switch. Show usage per coupon.

### Push notifications

Compose offer and promotional notifications, target all customers or a city or segment, send now or schedule, and track status and delivery counts. Order notifications go out automatically at each status change.

### Network: cities, vendors, franchises, delivery partners

- Add, edit, activate and deactivate each from the admin. Assign vendors, franchises and delivery partners to cities.
- Franchise fields: name, city, area, address, contact details, status, assigned enquiries and orders, sales and performance.

### Pearl pricing

- A rate table managed in the admin by grade, farm and size. This is the guaranteed source.
- A live rate feed adapter that stays off until a usable market source is confirmed.
- Margin rules, and a calculator that takes carat, grade and farm and suggests a price. Staff use it to price the catalogue and to answer WhatsApp quotes.

### Payments, returns, reviews, reports, settings

- Payments: transaction list, refunds and COD reconciliation.
- Returns and cancellations: request queue with approve, reject, pickup and refund steps.
- Reviews: requested automatically after delivery, moderated before they show.
- Abandoned cart: a WhatsApp reminder with the cart link, with timing set in the admin.
- Reports: sales, orders, monthly summaries, enquiries, franchise and vendor performance, and WhatsApp analytics showing which products, cities and sources produce enquiries and orders and how they convert.
- Settings: payment methods on or off, GST rates and HSN codes per category, delivery charges, notification templates and feature flags.
- Audit log viewer with filters by user, record and date.

## Part 7 — Partner panels

Each partner type gets its own login and a panel showing only its own data. The panels live in the admin app and reuse its components, with the API enforcing the scope.

- City Manager panel. The dashboard, enquiries, orders, partners and reports for one city. No access to settings, other cities or global reports.
- Vendor panel. Their own products and stock, the orders assigned to them, and order status updates up to Packed. They can add or edit products, which go live after admin approval. Commission and settlement screens exist but stay hidden until the feature is switched on.
- Franchise panel. The enquiries and orders assigned to them by city and area. They can update enquiry stages, add notes, convert an enquiry to an order, assign a delivery partner from their city, and see their own sales and performance.
- Delivery Partner panel. A mobile-first screen, also shipped as the delivery app in Part 8. It shows today's deliveries and history. Status moves Assigned, Picked Up, Out for Delivery, Delivered in one tap each. Failed and Returned are alternatives that require a reason. Delivery ends with proof of delivery: a photo, and a signature or customer OTP. For COD orders the partner records the amount collected.

The delivery screens are used standing at a customer's door, often in sunlight with one hand. Use large buttons, few fields and a working offline queue that syncs when the signal returns.

## Part 8 — Android and iOS apps

Build two apps with React Native and Expo, each for Android and iOS, both using the same API as the website.

- Customer app. The full store: browse, search, filter, product detail, wishlist, cart, checkout, payment, order tracking, account, referral code, returns, Customized Jewellery, Ring Finder and WhatsApp enquiry. It receives offer and order push notifications. Product and tracking links open in the app when it is installed.
- Delivery app. Login by phone and OTP, today's deliveries, one-tap status updates, reasons for Failed and Returned, proof of delivery, COD collection, history, and a push notification for each new assignment. Location capture is built in but live GPS tracking stays behind its feature flag.

Prepare both apps for release: app icons, splash screens, store listing text, privacy policy link, and build configuration for the Play Store and the App Store. The website footer links to both stores, with the links set in the admin.

## Part 9 — Data model

Design the PostgreSQL schema around these entities. Every table has an id, created and updated timestamps, and an archived or active marker where rule 7 applies. Almost every business record carries a city, because city is the main boundary for permissions and reports.

| Area | Entities | Key fields and notes |
|---|---|---|
| People | User, StaffPermission, Customer, Address, DeviceToken | User has one role and an optional city, vendor or franchise link. StaffPermission holds module and allowed actions. Customer has phone, referral code and referred-by. |
| Network | City, Vendor, Franchise, Manufacturer, DeliveryPartner | Franchise has city, area, address, contact and status. Join tables link vendors, franchises and delivery partners to cities. |
| Catalogue | Category, CategoryCity, Collection, Farm, Product, ProductImage, RelatedProduct, Certificate, Review | Product has SKU, price, price-on-request, metal cost, labour cost, pearl cost, carat as decimal, shape, colour, lustre, surface, farm, certification, stock type, quantity, status, vendor and video. ProductImage has kind and sort order. |
| Shopping | Cart, CartItem, Wishlist, StockHold, Coupon, CouponRedemption, Referral | StockHold links a unique product to a checkout with an expiry time. |
| Orders | Order, OrderItem, OrderEvent, Payment, Refund, Invoice, ReturnRequest, Delivery | Order has number, source (checkout, enquiry, manual), type (standard, customized), address snapshot, all assignments, status, payment status and money fields in paise. Delivery has status, failure reason, proof and COD collected. |
| Customized work | CustomRequest, PurchaseOrder | CustomRequest has type, metal, size, design notes, images and budget. PurchaseOrder has number, manufacturer, specification, cost, due date and status. |
| Enquiries | Enquiry, EnquiryNote, WhatsAppNumber, MessageTemplate, RoutingRule | Enquiry has reference, type (product, customized, bulk, ring finder, contact), product, page, city, source, stage, owner, first-response time and converted order. |
| Content | Banner, ContentBlock, Page, Testimonial, GalleryItem, Faq, JobOpening, JobApplication | Page holds legal text with versions. JobApplication holds the resume file. |
| Pricing | PearlRate, MarginRule | PearlRate is by grade, farm and size, with a source of manual or feed. |
| System | Notification, NotificationLog, Setting, FeatureFlag, AuditLog | AuditLog has actor, action, record, before, after, time and IP. |
| Switched off for now | VendorCommission, Settlement, LoyaltyLedger, Currency, DeliveryLocationPing | Created in the schema, unused until their flag is on. |

Provide seed data: one Super Admin, two cities, two farms, sample categories and about thirty products, and one user for each partner role, so every panel can be tested on day one.

## Part 10 — Integrations and fallbacks

Some features depend on outside services and approvals. Each integration needs a working fallback so the business workflow survives when the service is unavailable or not yet approved. Never drop a capability silently; say what is missing and propose the closest alternative.

| Integration | Used for | Fallback |
|---|---|---|
| Payment gateway (Razorpay assumed) | UPI, cards, net banking, wallets, refunds | Cash on delivery stays available. A sandbox mode runs until live keys arrive. |
| WhatsApp Business API | Order updates, enquiry acknowledgement, cart recovery, review requests | A click-to-chat link with a pre-filled message, which needs no approval, plus email. |
| SMS OTP provider | Customer and partner login | Email OTP for staff. A fixed test OTP in development only. |
| Email service | Order updates, invoices, staff alerts | Queue and retry. Messages are also visible in the admin. |
| Push service (Firebase Cloud Messaging) | Offer and order notifications to both apps | WhatsApp and email carry the same order updates. |
| File storage and CDN | Product images, video, resumes, proof of delivery | Local disk storage in development. |
| AI model provider | Ring Finder ranking and explanations | Plain filtered catalogue results. |
| Pearl market-rate source | Live rate feed | The admin-managed manual rate table. |

Keep all keys in environment variables, document each one in .env.example, and verify the signature on every incoming webhook.

## Part 11 — Design direction

The storefront should feel like a fine-jewellery house, not a marketplace template. The pearls and the farms are the story, so let photography carry the pages.

- Palette. Warm ivory and pearl-white backgrounds, deep charcoal text, and one rich accent used sparingly, such as deep teal or muted gold. No bright sale-banner colours.
- Type. An elegant serif for headings and a clean sans-serif for body text and the interface. Large, comfortable sizes on mobile.
- Layout. Generous white space, large product images on a consistent neutral background, and a calm grid. One clear action per screen.
- Motion. Slow, subtle transitions on images and page sections. Nothing that delays a tap.
- Trust. Farm origin, certification and delivery promises shown near the price and the buy buttons.
- Admin and panels. Plain, dense and fast. Clear tables, obvious status colours, and forms that show errors next to the field.
- Accessibility. Readable contrast, visible focus states, labels on every form field, and touch targets of at least 44 pixels.

Keep colours, type and spacing as tokens in packages/ui, so the brand can be adjusted in one place.

## Part 12 — Build phases and definition of done

Build in seven phases, in order, and move straight from one to the next without waiting for approval. Finish and test each phase before starting the next, because later phases depend on earlier ones.

1. Phase 0 — Plan. Before any feature code, produce the sitemap, the design direction with sample screens for home, catalogue, product page and checkout, the full database schema, the permission matrix, the API outline and this phase plan with estimates. Commit them to the docs folder so the client can review them, then continue.
2. Phase 1 — Foundation. Monorepo, database and migrations, OTP and staff login, roles and permissions with tests, audit log, admin shell, cities, vendors, franchises, manufacturers, delivery partners, categories, products with image and video upload, and content management.
3. Phase 2 — Storefront and enquiries. All public pages, catalogue with filters and search, product page, WhatsApp enquiry capture, enquiry inbox with routing and templates, Customized Jewellery, farm pages, FAQ, Careers, legal pages and SEO.
4. Phase 3 — Commerce. Cart, checkout, payment gateway and COD, stock holds, coupons and offers, orders, GST invoices, customer account, order tracking, WhatsApp and email updates, returns and cancellations, and referral codes.
5. Phase 4 — Operations. City manager, vendor, franchise and delivery panels, proof of delivery, customized order workflow, PO generation, pearl pricing and calculator, dashboard, reports, WhatsApp analytics, abandoned cart, reviews, certificates with QR, Ring Finder and push notification management.
6. Phase 5 — Mobile apps. Customer app and delivery app for Android and iOS, with store release preparation.
7. Phase 6 — Hardening and handover. Security review, load test, backup and restore test, deployment, documentation and admin training notes.

How to work in every phase:

- Start by listing what you will build. End with a summary of what works, what is stubbed, how to test it, and test logins for each role.
- Make small commits. Add a migration for every schema change and never edit one that has been applied.
- Never leave a silent placeholder. List anything unfinished in docs/STATUS.md.
- Write unit tests for price, GST and coupon maths.
- Write integration tests for permissions by role, two buyers racing for one unique piece, payment webhooks, and enquiry capture when WhatsApp opens.
- Write two end-to-end tests: browse, add to cart, pay, track; and browse, enquire, convert to order, deliver.

How to work without supervision:

- Do not ask questions or wait for confirmation. Decide, record the decision, and keep going.
- Update docs/STATUS.md after every finished item, so any new session can resume from it.
- Run the tests, the linter and the build after each feature. Fix failures before moving on. Never skip, delete or weaken a test to make it pass.
- When something fails three times, write what you tried in docs/STATUS.md, stub it behind its interface, and move to the next item.
- When a key or account is missing, build against the fallback or a sandbox, add the variable to .env.example, and list it under "Needed from the owner" in docs/STATUS.md.
- Never run destructive commands outside the project folder, never force-push, and never put real secrets in the repository.
- At the end of each phase, commit, tag the commit with the phase name, and start the next phase immediately.
- Stop only when every item in the done list below is ticked, or when only owner-supplied items remain. Then write a final report at the top of docs/STATUS.md.

The project is done when:

- Every feature in Parts 5 to 8 works with real data, and every integration either works or runs on its documented fallback.
- All tests pass, including the permission tests for all seven roles.
- A new city, vendor, franchise, manufacturer and delivery partner can each be added from the admin with no code change.
- A sold unique piece cannot be ordered a second time under load.
- Backups run automatically and a restore has been tested.
- The client receives the full source code, Super Admin access, and documentation: setup guide, data model, permission matrix, API reference, deployment and backup runbook, and an admin user guide.
