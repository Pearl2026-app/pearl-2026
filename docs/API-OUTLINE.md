# API Outline

NestJS REST API at `/api/v1`, with an OpenAPI spec generated at `/api/docs`. JSON in and out. Money is always integer paise. Errors use one shape: `{ code, message, fields? }`.

- **Auth:** short-lived JWT access token plus a rotating refresh token. Web uses httpOnly secure cookies; the mobile apps use secure storage.
- **Scope:** every route declares `module` + `action`, and the service applies the caller's scope (see [PERMISSION-MATRIX.md](PERMISSION-MATRIX.md)). An out-of-scope id returns `404`.
- **Lists:** `?q=&page=&pageSize=&sort=&filter[...]=`. Every admin list also has `/export.csv` with the same filters.
- **Writes** by staff or partners record an AuditLog entry (who, what, before, after, IP).
- **Idempotency:** `Idempotency-Key` header on checkout, payment confirmation, enquiry creation and delivery updates.

Scope column: **P** public · **C** customer · **A** admin (Super Admin / granted Staff) · **CM** city manager · **V** vendor · **F** franchise · **D** delivery partner.

## Auth
| Method | Path | Scope | Purpose |
|---|---|---|---|
| POST | /auth/otp/request | P | Send an OTP to a phone (customer, partner) or email (staff fallback). Rate-limited per destination and IP. |
| POST | /auth/otp/verify | P | Verify the OTP. Customers are created on first login (with an optional referral code). |
| POST | /auth/staff/login | P | Email + password; returns an OTP challenge. |
| POST | /auth/staff/verify | P | Complete staff login with the OTP. |
| POST | /auth/refresh | P | Rotate the refresh token. |
| POST | /auth/logout | any | Revoke the session. |
| GET | /me | any | Current user, role, scope and the permission set for the interface. |

## Catalogue (public)
| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | /catalogue/products | P | Filter: category, collection, farm, carat range, shape, colour, price; `q` (name/SKU full-text); sort: newest, price, carat. City-aware. |
| GET | /catalogue/products/:slug | P | Detail with images, video, specification, farm, certificate, approved reviews, related products. Hides price when price-on-request. |
| GET | /catalogue/filters | P | Facet values and counts for the current filter. |
| GET | /catalogue/categories · /collections · /farms · /farms/:slug | P | Navigation and farm pages. |
| GET | /verify/:certificateCode | P | Certificate QR target: the piece and its farm. |
| POST | /ring-finder/recommend | P | Answers → filtered in-stock catalogue, ranked by AI with one-line reasons. Falls back to plain filtered results. |

## Content (public)
| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | /content/home | P | Banners, blocks, featured products and collections, testimonials, trust points. |
| GET | /content/pages/:slug | P | Current version of a static or legal page. |
| GET | /content/faq · /gallery · /offers · /site | P | FAQ, gallery, active public offers, site settings (footer, app links, WhatsApp default). |
| GET | /careers · /careers/:slug | P | Openings. |
| POST | /careers/:slug/apply | P | Application with resume upload (PDF/DOC, size-limited, virus-scan hook). |

## Enquiries
| Method | Path | Scope | Purpose |
|---|---|---|---|
| POST | /enquiries | P/C | Create (product, bulk, contact, ring finder). Client sends `clientId` so retries are idempotent. Returns `reference` and the **wa.me URL** with the routed number and pre-filled message (product name, SKU, reference). |
| POST | /enquiries/custom | P/C | Customized Jewellery form with image uploads. Creates an Enquiry + CustomRequest. |
| GET | /admin/enquiries | A CM F | Inbox with filters (stage, type, city, owner, source, date). |
| GET/PATCH | /admin/enquiries/:id | A CM F | Detail; change stage or owner. The first staff action sets `firstResponseAt`. |
| POST | /admin/enquiries/:id/notes | A CM F | Internal note. |
| POST | /admin/enquiries/:id/convert | A CM F | One-click conversion to an order, carrying the details over. |
| CRUD | /admin/whatsapp-numbers · /admin/message-templates · /admin/routing-rules | A | WhatsApp CRM configuration. |

