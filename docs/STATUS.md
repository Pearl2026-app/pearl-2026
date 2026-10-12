# Status

Resume rule: read [SPEC.md](SPEC.md) and this file, then continue from the first unchecked item.

## Needed from the owner
- **Hosting accounts** for docs/DEPLOYMENT.md: Vercel, Fly.io, Neon or Supabase (Mumbai), Upstash Redis (Mumbai), AWS S3 (ap-south-1); a domain.
- **Approved legal texts** (terms, refund, privacy, return & cancellation, shipping): production starts with drafts.
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
See [DECISIONS.md](DECISIONS.md) and [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md). Cautious defaults were taken. Flagged so far: D32 (GST on delivery), D33 (no sandbox in production), D35 (only Super Admin manages logins), D38 (cost fields hidden from partners), D40 (only head office sets agreed prices), D15/D41 (automatic refunds of late payments), D44 (only head office quotes customized work), D46 (only head office changes pearl rates and margins).

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

### Phase 3 — Commerce ✅ (tag phase-3)
- [x] Cart (guest cookie, merge into the account on login, server totals), coupons (rules, limits, personal coupons)
- [x] Checkout, 15-minute stock holds (row locks + partial unique index), COD with limit, sandbox/Razorpay provider, signature-verified idempotent webhook
- [x] Orders: state machine per role, timeline, manual orders (agreed price for price-on-request pieces), one-click enquiry conversion, GST invoice PDF (CGST/SGST or IGST)
- [x] Customer account (profile, orders, addresses, wishlist + share, referral, returns, reviews), public tracking by signed link
- [x] Notifications on status change (logged first, then sent via WhatsApp/email/push with fallbacks)
- [x] Returns and cancellations queue, refunds through the gateway, COD reconciliation, referral rewards and review requests after delivery
- [x] Admin: orders list/filters/CSV, order detail, new manual order, enquiry conversion, payments + COD reconcile, returns, coupons with usage
- [x] Race test (6 parallel checkouts → one order), webhook tests (bad signature, duplicate, failed, late payment → refund), 69 API tests
- [x] Browser check (Playwright, local): product → cart → checkout → sandbox payment → confirmation → invoice; admin order handling, manual order, enquiry conversion. A committed Playwright suite is part of Phase 6.

Notes:
- Found in the browser check and fixed: BullMQ rejects `:` in job ids (inline test mode did not; ids are now checked in every mode); the API started its worker before modules registered their jobs (the per-minute hold sweep was not scheduled); checking out the same cart twice was blocked by the customer's own earlier hold (the earlier unpaid order is now released); guests made needless `/me` and refresh calls (a script-readable `sp_s=1` hint cookie, holding no secret, now gates them).

### Phase 4 — Operations ✅ (tag phase-4)
- [x] Partner panels: City Manager, Vendor and Franchise use the shared admin with menus and data limited by role (checked in a browser for each role); Delivery has its own mobile-first screens
- [x] Delivery: job list, one-tap steps, proof (photo + customer code or signature; code required at or above the value in Settings), COD collected at the door, offline queue on the device (IndexedDB) that replays safely
- [x] Customized orders: requirement → quote (cost breakdown, head office only) → advance (creates the order) → PO → production → ready → dispatch/delivery; partial payments; files; history
- [x] Purchase orders with numbered PDF, status steps that drive production stages, PDF link emailed when sent
- [x] Pearl pricing: rate table by grade/farm/size, margin rules, calculator with apply-to-product, live feed adapter (off until configured)
- [x] Dashboard (cards, monthly sales and orders, recent activity, date range, role-scoped) and reports with CSV: sales, GST register, enquiries, WhatsApp analytics, partners, best sellers
- [x] Abandoned-cart reminder (timing in Settings), Ring Finder (filter → AI rank → fallback → hand-off), push campaign management
- [x] Reviews (requested after delivery, moderated) and certificates with QR — built in Phases 1 and 3
- [x] End-to-end test browse → enquire → convert → deliver (API, `test/journey.test.ts`); 88 API tests

