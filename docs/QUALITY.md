# Quality checks: load, end-to-end and Lighthouse

Recorded on 12 Oct 2026 against production builds on one 4-core, 16 GB machine (API, website, Postgres 16 and Redis together). Re-run before launch on the real hosting; the numbers there will differ.

## 1. Load test (`pnpm load`, script `scripts/load/load.mjs`)

Plain Node, no extra tools. Run it against local or staging only: the race sells a real piece.

```
API_URL=https://staging.example/api/v1 BROWSE_USERS=40 BROWSE_SECONDS=30 RACE_BUYERS=50 pnpm load
```

Each simulated shopper uses its own address (`X-Forwarded-For`), as real shoppers do, so per-address rate limits apply to each of them separately.

**Browsing:** 40 shoppers for 30 s with think time, 3,813 requests (127 per second), **0 errors**.

| Request | Count | p50 | p95 | p99 |
|---|---|---|---|---|
| Site settings | 415 | 12 ms | 38 ms | 168 ms |
| Catalogue page | 772 | 10 ms | 27 ms | 104 ms |
| Category | 383 | 10 ms | 25 ms | 105 ms |
| Search | 488 | 12 ms | 30 ms | 112 ms |
| Product page | 1,308 | 19 ms | 54 ms | 169 ms |
| Filters | 447 | 10 ms | 25 ms | 49 ms |

**Unique piece race:** 50 buyers, each with the same one-of-a-kind piece in their cart, press "Place order" at the same moment.
**Exactly 1 order**; the other 49 got "409 OUT_OF_STOCK"; 0 server errors; the piece shows as sold afterwards. Checkout p50 427 ms, p95 591 ms. The test fails if anything else happens.

## 2. End-to-end browser tests (`pnpm e2e`, folder `e2e/`)

Playwright drives the built website and admin in Chromium, on a phone screen (Pixel 7) for shoppers and riders. They run in CI on every push (job `e2e`).

1. **Shop:** home → product → add to cart → cart → guest checkout (Pune) → pay online (payment sandbox) → confirmation → tracking page shows "Online · Paid".
2. **Enquiry to delivery:** product → Enquire on WhatsApp. The enquiry is saved with a server reference before WhatsApp opens; WhatsApp is stubbed. Then head office signs in (password and code), finds the enquiry by reference, and converts it into a cash-on-delivery order in Pune. Head office confirms, packs and assigns the Pune rider. The rider signs in on a phone, marks picked up and out for delivery, and delivers with a photo, the customer's code and the cash. Head office then sees "Delivered" and "COD Collected".

`pnpm e2e` first rebuilds a separate `e2e` schema (it refuses to reset anything else), then starts the API in development mode with the fixed sign-in code `123456` and the payment sandbox. It needs `pnpm build`, Postgres and Redis. Locally, set `E2E_CHROMIUM` to use a Chromium already installed.

## 3. Lighthouse (mobile, default throttling)

| Page | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Home `/` | 96 | 100 | 100 | 92 |
| Catalogue `/jewellery` | 93 | 100 | 100 | 92 |
| Category `/jewellery/rings` | 96 | 100 | 100 | 100 |
| Product page | 97 | 100 | 100 | 100 |

Layout shift is 0 on all four pages; LCP is 2.5–3.2 s.

Fixed during this check (before: catalogue performance 73, accessibility 91–93):
- **The catalogue footer jumped when the pieces loaded** (layout shift 0.46). The catalogue now holds its space with a placeholder.
- The account icon had no name for screen readers.
- "Coming soon" app-store badges had low contrast.
- Product headings skipped a level.

The two SEO points of 92 are the page description, which Next.js streams to ordinary browsers. WhatsApp, Facebook and Bing previews receive it in the page head (checked), and Google runs the page's script. No change is needed.

Lighthouse is not in CI: it needs a stable machine to give comparable scores. Run it on the staging site before launch:

```
npx lighthouse https://staging.example/jewellery --preset=perf --form-factor=mobile
```
