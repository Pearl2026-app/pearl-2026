# Phase Plan

Seven phases, each ending in a review gate. Development does not move to the next phase until the client approves the current one.

Estimates are in **developer-weeks** for one experienced full-stack TypeScript developer working with AI-assisted tooling. They assume the open questions are answered on time ([OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)) and that product photography and content arrive from the client. A team of two cuts the calendar time by roughly 40%, not 50%, because of review and integration overhead.

| Phase | Scope (summary) | Estimate |
|---|---|---|
| 0 Plan | This package | 1 |
| 1 Foundation | Monorepo, DB, auth, permissions, audit, admin shell, network, catalogue, uploads, content | 4–5 |
| 2 Storefront & enquiries | Public site, catalogue, product page, enquiry capture, inbox, custom form, farms, SEO | 4–5 |
| 3 Commerce | Cart, checkout, payments, holds, coupons, orders, invoices, account, notifications, returns, referrals | 5–6 |
| 4 Operations | Partner panels, delivery, custom workflow, POs, pricing, dashboard, reports, reviews, QR, Ring Finder, push | 5–6 |
| 5 Mobile apps | Customer app and delivery app, store preparation | 4–5 |
| 6 Hardening & handover | Security, load, backups, deployment, docs, training | 2 |
| **Total** | | **25–30** |

App store review, WhatsApp template approval and payment gateway KYC run in parallel and are outside our control. Start them during Phase 1 (see open questions).

---

## Phase 0: Plan for approval ✅ (this package)
**Deliver:** sitemap, design direction with sample screens, database schema, permission matrix, API outline, decisions, open questions, this plan.
**Exit:** the client approves the package and answers (or accepts the defaults for) the open questions.

## Phase 1: Foundation
**Build**
- pnpm/Turborepo monorepo, TypeScript config, lint/format, CI (lint, typecheck, test, build) and Docker Compose for Postgres, Redis, Mailpit and MinIO.
- `packages/db`: first migration from the approved schema, raw-SQL migrations (partial unique index on active holds, audit log grants), seed data.
- `packages/shared`: permission matrix, Zod schemas, money / GST / coupon maths with unit tests.
- `packages/ui`: tokens, Tailwind preset, base components (button, input, select, table, dialog, toast, upload).
- API: auth (customer/partner OTP, staff password + OTP, refresh, sessions), guards and scope layer, audit log interceptor, provider interfaces with development implementations, storage + image processing worker, health checks.
- Admin: shell (login, layout, menu from permissions), Users & grants, Cities, Vendors, Franchises, Manufacturers, Delivery partners, Categories, Collections, Farms, Products (images with reorder, video, CSV import, approval), Content (banners, blocks, pages with versions, testimonials, gallery, FAQ, jobs), Settings, Feature flags, Audit log viewer.

**Tests:** permission negative tests for all seven roles against the Phase 1 modules; money maths unit tests; audit log append-only test.
**Exit:** each role logs in and sees only its scope; a city, vendor, franchise, manufacturer and delivery partner can be added from the admin; about 30 seeded products are manageable.

## Phase 2: Storefront and enquiries
**Build:** every public page in [SITEMAP.md](SITEMAP.md); catalogue with filters, full-text search and sort; product page (gallery, zoom, video, spec, farm, sticky actions, price-on-request, sold state); enquiry capture (save first, then open WhatsApp; background retry with `clientId`); enquiry inbox with stages, owner, response timer, notes, routing rules, templates, auto-acknowledgement; Customized Jewellery form → CustomRequest; farm pages; FAQ; Careers with resume upload; legal pages; Offers page (read-only); SEO (metadata, JSON-LD, sitemap, robots, image optimisation).
**Tests:** enquiry capture integration test (including a failed save that still opens WhatsApp and retries); routing rule resolution; Lighthouse CI budget (mobile performance ≥ 90 on home, catalogue and product).
**Exit:** a visitor can browse, find a piece and enquire, and the right team sees the enquiry with its reference.

## Phase 3: Commerce
**Build:** cart (guest + merge), coupons, one-page checkout, stock holds with row locks and expiry, Razorpay (sandbox) with signature-verified webhook, COD, order creation from checkout / enquiry / manual, state machine and timeline, GST invoice PDF (CGST/SGST vs IGST), customer account (orders, addresses, wishlist + share, referral code, returns), tracking page with signed link, WhatsApp/email notifications at each status, return and cancellation queue, refunds, referral rewards.
**Tests:** race test (N concurrent checkouts on one unique piece → exactly one order); webhook tests (valid, invalid signature, duplicate, late payment after expiry → auto-refund); coupon rule tests; e2e *browse → add to cart → pay → track*.
**Exit:** real sandbox payments and COD orders flow end to end; a sold piece cannot be bought twice.

## Phase 4: Operations
**Build:** City Manager, Vendor, Franchise and Delivery panels; delivery flow with proof (photo, signature or OTP), COD collection and offline queue (web); COD reconciliation; customized order workflow and production stages; PO generation PDF and status; pearl rate table, margins and calculator; dashboard; reports + WhatsApp analytics + CSV; abandoned-cart reminders; review requests and moderation; certificates with QR + `/verify`; Ring Finder (filter → AI rank → fallback → hand-off to the custom form); push notification composer and scheduling (FCM).
**Tests:** permission tests extended to all panels; e2e *browse → enquire → convert to order → deliver*; Ring Finder fallback test.
**Exit:** the full business loop runs from the panels with no developer involvement.

## Phase 5: Mobile apps
**Build:** Expo customer app (whole store, Razorpay SDK, push, deep links) and delivery app (OTP login, today, one-tap status, proof, COD, offline queue with sync, push on assignment, location capture with live GPS behind its flag). Icons, splash screens, store listing text, privacy policy link, EAS build profiles for the Play Store and App Store; store links editable in the admin.
**Tests:** shared API client contract tests; device smoke test on Android and iOS; offline queue replay test.
**Exit:** internal test builds installed and approved; store submissions prepared.

## Phase 6: Hardening and handover
**Build:** security review (OWASP ASVS L2 checklist, dependency audit, rate limits, headers, secret scan), load test (k6: browse + checkout peak, and the unique-piece race under load), automated daily backups plus a **tested** restore script, production deployment to the India region with monitoring and alerts, and documentation: setup guide, data model, permission matrix, API reference, deployment and backup runbook, admin user guide, training notes.
**Exit:** the definition of done below is met and the client receives source, Super Admin access and documentation.

---

## How every phase is run
- Start with a list of what will be built. End with a summary of what works, what is stubbed, how to test it, and test logins for each role.
- Make small commits. Add a migration for every schema change and never edit an applied migration.
- No silent placeholders: anything unfinished goes in [STATUS.md](STATUS.md).
- Unit tests for price, GST and coupon maths.
- Integration tests for permissions by role, the unique-piece race, payment webhooks and enquiry capture.
- Two end-to-end tests (Playwright): *browse → cart → pay → track* and *browse → enquire → convert → deliver*.

## Definition of done
- Every feature in Parts 5–8 of the brief works with real data, and every integration either works or runs on its documented fallback.
- All tests pass, including permission tests for all seven roles.
- A new city, vendor, franchise, manufacturer and delivery partner can each be added from the admin with no code change.
- A sold unique piece cannot be ordered a second time under load.
- Backups run automatically and a restore has been tested.
- The client receives full source code, Super Admin access and documentation.