Notes:
- Found in browser checks and fixed: TanStack Query paused delivery steps while offline instead of queuing them (now always queued on the device); some browsers refuse Blobs in IndexedDB (files are stored as ArrayBuffers); franchises could not load the city list for manual orders (roles without the Cities module now read the public list); the web checkout never stored the phone on the cart, so guest carts could not be reminded.
- A flaky test was traced to the per-number OTP limit when parallel test files sign in the same accounts; the limit is now a setting (`OTP_MAX_PER_WINDOW`, default 5) with its own test.
- Push campaigns are recorded and counted, but phones receive nothing until Firebase keys are supplied (the admin says so).

### Premium storefront (added on request: benchmarked against leading Indian and international jewellery sites)
- [x] Announcement bar (admin-editable; defaults from delivery and returns settings) and mega menu: category, pearl colour, shape, collections, price bands
- [x] Pearl Guide: types, how we grade (AAA–A defined), lustre, surface, shape, size, necklace lengths, ring sizes, care, certificate; specification rows link to it
- [x] Product page: size guide pop-up (rings, necklaces), pincode delivery-date estimate, returns/insured/gift trust tiles, share, "see it on a video call", recently viewed
- [x] Gifts page (budget bands, occasions); free gift packing with a message card at checkout; **gift packing slip without prices** (admin → order)
- [x] Book a consultation (video call or store visit) saved as a CONSULTATION enquiry for the city team; "Visit us" store list (franchises switched on in the admin)
- [x] Newsletter sign-up with explicit consent; unsubscribe page; admin list with CSV
- [x] Fixed: every PDF (invoice, PO, certificate) printed a blank extra page; admin switches overlapped their labels
- [ ] Later, needs owner decisions: try-at-home, AR try-on, gift cards, lifetime care/buy-back promises (not shown until approved)

### Phase 5 — Mobile apps ✅
- [x] Shared app API client (token sign-in with refresh, cart token, delivery steps) with contract tests against the API
- [x] Customer app (Expo SDK 57): home, shop with search and filters, product (gallery, spec linked to the Pearl Guide, reviews), wishlist with sharing, cart with coupons, checkout (guest or signed in, saved addresses, gift packing, COD, online payment on the website's /pay/app page returning to the app), order tracking with cancel/return, addresses, referral, returns, Ring Finder, Customized Jewellery with photos, WhatsApp enquiry saved first; push; website links open the app once APPLE_TEAM_ID / ANDROID_APP_SHA256 are set. Unit tests (links, filters, checkout form), a contract test of the whole shopper journey, Android/iOS bundles build, screens checked in a web preview. Not yet run on a physical phone here.
- [x] Delivery app (Expo SDK 57, expo-router): phone OTP sign-in, jobs and history (kept on the phone for no-signal areas), one-tap steps, photo + code or signature proof, COD, reasons, push for new assignments, location with the proof; offline queue with 8 unit tests; Android and iOS bundles build (`expo export`); icons, splash and EAS profiles. Not yet run on a physical phone here (no device in this workspace).
- [x] Store release preparation: icons and splash for both apps (`scripts/brand/make-app-icons.mjs`), EAS build profiles, listing text, data-safety and privacy answers, reviewer notes (docs/STORE-LISTING.md), build and submit steps (docs/DEPLOYMENT.md §9a). **Account deletion** added (required by both stores): in the app, on the website, and the public page /delete-account (D62). Publishing needs the owner's Google Play and Apple developer accounts.

### Phase 6 — Hardening and handover
- [ ] Security review
- [ ] Load test (incl. unique piece under load)
- [x] Backups + tested restore (scripts/backup; nightly GitHub Actions backup with restore test; restore test passed here on real data)
- [x] Deployment kit: one Vercel project with services (root `vercel.json`: `web` at `/`, `admin` at `/admin`, `api` container at `/api` and `/media`; Mumbai), Fly.io worker-only config, a **Database migrations** GitHub workflow, a production setup seed with no sample data, docs/DEPLOYMENT.md and docs/RUNBOOK.md (D54–D56)
- [ ] Actual deployment — needs the owner's accounts (see below)
- [ ] Docs: setup guide, API reference, runbook, admin user guide, training notes
