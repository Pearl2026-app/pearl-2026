# Status

Resume rule: read [SPEC.md](SPEC.md) and this file, then continue from the first unchecked item.

## Needed from the owner
- Payment gateway live keys (Razorpay assumed): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Until then: sandbox provider + COD.
- WhatsApp Business API approval and provider credentials (`WHATSAPP_*`). Until then: click-to-chat links + email.
- SMS OTP provider with DLT registration (`SMS_*`). Until then: email OTP for staff, console OTP in development.
- Email service credentials (`SMTP_*`). Until then: messages queued and visible in the admin.
- Firebase project for push (`FCM_*`). Until then: push is logged only; WhatsApp/email carry order updates.
- S3-compatible storage + CDN (`S3_*`, `CDN_BASE_URL`). Until then: local disk.
- AI model provider key (`AI_*`). Until then: plain filtered Ring Finder results.
- Hosting account in an India region, domain, Google Play and Apple developer accounts.
- GSTIN, legal name and registered address for invoices (Settings → Store).

## Flagged for owner review (money, permissions, deletion)
See [DECISIONS.md](DECISIONS.md) and [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md). Cautious defaults were taken; items are listed there.

## Checklist

### Phase 0 — Plan
- [x] SPEC.md saved, STATUS.md checklist
- [x] Sitemap, design direction + sample screens, schema, permission matrix, API outline, phase plan

### Phase 1 — Foundation
- [ ] Monorepo tooling (TypeScript, lint, test runners, CI workflow, docker-compose)
- [ ] packages/shared: permissions, validation, money/GST/coupon maths + unit tests
- [ ] packages/db: initial migration, raw SQL (hold index, audit grants, FTS), seed
- [ ] packages/ui: tokens + Tailwind preset + base components
- [ ] API: config, Prisma, auth (OTP + staff password/OTP, refresh, sessions)
- [ ] API: guards, scope layer, audit log interceptor
- [ ] API: providers (payment, WhatsApp, SMS, email, push, storage, AI, pearl rate) with fallbacks
- [ ] API: network CRUD (cities, vendors, franchises, manufacturers, delivery partners)
- [ ] API: catalogue CRUD (categories, collections, farms, products, images, video, CSV import, approval)
- [ ] API: content (banners, blocks, pages + versions, testimonials, gallery, FAQ, jobs), settings, flags, audit viewer, users & grants
- [ ] Permission integration tests for seven roles
- [ ] Admin shell + Phase 1 screens

### Phase 2 — Storefront and enquiries
- [ ] Public catalogue API (filters, FTS, facets), content API
- [ ] Enquiries API (capture, routing, templates, acknowledgement, inbox, notes, convert)
- [ ] Storefront pages (all in SITEMAP), floating WhatsApp, SEO (metadata, JSON-LD, sitemap)
- [ ] Customized Jewellery, farms, FAQ, Careers, legal pages, contact, bulk
- [ ] Admin enquiry inbox + WhatsApp settings
- [ ] Enquiry capture integration test

### Phase 3 — Commerce
- [ ] Cart (guest + merge), coupons
- [ ] Checkout, stock holds, COD, payment provider + verified webhook
- [ ] Orders: state machine, timeline, manual + enquiry orders, invoice PDF
- [ ] Customer account (orders, addresses, wishlist share, referral, returns), tracking
- [ ] Notifications on status change (WhatsApp/email/push with fallbacks)
- [ ] Returns, refunds; referral rewards
- [ ] Race test, webhook tests, e2e browse→cart→pay→track

### Phase 4 — Operations
- [ ] Partner panels (City Manager, Vendor, Franchise, Delivery) + delivery proof + COD
- [ ] Customized order workflow, PO PDF
- [ ] Pearl pricing + calculator
- [ ] Dashboard, reports, WhatsApp analytics, CSV
- [ ] Abandoned cart, reviews, certificates + QR, Ring Finder, push campaigns
- [ ] e2e browse→enquire→convert→deliver

### Phase 5 — Mobile apps
- [ ] Customer app (Expo)
- [ ] Delivery app (Expo) with offline queue
- [ ] Store release preparation (icons, splash, listing text, EAS config)

### Phase 6 — Hardening and handover
- [ ] Security review
- [ ] Load test (incl. unique piece under load)
- [ ] Backups + tested restore
- [ ] Deployment (Docker images, compose/production config)
- [ ] Docs: setup guide, API reference, runbook, admin user guide, training notes