## Cart, checkout, payments
| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET/POST/PATCH/DELETE | /cart · /cart/items/:productId | P/C | Guest cart by cookie token. Totals are always recomputed on the server. |
| POST | /cart/merge | C | Merge the guest cart into the account cart on login. |
| POST | /cart/coupon · DELETE /cart/coupon | P/C | Apply or remove a coupon; returns the reason when one is rejected. |
| POST | /checkout | P/C | Address + city + payment method → computes totals, creates the order (`PLACED`, payment `PENDING`/`COD_PENDING`), **creates stock holds in a locked transaction**, and returns the gateway order for online payment. |
| POST | /checkout/:orderId/confirm-cod | P/C | Confirms a COD order: hold → converted, piece sold. |
| POST | /payments/razorpay/verify | P/C | Client-side checkout callback. Shows a "processing" state only; it never marks an order paid. |
| POST | /webhooks/razorpay | provider | **Signature-verified.** `payment.captured` → Paid, hold converted, invoice, notifications. `payment.failed` → hold released. `refund.processed` → refund completed. Idempotent through WebhookEvent. |
| GET | /orders · /orders/:number | C | My orders, detail, live status, timeline. |
| GET | /orders/:number/invoice.pdf | C A CM | GST invoice. |
| GET | /track/:number?token= | P | Tracking link sent by WhatsApp and email (signed token). |
| POST | /orders/:number/returns | C | Return or cancellation request. |
| GET/POST/PATCH | /me/addresses · /me/wishlist · /me/referral · /me/profile | C | Account. The wishlist returns a shareable WhatsApp link. |
| POST | /reviews | C | Review for a delivered item; goes to moderation. |

## Orders and fulfilment (admin and partners)
| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | /admin/orders | A CM V F | Filters: number, customer, phone, SKU, date range, value range, city, vendor, franchise, manufacturer, status, payment status. |
| POST | /admin/orders | A CM F | Manual order (phone or Instagram sale). |
| GET/PATCH | /admin/orders/:id | A CM V F | Detail; status changes follow the state machine; assignments. |
| POST | /admin/orders/:id/assign-delivery | A CM F | Assign a delivery partner (same city). Push to the partner. |
| POST | /admin/orders/:id/refunds | A | Refund through the gateway, or a manual refund record. |
| GET/PATCH | /admin/returns · /admin/returns/:id | A CM | Approve, reject, schedule pickup, receive, refund. |
| GET/POST | /admin/payments · /admin/payments/cod-reconcile | A CM | Transactions and COD reconciliation. |
| GET | /delivery/today · /delivery/history | D | My deliveries. |
| POST | /delivery/:id/status | D | One-tap status. Failed/Returned require a reason. Accepts `clientEventId` for the offline queue. |
| POST | /delivery/:id/proof | D | Photo + signature, or customer OTP (`/delivery/:id/otp` sends it). COD amount collected. |
| POST | /delivery/:id/location | D | Captures location at status change. Live pings only when `live_gps` is on. |

## Customized work and purchase orders
| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET/PATCH | /admin/custom-requests · /:id | A CM | Team order form, cost breakdown → quoted price, production stage. |
| POST | /admin/custom-requests/:id/order | A CM | Create the customized order (advance payment link optional). |
| CRUD | /admin/purchase-orders | A | Create from an order with a manufacturer; number assigned; status flow. |
| GET | /admin/purchase-orders/:id/pdf | A | Numbered PO PDF. |
| POST | /admin/purchase-orders/:id/send | A | Email (and WhatsApp link) the PO to the manufacturer. Status → Sent. |

## Catalogue management
| Method | Path | Scope | Purpose |
|---|---|---|---|
| CRUD + archive | /admin/categories · /collections · /farms | A | With city links, sort order, GST/HSN, SEO. |
| CRUD + archive | /admin/products | A V | Publish, unpublish, archive. Vendor edits go to `PENDING_APPROVAL`. |
| POST | /admin/products/:id/approve | A | Approve a vendor submission. |
| POST | /admin/products/import | A | CSV bulk import with a dry run and a row-level error report. |
| POST | /admin/uploads | A V F D C | Signed upload URL or direct upload. Images are resized, cropped and compressed by a worker. |
| PATCH | /admin/products/:id/images/order | A V | Drag-to-reorder. |
| CRUD | /admin/certificates | A | Issue a certificate, QR and PDF. |
| GET/PATCH | /admin/reviews | A | Moderation. |

