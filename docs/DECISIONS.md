# Decisions

This file records each choice the brief left open or where sources conflicted. The client can overturn any of them. Choices that affect money, permissions or data deletion are also listed in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

Note: the three source PDFs were not available when Phase 0 was prepared. Decisions D1–D8 come from the reconciliation table in the Master Build Prompt itself.

## From the Master Build Prompt's reconciliation

| # | Topic | Decision |
|---|---|---|
| D1 | Prices | Prices are shown. Each product has a **price on request** switch that hides the price and Add to Cart and leaves only WhatsApp enquiry. |
| D2 | Mobile apps | The customer app and delivery app (Android and iOS) are in scope, built in Phase 5. |
| D3 | Referral | The referral code is in scope (account menu). Loyalty points are off (`loyalty_points` flag). |
| D4 | Later features | Commissions/settlements, live GPS, multi-currency and loyalty have tables now and flags set to off. |
| D5 | Ring AI | A guided ring finder: filter the live in-stock catalogue first, then the AI ranks and explains. Falls back to plain filtered results. Hands off to Customized Jewellery when nothing fits. |
| D6 | Manufacturer | Its own record, separate from Vendor. Receives purchase orders. |
| D7 | Stack | TypeScript monorepo: Next.js, NestJS, PostgreSQL/Prisma, Redis/BullMQ, React Native/Expo (see the README). |
| D8 | Payment gateway | Razorpay assumed, behind `PaymentProvider`. |

## Made in Phase 0

| # | Topic | Decision | Why |
|---|---|---|---|
| D9 | Price display and GST | The catalogue price is **GST-inclusive** (the norm for Indian retail jewellery). The server derives the taxable value as `price ÷ (1 + rate)`, and checkout and the invoice show the breakdown. Coupons apply to the taxable value; GST is recomputed on the discounted base. | Customers see one honest number. Invoices stay correct. |
| D10 | GST split | Seller state from the `store.state` setting. Delivery in the same state → CGST + SGST; otherwise IGST. Rates per category in basis points (default 3%, HSN 7113 for jewellery, 7101 for loose pearls). | GST law. Configurable per category. |
| D11 | Rounding | All maths in integer paise. Each line's GST is rounded half-up to the paisa; the order total is the sum of lines plus delivery. The payable amount is not rounded to the rupee unless the `round_total_to_rupee` setting is on. | Deterministic and testable. |
| D12 | Numbering | Orders `SP-YYMM-00001` (resets monthly); invoices `SP/2026-27/00001` (gap-free per financial year, as GST requires); POs `PO-2026-00001`; enquiries `ENQ-26-000001`. Counters live in the `Sequence` table, incremented in the same transaction. | Readable over the phone and on WhatsApp. |
| D13 | Auth tokens | JWT access token (15 min) plus a rotating refresh token (30 days) stored hashed in `AuthSession`. httpOnly, Secure, SameSite=Lax cookies on web; secure storage on mobile. Deactivation revokes every session. | Standard, and revocable. |
| D14 | Stock hold | 15 minutes, created in a transaction with `SELECT … FOR UPDATE` on the product, backed by a partial unique index on active holds. A BullMQ delayed job releases it, and expiry is also re-checked inline. | Rule 2, with a database-level guarantee. |
| D15 | Late payment | A payment that arrives after its hold was released and the piece was sold elsewhere → order `FAILED`, automatic refund, staff alert. | Rule 2 never yields two orders, and the customer gets their money back. |
| D16 | Guest checkout | Allowed. A customer record is created silently from the checkout phone number; the customer can later log in by OTP and see the order. | Brief requires guest checkout; account history stays whole. |
| D17 | Out-of-scope ids | Return `404`, not `403`. | Prevents probing for other cities' records. |
| D18 | Enquiry save | The client generates `clientId` (UUID) and calls `POST /enquiries` with a 1.5 s timeout. On success or timeout it opens WhatsApp with the returned (or locally generated) reference, then retries the save from local storage. The server deduplicates on `clientId`. | Rule 3: never blocked, never lost. |
| D19 | Hosting | Docker containers in an India cloud region (AWS `ap-south-1` Mumbai assumed). Managed PostgreSQL and Redis, S3 + CloudFront. | Data residency; well-supported managed services. |
| D20 | Admin app | One Next.js admin app serves the central admin and all partner panels; the menu comes from the permission set. The delivery panel is also a mobile-first route there, and shipped as the native delivery app. | One codebase; the API enforces scope. |
| D21 | Search | PostgreSQL full-text search (generated `tsvector` + GIN), with exact SKU matches ranked first. | No extra service until needed. |
| D22 | Image pipeline | Originals stay in private storage. A worker produces WebP and AVIF in 4 widths (400/800/1200/1600) and square crops, served from the CDN via `next/image` with a custom loader. | Mobile speed on slow connections. |
| D23 | Order status permissions | Vendor: Confirmed → Packed only. Delivery: Assigned → Picked Up → Out for Delivery → Delivered/Failed/Returned. Admin and City Manager: any valid transition. Invalid jumps are rejected by a shared state machine. | Clear ownership of each step. |
| D24 | Delivery proof | Photo is always required. In addition: signature **or** customer OTP (OTP preferred for orders above a threshold set in the admin, default ₹50,000). | High-value goods. |
| D25 | Seed cities | Pune and Mumbai. | The brief mentions Pune; Mumbai is assumed as the second. |
| D26 | Fonts | Cormorant Garamond (headings) and Inter (body), both open-licence and self-hosted. | Elegant serif + legible sans, no licence cost. |
| D27 | E2E and load tools | Playwright for end-to-end tests; k6 for load. Vitest for unit tests; Jest via Nest for API integration tests against a real Postgres in Docker. | Standard tooling. |
| D28 | Languages | English only at launch; message templates carry a `language` field so Marathi/Hindi can be added. | Not requested in the brief. |
| D29 | White-label | No agency or developer names in code, metadata, app listings or emails. Footer text: "Developed by Sahyadri Pearls" and "© {year} Sahyadri Pearls. All Rights Reserved.", with the year computed. | Rule 10. |
