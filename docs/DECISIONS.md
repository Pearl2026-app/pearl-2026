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

## Made during the build

| # | Topic | Decision | Why |
|---|---|---|---|
| D30 | SPEC.md | The prompt is saved from Part 1 onward with a reconciliation table; the "how to use" preamble and author line are left out. | White-label rule (D29); the build instructions live in STATUS. |
| D31 | Versions | Node 22, pnpm 9, Next 15.5, NestJS 11, Prisma 6, zod 3, Tailwind 4, Vitest 3 (API tests use Vitest with SWC, not Jest as D27 said). | Current stable releases; one test runner for the whole repo. |
| D32 | Delivery GST | A delivery charge is taxed at the highest GST rate among the order's lines (composite supply). | GST rule for composite supplies; the cautious choice. **Flag: owner's CA to confirm.** |
| D33 | Sandbox payments | The sandbox provider refuses to start when `NODE_ENV=production`. Without live keys, production offers COD only. | No fake "paid" orders in production. |
| D34 | Test database | Each test run migrates and seeds its own schema in `sahyadri_test` and drops only that schema afterwards. | Never wipes a database that may hold data. |
| D35 | Logins | Only Super Admin creates or changes staff and partner logins and grants. | Permissions are the most sensitive setting. **Flag.** |
| D36 | Images on the web | Plain `<img srcset>` over the API's pre-built WebP variants instead of `next/image`. | Variants already exist; avoids a second optimiser. |
| D37 | Page rendering | Storefront pages render per request with a short in-memory cache of API reads. | Stock and prices must be fresh (a sold piece must not look available). |
| D38 | Cost fields | Cost and margin fields are hidden from Franchise and City Manager (UI and CSV). | Commercially sensitive. **Flag.** |
| D39 | COD invoices | A COD order's invoice is issued when the cash is recorded as collected; online orders get it on payment capture. | The invoice follows the money. |
| D40 | Price on request | A price-on-request piece cannot be added to the cart; it is sold through an enquiry or a manual order, where head office (Super Admin/Staff) enters the agreed price. City Managers and Franchises cannot change prices. | Prices are a money decision. **Flag.** |
| D41 | Repeat checkout | Checking out the same cart again releases that cart's earlier unpaid online order (marked Failed). A payment that still arrives for it is refunded automatically (D15). | Customers are not blocked by their own hold; Rule 2 still holds. |
| D42 | Session hint cookie | Besides the httpOnly token cookies, the API sets `sp_s=1` (readable by scripts, no secret) so the site only asks for the session when one may exist. | Fewer requests and no console noise for guests. |
| D43 | Delivery offline queue | Steps are sent at once when online; otherwise saved on the device (IndexedDB, files as ArrayBuffers) and replayed in order when the signal returns. Each step carries a client event id, so a replay never applies twice. A step the server refuses is shown to the rider, not retried. | Riders work at doorsteps with poor signal; cash and proof must not be lost or doubled. |
| D44 | Customized pricing | Quote = metal + labour + pearl + margin, plus 3% GST (HSN 7113). Only head office sets costs and the quote; others see the quote only. The advance creates the order; the balance is recorded on it; the invoice is issued once fully paid. Only customized orders accept part payments. | Money decision; the invoice follows the money (D39). **Flag.** |
| D45 | Purchase orders | A draft can change (the PDF is regenerated); after it is sent it is fixed and must be closed and replaced. Marking it sent emails the manufacturer a link to the PDF valid for 7 days. | A PO is a commitment to a supplier. |
| D46 | Pearl rates | Manual rates are the guaranteed source and win over feed rates for the same grade, farm and size. The feed stays off until a source is configured; a sync replaces only feed rows. Partners may view rates and use the calculator; only head office changes rates and margins. | Spec Part 6; money settings. **Flag.** |
| D47 | Margin rule choice | The calculator uses the first active rule (lowest priority number) whose category and grade match; empty fields match anything. | Predictable and easy to explain to staff. |
| D48 | Reports | Computed from role-scoped queries in the API, not a separate warehouse. | Enough at this scale; revisit above roughly 100k orders a year. |
| D49 | Cart reminders | One reminder per cart, only within 7 days of activity, skipped if the shopper ordered since. A guest's link carries the cart token (it reveals only the cart's pieces). | Helpful without spamming. |
| D50 | Ring Finder | Candidates: in-stock, priced rings in the visitor's city. Preferences loosen in the order shape → pearl colour → metal, and the page says what was loosened. Only the answers and product facts go to the AI; anything it invents is dropped; on error or timeout the filtered order is used. | Spec Part 5 and rule 9. |
| D51 | Push audiences | Campaigns go to customer-app devices only: everyone, chosen cities, or a segment (repeat buyers, bought in 90 days, never ordered, wishlist). Delivery counts come from the message log. | Matches the spec's "all, a city or a segment". |
| D52 | City list | Roles without the Cities module (e.g. franchises) read the public city list for pickers. | Cities are public; a franchise must be able to take a manual order. |
| D53 | OTP limit | Codes per phone or email per 15 minutes is a setting (`OTP_MAX_PER_WINDOW`, default 5). | Tests and operations can tune it without code changes. |
| D54 | Hosting layout | One Vercel project with three services on one domain (root `vercel.json`, Mumbai `bom1`): `web` at `/`, `admin` at `/admin` (Next `basePath`), and `api` (container from `Dockerfile.vercel`) at `/api` and `/media`. Only `web` has a binding (`api` → `API_INTERNAL_URL`, used for server-side rendering). The admin calls the API from the browser on the same origin. The BullMQ worker runs on Fly.io (Mumbai) from the same image, with `RUN_WORKERS=false` on Vercel. | Confirmed by the owner. One domain means one cookie scope and no CORS. Vercel cannot run long-lived workers yet. |
| D55 | Migrations | Applied by the **Database migrations** GitHub workflow on push to `main` (when `packages/db/prisma` changes) or by hand, never at container start. Migrations must stay backward-compatible (add first, remove later) because Vercel deploys in parallel. | Confirmed by the owner. One place runs them, with no race between instances. |
| D56 | API reference | Swagger (`/api/docs`) is served only outside production. `pnpm --filter @sahyadri/api openapi` still writes the spec offline. | Confirmed by the owner. Do not publish the full endpoint list. |
| D57 | Gift packing | Free, offered while Settings → Website extras allows it. A gift order prints a packing slip with no prices plus a message card; the invoice stays with the buyer (order page and messages). No paid gift wrap until the owner sets a price and its GST treatment. | Money and GST stay unchanged. **Flag:** a paid option needs a price. |
| D58 | Store list | Franchises appear on "Visit us" (and can be chosen for store visits) only when switched on per franchise, because it publishes an address and phone. | Cautious default for publishing partner details. |
| D59 | Grading words | The Pearl Guide defines our AAA/AA+/AA/A grades and says plainly that the certificate is our own grading, not a laboratory report. Promises such as lifetime care, buy-back or try-at-home are not shown until approved. | Honest claims only. **Flag:** owner to confirm the grade definitions. |
| D60 | Delivery estimate | Product pages show an arrival window from Settings (default 3–5 working days, Monday–Saturday, 2 pm cut-off, India time) for any valid pincode; it is an estimate, not a serviceability check. | No courier integration yet. |
| D61 | Newsletter | Stored only with a ticked consent box; unsubscribing keeps the row with a date so the address is not re-added by mistake; unsubscribe needs a button press (email link scanners cannot unsubscribe people). | DPDP-style consent. |