## Network, users, content, marketing
| Method | Path | Scope | Purpose |
|---|---|---|---|
| CRUD + activate | /admin/cities · /vendors · /franchises · /manufacturers · /delivery-partners | A (CM view) | Network management and city assignments. |
| CRUD + deactivate | /admin/users · /admin/users/:id/permissions | A | Staff and partner users, role, module grants. |
| GET/PATCH | /admin/customers · /:id | A CM | Customer database, block/unblock, history. |
| CRUD | /admin/banners · /content-blocks · /pages (+ /versions) · /testimonials · /gallery · /faq · /jobs · /job-applications | A | Content. Publishing a page creates a version. |
| CRUD | /admin/coupons (+ /usage) | A | Coupons and offers. |
| CRUD | /admin/notifications (+ /send, /schedule) | A | Push campaigns by audience; delivery counts. |
| GET | /admin/notification-logs | A | Every outbound message on every channel. |

## Pricing, reports, settings, audit
| Method | Path | Scope | Purpose |
|---|---|---|---|
| CRUD | /admin/pearl-rates · /margin-rules | A | Manual rate table and margins. |
| POST | /admin/pricing/calculate | A CM F | Carat + grade + farm (+ size, metal, labour) → suggested price with breakdown. |
| GET | /admin/dashboard?from&to | A CM V F | Cards and charts, scoped. |
| GET | /admin/reports/{sales,orders,monthly,enquiries,franchises,vendors,whatsapp} | A CM V F | Reports with CSV export. |
| GET/PATCH | /admin/settings · /admin/feature-flags | A (Super Admin for flags) | Payment methods on/off, GST defaults, delivery charges, return window, referral rewards, cart-reminder timing, templates. |
| GET | /admin/audit-logs | A | Filter by user, record, date. |
| GET | /health · /ready | ops | Liveness and readiness. |

## Background jobs (BullMQ)
| Queue | Job |
|---|---|
| `stock` | Release a hold at `expiresAt`; sweep stale holds every minute (safety net). |
| `notify` | Send WhatsApp / email / SMS / push with retry and backoff. Everything is written to NotificationLog. |
| `cart` | Abandoned-cart reminder after the configured delay (once per cart activity window). |
| `reviews` | Review request N days after delivery. |
| `media` | Image resize, crop, WebP/AVIF variants; video poster frame. |
| `campaigns` | Scheduled push campaigns, fanned out in batches. |
| `reports` | Nightly report materialisation; CSV exports for large lists. |
| `backup` | Nightly `pg_dump` to backup storage, plus a weekly automated restore check into a scratch database. |

## Providers (every third-party service sits behind an interface)

| Interface | Default implementation | Fallback / development implementation |
|---|---|---|
| `PaymentProvider` (createOrder, verifyWebhook, refund) | Razorpay | Sandbox keys; COD is always available. |
| `WhatsAppProvider` (sendTemplate, sendText, verifyWebhook) | BSP to be confirmed | `ClickToChatProvider`: builds `wa.me` links, sends nothing server-side, so order updates go by email. |
| `SmsProvider` (sendOtp) | Provider to be confirmed (DLT-registered) | `ConsoleSms` in development (fixed OTP only when `NODE_ENV=development`); email OTP for staff. |
| `EmailProvider` | SMTP / transactional email service | Queue + retry; message visible in the admin log. |
| `PushProvider` | Firebase Cloud Messaging | WhatsApp + email carry the same order updates. |
| `StorageProvider` (put, signedUrl) | S3-compatible + CDN | Local disk in development. |
| `AiRanker` (rank(products, answers)) | Model provider to be confirmed | `NoopRanker`: keeps the filter order and gives template reasons. Has a timeout. |
| `PearlRateProvider` | Off (`pearl_rate_feed` flag) | Manual PearlRate table. |

Every incoming webhook (payment, WhatsApp) is signature-verified before any processing, and deduplicated through `WebhookEvent`.
