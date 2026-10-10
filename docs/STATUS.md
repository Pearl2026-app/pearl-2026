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

### Phase 1 — Foundation ✅ (tag phase-1)
- [x] Monorepo tooling (TypeScript, ESLint, Vitest, CI workflow, docker-compose.dev.yml)
- [x] packages/shared: permissions, validation, money/GST/coupon maths + unit tests (31)
- [x] packages/db: initial migration, guards migration (hold index, append-only triggers, FTS), idempotent seed
- [x] packages/ui: tokens + Tailwind theme + base components
- [x] API: config, Prisma, auth (customer OTP, partner OTP, staff password + OTP, email fallback, refresh rotation with reuse detection)
- [x] API: global guard, scope layer (404 on out-of-scope ids), audit log
- [x] API: providers with fallbacks (payment sandbox/Razorpay, WhatsApp click-to-chat/Cloud API, SMS console/HTTP, email log/SMTP, push log/FCM, storage local/S3, AI none/OpenAI-compatible, pearl-rate feed)
- [x] API: network CRUD (cities, vendors, franchises, manufacturers, delivery partners)
- [x] API: catalogue (categories, collections, farms, products, images, video, CSV import, bulk images, vendor approval, certificates, reviews)
- [x] API: content (banners, blocks, versioned pages, testimonials, gallery, FAQ, careers, applications), settings, flags, users & grants, customers, audit and message logs
- [x] Permission integration tests for seven roles (Phase 1 modules)
- [x] Admin shell + Phase 1 screens (verified in a browser)

Notes:
- Tests run in a fresh per-run schema of the test database (Prisma blocks `migrate reset` when run by an agent; nothing existing is wiped).
- Minor: the product "Related pieces" picker lists the product itself; the API ignores self-links.

### Phase 2 — Storefront and enquiries ✅ (tag phase-2)
- [x] Public catalogue API (filters, facets, full-text search with SKU ranking, city availability), content API, careers, certificate verification, sitemap data
- [x] Enquiries API: saved before WhatsApp opens, idempotent on clientId, device fallback reference kept, routing by city and type, templates, automatic acknowledgement (click-to-chat fallback + email), inbox with stages/owner/timer/notes/CSV, scoped by role
- [x] Storefront pages (home, jewellery, category, collection, search, product, farms, customized jewellery, contact, bulk buying, FAQ, careers, offers, gallery, verify, Our Story, About, five legal pages), floating WhatsApp, SEO (metadata, JSON-LD, sitemap.xml, robots.txt)
- [x] Admin enquiry inbox + WhatsApp numbers, routing rules and templates
- [x] Enquiry capture integration tests (incl. slow/failed first save)
- [ ] Mobile Lighthouse ≥ 90 measurement → Phase 6 (pages are server-rendered with ~106 kB JS, lazy images and pre-sized WebP variants)
- [ ] Ring Finder page → Phase 4 (per SPEC phase list)

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
